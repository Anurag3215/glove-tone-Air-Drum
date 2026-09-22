import { useState, useCallback, useRef, useEffect } from 'react'
import { playDrumSound } from '../utils/audio'
import useSensorStore from '../store/sensorStore'
import { HOLOGRAPHIC_DRUMS } from '../utils/constants'

export function useDrumInteraction({ onDrumStrike, activeHand = 'LEFT' }) {
  const [hoveredDrum, setHoveredDrum] = useState(null)
  const [activeBurst, setActiveBurst] = useState(null)
  const [triggeredDrums, setTriggeredDrums] = useState({})
  const [liveBends, setLiveBends] = useState({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 })

  const burstTimeout = useRef(null)

  // Trigger drum hit
  const triggerHit = useCallback((drum, velocity = 1.0) => {
    if (!drum) return

    // 1. Play procedural synthesized sound
    playDrumSound(drum.sound || drum.name, velocity)

    // 2. Trigger visual bounce & glow
    setTriggeredDrums(prev => ({ ...prev, [drum.id]: true }))
    setTimeout(() => {
      setTriggeredDrums(prev => ({ ...prev, [drum.id]: false }))
    }, 180)

    // 3. Trigger localized particle burst
    setActiveBurst({ id: drum.id, pos3d: drum.pos3d, time: Date.now() })
    if (burstTimeout.current) clearTimeout(burstTimeout.current)
    burstTimeout.current = setTimeout(() => setActiveBurst(null), 450)

    // 4. Notify parent / HandController to animate stick strike
    if (onDrumStrike) {
      onDrumStrike(drum)
    }
  }, [onDrumStrike])

  // Real-time finger bend integration from hardware glove or webcam tracking
  useEffect(() => {
    const BEND_TRIGGER = 0.50
    const BEND_RELEASE = 0.30
    const isBent = { thumb: false, index: false, middle: false, ring: false, pinky: false }

    const interval = setInterval(() => {
      const state = useSensorStore.getState()
      const hand = activeHand === 'LEFT' ? state.leftHand : state.rightHand
      const flex = hand?.flex || {}

      const newBends = {}
      for (const drum of HOLOGRAPHIC_DRUMS) {
        if (!drum.finger) continue
        const raw = flex[drum.finger] ?? 750
        const bendNorm = Math.max(0, Math.min(1, (820 - raw) / 450))
        const pct = Math.round(bendNorm * 100)
        newBends[drum.finger] = pct

        if (bendNorm >= BEND_TRIGGER && !isBent[drum.finger]) {
          isBent[drum.finger] = true
          triggerHit(drum, 1.0)
        } else if (bendNorm < BEND_RELEASE && isBent[drum.finger]) {
          isBent[drum.finger] = false
        }
      }
      setLiveBends(newBends)
    }, 25) // 40 Hz fast sampling

    return () => clearInterval(interval)
  }, [activeHand, triggerHit])

  return {
    hoveredDrum,
    setHoveredDrum,
    activeBurst,
    triggeredDrums,
    liveBends,
    triggerHit
  }
}
