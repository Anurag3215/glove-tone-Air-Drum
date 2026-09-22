import React from 'react'
import useSensorStore from '../store/sensorStore'
import useSettingsStore from '../store/settingsStore'
import useTransportStore from '../store/transportStore'
import './StatusBar.css'

const INSTRUMENTS = ['Drums', 'Drums Z', 'Keys', 'Chords', 'Guitar', 'MP3']

function StatusBar({ isTracksOpen, onToggleTracks }) {
  const isConnected = useSensorStore((state) => state.isConnected)
  const leftConnected = useSensorStore((state) => state.leftHand.connected)
  const rightConnected = useSensorStore((state) => state.rightHand.connected)
  const toggleConnection = useSensorStore((state) => state.toggleConnection)
  const toggleLeftHand = useSensorStore((state) => state.toggleLeftHand)
  const toggleRightHand = useSensorStore((state) => state.toggleRightHand)
  const currentInstrument = useSettingsStore((state) => state.currentInstrument)
  
  const recording = useTransportStore((state) => state.recording)
  const playing = useTransportStore((state) => state.playing)
  const bpm = useTransportStore((state) => state.bpm || 120)
  
  const isOnline = isConnected && (leftConnected || rightConnected)
  
  return (
    <div className="status-bar-pro">
      {/* Current Instrument */}
      <div className="status-section instrument-display">
        <div className="section-label">INSTRUMENT</div>
        <div className="instrument-name">{INSTRUMENTS[currentInstrument]}</div>
      </div>

      <div className="status-divider" />
      
      {/* Connection with Interactive ON / OFF Switch */}
      <div className="status-section connection-section">
        <div className="section-label">CONNECTION</div>
        <div className="connection-control-group">
          {/* Tactile ON / OFF Switch Button */}
          <button
            type="button"
            className={`connection-toggle-btn ${isConnected ? 'on' : 'off'}`}
            onClick={() => toggleConnection()}
            title={isConnected ? "Turn Connection OFF" : "Turn Connection ON"}
            aria-label="Toggle Connection ON/OFF"
          >
            <span className="toggle-slider-knob" />
            <span className="toggle-label">{isConnected ? 'ON' : 'OFF'}</span>
          </button>

          <div className="connection-indicator">
            <div className={`wifi-icon ${isOnline ? 'connected' : 'disconnected'}`}>
              <div className="wifi-bar bar-1"></div>
              <div className="wifi-bar bar-2"></div>
              <div className="wifi-bar bar-3"></div>
            </div>
            <span className={`connection-text ${isOnline ? 'connected' : 'disconnected'}`}>
              {isOnline ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="status-divider" />
      
      {/* Glove Connection Status (Clickable to toggle Left / Right) */}
      <div className="status-section">
        <div className="section-label">GLOVES</div>
        <div className="glove-status">
          <button 
            type="button"
            className={`glove-item-btn ${leftConnected ? 'active' : 'inactive'}`}
            onClick={toggleLeftHand}
            title={`Left Glove: ${leftConnected ? 'Connected (Click to toggle)' : 'Disconnected (Click to connect)'}`}
          >
            <span className="glove-label">LEFT</span>
            <div className={`status-dot ${leftConnected ? 'active' : 'inactive'}`} />
          </button>

          <button 
            type="button"
            className={`glove-item-btn ${rightConnected ? 'active' : 'inactive'}`}
            onClick={toggleRightHand}
            title={`Right Glove: ${rightConnected ? 'Connected (Click to toggle)' : 'Disconnected (Click to connect)'}`}
          >
            <span className="glove-label">RIGHT</span>
            <div className={`status-dot ${rightConnected ? 'active' : 'inactive'}`} />
          </button>
        </div>
      </div>

      <div className="status-spacer" />

      {/* On-Demand DAW Tracks Pop-up Trigger Button */}
      <div className="status-section tracks-trigger-section">
        <div className="section-label">DAW STUDIO</div>
        <button
          type="button"
          className={`daw-toggle-trigger-btn ${isTracksOpen ? 'open' : ''} ${recording ? 'is-recording' : playing ? 'is-playing' : ''}`}
          onClick={onToggleTracks}
          title="Open DAW Multi-Track Looper Studio"
        >
          <span className="daw-icon">🎹</span>
          <span className="daw-label">DAW LOOPER & TRACKS</span>
          <span className="daw-badge">
            {recording ? '● REC' : playing ? `▶ ${bpm} BPM` : '6 TRACKS'}
          </span>
        </button>
      </div>
    </div>
  )
}

export default StatusBar
