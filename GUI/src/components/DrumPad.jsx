import React, { useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export function DrumPad({
  drum,
  isTriggered,
  onHit,
  onHoverChange
}) {
  const groupRef = useRef()
  const membraneRef = useRef()
  const rippleRef = useRef()
  const innerRingRef = useRef()
  const glowLightRef = useRef()

  const [isHovered, setIsHovered] = useState(false)

  // Spring physics state for hit compression and rebound
  const spring = useRef({
    displacement: 0,
    velocity: 0,
    glow: 1.0,
    rippleScale: 0.1,
    rippleOpacity: 0
  })

  // Mechanical bracket lugs placed radially around the rim
  const lugs = useMemo(() => {
    const items = []
    const count = drum.isCymbal ? 3 : 6
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const x = Math.cos(angle) * (drum.radius * 1.02)
      const z = Math.sin(angle) * (drum.radius * 1.02)
      items.push({ x, z, angle })
    }
    return items
  }, [drum.radius, drum.isCymbal])

  // Trigger hit animation
  const triggerHit = (e) => {
    if (e) e.stopPropagation()
    // Spring impulse
    spring.current.velocity = -0.45
    spring.current.glow = 3.2
    spring.current.rippleScale = 0.15
    spring.current.rippleOpacity = 0.95

    if (onHit) onHit(drum)
  }

  // React to programmatic trigger (finger bend, glove, or stick hit)
  React.useEffect(() => {
    if (isTriggered) {
      spring.current.velocity = -0.45
      spring.current.glow = 3.2
      spring.current.rippleScale = 0.15
      spring.current.rippleOpacity = 0.95
    }
  }, [isTriggered])

  // 60 FPS Physics & Shader update
  useFrame((_, delta) => {
    const time = performance.now() * 0.001

    // Spring physics simulation: F = -k*x - c*v
    const k = 160 // spring stiffness
    const c = 12 // damping coefficient
    const force = -k * spring.current.displacement - c * spring.current.velocity
    spring.current.velocity += force * delta
    spring.current.displacement += spring.current.velocity * delta

    // Glow decay
    spring.current.glow = THREE.MathUtils.lerp(
      spring.current.glow,
      isHovered ? 1.6 : 1.0,
      delta * 6.0
    )

    // Ripple wave expansion
    if (spring.current.rippleOpacity > 0.01) {
      spring.current.rippleScale += delta * 2.8
      spring.current.rippleOpacity = THREE.MathUtils.lerp(spring.current.rippleOpacity, 0, delta * 5.0)
    }

    // Apply displacement to membrane
    if (membraneRef.current) {
      membraneRef.current.position.y = (drum.height / 2) + spring.current.displacement
    }

    // Apply ripple transformation
    if (rippleRef.current) {
      rippleRef.current.scale.set(
        spring.current.rippleScale,
        spring.current.rippleScale,
        1
      )
      rippleRef.current.material.opacity = spring.current.rippleOpacity
    }

    // Gentle holographic floating rotation on inner ring
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z += delta * (isHovered ? 1.8 : 0.8)
    }

    // Subtle breathing floating motion for whole drum
    if (groupRef.current) {
      const floatY = Math.sin(time * 1.5 + drum.pos3d[0]) * 0.015
      groupRef.current.position.y = drum.pos3d[1] + floatY
    }

    // Local point light intensity
    if (glowLightRef.current) {
      glowLightRef.current.intensity = spring.current.glow * 1.2
    }
  })

  const membraneColor = isHovered ? '#1af6ff' : '#00d4ea'

  return (
    <group
      ref={groupRef}
      position={drum.pos3d}
      rotation={drum.rot3d}
      onPointerOver={(e) => {
        e.stopPropagation()
        setIsHovered(true)
        document.body.style.cursor = 'pointer'
        if (onHoverChange) onHoverChange(drum, true)
      }}
      onPointerOut={() => {
        setIsHovered(false)
        document.body.style.cursor = 'default'
        if (onHoverChange) onHoverChange(drum, false)
      }}
      onPointerDown={triggerHit}
    >
      {/* 1. DARK CYLINDRICAL BODY (Metallic Shell with Depth) */}
      <mesh position={[0, 0, 0]}>
        {drum.isCymbal ? (
          <coneGeometry args={[drum.radius, drum.height, 36, 2, true]} />
        ) : (
          <cylinderGeometry args={[drum.radius, drum.radius * 0.94, drum.height, 36, 4, false]} />
        )}
        <meshStandardMaterial
          color="#040813"
          metalness={0.88}
          roughness={0.25}
          emissive="#001833"
          emissiveIntensity={0.35}
        />
      </mesh>

      {/* 2. TRANSLUCENT GLASS / HOLOGRAPHIC DRUM MEMBRANE */}
      <mesh
        ref={membraneRef}
        position={[0, drum.height / 2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[drum.radius * 0.96, 36]} />
        <meshPhysicalMaterial
          color={membraneColor}
          transparent
          opacity={0.42}
          roughness={0.15}
          metalness={0.1}
          transmission={0.65}
          ior={1.4}
          emissive="#00f3ff"
          emissiveIntensity={isHovered ? 0.45 : 0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. THIN CYAN EMISSIVE OUTER RIM */}
      <mesh position={[0, drum.height / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[drum.radius * 0.96, drum.radius * 1.02, 48]} />
        <meshBasicMaterial
          color="#00f3ff"
          transparent
          opacity={isHovered ? 1.0 : 0.85}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 4. SECONDARY INNER CYAN RING WITH ANIMATED TICKS */}
      <mesh
        ref={innerRingRef}
        position={[0, drum.height / 2 + 0.008, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[drum.radius * 0.42, drum.radius * 0.46, 24]} />
        <meshBasicMaterial
          color="#00f3ff"
          wireframe
          transparent
          opacity={isHovered ? 0.9 : 0.6}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 5. CENTER HOLOGRAPHIC CROSSHAIR RETICLE */}
      <mesh position={[0, drum.height / 2 + 0.009, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[drum.radius * 0.08, drum.radius * 0.12, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 6. EXPANDING CIRCULAR RIPPLE ON HIT */}
      <mesh
        ref={rippleRef}
        position={[0, drum.height / 2 + 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[drum.radius * 0.88, drum.radius * 0.96, 36]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 7. MECHANICAL LUGS AROUND RIM */}
      {lugs.map((lug, idx) => (
        <mesh
          key={idx}
          position={[lug.x, drum.height / 4, lug.z]}
          rotation={[0, -lug.angle, 0]}
        >
          <boxGeometry args={[0.04, drum.height * 0.7, 0.06]} />
          <meshStandardMaterial
            color="#081020"
            metalness={0.9}
            roughness={0.2}
            emissive="#00f3ff"
            emissiveIntensity={0.2}
          />
        </mesh>
      ))}

      {/* 8. SUBTLE UNDERSIDE EMISSIVE PROJECTION GLOW */}
      <pointLight
        ref={glowLightRef}
        position={[0, drum.height / 2 + 0.15, 0]}
        distance={2.4}
        intensity={1.0}
        color="#00f3ff"
      />
    </group>
  )
}
