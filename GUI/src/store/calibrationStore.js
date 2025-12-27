import { create } from 'zustand'

// Calibration store
const useCalibrationStore = create((set) => ({
  // Calibration completion status
  completed: {
    flex: false,
    pose: false,
    drums: false,
    keys: false,
    violin: false,
  },
  
  // Current calibration in progress (null if none)
  currentCalibration: null,  // 'flex', 'pose', 'drums', 'keys', 'violin'
  currentStep: 0,
  totalSteps: 0,
  countdown: 0,
  isCountingDown: false,
  
  // Start a calibration
  startCalibration: (type) => {
    const steps = {
      flex: 2,    // Neutral, Bent
      pose: 3,    // Neutral, Left Wakanda, Right Wakanda
      drums: 10,  // 5 left hand zones + 5 right hand zones
      keys: 6,    // Left: neutral/up/down, Right: neutral/up/down
      violin: 6,  // Yaw: neutral/flat/sharp, Roll: neutral/up/down
    }
    
    set({
      currentCalibration: type,
      currentStep: 1,
      totalSteps: steps[type],
      countdown: 0,
      isCountingDown: false
    })
  },
  
  // Start countdown for current step
  startCountdown: () => {
    set({ countdown: 3, isCountingDown: true })
    
    const interval = setInterval(() => {
      set((state) => {
        const newCount = state.countdown - 1
        if (newCount <= 0) {
          clearInterval(interval)
          return { countdown: 0, isCountingDown: false }
        }
        return { countdown: newCount }
      })
    }, 1000)
  },
  
  // Next step
  nextStep: () => set((state) => {
    if (state.currentStep >= state.totalSteps) {
      // Calibration complete
      return {
        completed: {
          ...state.completed,
          [state.currentCalibration]: true
        },
        currentCalibration: null,
        currentStep: 0
      }
    }
    return {
      currentStep: state.currentStep + 1,
      countdown: 0,
      isCountingDown: false
    }
  }),
  
  // Cancel calibration
  cancelCalibration: () => set({
    currentCalibration: null,
    currentStep: 0,
    totalSteps: 0,
    countdown: 0,
    isCountingDown: false
  }),
  
  // Reset all calibrations
  resetAll: () => set({
    completed: {
      flex: false,
      pose: false,
      drums: false,
      keys: false,
      violin: false,
    },
    currentCalibration: null,
    currentStep: 0
  }),
}))

export default useCalibrationStore
