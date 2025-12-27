import { create } from 'zustand'

// Settings store
const useSettingsStore = create((set) => ({
  // Theme
  theme: 'dark',  // 'dark' or 'light'
  
  // Current instrument
  currentInstrument: 2,  // 0=Drums, 1=DrumsZ, 2=Keys, 3=Chords, 4=Violin, 5=Guitar, 6=MP3
  
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
  
  setInstrument: (instrument) => set({ currentInstrument: instrument }),
  
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
