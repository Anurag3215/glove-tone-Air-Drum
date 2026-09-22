import React, { useState } from 'react'
import useSettingsStore from '../store/settingsStore'
import './SettingsScreen.css'

const INSTRUMENTS = [
  { id: 0, name: 'Drums' },
  { id: 1, name: 'Drums Z' },
  { id: 2, name: 'Keys' },
  { id: 3, name: 'Chords' },
  { id: 4, name: 'Guitar' },
  { id: 5, name: 'MP3' },
]

function SettingsScreen() {
  const [activeTab, setActiveTab] = useState('general')
  
  // Settings store
  const currentInstrument = useSettingsStore((state) => state.currentInstrument)
  const setInstrument = useSettingsStore((state) => state.setInstrument)
  const flexSensitivity = useSettingsStore((state) => state.flexSensitivity)
  const setFlexSensitivity = useSettingsStore((state) => state.setFlexSensitivity)
  const leftHandThresholds = useSettingsStore((state) => state.leftHandThresholds)
  const rightHandThresholds = useSettingsStore((state) => state.rightHandThresholds)
  const setLeftHandThreshold = useSettingsStore((state) => state.setLeftHandThreshold)
  const setRightHandThreshold = useSettingsStore((state) => state.setRightHandThreshold)
  
  return (
    <div className="settings-pro">
      {/* Sidebar Navigation */}
      <aside className="settings-sidebar">
        <button
          className={`sidebar-btn ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'instruments' ? 'active' : ''}`}
          onClick={() => setActiveTab('instruments')}
        >
          Instruments
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'sensors' ? 'active' : ''}`}
          onClick={() => setActiveTab('sensors')}
        >
          Sensors
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          Audio
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'advanced' ? 'active' : ''}`}
          onClick={() => setActiveTab('advanced')}
        >
          Advanced
        </button>
      </aside>
      
      {/* Main Content */}
      <div className="settings-content-pro">
        {activeTab === 'general' && (
          <div className="settings-panel">
            <h2>General Settings</h2>
            
            <div className="setting-section">
              <h3>Current Instrument</h3>
              <div className="instrument-selector-grid">
                {INSTRUMENTS.map(inst => (
                  <button
                    key={inst.id}
                    className={`instrument-tile ${currentInstrument === inst.id ? 'active' : ''}`}
                    onClick={() => setInstrument(inst.id)}
                  >
                    <span className="inst-name">{inst.name}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="setting-section">
              <h3>Global Sensitivity</h3>
              <div className="slider-control">
                <label>
                  <span>Flex Sensitivity</span>
                  <span className="slider-val">{flexSensitivity}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={flexSensitivity}
                  onChange={(e) => setFlexSensitivity(parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'instruments' && (
          <div className="settings-panel">
            <h2>Instrument Configuration</h2>
            <p className="setting-note">Per-instrument parameters (Coming in C++ integration)</p>
          </div>
        )}
        
        {activeTab === 'sensors' && (
          <div className="settings-panel">
            <h2>Sensor Configuration</h2>
            
            <div className="setting-section">
              <h3>Flex Sensor Thresholds</h3>
              
              <div className="threshold-grid">
                <div className="threshold-hand">
                  <h4>Left Hand</h4>
                  {Object.entries(leftHandThresholds).map(([finger, value]) => (
                    <div key={finger} className="threshold-item">
                      <label>{finger.toUpperCase()}</label>
                      <input
                        type="number"
                        min="0"
                        max="1023"
                        value={value}
                        onChange={(e) => setLeftHandThreshold(finger, parseInt(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
                
                <div className="threshold-hand">
                  <h4>Right Hand</h4>
                  {Object.entries(rightHandThresholds).map(([finger, value]) => (
                    <div key={finger} className="threshold-item">
                      <label>{finger.toUpperCase()}</label>
                      <input
                        type="number"
                        min="0"
                        max="1023"
                        value={value}
                        onChange={(e) => setRightHandThreshold(finger, parseInt(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'audio' && (
          <div className="settings-panel">
            <h2>Audio Settings</h2>
            <p className="setting-note">Audio configuration (Coming in C++ integration)</p>
          </div>
        )}
        
        {activeTab === 'advanced' && (
          <div className="settings-panel">
            <h2>Advanced Settings</h2>
            <p className="setting-note">Debug and advanced options (Coming in C++ integration)</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsScreen
