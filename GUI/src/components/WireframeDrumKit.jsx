import React, { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useSensorStore from '../store/sensorStore'
import useSettingsStore from '../store/settingsStore'

// Fast Web Audio synthesizer for zero-latency drum strikes
function playDrumSound(type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    if (type === 'KICK') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.setValueAtTime(145, now)
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.35)
      gain.gain.setValueAtTime(1, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.35)
    } else if (type === 'SNARE') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate)
      const out = buf.getChannelData(0)
      for (let i = 0; i < buf.length; i++) out[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 950
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.7, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    } else if (type === 'HI-HAT') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.07, ctx.sampleRate)
      const out = buf.getChannelData(0)
      for (let i = 0; i < buf.length; i++) out[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 8500
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.5, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    } else if (type === 'TOM') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.setValueAtTime(210, now)
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.3)
      gain.gain.setValueAtTime(0.9, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.3)
    } else if (type === 'CRASH') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate)
      const out = buf.getChannelData(0)
      for (let i = 0; i < buf.length; i++) out[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 5500
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.8, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    }
  } catch {
    // Audio fallback
  }
}

// 5 3D Drum Pieces in the Matrix
const DRUM_SPECS = [
  { id: 'kick', name: 'KICK', color: '#00f3ff', position: [-2.6, -0.7, 0.4], rotation: [0.15, 0.3, 0], radius: 0.65, height: 0.5 },
  { id: 'tom', name: 'TOM', color: '#f59e0b', position: [-1.4, 0.3, -0.5], rotation: [0.3, 0.2, 0], radius: 0.48, height: 0.4 },
  { id: 'snare', name: 'SNARE', color: '#00ff9d', position: [0.0, -0.45, 0.7], rotation: [0.08, 0, 0], radius: 0.58, height: 0.35 },
  { id: 'hihat', name: 'HI-HAT', color: '#ec4899', position: [1.4, 0.35, -0.5], rotation: [-0.15, -0.15, 0], radius: 0.55, height: 0.08, isCymbal: true },
  { id: 'crash', name: 'CRASH', color: '#a855f7', position: [2.6, 0.65, 0.3], rotation: [-0.25, -0.3, 0], radius: 0.68, height: 0.08, isCymbal: true },
]

function SingleWireframeDrum({ spec, isTargeted, onHit }) {
  const groupRef = useRef()
  const ringRef = useRef()
  const [hit, setHit] = useState(false)
  const scaleRef = useRef(1.0)
  const lastHitRef = useRef(0)

  const trigger = (e) => {
    if (e) e.stopPropagation()
    const now = performance.now()
    if (now - lastHitRef.current < 160) return
    lastHitRef.current = now

    scaleRef.current = 1.35
    setHit(true)
    playDrumSound(spec.name)
    if (onHit) onHit(spec.name)

    setTimeout(() => {
      scaleRef.current = 1.0
      setHit(false)
    }, 200)
  }

  useFrame((_, delta) => {
    if (groupRef.current) {
      const baseScale = isTargeted ? 1.08 + Math.sin(Date.now() * 0.006) * 0.04 : 1.0
      const currentScale = Math.max(baseScale, scaleRef.current)
      groupRef.current.scale.lerp(new THREE.Vector3(currentScale, currentScale, currentScale), delta * 14)
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (isTargeted ? 1.2 : 0.4)
    }
  })

  const activeColor = hit ? '#FFFFFF' : isTargeted ? '#00f3ff' : spec.color

  return (
    <group 
      ref={groupRef} 
      position={spec.position} 
      rotation={spec.rotation} 
      onClick={trigger}
    >
      {/* 3D Wireframe Mesh Body */}
      <mesh>
        {spec.isCymbal ? (
          <coneGeometry args={[spec.radius, spec.height, 18, 2, true]} />
        ) : (
          <cylinderGeometry args={[spec.radius, spec.radius * 0.95, spec.height, 18, 4, true]} />
        )}
        <meshBasicMaterial 
          color={activeColor} 
          wireframe 
          transparent 
          opacity={hit ? 1.0 : isTargeted ? 0.95 : 0.7} 
        />
      </mesh>

      {/* Wireframe Head / Rim */}
      <mesh position={[0, spec.isCymbal ? 0 : spec.height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[spec.radius * 0.25, spec.radius, 18, 2]} />
        <meshBasicMaterial 
          color={activeColor} 
          wireframe 
          transparent 
          opacity={hit ? 1.0 : 0.65} 
        />
      </mesh>

      {/* Outer Orbiting Wireframe Ring */}
      <mesh ref={ringRef} position={[0, spec.isCymbal ? 0 : spec.height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[spec.radius * 1.15, spec.radius * 1.25, 20]} />
        <meshBasicMaterial 
          color={activeColor} 
          wireframe 
          transparent 
          opacity={isTargeted ? 0.8 : 0.3} 
        />
      </mesh>
    </group>
  )
}

export function WireframeDrumKit({ onDrumHit }) {
  const [targetedDrum, setTargetedDrum] = useState(null)
  const prevBent = useRef({ thumb: false, index: false, middle: false, ring: false, pinky: false })
  const lastTarget = useRef(null)

  // Real-time Gesture Engine in useFrame (60+ FPS, Zero DOM Thrashing)
  useFrame(() => {
    const sensor = useSensorStore.getState()
    const settings = useSettingsStore.getState()
    const mode = settings.airDrumMode || 'hybrid'
    const hand = sensor.leftHand.connected ? sensor.leftHand : sensor.rightHand

    if (!hand || !hand.quaternion || !hand.flex) return

    const q = hand.quaternion
    const flex = hand.flex
    const thresholds = settings.leftHandThresholds || { thumb: 380, index: 380, middle: 380, ring: 550, pinky: 650 }

    // 1. Spatial Aiming from Hand Quaternion (Yaw/Pitch)
    let spatialTarget = 'SNARE'
    if (q.y < -0.22) {
      spatialTarget = q.x > 0.15 ? 'TOM' : 'KICK'
    } else if (q.y > 0.22) {
      spatialTarget = q.x > 0.15 ? 'HI-HAT' : 'CRASH'
    } else if (Math.abs(q.y) <= 0.22 && q.x < 0.1) {
      spatialTarget = 'SNARE'
    }

    if (spatialTarget !== lastTarget.current) {
      lastTarget.current = spatialTarget
      setTargetedDrum(spatialTarget)
    }

    // 2. Finger Flex Gesture Triggering
    const isThumb = flex.thumb < thresholds.thumb
    const isIndex = flex.index < thresholds.index
    const isMiddle = flex.middle < thresholds.middle
    const isRing = flex.ring < thresholds.ring
    const isPinky = flex.pinky < thresholds.pinky

    // Check transition from unbent to bent (trigger on edge)
    const justThumb = isThumb && !prevBent.current.thumb
    const justIndex = isIndex && !prevBent.current.index
    const justMiddle = isMiddle && !prevBent.current.middle
    const justRing = isRing && !prevBent.current.ring
    const justPinky = isPinky && !prevBent.current.pinky

    prevBent.current = { thumb: isThumb, index: isIndex, middle: isMiddle, ring: isRing, pinky: isPinky }

    // Execute based on Air Drum Mode
    if (mode === 'hybrid') {
      // Point hand to spatial target + any finger tap triggers the hit
      if (justIndex || justThumb || justMiddle) {
        playDrumSound(spatialTarget)
        if (onDrumHit) onDrumHit(spatialTarget)
      }
    } else if (mode === 'fingers') {
      // Direct 1-to-1 finger per drum
      if (justThumb) { playDrumSound('KICK'); if (onDrumHit) onDrumHit('KICK'); }
      if (justIndex) { playDrumSound('SNARE'); if (onDrumHit) onDrumHit('SNARE'); }
      if (justMiddle) { playDrumSound('TOM'); if (onDrumHit) onDrumHit('TOM'); }
      if (justRing) { playDrumSound('HI-HAT'); if (onDrumHit) onDrumHit('HI-HAT'); }
      if (justPinky) { playDrumSound('CRASH'); if (onDrumHit) onDrumHit('CRASH'); }
    } else if (mode === 'kinetic') {
      // Downward wrist flick into zone
      if (q.x < -0.32 && !prevBent.current.kineticFlick) {
        prevBent.current.kineticFlick = true
        playDrumSound(spatialTarget)
        if (onDrumHit) onDrumHit(spatialTarget)
      } else if (q.x > -0.15) {
        prevBent.current.kineticFlick = false
      }
    }
  })

  return (
    <group position={[0, 0, 0]}>
      {DRUM_SPECS.map((spec) => (
        <SingleWireframeDrum 
          key={spec.id}
          spec={spec}
          isTargeted={targetedDrum === spec.name}
          onHit={onDrumHit}
        />
      ))}
    </group>
  )
}

export default WireframeDrumKit
