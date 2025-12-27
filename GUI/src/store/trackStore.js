import { create } from 'zustand'

// Track state store (mute, solo, VST editor, etc.)
const useTrackStore = create((set) => ({
  // Track states
  tracks: {
    1: { muted: false, solo: false, volume: 75, vstEditorOpen: false },
    2: { muted: false, solo: false, volume: 75, vstEditorOpen: false },
    3: { muted: false, solo: false, volume: 75, vstEditorOpen: false },
    4: { muted: false, solo: false, volume: 75, vstEditorOpen: false },
    5: { muted: false, solo: false, volume: 75, vstEditorOpen: false },
    6: { muted: false, solo: false, volume: 75, vstEditorOpen: false },
    7: { muted: false, solo: false, volume: 75, vstEditorOpen: false },
  },
  
  // Actions
  toggleMute: (trackId) => set((state) => ({
    tracks: {
      ...state.tracks,
      [trackId]: { ...state.tracks[trackId], muted: !state.tracks[trackId].muted }
    }
  })),
  
  toggleSolo: (trackId) => set((state) => ({
    tracks: {
      ...state.tracks,
      [trackId]: { ...state.tracks[trackId], solo: !state.tracks[trackId].solo }
    }
  })),
  
  setVolume: (trackId, volume) => set((state) => ({
    tracks: {
      ...state.tracks,
      [trackId]: { ...state.tracks[trackId], volume }
    }
  })),
  
  toggleVstEditor: (trackId) => set((state) => ({
    tracks: {
      ...state.tracks,
      [trackId]: { 
        ...state.tracks[trackId], 
        vstEditorOpen: !state.tracks[trackId].vstEditorOpen 
      }
    }
  })),
}))

export default useTrackStore
