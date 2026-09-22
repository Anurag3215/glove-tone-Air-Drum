import { useCallback } from 'react'
import { playDrumSound } from '../utils/audio'

export function useAudio() {
  const triggerSound = useCallback((drumName, velocity = 1.0) => {
    playDrumSound(drumName, velocity)
  }, [])

  return { triggerSound }
}
