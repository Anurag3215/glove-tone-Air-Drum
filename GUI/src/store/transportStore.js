import { create } from 'zustand'

// Transport and loop state store
const useTransportStore = create((set, get) => ({
  // Transport state
  playing: false,
  recording: false,
  looping: false,
  paused: false,
  
  // Loop data
  globalLoopLength: 0,  // In samples (0 means no loop recorded yet)
  currentLoopSample: 0,
  sampleRate: 44100,
  bpm: 120,
  
  // Track recordings - MIDI note blocks
  trackNotes: {
    1: [],  // Drums
    2: [],  // Drums Z
    3: [],  // Keys
    4: [],  // Chords
    5: [],  // Guitar
    6: [],  // MP3
  },
  
  // Actions
  togglePlay: () => set((state) => ({ 
    playing: !state.playing,
    paused: false 
  })),
  
  stopPlayback: () => set({
    playing: false,
    recording: false,
    paused: false,
    currentLoopSample: 0,
  }),
  
  toggleRecord: () => set((state) => {
    const newRecording = !state.recording
    
    // If starting recording and no loop exists, start first loop
    if (newRecording && state.globalLoopLength === 0) {
      return {
        recording: true,
        playing: true,
        currentLoopSample: 0
      }
    }
    
    // If stopping recording, finalize the loop
    if (!newRecording && state.globalLoopLength === 0) {
      // Set loop length to current position
      return {
        recording: false,
        globalLoopLength: state.currentLoopSample,
        currentLoopSample: 0
      }
    }
    
    return { recording: newRecording }
  }),
  
  toggleLoop: () => set((state) => ({ looping: !state.looping })),
  
  togglePause: () => set((state) => ({ 
    paused: !state.paused,
    playing: state.paused ? state.playing : false 
  })),
  
  clearAll: () => set({
    playing: false,
    recording: false,
    looping: false,
    paused: false,
    globalLoopLength: 0,
    currentLoopSample: 0,
    trackNotes: {
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: []
    }
  }),
  
  clearTrack: (trackId) => set((state) => ({
    trackNotes: {
      ...state.trackNotes,
      [trackId]: []
    }
  })),
  
  // Add a MIDI note to a track
  addNote: (trackId, sampleOffset, note) => set((state) => ({
    trackNotes: {
      ...state.trackNotes,
      [trackId]: [...state.trackNotes[trackId], { sampleOffset, note }]
    }
  })),
  
  // Update playhead position
  updatePlayhead: (delta) => set((state) => {
    if (!state.playing || state.paused) return state
    
    const newSample = state.currentLoopSample + delta
    const loopLength = state.globalLoopLength
    
    // If recording first loop, just advance
    if (state.recording && loopLength === 0) {
      return { currentLoopSample: newSample }
    }
    
    // If playing and looping, wrap around
    if (loopLength > 0 && state.looping) {
      return { 
        currentLoopSample: newSample % loopLength 
      }
    }
    
    // If playing without loop, stop at end
    if (loopLength > 0 && newSample >= loopLength) {
      return { 
        playing: false,
        currentLoopSample: 0
      }
    }
    
    return { currentLoopSample: newSample }
  }),
  
  // Start mock MIDI generation (for testing)
  startMockRecording: () => {
    const interval = setInterval(() => {
      const state = get()
      
      if (state.recording && state.playing) {
        const currentSample = state.currentLoopSample
        
        // Randomly add notes to tracks (simulate playing)
        if (Math.random() < 0.1) {  // 10% chance per tick
          const trackId = Math.floor(Math.random() * 3) + 1  // Tracks 1-3
          const note = 60 + Math.floor(Math.random() * 24)  // C4 to B5
          
          get().addNote(trackId, currentSample, note)
        }
      }
    }, 100)  // Check every 100ms
  }
}))

export default useTransportStore
