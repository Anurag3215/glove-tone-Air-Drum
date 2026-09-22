import { create } from 'zustand'
import * as THREE from 'three'

// Mock sensor data store
const useSensorStore = create((set, get) => ({
  // Global connection state
  isConnected: true,

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

  // Toggle master connection
  toggleConnection: (forceState) => set((state) => {
    const nextState = forceState !== undefined ? forceState : !state.isConnected
    return {
      isConnected: nextState,
      leftHand: { ...state.leftHand, connected: nextState },
      rightHand: { ...state.rightHand, connected: nextState }
    }
  }),

  // Toggle individual hands
  toggleLeftHand: () => set((state) => {
    const nextConnected = !state.leftHand.connected
    return {
      leftHand: { ...state.leftHand, connected: nextConnected },
      isConnected: nextConnected || state.rightHand.connected
    }
  }),

  toggleRightHand: () => set((state) => {
    const nextConnected = !state.rightHand.connected
    return {
      rightHand: { ...state.rightHand, connected: nextConnected },
      isConnected: state.leftHand.connected || nextConnected
    }
  }),
  
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
      const state = get()
      if (!state.isConnected) {
        return
      }

      time += 0.016  // Smooth 30Hz simulation
      
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
      
      set((curr) => ({
        leftHand: curr.leftHand.connected ? {
          ...curr.leftHand,
          quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
          flex: leftFlex,
          sampleRate: 60,
        } : curr.leftHand,
        rightHand: curr.rightHand.connected ? {
          ...curr.rightHand,
          quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
          flex: rightFlex,
          sampleRate: 60,
        } : curr.rightHand
      }))
    }, 1000 / 30)  // 30 FPS state updates - smooth and zero lag
    
    return () => clearInterval(interval)
  }
}))

export default useSensorStore
