// High-Performance Web Audio API Multi-Layer Drum Synthesizer
let audioCtx = null

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

export function playDrumSound(drumType, velocity = 1.0) {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const gainScale = Math.max(0.2, Math.min(1.5, velocity))

    const type = drumType ? drumType.toUpperCase() : 'SNARE'

    // =========================================================================
    // 1. KICK (808 Sub-Bass Dive + Punch Transient)
    // =========================================================================
    if (type === 'KICK' || type === 'DRUM6') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const clickOsc = ctx.createOscillator()
      const clickGain = ctx.createGain()

      // Pitch sweep
      osc.type = 'sine'
      osc.frequency.setValueAtTime(155, now)
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.35)

      gain.gain.setValueAtTime(1.1 * gainScale, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38)

      // Transient attack click
      clickOsc.type = 'triangle'
      clickOsc.frequency.setValueAtTime(320, now)
      clickOsc.frequency.exponentialRampToValueAtTime(60, now + 0.02)
      clickGain.gain.setValueAtTime(0.7 * gainScale, now)
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02)

      osc.connect(gain)
      gain.connect(ctx.destination)
      clickOsc.connect(clickGain)
      clickGain.connect(ctx.destination)

      osc.start(now)
      clickOsc.start(now)
      osc.stop(now + 0.38)
      clickOsc.stop(now + 0.02)
    }

    // =========================================================================
    // 2. SNARE (Dual Punch Body Tone + Filtered White Noise Sizzle)
    // =========================================================================
    else if (type === 'SNARE' || type === 'DRUM4') {
      // Body tone
      const osc = ctx.createOscillator()
      const bodyGain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(185, now)
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12)
      bodyGain.gain.setValueAtTime(0.75 * gainScale, now)
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14)
      osc.connect(bodyGain)
      bodyGain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.14)

      // Noise sizzle
      const bufSize = ctx.sampleRate * 0.22
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
      const noise = ctx.createBufferSource()
      noise.buffer = buf

      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.setValueAtTime(950, now)

      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(0.85 * gainScale, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

      noise.connect(filter)
      filter.connect(noiseGain)
      noiseGain.connect(ctx.destination)
      noise.start(now)
    }

    // =========================================================================
    // 3. HI-HAT (Metallic 6-Square-Wave Ring Modulation + Sharp Choke)
    // =========================================================================
    else if (type === 'HI-HAT' || type === 'HIHAT' || type === 'DRUM2') {
      const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21]
      const baseFreq = 42
      const bandpass = ctx.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.setValueAtTime(9500, now)

      const highpass = ctx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.setValueAtTime(7000, now)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.55 * gainScale, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)

      ratios.forEach((ratio) => {
        const osc = ctx.createOscillator()
        osc.type = 'square'
        osc.frequency.setValueAtTime(baseFreq * ratio, now)
        osc.connect(bandpass)
        osc.start(now)
        osc.stop(now + 0.07)
      })

      bandpass.connect(highpass)
      highpass.connect(gain)
      gain.connect(ctx.destination)
    }

    // =========================================================================
    // 4. TOM 1 (High Tom: Pitch-Drop Sine + Click Transient)
    // =========================================================================
    else if (type === 'TOM 1' || type === 'TOM1' || type === 'DRUM3') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(210, now)
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.28)
      gain.gain.setValueAtTime(0.9 * gainScale, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.28)
    }

    // =========================================================================
    // 5. TOM 2 (Low / Floor Tom: Deep Resonant Pitch Drop)
    // =========================================================================
    else if (type === 'TOM 2' || type === 'TOM2' || type === 'TOM' || type === 'DRUM5') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(135, now)
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.35)
      gain.gain.setValueAtTime(0.95 * gainScale, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.35)
    }

    // =========================================================================
    // 6. CRASH (Wide Bandpass Noise Explosion + Metallic Ring Decay)
    // =========================================================================
    else if (type === 'CRASH' || type === 'DRUM1') {
      const bufSize = ctx.sampleRate * 0.75
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
      const noise = ctx.createBufferSource()
      noise.buffer = buf

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(5600, now)
      filter.Q.setValueAtTime(1.8, now)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.85 * gainScale, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75)

      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    }
  } catch (err) {
    console.warn('Audio synthesis fallback:', err)
  }
}

// Unlock Web Audio on first user interaction
if (typeof window !== 'undefined') {
  const unlock = () => {
    getAudioContext()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}
