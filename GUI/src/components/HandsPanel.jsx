import React, { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import HolographicHand, { CyberSpaceGrid, HAND_STYLES, HOLOGRAM_DESIGNS } from './Hand3D'
import useSensorStore from '../store/sensorStore'
import useSettingsStore from '../store/settingsStore'
import {
  ChevronLeft,
  ChevronRight,
  Activity,
  Code2,
  Sparkles,
  Sliders,
  Eye,
  EyeOff,
  Palette,
  X,
  Check,
  Sun,
  Flame,
  Layers,
} from 'lucide-react'
import './HandsPanel.css'

// Active Instruments
const INSTRUMENTS = [
  { id: 0, name: 'DRUMS', icon: '🥁', mode: 'MODE: ZONES • CH: 1' },
  { id: 1, name: 'DRUMS Z', icon: '🎯', mode: 'MODE: SPATIAL 3D • CH: 2' },
  { id: 2, name: 'KEYS', icon: '🎹', mode: 'MODE: ORIENTATION • CH: 3' },
  { id: 3, name: 'CHORDS', icon: '🎼', mode: 'MODE: GESTURE CHORDS • CH: 4' },
  { id: 4, name: 'GUITAR', icon: '🎸', mode: 'MODE: AI STRUM • CH: 5' },
  { id: 5, name: 'MP3', icon: '📻', mode: 'MODE: BACKING TRACK • CH: 6' },
]

// Dynamic Gesture Detection from real sensor values
function detectGesture(flex, thresholds) {
  if (!flex) return { name: 'OPEN HAND', confidence: 95, action: 'STANDBY' }

  const isThumbBent = flex.thumb < (thresholds.thumb || 500)
  const isIndexBent = flex.index < (thresholds.index || 500)
  const isMiddleBent = flex.middle < (thresholds.middle || 500)
  const isRingBent = flex.ring < (thresholds.ring || 500)
  const isPinkyBent = flex.pinky < (thresholds.pinky || 500)

  const bentCount = [isThumbBent, isIndexBent, isMiddleBent, isRingBent, isPinkyBent].filter(Boolean).length

  if (isThumbBent && isIndexBent && isMiddleBent && isRingBent && isPinkyBent) {
    return { name: 'FIST / GRIP', confidence: 96, action: 'MUTE ALL' }
  }
  if (!isThumbBent && !isIndexBent && !isMiddleBent && !isRingBent && !isPinkyBent) {
    return { name: 'OPEN PALM', confidence: 98, action: 'SUSTAIN' }
  }
  if (isThumbBent && !isIndexBent && !isMiddleBent) {
    return { name: 'THUMB KICK', confidence: 89, action: 'KICK DRUM' }
  }
  if (isThumbBent && isIndexBent && !isMiddleBent) {
    return { name: 'PINCH / TRIGGER', confidence: 93, action: 'HI-HAT CHOKE' }
  }
  if (!isIndexBent && isMiddleBent && isRingBent && isPinkyBent) {
    return { name: 'POINT', confidence: 90, action: 'SPATIAL POINT' }
  }

  return { name: 'FLEX TRIGGER', confidence: 88, action: 'PLAY NOTE' }
}

function HandsPanel({ onToggleTracks, isTracksOpen }) {
  const [activeHandTab, setActiveHandTab] = useState('both') // 'both' | 'left' | 'right'
  const [showRawData, setShowRawData] = useState(false)
  const [showHud, setShowHud] = useState(true)
  const [showStyleModal, setShowStyleModal] = useState(false)

  const leftHand = useSensorStore((state) => state.leftHand)
  const rightHand = useSensorStore((state) => state.rightHand)
  const currentInstrument = useSettingsStore((state) => state.currentInstrument)
  const setInstrument = useSettingsStore((state) => state.setInstrument)
  const rawHandStyle = useSettingsStore((state) => state.handStyle || 'cyan')
  const handStyle = (rawHandStyle === 'red' || rawHandStyle === 'topo-red') ? 'cyan' : rawHandStyle
  const setHandStyle = useSettingsStore((state) => state.setHandStyle)
  const rawHologramDesign = useSettingsStore((state) => state.hologramDesign || 'particles')
  const hologramDesign = rawHologramDesign === 'topographic' ? 'particles' : rawHologramDesign
  const setHologramDesign = useSettingsStore((state) => state.setHologramDesign)
  const bloomIntensity = useSettingsStore((state) => state.bloomIntensity ?? 1.7)
  const setBloomIntensity = useSettingsStore((state) => state.setBloomIntensity)
  const glowIntensity = useSettingsStore((state) => state.glowIntensity ?? 2.0)
  const setGlowIntensity = useSettingsStore((state) => state.setGlowIntensity)

  // Calibrated thresholds
  const thresholdsL = { thumb: 350, index: 350, middle: 350, ring: 550, pinky: 650 }
  const thresholdsR = { thumb: 760, index: 550, middle: 650, ring: 560, pinky: 560 }

  // Detect gestures dynamically
  const leftGesture = detectGesture(leftHand.flex, thresholdsL)
  const rightGesture = detectGesture(rightHand.flex, thresholdsR)

  const instData = INSTRUMENTS[currentInstrument] || INSTRUMENTS[0]
  const currentPalette = HAND_STYLES[handStyle] || HAND_STYLES.purple

  const handlePrevInstrument = () => {
    const nextIdx = (currentInstrument - 1 + INSTRUMENTS.length) % INSTRUMENTS.length
    setInstrument(nextIdx)
  }

  const handleNextInstrument = () => {
    const nextIdx = (currentInstrument + 1) % INSTRUMENTS.length
    setInstrument(nextIdx)
  }

  // Calculate percentage of extension for a finger (0-100%)
  const getPercent = (value, finger) => {
    const min = 250
    const max = 850
    const pct = Math.round(((value - min) / (max - min)) * 100)
    return Math.min(100, Math.max(8, pct))
  }

  return (
    <div className="hands-panel-cyber full-portion">
      {/* Top Floating Viewport Control Bar */}
      <div className="cyber-viewport-header">
        <div className="viewport-title-group">
          <span className="live-dot" />
          <span className="viewport-title">3D CYBER SPACE • HOLOGRAPHIC HAND WIREFRAME</span>
          <span className="matrix-badge">GRID MATRIX</span>
        </div>

        <div className="viewport-controls-right">
          {/* Hand Hologram Style & Design Pop-up Trigger */}
          <button
            type="button"
            className={`style-popup-trigger-btn ${showStyleModal ? 'active' : ''}`}
            onClick={() => setShowStyleModal(!showStyleModal)}
            title="Configure Hologram Design, Color & Bloom"
          >
            <Palette size={12} className="palette-icon" />
            <span className="style-trigger-label">STYLE:</span>
            <span className={`color-pip ${handStyle}`} />
            <span className="style-trigger-val">
              {HOLOGRAM_DESIGNS[hologramDesign]?.shortName || 'WIREFRAME'} • {currentPalette.name}
            </span>
          </button>

          {/* Hand Isolation Tabs */}
          <div className="hand-toggle-tabs">
            <button 
              className={`tab-btn ${activeHandTab === 'both' ? 'active' : ''}`}
              onClick={() => setActiveHandTab('both')}
            >
              BOTH
            </button>
            <button 
              className={`tab-btn ${activeHandTab === 'left' ? 'active' : ''}`}
              onClick={() => setActiveHandTab('left')}
            >
              LEFT
            </button>
            <button 
              className={`tab-btn ${activeHandTab === 'right' ? 'active' : ''}`}
              onClick={() => setActiveHandTab('right')}
            >
              RIGHT
            </button>
          </div>

          {/* Toggle HUD Visibility */}
          <button 
            type="button"
            className={`hud-toggle-btn ${showHud ? 'active' : ''}`}
            onClick={() => setShowHud(!showHud)}
            title={showHud ? 'Hide Telemetry HUD' : 'Show Telemetry HUD'}
          >
            {showHud ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>{showHud ? 'HIDE HUD' : 'SHOW HUD'}</span>
          </button>

          {/* Quick Trigger for DAW Tracks Pop-up */}
          {onToggleTracks && (
            <button 
              type="button"
              className="quick-daw-btn"
              onClick={onToggleTracks}
              title="Open DAW Multi-Track Looper"
            >
              <Sliders size={13} />
              <span>DAW TRACKS</span>
            </button>
          )}
        </div>
      </div>

      {/* 3D Glove Canvas: Single Widescreen Cyberpunk Space with Infinite Black & White Grid */}
      <div className="cyber-canvas-container full-viewport">
        {/* Spatial Labels */}
        {activeHandTab === 'both' && (
          <>
            <div className="spatial-tag left-tag">LEFT GLOVE [{HOLOGRAM_DESIGNS[hologramDesign]?.shortName} • {currentPalette.tag}]</div>
            <div className="spatial-tag right-tag">RIGHT GLOVE [{HOLOGRAM_DESIGNS[hologramDesign]?.shortName} • {currentPalette.tag}]</div>
          </>
        )}
        {activeHandTab === 'left' && (
          <div className="spatial-tag center-tag">LEFT GLOVE [{HOLOGRAM_DESIGNS[hologramDesign]?.shortName} • {currentPalette.tag}]</div>
        )}
        {activeHandTab === 'right' && (
          <div className="spatial-tag center-tag">RIGHT GLOVE [{HOLOGRAM_DESIGNS[hologramDesign]?.shortName} • {currentPalette.tag}]</div>
        )}

        <Canvas 
          camera={{ position: [0, 0.4, 7.8], fov: 48 }} 
          dpr={[1, 1.5]}
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
        >
          <color attach="background" args={['#000000']} />
          <fog attach="fog" args={['#000000', 10, 36]} />
          
          <ambientLight intensity={0.6} />
          <pointLight position={[0, 5, 7]} intensity={0.9} color="#FFFFFF" />
          <pointLight 
            position={[-6, 2, 4]} 
            intensity={0.9} 
            color={handStyle === 'gold' ? '#FFB800' : handStyle === 'cyan' ? '#00D2FF' : '#A855F7'} 
          />
          <pointLight 
            position={[6, 2, 4]} 
            intensity={0.9} 
            color={handStyle === 'gold' ? '#FFB800' : handStyle === 'cyan' ? '#00D2FF' : '#A855F7'} 
          />
          <pointLight 
            position={[0, -2, 4]} 
            intensity={0.5} 
            color={handStyle === 'gold' ? '#B8860B' : handStyle === 'cyan' ? '#007799' : '#581C87'} 
          />
          
          {/* 3D Space Cyberpunk Grid in Black & White (Moving Forward) */}
          <CyberSpaceGrid speed={3.5} />
          
          {/* 3D Wireframe Hands floating in Cyber Space */}
          {activeHandTab === 'both' && (
            <>
              <HolographicHand position={[-2.4, 0, 0]} rotation={[0, 0, 0]} label="LEFT" />
              <HolographicHand position={[2.4, 0, 0]} rotation={[0, 0, 0]} label="RIGHT" />
            </>
          )}
          {activeHandTab === 'left' && (
            <HolographicHand position={[0, 0, 0]} rotation={[0, 0, 0]} label="LEFT" />
          )}
          {activeHandTab === 'right' && (
            <HolographicHand position={[0, 0, 0]} rotation={[0, 0, 0]} label="RIGHT" />
          )}

          {/* High-Performance Holographic Bloom (Zero MSAA overhead) */}
          <EffectComposer multisampling={0}>
            <Bloom 
              intensity={bloomIntensity}
              luminanceThreshold={0.08}
              luminanceSmoothing={0.9}
              mipmapBlur
              radius={0.7}
            />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Floating Cyber HUD Overlay (Non-Intrusive, Collapsible) */}
      {showHud && (
        <div className="cyber-hud-overlay">
          {/* Left HUD: Compact Telemetry Panel */}
          <div className="telemetry-hud-card">
            <div className="card-header">
              <div className="header-left">
                <Activity size={13} className="mono-icon" />
                <span>FINGER TELEMETRY</span>
              </div>
              <button 
                className={`raw-toggle-btn ${showRawData ? 'active' : ''}`}
                onClick={() => setShowRawData(!showRawData)}
              >
                <Code2 size={11} />
                <span>{showRawData ? 'HIDE' : 'RAW'}</span>
              </button>
            </div>

            <div className="finger-bars-grid">
              {['thumb', 'index', 'middle', 'ring', 'pinky'].map((finger) => {
                const valL = leftHand.flex[finger] || 0
                const pctL = getPercent(valL, finger)
                const isBentL = valL < thresholdsL[finger]

                return (
                  <div key={finger} className="finger-stat-row">
                    <span className="finger-name">{finger.substring(0, 3).toUpperCase()}</span>
                    <div className="bar-track">
                      <div 
                        className={`bar-fill ${isBentL ? 'bent' : ''}`}
                        style={{ width: `${pctL}%` }}
                      />
                    </div>
                    <span className={`finger-pct ${isBentL ? 'bent' : ''}`}>{pctL}%</span>
                  </div>
                )
              })}
            </div>

            {/* Compact Quaternion IMU Data */}
            <div className="compact-orientation">
              <span className="orient-label">4D QUAT</span>
              <div className="quat-chips">
                <span>W:{leftHand.quaternion.w.toFixed(2)}</span>
                <span>X:{leftHand.quaternion.x.toFixed(2)}</span>
                <span>Y:{leftHand.quaternion.y.toFixed(2)}</span>
                <span>Z:{leftHand.quaternion.z.toFixed(2)}</span>
              </div>
            </div>

            {/* Expandable Raw Data Drawer */}
            {showRawData && (
              <div className="raw-data-drawer">
                <div className="raw-col">
                  <span className="raw-title">L-RAW</span>
                  {Object.entries(leftHand.flex).map(([f, v]) => (
                    <div key={f} className="raw-item">
                      <span>{f.substring(0, 3).toUpperCase()}</span>
                      <span className="mono">{Math.round(v)}</span>
                    </div>
                  ))}
                </div>
                <div className="raw-col">
                  <span className="raw-title">R-RAW</span>
                  {Object.entries(rightHand.flex).map(([f, v]) => (
                    <div key={f} className="raw-item">
                      <span>{f.substring(0, 3).toUpperCase()}</span>
                      <span className="mono">{Math.round(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right HUD: Live Gesture & Instrument Card */}
          <div className="gesture-instrument-hud-card">
            <div className="card-header">
              <div className="header-left">
                <Sparkles size={13} className="mono-icon" />
                <span>GESTURE & MODE</span>
              </div>
              <span className="gesture-live-pill">LIVE SENSORS</span>
            </div>

            <div className="gesture-hero-block">
              <div className="gesture-name-row">
                <span className="gesture-title">{leftGesture.name}</span>
                <span className="confidence-badge">{leftGesture.confidence}% CONF</span>
              </div>
              <div className="gesture-action-row">
                <span className="action-tag">ACTION:</span>
                <span className="action-text">{leftGesture.action}</span>
              </div>
            </div>

            {/* Embedded Instrument Switcher */}
            <div className="hud-instrument-strip">
              <button 
                className="selector-arrow-btn" 
                onClick={handlePrevInstrument}
                title="Previous Instrument"
                aria-label="Previous Instrument"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="selector-content">
                <span className="selector-hero">
                  <span className="inst-icon">{instData.icon}</span>
                  <span className="inst-title">{instData.name}</span>
                </span>
                <span className="inst-submode">{instData.mode}</span>
              </div>

              <button 
                className="selector-arrow-btn" 
                onClick={handleNextInstrument}
                title="Next Instrument"
                aria-label="Next Instrument"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Hand Hologram Style & Design Popdown Modal */}
      {showStyleModal && (
        <div className="style-modal-backdrop" onClick={() => setShowStyleModal(false)}>
          <div className="style-modal-card clean-popdown" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="style-modal-header">
              <div className="style-modal-title-group">
                <Palette size={16} className="style-modal-icon" />
                <h3 className="style-modal-title">HAND STYLE &amp; LIGHTING</h3>
              </div>
              <button 
                type="button" 
                className="style-modal-close-btn"
                onClick={() => setShowStyleModal(false)}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="clean-modal-content">
              {/* 2-Column Split: Design (Left) vs Color (Right) */}
              <div className="style-split-columns compact">
                {/* Column 1: Hologram Design */}
                <div className="style-column">
                  <span className="clean-section-label">DESIGN</span>
                  <div className="design-cards-stack">
                    <button
                      type="button"
                      className={`clean-choice-card ${hologramDesign === 'wireframe' ? 'active' : ''}`}
                      onClick={() => setHologramDesign('wireframe')}
                    >
                      <div className="choice-card-left">
                        <div className="choice-icon-wrap">
                          <Layers size={16} />
                        </div>
                        <div className="choice-text-wrap">
                          <span className="choice-title">3D Mesh Matrix</span>
                          <span className="choice-sub">Wireframe Grid</span>
                        </div>
                      </div>
                      {hologramDesign === 'wireframe' && (
                        <span className="active-check-badge">
                          <Check size={12} />
                        </span>
                      )}
                    </button>


                    <button
                      type="button"
                      className={`clean-choice-card particles ${hologramDesign === 'particles' ? 'active' : ''}`}
                      onClick={() => setHologramDesign('particles')}
                    >
                      <div className="choice-card-left">
                        <div className="choice-icon-wrap">
                          <Sparkles size={16} />
                        </div>
                        <div className="choice-text-wrap">
                          <span className="choice-title">Quantum Cloud</span>
                          <span className="choice-sub">Nebula Stardust</span>
                        </div>
                      </div>
                      {hologramDesign === 'particles' && (
                        <span className="active-check-badge">
                          <Check size={12} />
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Column 2: Color Palette */}
                <div className="style-column">
                  <span className="clean-section-label">COLOR</span>
                  <div className="color-cards-stack">
                    {Object.values(HAND_STYLES).map((style) => {
                      const isSelected = handStyle === style.id
                      return (
                        <button
                          key={style.id}
                          type="button"
                          className={`clean-color-card ${isSelected ? 'active' : ''} ${style.id}`}
                          onClick={() => setHandStyle(style.id)}
                        >
                          <div className="choice-card-left">
                            <span className={`color-dot-large ${style.id}`} />
                            <span className="choice-title">{style.name}</span>
                          </div>
                          {isSelected && (
                            <span className="active-check-badge">
                              <Check size={12} />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Sliders Section: Glow & Bloom */}
              <div className="sliders-panel-clean">
                <span className="clean-section-label">LIGHTING &amp; FX</span>

                {/* Glow Slider Row */}
                <div className="slider-row-clean glow-row">
                  <div className="slider-label-group">
                    <Sun size={15} className="slider-icon glow" />
                    <span className="slider-title">Glow</span>
                  </div>
                  <div className="slider-track-wrap">
                    <input 
                      type="range" 
                      min="0.5" 
                      max="4.0" 
                      step="0.1" 
                      value={glowIntensity} 
                      onChange={(e) => setGlowIntensity(parseFloat(e.target.value))}
                      className="cyber-range-slider glow-slider"
                    />
                  </div>
                  <span className="slider-val-badge glow">
                    {Math.round((glowIntensity / 4.0) * 100)}%
                  </span>
                </div>

                {/* Bloom Slider Row */}
                <div className="slider-row-clean bloom-row">
                  <div className="slider-label-group">
                    <Sparkles size={15} className="slider-icon bloom" />
                    <span className="slider-title">Bloom</span>
                  </div>
                  <div className="slider-track-wrap">
                    <input 
                      type="range" 
                      min="0" 
                      max="3.5" 
                      step="0.1" 
                      value={bloomIntensity} 
                      onChange={(e) => setBloomIntensity(parseFloat(e.target.value))}
                      className="cyber-range-slider bloom-slider"
                    />
                  </div>
                  <span className="slider-val-badge bloom">
                    {Math.round((bloomIntensity / 3.5) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="style-modal-footer clean">
              <span className="footer-live-hint">
                <span className="hint-pulse-dot" /> Live real-time preview
              </span>
              <button 
                type="button" 
                className="style-apply-btn"
                onClick={() => setShowStyleModal(false)}
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HandsPanel
