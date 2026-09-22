import React, { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

const AMBIENT_COUNT = 320
const BURST_COUNT = 60

export function ParticleField({ activeBurst }) {
  const pointsRef = useRef()
  const burstPointsRef = useRef()

  // 1. Ambient floating cosmic dust particles
  const { positions, originalPositions, scales, opacities } = useMemo(() => {
    const pos = new Float32Array(AMBIENT_COUNT * 3)
    const orig = new Float32Array(AMBIENT_COUNT * 3)
    const sc = new Float32Array(AMBIENT_COUNT)
    const op = new Float32Array(AMBIENT_COUNT)

    for (let i = 0; i < AMBIENT_COUNT; i++) {
      // Space volume around the drum kit
      const x = (Math.random() - 0.5) * 14
      const y = (Math.random() - 0.5) * 8 + 0.5
      const z = (Math.random() - 0.5) * 10 - 1.0

      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z

      orig[i * 3] = x
      orig[i * 3 + 1] = y
      orig[i * 3 + 2] = z

      sc[i] = Math.random() * 0.045 + 0.015
      op[i] = Math.random() * 0.6 + 0.2
    }

    return { positions: pos, originalPositions: orig, scales: sc, opacities: op }
  }, [])

  // 2. Localized drum hit burst particle buffers
  const burstData = useMemo(() => {
    const pos = new Float32Array(BURST_COUNT * 3)
    const vel = new Float32Array(BURST_COUNT * 3)
    const life = new Float32Array(BURST_COUNT) // 0 to 1

    for (let i = 0; i < BURST_COUNT; i++) {
      pos[i * 3] = 0
      pos[i * 3 + 1] = -999 // hidden initially
      pos[i * 3 + 2] = 0
      life[i] = 0
    }

    return { pos, vel, life, progress: 1.0, center: new THREE.Vector3() }
  }, [])

  // Trigger burst on drum hit
  useEffect(() => {
    if (!activeBurst || !activeBurst.pos3d) return
    const [cx, cy, cz] = activeBurst.pos3d

    burstData.center.set(cx, cy, cz)
    burstData.progress = 0.0 // reset life

    for (let i = 0; i < BURST_COUNT; i++) {
      // Start at drum position with slight random radius
      const angle = Math.random() * Math.PI * 2
      const spread = Math.random() * 0.4
      burstData.pos[i * 3] = cx + Math.cos(angle) * spread
      burstData.pos[i * 3 + 1] = cy + (Math.random() - 0.5) * 0.15
      burstData.pos[i * 3 + 2] = cz + Math.sin(angle) * spread

      // Velocity explodes upward and outward
      const speed = Math.random() * 3.5 + 1.2
      const vAngle = Math.random() * Math.PI * 2
      burstData.vel[i * 3] = Math.cos(vAngle) * speed
      burstData.vel[i * 3 + 1] = Math.random() * 2.8 + 0.8
      burstData.vel[i * 3 + 2] = Math.sin(vAngle) * speed

      burstData.life[i] = 1.0
    }
  }, [activeBurst, burstData])

  useFrame((_, delta) => {
    // Animate ambient floating dust
    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position
      const time = performance.now() * 0.0006

      for (let i = 0; i < AMBIENT_COUNT; i++) {
        const i3 = i * 3
        // Gentle floating drift
        positions[i3 + 1] = originalPositions[i3 + 1] + Math.sin(time + i * 0.5) * 0.25
        positions[i3] = originalPositions[i3] + Math.cos(time * 0.7 + i * 0.3) * 0.15
      }
      posAttr.needsUpdate = true
    }

    // Animate burst particles
    if (burstPointsRef.current && burstData.progress < 1.0) {
      burstData.progress += delta * 2.4
      const posAttr = burstPointsRef.current.geometry.attributes.position
      const alpha = Math.max(0, 1.0 - burstData.progress)

      for (let i = 0; i < BURST_COUNT; i++) {
        const i3 = i * 3
        burstData.pos[i3] += burstData.vel[i3] * delta
        burstData.pos[i3 + 1] += burstData.vel[i3 + 1] * delta
        burstData.pos[i3 + 2] += burstData.vel[i3 + 2] * delta
        // Drag
        burstData.vel[i3] *= 0.94
        burstData.vel[i3 + 1] -= delta * 3.5 // gravity
        burstData.vel[i3 + 2] *= 0.94
      }
      posAttr.needsUpdate = true
      burstPointsRef.current.material.opacity = alpha * 0.95
    }
  })

  return (
    <group>
      {/* Ambient Floating Dust */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={AMBIENT_COUNT}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.038}
          color="#00f3ff"
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Localized Drum Hit Burst Particles */}
      <points ref={burstPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={BURST_COUNT}
            array={burstData.pos}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.065}
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  )
}
