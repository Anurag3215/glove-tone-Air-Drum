import React, { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Grid, PresentationControls } from '@react-three/drei'
import * as THREE from 'three'
import useSensorStore from '../store/sensorStore'

function WireframeHand({ position, rotation, label }) {
  const pivotRef = useRef()
  const modelRef = useRef()
  const materialsRef = useRef({})
  
  const { scene } = useGLTF('/model/hand.glb')
  const handScene = useMemo(() => scene.clone(), [scene])
  
  const handData = useSensorStore((state) => 
    label === 'LEFT' ? state.leftHand : state.rightHand
  )
  
  const { quaternion, flex } = handData
  
  const thresholds = label === 'LEFT' 
    ? { thumb: 350, index: 350, middle: 350, ring: 550, pinky: 650 }
    : { thumb: 760, index: 550, middle: 650, ring: 560, pinky: 560 }
  
  // Setup once
  useEffect(() => {
    if (handScene && modelRef.current) {
      const box = new THREE.Box3().setFromObject(handScene)
      const center = box.getCenter(new THREE.Vector3())
      handScene.position.set(-center.x, -center.y, -center.z)
      
      // Create materials once and store references
      handScene.traverse((child) => {
        if (child.isMesh) {
          const name = child.name.toLowerCase()
          const mat = new THREE.MeshBasicMaterial({
            color: '#FFD700',
            wireframe: true,
            opacity: 0.8,
            transparent: true,
            side: THREE.DoubleSide
          })
          child.material = mat
          
          // Store material reference by finger name for later color updates
          if (name.includes('thumb')) materialsRef.current.thumb = mat
          else if (name.includes('index')) materialsRef.current.index = mat
          else if (name.includes('middle')) materialsRef.current.middle = mat
          else if (name.includes('ring')) materialsRef.current.ring = mat
          else if (name.includes('pinky') || name.includes('little')) materialsRef.current.pinky = mat
        }
      })
      
      modelRef.current.add(handScene)
    }
  }, [handScene])
  
  // Update rotation and finger colors every frame
  useFrame(() => {
    if (pivotRef.current && quaternion) {
      pivotRef.current.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    }
    
    // Update finger colors based on flex
    Object.entries(flex).forEach(([finger, value]) => {
      const mat = materialsRef.current[finger]
      if (mat) {
        const isBent = value < thresholds[finger]
        mat.color.set(isBent ? '#FF3333' : '#FFD700')
      }
    })
  })
  
  const visualScale = label === 'LEFT' ? [-0.05, 0.05, 0.05] : [0.05, 0.05, 0.05]
  
  return (
    <group position={position} rotation={rotation}>
      <PresentationControls
        speed={1.5}
        global
        polar={[-0.1, Math.PI / 4]}
        azimuth={[-Math.PI / 4, Math.PI / 4]}
      >
        <group ref={pivotRef}>
          <group ref={modelRef} scale={visualScale} />
        </group>
      </PresentationControls>
      <Grid 
        position={[0, -2, 0]} 
        args={[10.5, 10.5]} 
        cellSize={0.5} 
        cellThickness={0.5} 
        cellColor="#6f6f6f" 
        sectionSize={3} 
        sectionThickness={1} 
        sectionColor="#9d4b4b" 
        fadeDistance={30} 
        fadeStrength={1} 
        followCamera={false} 
        infiniteGrid={true}
      />
    </group>
  )
}

useGLTF.preload('/model/hand.glb')

export default WireframeHand
