import React, { useState } from 'react'
import { useHandTrackerStore } from '../utils/handTracker'
import { HOLOGRAPHIC_DRUMS } from '../utils/constants'
import './HolographicHUD.css'

export function HolographicHUD({
  onReset,
  liveBends = {},
  triggeredDrums = {},
  onDrumClick,
  activeHand = 'LEFT',
  onHandChange
}) {
  const [bpm, setBpm] = useState(120)

  // Camera tracking store hooks
  const isCameraActive = useHandTrackerStore((state) => state.isCameraActive)
  const camStatus = useHandTrackerStore((state) => state.status)
  const camFps = useHandTrackerStore((state) => state.fps)
  const handsDetected = useHandTrackerStore((state) => state.handsDetected)
  const toggleCamera = useHandTrackerStore((state) => state.toggleCamera)

  return (
    <div className="holo-hud-overlay">
      {/* TOP BAR */}
      <div className="holo-hud-topbar">
        {/* Top-Left: Brand & Title */}
        <div className="holo-hud-brand">
          <div className="holo-title-group">
            <span className="holo-main-title">HOLO DRUM</span>
            <span className="holo-sub-title">LIVE PERFORMANCE</span>
          </div>
          <div className="holo-brand-bracket" />
        </div>

        {/* Top-Center: Optical Camera Toggle & Hand Switcher */}
        <div className="holo-hud-center-controls">
          <button
            type="button"
            className={`holo-cam-toggle-btn ${isCameraActive ? 'active' : ''}`}
            onClick={toggleCamera}
            title="Toggle Optical Webcam Hand Tracking"
          >
            <span className={`cam-dot ${isCameraActive ? (handsDetected > 0 ? 'tracking' : 'on') : 'off'}`} />
            <span className="cam-icon">📷</span>
            <span className="cam-text">
              {isCameraActive
                ? (camStatus === 'initializing' ? 'INITIALIZING...' : `CAMERA ON • ${camFps} FPS`)
                : 'CAMERA: OFF'}
            </span>
          </button>

          <div className="holo-hand-switcher">
            <button
              type="button"
              className={`holo-hand-pill ${activeHand === 'LEFT' ? 'active' : ''}`}
              onClick={() => onHandChange && onHandChange('LEFT')}
            >
              L GLOVE
            </button>
            <button
              type="button"
              className={`holo-hand-pill ${activeHand === 'RIGHT' ? 'active' : ''}`}
              onClick={() => onHandChange && onHandChange('RIGHT')}
            >
              R GLOVE
            </button>
          </div>
        </div>

        {/* Top-Right: Status Indicator & Reset Control */}
        <div className="holo-hud-status-group">
          <div className="holo-status-pill">
            <span className="status-live-dot" />
            <span className="status-live-text">SYSTEM ONLINE</span>
          </div>

          <button
            type="button"
            className="holo-reset-btn"
            onClick={onReset}
            title="Reset Holographic Instrument"
          >
            <span className="reset-icon">↺</span>
            <span className="reset-label">RESET</span>
          </button>
        </div>
      </div>

      {/* BOTTOM TELEMETRY & CONTROLS */}
      <div className="holo-hud-bottombar">
        {/* Bottom-Left: Tempo */}
        <div className="holo-tempo-hud">
          <span className="tempo-bracket-l">[</span>
          <span className="tempo-label">TEMPO</span>
          <button 
            type="button"
            className="tempo-step-btn"
            onClick={() => setBpm(b => Math.max(60, b - 5))}
          >
            -
          </button>
          <span className="tempo-val">{bpm} BPM</span>
          <button 
            type="button"
            className="tempo-step-btn"
            onClick={() => setBpm(b => Math.min(220, b + 5))}
          >
            +
          </button>
          <span className="tempo-bracket-r">]</span>
        </div>

        {/* Bottom-Center: Minimal 6-Drum Finger Bend Telemetry Strip */}
        <div className="holo-finger-strip">
          {HOLOGRAPHIC_DRUMS.map((drum) => {
            const bend = liveBends[drum.finger] || 0
            const isHit = triggeredDrums[drum.id]
            return (
              <div
                key={drum.id}
                className={`holo-finger-chip ${isHit ? 'hit' : ''}`}
                onClick={() => onDrumClick && onDrumClick(drum)}
                title={`Bend ${drum.fingerLabel || 'finger'} to trigger ${drum.name}`}
              >
                <div className="chip-row">
                  <span className="chip-finger-name">{drum.finger ? drum.finger.toUpperCase() : 'AIR'}</span>
                  <span className="chip-arrow">➔</span>
                  <span className="chip-drum-name" style={{ color: isHit ? '#FFFFFF' : '#00f3ff' }}>
                    {drum.name}
                  </span>
                </div>
                <div className="chip-gauge-track">
                  <div
                    className="chip-gauge-fill"
                    style={{
                      width: `${bend}%`,
                      backgroundColor: isHit ? '#FFFFFF' : '#00f3ff'
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom-Right: Mode Display */}
        <div className="holo-mode-hud">
          <span className="mode-bracket-l">[</span>
          <span className="mode-pulse-dot" />
          <span className="mode-text">DRUM MODE</span>
          <span className="mode-bracket-r">]</span>
        </div>
      </div>
    </div>
  )
}
