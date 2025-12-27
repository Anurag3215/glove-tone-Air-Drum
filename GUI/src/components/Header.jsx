import React from 'react'
import useSensorStore from '../store/sensorStore'
import './Header.css'

function Header({ currentView, onViewChange }) {
  const leftConnected = useSensorStore((state) => state.leftHand.connected)
  const rightConnected = useSensorStore((state) => state.rightHand.connected)
  const leftRate = useSensorStore((state) => state.leftHand.sampleRate)
  const rightRate = useSensorStore((state) => state.rightHand.sampleRate)
  
  return (
    <header className="header-minimal">
      {/* Left: Brand */}
      <div className="header-brand-minimal">
        <span className="brand-name">GLOVETONE</span>
        <span className="brand-version">v1.0</span>
      </div>
      
      {/* Center: Navigation */}
      <nav className="header-nav-minimal">
        <button
          className={`nav-item ${currentView === 'home' ? 'active' : ''}`}
          onClick={() => onViewChange('home')}
        >
          Home
        </button>
        <button
          className={`nav-item ${currentView === 'calibrate' ? 'active' : ''}`}
          onClick={() => onViewChange('calibrate')}
        >
          Calibrate
        </button>
        <button
          className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          Settings
        </button>
      </nav>
      
      {/* Right: System Stats */}
      <div className="header-stats">
        <div className="stat-group">
          <span className="stat-label">HANDS</span>
          <div className="stat-indicators">
            <span className={`indicator ${leftConnected ? 'on' : 'off'}`}>L</span>
            <span className={`indicator ${rightConnected ? 'on' : 'off'}`}>R</span>
          </div>
        </div>
        
        <div className="stat-group">
          <span className="stat-label">RATE</span>
          <span className="stat-value">{leftRate}Hz</span>
        </div>
        
        <div className="stat-group">
          <span className="stat-label">CPU</span>
          <span className="stat-value">24%</span>
        </div>
        
        <div className="stat-group">
          <span className="stat-label">LAT</span>
          <span className="stat-value">5ms</span>
        </div>
      </div>
    </header>
  )
}

export default Header
