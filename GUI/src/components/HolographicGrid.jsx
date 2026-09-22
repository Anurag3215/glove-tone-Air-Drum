import React, { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export function HolographicGrid() {
  const gridMeshRef = useRef()
  const offsetRef = useRef(0)

  // Custom shader material for the perspective grid with horizon fade
  const gridMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#00f3ff') },
        uDeepBlue: { value: new THREE.Color('#0033aa') },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uDeepBlue;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          // World coordinate grid mapping
          vec2 coord = vWorldPos.xz * 1.8;
          coord.y += uTime * 0.45; // forward slow energy drift

          // Grid lines
          vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
          float line = 1.0 - min(min(grid.x, grid.y), 1.0);

          // Distance from camera for smooth horizon attenuation
          float dist = length(vWorldPos.xz - vec2(0.0, 0.0));
          float fade = smoothstep(18.0, 1.5, dist);
          float forwardFade = smoothstep(-3.0, 0.5, vWorldPos.z); // Fade near camera

          // Holographic pulse waves traveling forward
          float pulse = sin(vWorldPos.z * 1.5 - uTime * 2.0) * 0.5 + 0.5;
          vec3 finalColor = mix(uDeepBlue, uColor, line * 0.7 + pulse * 0.3);

          float alpha = line * fade * forwardFade * 0.42;

          if (alpha < 0.01) discard;
          gl_FragColor = vec4(finalColor, alpha);
        }
      `
    })
  }, [])

  useFrame((_, delta) => {
    if (gridMaterial) {
      gridMaterial.uniforms.uTime.value += delta
    }
  })

  return (
    <group position={[0, -2.1, 0]}>
      {/* Perspective Infinite Grid Plane */}
      <mesh 
        ref={gridMeshRef} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, -4]}
        material={gridMaterial}
      >
        <planeGeometry args={[36, 40, 64, 64]} />
      </mesh>

      {/* Subtle Atmospheric Floor Glow Disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[5.5, 32]} />
        <meshBasicMaterial 
          color="#002255" 
          transparent 
          opacity={0.18} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
