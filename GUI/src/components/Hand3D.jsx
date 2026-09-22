import React, { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Grid, PresentationControls } from '@react-three/drei'
import * as THREE from 'three'
import useSensorStore from '../store/sensorStore'
import useSettingsStore from '../store/settingsStore'

// Hologram Designs: 1. 3D Mesh Matrix, 2. Quantum Point Cloud (media_1789762334533.png)
export const HOLOGRAM_DESIGNS = {
  wireframe: {
    id: 'wireframe',
    name: '3D MESH MATRIX',
    shortName: '3D MESH MATRIX',
    badge: 'POLYGONAL GRID',
    desc: 'Geometric 3D wireframe polygon coordinate lattice with luminous joints',
    source: 'Default 3D Mesh'
  },
  particles: {
    id: 'particles',
    name: 'QUANTUM POINT CLOUD',
    shortName: 'QUANTUM PARTICLES',
    badge: 'NEBULA STARDUST',
    desc: 'Luminous celestial particle cloud with shimmering quantum stardust nodes',
    source: 'media_1789762334533.png'
  }
}

// Color Palettes with HDR Bloom Multipliers for High-Visibility Glow
export const HAND_STYLES = {
  cyan: {
    id: 'cyan',
    name: 'NEBULA CYAN',
    label: 'Nebula Cyan',
    hexBase: '#00D2FF',
    hexBent: '#7DD3FC',
    scalarBase: 2.8,
    scalarBent: 4.4,
    tag: 'COSMIC CYAN',
    desc: 'Luminous celestial cyan starlight with electric ice-blue dispersion'
  },
  purple: {
    id: 'purple',
    name: 'DARK PURPLE',
    label: 'Dark Purple',
    hexBase: '#9D4EDD',
    hexBent: '#E056FD',
    scalarBase: 2.5,
    scalarBent: 3.8,
    tag: 'CYBER VIOLET',
    desc: 'Deep cyber violet wireframe with radiant electric violet flex bloom'
  },
  gold: {
    id: 'gold',
    name: 'GOLDEN',
    label: 'Holographic Gold',
    hexBase: '#FFD700',
    hexBent: '#FFA500',
    scalarBase: 2.8,
    scalarBent: 4.2,
    tag: 'HOLOGRAPHIC GOLD',
    desc: 'Polished golden laser wireframe with incandescent amber bloom'
  }
}

// Reusable Color object to prevent GC allocations in useFrame
const _tempTargetColor = new THREE.Color()

// Generate dynamic HDR Three.js colors on demand with separate glowMultiplier
export function getStyleColor(styleKey, isBent = false, glowMultiplier = 1.0, outColor = null) {
  const s = HAND_STYLES[styleKey] || HAND_STYLES.cyan || HAND_STYLES.purple
  const hex = isBent ? s.hexBent : s.hexBase
  const scalar = (isBent ? s.scalarBent : s.scalarBase) * glowMultiplier
  const result = outColor || new THREE.Color()
  return result.set(hex).multiplyScalar(scalar)
}

// Quantum Particle Cloud Shaders (Replicating media_1789762334533.png stardust nebula)
const PARTICLE_VERTEX_SHADER = `
  uniform float uTime;

  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aNormal;

  varying float vTwinkle;

  void main() {
    vec3 pos = position;
    
    // Subtle organic floating drift along normal (stardust aura)
    float drift = sin(uTime * 1.5 + aPhase) * 0.25;
    pos += aNormal * drift;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Organic twinkle [0.65, 1.0]
    float twinkle = 0.65 + 0.35 * sin(uTime * 2.5 + aPhase * 2.0);
    vTwinkle = twinkle;
    
    // Point size: small, delicate stardust pinpoints (clamped between 1.2px and 7.5px)
    float pSize = aSize * (30.0 / -mvPosition.z);
    gl_PointSize = clamp(pSize * twinkle, 1.2, 7.5);
    
    gl_Position = projectionMatrix * mvPosition;
  }
`

const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 uColor;

  varying float vTwinkle;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    
    // Crisp circular particle with smooth soft edge
    float alpha = smoothstep(0.5, 0.15, dist);
    
    // White-hot star core at the very center
    float core = smoothstep(0.18, 0.0, dist);
    
    // Base starlight color (calibrated to sparkle without blowing out)
    vec3 starColor = mix(uColor * 0.35, vec3(1.0) * 1.2, core * 0.70);
    
    gl_FragColor = vec4(starColor, alpha * vTwinkle * 0.85);
  }
`

// Generate high-density surface particle cloud from hand mesh
function generateParticleGeometry(scene, center, numParticles = 4800) {
  let mesh = null
  scene.traverse((child) => {
    if (child.isMesh && !mesh) mesh = child
  })
  if (!mesh || !mesh.geometry) return null

  const geom = mesh.geometry
  const posAttr = geom.attributes.position
  const indexAttr = geom.index

  if (!posAttr) return null

  const count = numParticles
  const pPos = new Float32Array(count * 3)
  const pNorm = new Float32Array(count * 3)
  const pSize = new Float32Array(count)
  const pPhase = new Float32Array(count)

  const positions = posAttr.array
  const hasIndex = !!indexAttr
  const indices = hasIndex ? indexAttr.array : null
  const triangleCount = hasIndex ? indices.length / 3 : posAttr.count / 3

  for (let i = 0; i < count; i++) {
    const tri = Math.floor(Math.random() * triangleCount)
    let i0, i1, i2
    if (hasIndex) {
      i0 = indices[tri * 3] * 3
      i1 = indices[tri * 3 + 1] * 3
      i2 = indices[tri * 3 + 2] * 3
    } else {
      i0 = tri * 9
      i1 = tri * 9 + 3
      i2 = tri * 9 + 6
    }

    let r1 = Math.random()
    let r2 = Math.random()
    if (r1 + r2 > 1) {
      r1 = 1 - r1
      r2 = 1 - r2
    }
    const r0 = 1 - r1 - r2

    const x = r0 * positions[i0] + r1 * positions[i1] + r2 * positions[i2]
    const y = r0 * positions[i0 + 1] + r1 * positions[i1 + 1] + r2 * positions[i2 + 1]
    const z = r0 * positions[i0 + 2] + r1 * positions[i1 + 2] + r2 * positions[i2 + 2]

    // Triangle Normal
    const ax = positions[i1] - positions[i0]
    const ay = positions[i1 + 1] - positions[i0 + 1]
    const az = positions[i1 + 2] - positions[i0 + 2]
    const bx = positions[i2] - positions[i0]
    const by = positions[i2 + 1] - positions[i0 + 1]
    const bz = positions[i2 + 2] - positions[i0 + 2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    nx /= len
    ny /= len
    nz /= len

    // Ethereal nebula dispersion: most on surface (0.1-0.6), few floating outward (0.6-2.0)
    const rand = Math.random()
    const dispersion = rand < 0.22 ? (0.5 + Math.random() * 2.0) : (Math.random() * 0.5)

    // Center coordinates to match modelRef centered position
    pPos[i * 3] = (x + nx * dispersion) - center.x
    pPos[i * 3 + 1] = (y + ny * dispersion) - center.y
    pPos[i * 3 + 2] = (z + nz * dispersion) - center.z

    pNorm[i * 3] = nx
    pNorm[i * 3 + 1] = ny
    pNorm[i * 3 + 2] = nz

    // Size distribution: majority tiny pinpoints (1.0-2.2), some medium (2.2-3.5), few bright nodes (3.5-5.0)
    pSize[i] = rand < 0.78 ? 1.0 + Math.random() * 1.2 : rand < 0.95 ? 2.2 + Math.random() * 1.3 : 3.5 + Math.random() * 1.5
    pPhase[i] = Math.random() * 6.28318
  }

  const pGeom = new THREE.BufferGeometry()
  pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  pGeom.setAttribute('aNormal', new THREE.BufferAttribute(pNorm, 3))
  pGeom.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1))
  pGeom.setAttribute('aPhase', new THREE.BufferAttribute(pPhase, 1))

  return pGeom
}

function createHologramMaterial(design, color, center = new THREE.Vector3(-156.03, -350.53, -0.63)) {
  if (design === 'particles') {
    // Dark cosmic obsidian occlusion shell
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x020814),
      transparent: true,
      opacity: 0.82,
      depthWrite: true,
      side: THREE.FrontSide,
    })
  }

  return new THREE.MeshBasicMaterial({
    color: color.clone(),
    wireframe: true,
    opacity: 0.95,
    transparent: true,
    side: THREE.FrontSide,
    toneMapped: false,
  })
}

function WireframeHand({ position, rotation, label }) {
  const pivotRef = useRef()
  const modelRef = useRef()
  const meshesRef = useRef([])
  const pointsRef = useRef()
  const centerRef = useRef(new THREE.Vector3(-156.03, -350.53, -0.63))
  
  const handStyle = useSettingsStore((state) => state.handStyle || 'purple')
  const hologramDesign = useSettingsStore((state) => state.hologramDesign || 'wireframe')
  const glowIntensity = useSettingsStore((state) => state.glowIntensity ?? 2.0)
  
  const { scene } = useGLTF('/model/hand.glb')
  const handScene = useMemo(() => scene.clone(), [scene])
  
  // Quantum particle geometry sampled from hand mesh
  const particleGeometry = useMemo(() => {
    return generateParticleGeometry(handScene, centerRef.current, 4800)
  }, [handScene])

  const particleMaterial = useMemo(() => {
    const initialColor = getStyleColor(handStyle, false, glowIntensity)
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: initialColor.clone() },
        uTime: { value: 0 },
      },
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
    })
  }, [])

  const pointsMesh = useMemo(() => {
    if (!particleGeometry) return null
    const pts = new THREE.Points(particleGeometry, particleMaterial)
    pts.visible = (hologramDesign === 'particles')
    return pts
  }, [particleGeometry, particleMaterial])

  const handData = useSensorStore((state) => 
    label === 'LEFT' ? state.leftHand : state.rightHand
  )
  
  const { quaternion, flex } = handData
  
  const thresholds = label === 'LEFT' 
    ? { thumb: 350, index: 350, middle: 350, ring: 550, pinky: 650 }
    : { thumb: 760, index: 550, middle: 650, ring: 560, pinky: 560 }
  
  // 1. Initial 3D Scene Setup & Material Binding
  useEffect(() => {
    if (handScene && modelRef.current) {
      const box = new THREE.Box3().setFromObject(handScene)
      const center = box.getCenter(new THREE.Vector3())
      centerRef.current.copy(center)
      handScene.position.set(-center.x, -center.y, -center.z)
      
      const collectedMeshes = []
      const initialColor = getStyleColor(handStyle, false, glowIntensity)
      
      handScene.traverse((child) => {
        if (child.isMesh) {
          const mat = createHologramMaterial(hologramDesign, initialColor, center)
          child.material = mat
          collectedMeshes.push(child)
        }
      })
      
      meshesRef.current = collectedMeshes
      modelRef.current.add(handScene)
    }
  }, [handScene])
  
  // 2. React immediately whenever hologramDesign changes in store
  useEffect(() => {
    const baseColor = getStyleColor(handStyle, false, glowIntensity)
    meshesRef.current.forEach((child) => {
      if (child.material) {
        child.material.dispose()
        child.material = createHologramMaterial(hologramDesign, baseColor, centerRef.current)
      }
    })
    if (pointsRef.current) {
      pointsRef.current.visible = (hologramDesign === 'particles')
    }
  }, [hologramDesign])

  // 3. React immediately whenever handStyle or glowIntensity changes in store
  useEffect(() => {
    const baseColor = getStyleColor(handStyle, false, glowIntensity)
    meshesRef.current.forEach((child) => {
      if (child.material) {
        if (child.material.isShaderMaterial) {
          child.material.uniforms.uColor.value.copy(baseColor)
        } else if (hologramDesign === 'particles') {
          child.material.color.set(0x020610)
        } else {
          child.material.color.copy(baseColor)
        }
      }
    })
    if (particleMaterial) {
      particleMaterial.uniforms.uColor.value.copy(baseColor)
    }
  }, [handStyle, glowIntensity, hologramDesign])

  // 4. Animation & Dynamic Frame Loop
  useFrame((state) => {
    if (pivotRef.current && quaternion) {
      pivotRef.current.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    }

    const time = state.clock.getElapsedTime()
    
    // Check if any finger is bent
    let isAnyBent = false
    if (flex) {
      isAnyBent = Object.entries(flex).some(([finger, value]) => {
        const thresh = thresholds[finger] || 500
        return value < thresh
      })
    }

    getStyleColor(handStyle, isAnyBent, glowIntensity, _tempTargetColor)
    
    // Smooth holographic luminous breathing pulse
    if (hologramDesign === 'particles') {
      const pulse = 1.0 + Math.sin(time * 3.0) * 0.08
      _tempTargetColor.multiplyScalar(pulse)
    }

    meshesRef.current.forEach((child) => {
      if (child.material) {
        if (child.material.isShaderMaterial) {
          child.material.uniforms.uColor.value.lerp(_tempTargetColor, 0.25)
          child.material.uniforms.uTime.value = time
        } else if (hologramDesign === 'particles') {
          // Keep base mesh dark obsidian to preserve depth and prevent white blowout
          child.material.color.set(0x020610)
        } else {
          child.material.color.lerp(_tempTargetColor, 0.25)
        }
      }
    })

    if (pointsRef.current) {
      pointsRef.current.visible = (hologramDesign === 'particles')
      if (hologramDesign === 'particles' && particleMaterial) {
        particleMaterial.uniforms.uColor.value.lerp(_tempTargetColor, 0.25)
        particleMaterial.uniforms.uTime.value = time
      }
    }
  })
  
  // Reduced visual scale (0.050)
  const visualScale = label === 'LEFT' ? [-0.050, 0.050, 0.050] : [0.050, 0.050, 0.050]
  
  return (
    <group position={position} rotation={rotation}>
      <PresentationControls
        speed={1.5}
        global
        polar={[-0.2, Math.PI / 3]}
        azimuth={[-Math.PI / 3, Math.PI / 3]}
      >
        <group ref={pivotRef}>
          <group ref={modelRef} scale={visualScale}>
            {pointsMesh && <primitive object={pointsMesh} ref={pointsRef} />}
          </group>
        </group>
      </PresentationControls>
    </group>
  )
}

// 3D Space Cyberpunk Grid in Black & White moving continuously forward (High FPS Optimized)
export function CyberSpaceGrid({ speed = 3.5 }) {
  const groundRef = useRef()
  const ceilingRef = useRef()

  useFrame((state, delta) => {
    // Continuously glide forward (towards camera) along Z axis
    if (groundRef.current) {
      groundRef.current.position.z = (groundRef.current.position.z + delta * speed) % 3
    }
    if (ceilingRef.current) {
      ceilingRef.current.position.z = (ceilingRef.current.position.z + delta * speed) % 3.6
    }
  })

  return (
    <group>
      {/* 1. Ground Infinite Cyberpunk Perspective Grid in Black & White (Moving Forward) */}
      <group ref={groundRef}>
        <Grid 
          position={[0, -2.6, 0]} 
          args={[44, 44]} 
          cellSize={0.6} 
          cellThickness={0.6} 
          cellColor="#222222" 
          sectionSize={3} 
          sectionThickness={1.1} 
          sectionColor="#666666" 
          fadeDistance={28} 
          fadeStrength={1.2} 
          followCamera={false} 
          infiniteGrid={true}
        />
      </group>

      {/* 2. Inverted Space Ceiling Grid (Moving Forward) */}
      <group ref={ceilingRef}>
        <Grid 
          position={[0, 4.5, 0]} 
          args={[44, 44]} 
          cellSize={1.2} 
          cellThickness={0.4} 
          cellColor="#101010" 
          sectionSize={3.6} 
          sectionThickness={0.7} 
          sectionColor="#242424" 
          fadeDistance={24} 
          fadeStrength={1.2} 
          followCamera={false} 
          infiniteGrid={true}
        />
      </group>

      {/* 3. Back Depth Perspective Matrix Grid Plane */}
      <Grid 
        position={[0, 0.9, -14]} 
        rotation={[Math.PI / 2, 0, 0]}
        args={[40, 20]} 
        cellSize={1.2} 
        cellThickness={0.4} 
        cellColor="#121212" 
        sectionSize={3.6} 
        sectionThickness={0.7} 
        sectionColor="#202020" 
        fadeDistance={20} 
        fadeStrength={1.2} 
        followCamera={false} 
      />
    </group>
  )
}

useGLTF.preload('/model/hand.glb')

export { WireframeHand as HolographicHand }
export default WireframeHand
