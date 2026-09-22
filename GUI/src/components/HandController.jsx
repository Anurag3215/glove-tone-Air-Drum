import React, { useRef, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { DrumStick } from './DrumStick'

// Cybernetic / Holographic Hand Mesh holding the stick grip
function CyberHandMesh({ side = 'left' }) {
  const isLeft = side === 'left'
  const sign = isLeft ? -1 : 1

  return (
    <group rotation={[0, 0, sign * 0.15]}>
      {/* Forearm base */}
      <mesh position={[0, -0.38, -0.08]} rotation={[0.2, 0, 0]}>
        <cylinderGeometry args={[0.075, 0.085, 0.55, 16]} />
        <meshStandardMaterial
          color="#060b18"
          metalness={0.85}
          roughness={0.3}
          emissive="#001830"
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* Cybernetic Forearm Trim Lines */}
      <mesh position={[0, -0.22, -0.06]}>
        <torusGeometry args={[0.082, 0.006, 8, 24]} />
        <meshBasicMaterial color="#00f3ff" transparent opacity={0.65} />
      </mesh>

      {/* Wrist Joint */}
      <mesh position={[0, -0.08, 0]}>
        <sphereGeometry args={[0.072, 16, 16]} />
        <meshStandardMaterial
          color="#0b1426"
          metalness={0.9}
          roughness={0.2}
          emissive="#002244"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Palm holding stick */}
      <mesh position={[sign * 0.01, 0.06, 0.02]} rotation={[0.1, sign * 0.1, 0]}>
        <boxGeometry args={[0.085, 0.12, 0.065]} />
        <meshStandardMaterial
          color="#0a1224"
          metalness={0.8}
          roughness={0.25}
          emissive="#001830"
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* Curved Fingers wrapped around the stick */}
      {[0.02, 0.05, 0.08, 0.11].map((yOffset, i) => (
        <mesh
          key={i}
          position={[sign * 0.038, yOffset, 0.025]}
          rotation={[0, 0, sign * 0.35]}
        >
          <capsuleGeometry args={[0.011, 0.045, 6, 8]} />
          <meshStandardMaterial
            color="#080f20"
            metalness={0.88}
            roughness={0.22}
            emissive="#00f3ff"
            emissiveIntensity={0.12}
          />
        </mesh>
      ))}

      {/* Thumb wrapped around opposite side */}
      <mesh position={[sign * -0.035, 0.04, 0.02]} rotation={[0.4, sign * -0.3, sign * -0.4]}>
        <capsuleGeometry args={[0.013, 0.05, 6, 8]} />
        <meshStandardMaterial
          color="#0a1528"
          metalness={0.88}
          roughness={0.22}
          emissive="#00f3ff"
          emissiveIntensity={0.15}
        />
      </mesh>
    </group>
  )
}

export const HandController = forwardRef(function HandController(props, ref) {
  const leftStickRef = useRef()
  const rightStickRef = useRef()
  const leftHandGroup = useRef()
  const rightHandGroup = useRef()

  const lastUsedHand = useRef('right')

  // Smooth breathing animation for resting hands
  useFrame(() => {
    const time = performance.now() * 0.0012
    if (leftHandGroup.current) {
      leftHandGroup.current.position.y = -1.65 + Math.sin(time) * 0.008
    }
    if (rightHandGroup.current) {
      rightHandGroup.current.position.y = -1.65 + Math.cos(time) * 0.008
    }
  })

  useImperativeHandle(ref, () => ({
    strikeDrum: (drum) => {
      // Determine which hand strikes the drum
      let handToUse = drum.hand || 'both'
      if (handToUse === 'both') {
        // Alternate for center kick drum
        handToUse = lastUsedHand.current === 'left' ? 'right' : 'left'
      }
      lastUsedHand.current = handToUse

      if (handToUse === 'left' && leftStickRef.current) {
        leftStickRef.current.strike(drum.pos3d)
      } else if (handToUse === 'right' && rightStickRef.current) {
        rightStickRef.current.strike(drum.pos3d)
      }
    }
  }))

  return (
    <group position={[0, 0, 0]}>
      {/* LEFT HAND + DRUMSTICK */}
      <group ref={leftHandGroup} position={[-0.45, -1.65, 2.2]}>
        <CyberHandMesh side="left" />
        <DrumStick
          ref={leftStickRef}
          side="left"
          basePosition={[0, 0.06, 0]}
          restRotation={[0.45, 0.22, -0.12]}
        />
      </group>

      {/* RIGHT HAND + DRUMSTICK */}
      <group ref={rightHandGroup} position={[0.45, -1.65, 2.2]}>
        <CyberHandMesh side="right" />
        <DrumStick
          ref={rightStickRef}
          side="right"
          basePosition={[0, 0.06, 0]}
          restRotation={[0.45, -0.22, 0.12]}
        />
      </group>
    </group>
  )
})
