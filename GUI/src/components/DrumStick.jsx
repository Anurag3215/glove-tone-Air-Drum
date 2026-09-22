import React, { useRef, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export const DrumStick = forwardRef(function DrumStick(
  { side = 'left', basePosition = [-0.45, -1.6, 2.2], restRotation = [0.4, 0.2, -0.1] },
  ref
) {
  const pivotRef = useRef()
  const tipGlowRef = useRef()

  // Spring physics for reactive striking motion
  const anim = useRef({
    currentRot: new THREE.Euler(...restRotation),
    targetRot: new THREE.Euler(...restRotation),
    currentPos: new THREE.Vector3(...basePosition),
    targetPos: new THREE.Vector3(...basePosition),
    velocityRot: new THREE.Vector3(0, 0, 0),
    tipGlow: 1.0,
    isStriking: false
  })

  useImperativeHandle(ref, () => ({
    strike: (targetPos3d) => {
      // Calculate strike trajectory toward target drum
      const [tx, ty, tz] = targetPos3d

      // Aim angle toward target
      const angleY = (tx - basePosition[0]) * 0.18
      const angleX = restRotation[0] - 0.35 // flick back for strike
      const angleZ = restRotation[2] + (side === 'left' ? -0.12 : 0.12)

      // Apply initial impulse
      anim.current.velocityRot.set(-2.8, (angleY - restRotation[1]) * 4.0, 0)
      anim.current.tipGlow = 3.5
      anim.current.isStriking = true

      // Reset to resting position after hit
      setTimeout(() => {
        anim.current.targetRot.set(...restRotation)
        anim.current.targetPos.set(...basePosition)
        anim.current.isStriking = false
      }, 110)
    }
  }))

  useFrame((_, delta) => {
    // Spring physics on stick rotation
    const k = 140
    const c = 14

    const diffX = anim.current.currentRot.x - anim.current.targetRot.x
    const diffY = anim.current.currentRot.y - anim.current.targetRot.y
    const diffZ = anim.current.currentRot.z - anim.current.targetRot.z

    const forceX = -k * diffX - c * anim.current.velocityRot.x
    const forceY = -k * diffY - c * anim.current.velocityRot.y
    const forceZ = -k * diffZ - c * anim.current.velocityRot.z

    anim.current.velocityRot.x += forceX * delta
    anim.current.velocityRot.y += forceY * delta
    anim.current.velocityRot.z += forceZ * delta

    anim.current.currentRot.x += anim.current.velocityRot.x * delta
    anim.current.currentRot.y += anim.current.velocityRot.y * delta
    anim.current.currentRot.z += anim.current.velocityRot.z * delta

    // Glow decay
    anim.current.tipGlow = THREE.MathUtils.lerp(anim.current.tipGlow, 1.0, delta * 6.0)

    if (pivotRef.current) {
      pivotRef.current.rotation.set(
        anim.current.currentRot.x,
        anim.current.currentRot.y,
        anim.current.currentRot.z
      )
    }

    if (tipGlowRef.current) {
      tipGlowRef.current.intensity = anim.current.tipGlow * 1.5
    }
  })

  return (
    <group position={basePosition}>
      {/* Pivot at base (hand grip location) */}
      <group ref={pivotRef} rotation={restRotation}>
        {/* Sleek Tapered Drumstick Shaft */}
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.012, 0.022, 1.5, 16]} />
          <meshStandardMaterial
            color="#080c16"
            metalness={0.9}
            roughness={0.18}
            emissive="#001830"
            emissiveIntensity={0.2}
          />
        </mesh>

        {/* Ergonomic Textured Grip Area */}
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.023, 0.024, 0.38, 16]} />
          <meshStandardMaterial
            color="#02050e"
            metalness={0.7}
            roughness={0.4}
            emissive="#00f3ff"
            emissiveIntensity={0.08}
          />
        </mesh>

        {/* Holographic Glowing Cyan Tip */}
        <mesh position={[0, 1.52, 0]}>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshPhysicalMaterial
            color="#ffffff"
            emissive="#00f3ff"
            emissiveIntensity={2.5}
            transparent
            opacity={0.95}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Tip Point Light */}
        <pointLight
          ref={tipGlowRef}
          position={[0, 1.55, 0]}
          distance={1.2}
          intensity={1.0}
          color="#00f3ff"
        />
      </group>
    </group>
  )
})
