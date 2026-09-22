import { create } from 'zustand'

// Settings store
const useSettingsStore = create((set) => ({
  // Theme
  theme: 'dark',  // 'dark' or 'light'
  
  // Hand Hologram Design: 'particles' (Quantum Volumetric Hand) | 'wireframe' (3D Mesh Matrix)
  hologramDesign: 'particles',

  // Hand Color Style: 'cyan' | 'purple' | 'gold'
  handStyle: 'cyan',

  // Bloom Intensity (Camera Lens Diffusion): 0.0 to 3.5 (default: 1.7)
  bloomIntensity: 1.7,

  // Glow Intensity (Material Emissive Radiance): 0.5 to 4.0 (default: 2.0)
  glowIntensity: 2.0,
  
  // Current instrument
  currentInstrument: 0,  // 0=Drums, 1=DrumsZ, 2=Keys, 3=Chords, 4=Guitar, 5=MP3
  
  // Air Drum Gesture Control Options:
  // 'hybrid': Spatial Aim (hand orient) + Finger Tap (trigger)
  // 'fingers': Direct Finger Percussion (Thumb=Kick, Index=Snare, Middle=Tom, Ring=HiHat, Pinky=Crash)
  // 'kinetic': Kinetic Air Strike (downward wrist flick into zone)
  airDrumMode: 'hybrid',
  showDrumKit: true,
  
  // General sensitivity
  flexSensitivity: 50,      // 0-100
  hitDetectionThreshold: 50, // 0-100
  
  // Advanced thresholds - Left Hand
  leftHandThresholds: {
    thumb: 350,
    index: 350,
    middle: 350,
    ring: 550,
    pinky: 650,
  },
  
  // Advanced thresholds - Right Hand
  rightHandThresholds: {
    thumb: 760,
    index: 550,
    middle: 650,
    ring: 560,
    pinky: 560,
  },
  
  // Actions
  setTheme: (theme) => set({ theme }),

  setHologramDesign: (hologramDesign) => set({ hologramDesign }),

  setHandStyle: (handStyle) => set({ handStyle }),

  setBloomIntensity: (bloomIntensity) => set({ bloomIntensity }),

  setGlowIntensity: (glowIntensity) => set({ glowIntensity }),
  
  setInstrument: (instrument) => set({ currentInstrument: instrument }),
  
  setAirDrumMode: (airDrumMode) => set({ airDrumMode }),
  
  setShowDrumKit: (showDrumKit) => set({ showDrumKit }),
  
  setFlexSensitivity: (value) => set({ flexSensitivity: value }),
  
  setHitDetectionThreshold: (value) => set({ hitDetectionThreshold: value }),
  
  setLeftHandThreshold: (finger, value) => set((state) => ({
    leftHandThresholds: {
      ...state.leftHandThresholds,
      [finger]: value
    }
  })),
  
  setRightHandThreshold: (finger, value) => set((state) => ({
    rightHandThresholds: {
      ...state.rightHandThresholds,
      [finger]: value
    }
  })),
  
  resetToDefaults: () => set({
    theme: 'dark',
    flexSensitivity: 50,
    hitDetectionThreshold: 50,
    leftHandThresholds: {
      thumb: 350,
      index: 350,
      middle: 350,
      ring: 550,
      pinky: 650,
    },
    rightHandThresholds: {
      thumb: 760,
      index: 550,
      middle: 650,
      ring: 560,
      pinky: 560,
    },
  }),
}))

export default useSettingsStore
