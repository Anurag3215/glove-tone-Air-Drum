import { create } from 'zustand'
import * as THREE from 'three'

// Mock sensor data store
const useSensorStore = create((set) => ({
  // Left hand data
  leftHand: {
    quaternion: { w: 1, x: 0, y: 0, z: 0 },
    flex: {
      thumb: 820,
      index: 750,
      middle: 710,
      ring: 680,
      pinky: 590
    },
    connected: true,
    sampleRate: 120
  },
  
  // Right hand data
  rightHand: {
    quaternion: { w: 1, x: 0, y: 0, z: 0 },
    flex: {
      thumb: 850,
      index: 800,
      middle: 790,
      ring: 720,
      pinky: 680
    },
    fsr: 0,
    connected: true,
    sampleRate: 120
  },
  
  // Update left hand
  updateLeftHand: (data) => set((state) => ({
    leftHand: { ...state.leftHand, ...data }
  })),
  
  // Update right hand
  updateRightHand: (data) => set((state) => ({
    rightHand: { ...state.rightHand, ...data }
  })),
  
  // Start mock sensor simulation - FAST AND DYNAMIC
  startMockData: () => {
    let time = 0
    const interval = setInterval(() => {
      time += 0.008  // Fast progression
      
      // Dynamic rotation - different speeds for each axis
      const rotX = Math.sin(time * 1.5) * 0.5
      const rotY = Math.cos(time * 1.2) * 0.5
      const rotZ = Math.sin(time * 0.8) * 0.3
      
      // Create quaternion from euler angles
      const euler = new THREE.Euler(rotX, rotY, rotZ, 'XYZ')
      const quat = new THREE.Quaternion().setFromEuler(euler)
      
      // Dynamic flex values - different patterns for each finger
      const leftFlex = {
        thumb: 350 + Math.sin(time * 2.1) * 150,
        index: 350 + Math.sin(time * 1.8) * 200,
        middle: 350 + Math.cos(time * 2.3) * 180,
        ring: 550 + Math.sin(time * 1.5) * 250,
        pinky: 650 + Math.cos(time * 1.9) * 300,
      }
      
      const rightFlex = {
        thumb: 760 + Math.cos(time * 2.0) * 300,
        index: 550 + Math.sin(time * 2.5) * 250,
        middle: 650 + Math.cos(time * 1.7) * 280,
        ring: 560 + Math.sin(time * 2.2) * 240,
        pinky: 560 + Math.cos(time * 1.6) * 260,
      }
      
      set({
        leftHand: {
          connected: true,
          quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
          flex: leftFlex,
          sampleRate: 60,
        },
        rightHand: {
          connected: true,
          quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
          flex: rightFlex,
          sampleRate: 60,
        }
      })
    }, 1000 / 60)  // 60 FPS - smooth but not laggy
    
    return () => clearInterval(interval)
  }
}))

export default useSensorStore
