import React, { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { HOLOGRAPHIC_DRUMS } from '../utils/constants'
import { DrumPad } from './DrumPad'
import { HandController } from './HandController'
import { HolographicGrid } from './HolographicGrid'
import { ParticleField } from './ParticleField'
import { usePointerParallax } from '../hooks/usePointerParallax'

// Inner Scene component with camera parallax hook
function InnerDrumScene({
  activeBurst,
  triggeredDrums,
  onDrumHit,
  onHoverChange,
  handControllerRef
}) {
  // Subtle camera mouse parallax
  usePointerParallax(0.28)

  return (
    <>
      <color attach="background" args={['#02050e']} />
      <fog attach="fog" args={['#02050e', 6, 26]} />

      {/* Atmospheric Lighting */}
      <ambientLight intensity={0.35} color="#102040" />
      <directionalLight position={[0, 6, 4]} intensity={0.7} color="#e0f8ff" />
      <pointLight position={[-4, 2, 1]} intensity={0.6} color="#00f3ff" distance={10} />
      <pointLight position={[4, 2, 1]} intensity={0.6} color="#0066ff" distance={10} />

      {/* Perspective Infinite Grid Floor */}
      <HolographicGrid />

      {/* Floating Cosmic Dust & Localized Drum Bursts */}
      <ParticleField activeBurst={activeBurst} />

      {/* 6 Spatial 3D Holographic Drum Pads */}
      {HOLOGRAPHIC_DRUMS.map((drum) => (
        <DrumPad
          key={drum.id}
          drum={drum}
          isTriggered={triggeredDrums[drum.id]}
          onHit={onDrumHit}
          onHoverChange={onHoverChange}
        />
      ))}

      {/* Two Reactive Hands with Drumsticks at Bottom-Center */}
      <HandController ref={handControllerRef} />

      {/* Damped Orbit Controls */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3.5}
        maxDistance={7.5}
        minPolarAngle={Math.PI / 4.2}
        maxPolarAngle={Math.PI / 2.05}
        minAzimuthAngle={-Math.PI / 6}
        maxAzimuthAngle={Math.PI / 6}
        dampingFactor={0.05}
      />
    </>
  )
}

export function HolographicDrumScene({
  activeBurst,
  triggeredDrums = {},
  onDrumHit,
  onHoverChange,
  handControllerRef
}) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', outline: 'none' }}>
      <Canvas
        camera={{ position: [0, 0.45, 5.0], fov: 46 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false
        }}
      >
        <InnerDrumScene
          activeBurst={activeBurst}
          triggeredDrums={triggeredDrums}
          onDrumHit={onDrumHit}
          onHoverChange={onHoverChange}
          handControllerRef={handControllerRef}
        />
      </Canvas>
    </div>
  )
}
