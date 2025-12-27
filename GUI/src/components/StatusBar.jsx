import React from 'react'
import useSensorStore from '../store/sensorStore'
import useSettingsStore from '../store/settingsStore'
import './StatusBar.css'

const INSTRUMENTS = ['Drums', 'Drums Z', 'Keys', 'Chords', 'Violin', 'Guitar', 'MP3']

function StatusBar() {
  const leftConnected = useSensorStore((state) => state.leftHand.connected)
  const rightConnected = useSensorStore((state) => state.rightHand.connected)
  const currentInstrument = useSettingsStore((state) => state.currentInstrument)
  
  // Simulated values (would come from actual glove data in production)
  const leftBattery = 87
  const rightBattery = 92
  const wifiStrength = leftConnected && rightConnected ? 100 : 0
  const calibrationHealth = 'Good' // Could check if calibration is needed
  
  return (
    <div className="status-bar-pro">
      {/* Current Instrument */}
      <div className="status-section instrument-display">
        <div className="section-label">INSTRUMENT</div>
        <div className="instrument-name">{INSTRUMENTS[currentInstrument]}</div>
      </div>
      
      {/* WiFi Status */}
      <div className="status-section">
        <div className="section-label">CONNECTION</div>
        <div className="connection-indicator">
          <div className={`wifi-icon ${wifiStrength > 0 ? 'connected' : 'disconnected'}`}>
            <div className="wifi-bar bar-1"></div>
            <div className="wifi-bar bar-2"></div>
            <div className="wifi-bar bar-3"></div>
          </div>
          <span className="connection-text">
            {wifiStrength > 0 ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
      
      {/* Glove Connection Status */}
      <div className="status-section">
        <div className="section-label">GLOVES</div>
        <div className="glove-status">
          <div className="glove-item">
            <span className="glove-label">LEFT</span>
            <div className={`status-dot ${leftConnected ? 'active' : 'inactive'}`}></div>
          </div>
          <div className="glove-item">
            <span className="glove-label">RIGHT</span>
            <div className={`status-dot ${rightConnected ? 'active' : 'inactive'}`}></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatusBar
