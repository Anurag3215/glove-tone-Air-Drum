import React, { useState } from 'react'
import useSettingsStore from '../store/settingsStore'
import './SettingsScreen.css'

const INSTRUMENTS = [
  {
    id: 0,
    name: 'DRUMS',
    icon: '🥁',
    tag: '3D WIREFRAME MESH',
    desc: '5-zone spatial air drum kit with 1:1 finger bend acoustic triggers.'
  },
  {
    id: 1,
    name: 'DRUMS Z',
    icon: '🌐',
    tag: 'DEPTH PERCUSSION',
    desc: 'Z-axis spatial depth percussion triggered by forward thrust momentum.'
  },
  {
    id: 2,
    name: 'KEYS',
    icon: '🎹',
    tag: 'SPATIAL KEYBOARD',
    desc: '6-pitch virtual keyboard zones for melodic synth performance.'
  },
  {
    id: 3,
    name: 'CHORDS',
    icon: '🎼',
    tag: 'HARMONIC GENERATOR',
    desc: 'Multi-finger chord generator with polyphonic voice spread.'
  },
  {
    id: 4,
    name: 'GUITAR',
    icon: '🎸',
    tag: 'VIRTUAL STRUM',
    desc: 'Air strumming and fret position emulation with velocity dynamics.'
  },
  {
    id: 5,
    name: 'MP3 LOOPER',
    icon: '📻',
    tag: 'BACKING TRACKS',
    desc: 'Stem playback, live looping, and synchronized performance triggers.'
  }
]

const GESTURE_MODES = [
  {
    id: 'hybrid',
    name: 'AIM + FINGER TAP',
    icon: '🎯',
    desc: 'Spatial hand orientation targeting combined with rapid finger flex triggers.'
  },
  {
    id: 'fingers',
    name: 'DIRECT FINGERS (1:1)',
    icon: '🖐️',
    desc: 'Immediate 1:1 finger bend triggers: Thumb Kick, Index Tom, Middle Snare, Ring Hi-Hat, Pinky Crash.'
  },
  {
    id: 'kinetic',
    name: 'KINETIC AIR STRIKE',
    icon: '⚡',
    desc: 'Dynamic downward air strike velocity detection with wrist acceleration spikes.'
  }
]

function SettingsScreen() {
  const [activeTab, setActiveTab] = useState('general')

  // Settings store
  const currentInstrument = useSettingsStore((state) => state.currentInstrument)
  const setInstrument = useSettingsStore((state) => state.setInstrument)

  const flexSensitivity = useSettingsStore((state) => state.flexSensitivity)
  const setFlexSensitivity = useSettingsStore((state) => state.setFlexSensitivity)

  const hitDetectionThreshold = useSettingsStore((state) => state.hitDetectionThreshold)
  const setHitDetectionThreshold = useSettingsStore((state) => state.setHitDetectionThreshold)

  const airDrumMode = useSettingsStore((state) => state.airDrumMode || 'hybrid')
  const setAirDrumMode = useSettingsStore((state) => state.setAirDrumMode)

  const showDrumKit = useSettingsStore((state) => state.showDrumKit ?? true)
  const setShowDrumKit = useSettingsStore((state) => state.setShowDrumKit)

  const hologramDesign = useSettingsStore((state) => state.hologramDesign || 'wireframe')
  const setHologramDesign = useSettingsStore((state) => state.setHologramDesign)

  const handStyle = useSettingsStore((state) => state.handStyle || 'cyan')
  const setHandStyle = useSettingsStore((state) => state.setHandStyle)

  const bloomIntensity = useSettingsStore((state) => state.bloomIntensity ?? 1.7)
  const setBloomIntensity = useSettingsStore((state) => state.setBloomIntensity)

  const glowIntensity = useSettingsStore((state) => state.glowIntensity ?? 2.0)
  const setGlowIntensity = useSettingsStore((state) => state.setGlowIntensity)

  const leftHandThresholds = useSettingsStore((state) => state.leftHandThresholds)
  const rightHandThresholds = useSettingsStore((state) => state.rightHandThresholds)
  const setLeftHandThreshold = useSettingsStore((state) => state.setLeftHandThreshold)
  const setRightHandThreshold = useSettingsStore((state) => state.setRightHandThreshold)

  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults)

  return (
    <div className="settings-pro">
      {/* Sleek Minimal Sidebar */}
      <aside className="settings-sidebar">
        <div className="sidebar-brand-strip">
          <span className="sidebar-category-label">SETTINGS MENU</span>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <span className="sidebar-icon">⚙️</span>
            <span className="sidebar-text">General</span>
            {activeTab === 'general' && <span className="sidebar-active-indicator" />}
          </button>

          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'visuals' ? 'active' : ''}`}
            onClick={() => setActiveTab('visuals')}
          >
            <span className="sidebar-icon">🖐️</span>
            <span className="sidebar-text">Hologram & Style</span>
            {activeTab === 'visuals' && <span className="sidebar-active-indicator" />}
          </button>

          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'gestures' ? 'active' : ''}`}
            onClick={() => setActiveTab('gestures')}
          >
            <span className="sidebar-icon">⚡</span>
            <span className="sidebar-text">Air Drum Gestures</span>
            {activeTab === 'gestures' && <span className="sidebar-active-indicator" />}
          </button>

          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'sensors' ? 'active' : ''}`}
            onClick={() => setActiveTab('sensors')}
          >
            <span className="sidebar-icon">🎛️</span>
            <span className="sidebar-text">Sensor Thresholds</span>
            {activeTab === 'sensors' && <span className="sidebar-active-indicator" />}
          </button>

          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            <span className="sidebar-icon">🛠️</span>
            <span className="sidebar-text">System Diagnostics</span>
            {activeTab === 'system' && <span className="sidebar-active-indicator" />}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="system-status-chip">
            <span className="status-live-dot" />
            <span className="status-text">ESP32 ONLINE</span>
          </div>
        </div>
      </aside>

      {/* Main Settings Body */}
      <main className="settings-content-pro">
        {/* ===================================================================
            TAB 1: GENERAL SETTINGS (MINIMAL & BALANCED)
            =================================================================== */}
        {activeTab === 'general' && (
          <div className="settings-panel animate-fade-in">
            <div className="panel-header-row">
              <div className="header-titles">
                <span className="section-eyebrow">PREFERENCES</span>
                <h1 className="panel-main-title">General Settings</h1>
                <p className="panel-sub-desc">
                  Select primary instrument mode, configure global glove sensitivity, and fine-tune trigger response.
                </p>
              </div>

              <button
                type="button"
                className="reset-defaults-btn"
                onClick={resetToDefaults}
                title="Restore all settings to default values"
              >
                <span className="reset-glyph">↺</span>
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* SECTION 1: PRIMARY INSTRUMENT ENGINE (3x2 RESPONSIVE GRID) */}
            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">PRIMARY INSTRUMENT ENGINE</h2>
                </div>
                <span className="card-badge">6 MODES AVAILABLE</span>
              </div>

              <div className="instrument-grid-minimal">
                {INSTRUMENTS.map((inst) => {
                  const isActive = currentInstrument === inst.id
                  return (
                    <div
                      key={inst.id}
                      className={`inst-card-minimal ${isActive ? 'active' : ''}`}
                      onClick={() => setInstrument(inst.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="inst-card-top">
                        <span className="inst-card-icon">{inst.icon}</span>
                        <span className={`inst-status-pill ${isActive ? 'active' : ''}`}>
                          {isActive ? 'ACTIVE' : 'SELECT'}
                        </span>
                      </div>

                      <div className="inst-card-body">
                        <span className="inst-card-name">{inst.name}</span>
                        <span className="inst-card-tag">{inst.tag}</span>
                        <p className="inst-card-desc">{inst.desc}</p>
                      </div>

                      {isActive && <div className="inst-card-glow-bar" />}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* SECTION 2: INPUT CALIBRATION & SENSITIVITY DUAL SLIDERS */}
            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">INPUT CALIBRATION & SENSITIVITY</h2>
                </div>
                <span className="card-badge">GLOBAL SENSORS</span>
              </div>

              <div className="sensitivity-dual-row">
                {/* Slider 1: Flex Sensitivity */}
                <div className="slider-block-minimal">
                  <div className="slider-header-wrap">
                    <div>
                      <span className="slider-label">FLEX SENSOR SENSITIVITY</span>
                      <p className="slider-desc">Scales responsiveness across all 5 glove fingers.</p>
                    </div>
                    <span className="slider-value-display cyan">{flexSensitivity}%</span>
                  </div>

                  <div className="range-track-container">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={flexSensitivity}
                      onChange={(e) => setFlexSensitivity(parseInt(e.target.value, 10))}
                      className="minimal-range cyan"
                    />
                  </div>

                  <div className="slider-presets-row">
                    {[
                      { label: '30% MILD', val: 30 },
                      { label: '50% BALANCED', val: 50 },
                      { label: '75% CRISP', val: 75 },
                      { label: '95% ULTRA', val: 95 }
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        className={`preset-btn ${flexSensitivity === p.val ? 'active' : ''}`}
                        onClick={() => setFlexSensitivity(p.val)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slider 2: Hit Detection Threshold */}
                <div className="slider-block-minimal">
                  <div className="slider-header-wrap">
                    <div>
                      <span className="slider-label">HIT TRIGGER THRESHOLD</span>
                      <p className="slider-desc">Minimum flex percentage required to fire acoustic sound.</p>
                    </div>
                    <span className="slider-value-display emerald">{hitDetectionThreshold}%</span>
                  </div>

                  <div className="range-track-container">
                    <input
                      type="range"
                      min="20"
                      max="85"
                      value={hitDetectionThreshold}
                      onChange={(e) => setHitDetectionThreshold(parseInt(e.target.value, 10))}
                      className="minimal-range emerald"
                    />
                  </div>

                  <div className="slider-presets-row">
                    {[
                      { label: '35% LIGHT', val: 35 },
                      { label: '50% STANDARD', val: 50 },
                      { label: '65% FIRM', val: 65 },
                      { label: '80% HARD', val: 80 }
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        className={`preset-btn ${hitDetectionThreshold === p.val ? 'active' : ''}`}
                        onClick={() => setHitDetectionThreshold(p.val)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 3: AIR DRUM GESTURE ENGINE */}
            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">AIR DRUM GESTURE ENGINE</h2>
                </div>
                <span className="card-badge">TRIGGER BEHAVIOR</span>
              </div>

              <div className="gesture-modes-grid">
                {GESTURE_MODES.map((mode) => {
                  const isModeActive = airDrumMode === mode.id
                  return (
                    <div
                      key={mode.id}
                      className={`gesture-card-minimal ${isModeActive ? 'active' : ''}`}
                      onClick={() => setAirDrumMode(mode.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="gesture-top">
                        <span className="gesture-icon">{mode.icon}</span>
                        <span className={`gesture-radio ${isModeActive ? 'active' : ''}`} />
                      </div>
                      <span className="gesture-name">{mode.name}</span>
                      <p className="gesture-desc">{mode.desc}</p>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* SECTION 4: RUNTIME PREFERENCES & HARDWARE FEEDBACK */}
            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">RUNTIME HARDWARE & TELEMETRY</h2>
                </div>
                <span className="card-badge">SYSTEM INTEGRITY</span>
              </div>

              <div className="toggles-list">
                <div className="toggle-row">
                  <div className="toggle-info">
                    <span className="toggle-name">3D Viewport Horizon Grid</span>
                    <span className="toggle-sub">Render perspective cyberspace grid lines beneath drum pads.</span>
                  </div>
                  <button
                    type="button"
                    className={`minimal-switch ${showDrumKit ? 'on' : 'off'}`}
                    onClick={() => setShowDrumKit(!showDrumKit)}
                  >
                    <span className="switch-thumb" />
                  </button>
                </div>

                <div className="toggle-row">
                  <div className="toggle-info">
                    <span className="toggle-name">Zero-Latency Serial Stream</span>
                    <span className="toggle-sub">High-frequency 60Hz UART data stream over USB serial (115200 Baud).</span>
                  </div>
                  <span className="status-tag-active">LOCKED 60Hz</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ===================================================================
            TAB 2: HOLOGRAM & STYLE
            =================================================================== */}
        {activeTab === 'visuals' && (
          <div className="settings-panel animate-fade-in">
            <div className="panel-header-row">
              <div className="header-titles">
                <span className="section-eyebrow">VISUAL PIPELINE</span>
                <h1 className="panel-main-title">Hologram & Visual Styling</h1>
                <p className="panel-sub-desc">
                  Customize holographic shaders, cybernetic starlight emission, and optical lens diffusion.
                </p>
              </div>
            </div>

            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">HOLOGRAM ARCHITECTURE</h2>
                </div>
              </div>

              <div className="hologram-designs-grid">
                {[
                  {
                    id: 'wireframe',
                    name: '3D MESH MATRIX',
                    desc: 'Polygonal coordinate lattice with luminous joints and sharp geometry.'
                  },
                  {
                    id: 'particles',
                    name: 'QUANTUM POINT CLOUD',
                    desc: 'Luminous celestial particle cloud with shimmering quantum stardust nodes.'
                  }
                ].map((item) => (
                  <div
                    key={item.id}
                    className={`style-card ${hologramDesign === item.id ? 'active' : ''}`}
                    onClick={() => setHologramDesign(item.id)}
                  >
                    <span className="style-card-name">{item.name}</span>
                    <p className="style-card-desc">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">CYBERNETIC COLOR PALETTE</h2>
                </div>
              </div>

              <div className="palette-grid">
                {[
                  { id: 'cyan', name: 'NEBULA CYAN', hex: '#00f3ff' },
                  { id: 'purple', name: 'CYBER VIOLET', hex: '#a855f7' },
                  { id: 'gold', name: 'HOLOGRAPHIC GOLD', hex: '#f59e0b' }
                ].map((item) => (
                  <div
                    key={item.id}
                    className={`palette-card ${handStyle === item.id ? 'active' : ''}`}
                    onClick={() => setHandStyle(item.id)}
                  >
                    <span className="color-swatch" style={{ backgroundColor: item.hex }} />
                    <span className="palette-name">{item.name}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">OPTICAL BLOOM & GLOW INTENSITY</h2>
                </div>
              </div>

              <div className="sensitivity-dual-row">
                <div className="slider-block-minimal">
                  <div className="slider-header-wrap">
                    <span className="slider-label">LENS BLOOM DIFFUSION</span>
                    <span className="slider-value-display cyan">{bloomIntensity.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    value={Math.round(bloomIntensity * 10)}
                    onChange={(e) => setBloomIntensity(parseInt(e.target.value, 10) / 10)}
                    className="minimal-range cyan"
                  />
                </div>

                <div className="slider-block-minimal">
                  <div className="slider-header-wrap">
                    <span className="slider-label">MATERIAL EMISSIVE RADIANCE</span>
                    <span className="slider-value-display emerald">{glowIntensity.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    value={Math.round(glowIntensity * 10)}
                    onChange={(e) => setGlowIntensity(parseInt(e.target.value, 10) / 10)}
                    className="minimal-range emerald"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ===================================================================
            TAB 3: AIR DRUM GESTURES
            =================================================================== */}
        {activeTab === 'gestures' && (
          <div className="settings-panel animate-fade-in">
            <div className="panel-header-row">
              <div className="header-titles">
                <span className="section-eyebrow">TRIGGER LOGIC</span>
                <h1 className="panel-main-title">Air Drum Gestures</h1>
                <p className="panel-sub-desc">
                  Select and configure motion gesture triggers for spatial air drumming.
                </p>
              </div>
            </div>

            <section className="settings-card">
              <div className="gesture-modes-grid">
                {GESTURE_MODES.map((mode) => {
                  const isModeActive = airDrumMode === mode.id
                  return (
                    <div
                      key={mode.id}
                      className={`gesture-card-minimal ${isModeActive ? 'active' : ''}`}
                      onClick={() => setAirDrumMode(mode.id)}
                    >
                      <div className="gesture-top">
                        <span className="gesture-icon">{mode.icon}</span>
                        <span className={`gesture-radio ${isModeActive ? 'active' : ''}`} />
                      </div>
                      <span className="gesture-name">{mode.name}</span>
                      <p className="gesture-desc">{mode.desc}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}

        {/* ===================================================================
            TAB 4: SENSOR THRESHOLDS
            =================================================================== */}
        {activeTab === 'sensors' && (
          <div className="settings-panel animate-fade-in">
            <div className="panel-header-row">
              <div className="header-titles">
                <span className="section-eyebrow">HARDWARE CALIBRATION</span>
                <h1 className="panel-main-title">Sensor Thresholds</h1>
                <p className="panel-sub-desc">
                  Individual ADC baseline thresholds (0 - 1023) for each finger flex sensor on Left and Right gloves.
                </p>
              </div>
            </div>

            <div className="thresholds-columns-wrap">
              {/* Left Hand */}
              <section className="settings-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <span className="card-dot" />
                    <h2 className="card-title">LEFT GLOVE THRESHOLDS</h2>
                  </div>
                </div>

                <div className="threshold-bars-list">
                  {Object.entries(leftHandThresholds).map(([finger, val]) => (
                    <div key={finger} className="threshold-row-item">
                      <div className="threshold-label-wrap">
                        <span className="finger-code">{finger.toUpperCase()}</span>
                        <span className="threshold-val">{val}</span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="950"
                        value={val}
                        onChange={(e) => setLeftHandThreshold(finger, parseInt(e.target.value, 10))}
                        className="minimal-range cyan"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Right Hand */}
              <section className="settings-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <span className="card-dot" />
                    <h2 className="card-title">RIGHT GLOVE THRESHOLDS</h2>
                  </div>
                </div>

                <div className="threshold-bars-list">
                  {Object.entries(rightHandThresholds).map(([finger, val]) => (
                    <div key={finger} className="threshold-row-item">
                      <div className="threshold-label-wrap">
                        <span className="finger-code">{finger.toUpperCase()}</span>
                        <span className="threshold-val">{val}</span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="950"
                        value={val}
                        onChange={(e) => setRightHandThreshold(finger, parseInt(e.target.value, 10))}
                        className="minimal-range emerald"
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: SYSTEM DIAGNOSTICS
            =================================================================== */}
        {activeTab === 'system' && (
          <div className="settings-panel animate-fade-in">
            <div className="panel-header-row">
              <div className="header-titles">
                <span className="section-eyebrow">DIAGNOSTICS & SYSTEM</span>
                <h1 className="panel-main-title">System Diagnostics</h1>
                <p className="panel-sub-desc">
                  Telemetry monitoring, serial communications, and factory reset parameters.
                </p>
              </div>
            </div>

            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">TELEMETRY BENCHMARKS</h2>
                </div>
              </div>

              <div className="diagnostics-grid">
                <div className="diag-item">
                  <span className="diag-label">FRAME RATE</span>
                  <span className="diag-val cyan">60 FPS</span>
                  <span className="diag-sub">Jitter-Free Sync</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">SYSTEM LATENCY</span>
                  <span className="diag-val emerald">5 MS</span>
                  <span className="diag-sub">Hardware Interrupt</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">CPU WORKLOAD</span>
                  <span className="diag-val purple">24%</span>
                  <span className="diag-sub">Electron Multi-Thread</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">BAUD RATE</span>
                  <span className="diag-val gold">115200</span>
                  <span className="diag-sub">UART Serial Link</span>
                </div>
              </div>
            </section>

            <section className="settings-card">
              <div className="card-header">
                <div className="card-title-group">
                  <span className="card-dot" />
                  <h2 className="card-title">FACTORY RESET</h2>
                </div>
              </div>

              <div className="reset-block">
                <p className="reset-desc">
                  Revert all instruments, glove thresholds, gesture parameters, and visual presets to factory defaults.
                </p>
                <button
                  type="button"
                  className="factory-reset-btn"
                  onClick={resetToDefaults}
                >
                  RESTORE FACTORY DEFAULTS
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default SettingsScreen
