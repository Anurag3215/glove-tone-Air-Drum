import React from 'react'
import useSensorStore from '../store/sensorStore'
import './Header.css'

function Header({ currentView, onViewChange }) {
  const leftConnected = useSensorStore((state) => state.leftHand.connected)
  const rightConnected = useSensorStore((state) => state.rightHand.connected)
  const leftRate = useSensorStore((state) => state.leftHand.sampleRate)
  
  const isOnline = leftConnected || rightConnected
  
  return (
    <header className="header-cyber">
      {/* Left: Brand */}
      <div className="header-brand">
        <span className="brand-name">GLOVETONE</span>
        <span className="brand-version">v1.0</span>
      </div>
      
      {/* Center: Navigation */}
      <nav className="header-nav" role="tablist">
        <button
          role="tab"
          aria-selected={currentView === 'home'}
          className={`nav-btn ${currentView === 'home' ? 'active' : ''}`}
          onClick={() => onViewChange('home')}
        >
          HOME
        </button>
        <button
          role="tab"
          aria-selected={currentView === 'calibrate'}
          className={`nav-btn ${currentView === 'calibrate' ? 'active' : ''}`}
          onClick={() => onViewChange('calibrate')}
        >
          CALIBRATE
        </button>
        <button
          role="tab"
          aria-selected={currentView === 'settings'}
          className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          SETTINGS
        </button>
      </nav>
      
      {/* Right: System Telemetry */}
      <div className="header-status">
        {/* System Online Badge */}
        <div className="status-pill online-indicator">
          <span className={`status-dot-pulse ${isOnline ? 'online' : 'offline'}`} />
          <span className="status-pill-text">{isOnline ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</span>
        </div>

        {/* Hand Gloves L / R */}
        <div className="glove-badges">
          <span className={`glove-badge ${leftConnected ? 'on' : 'off'}`} title="Left Glove">L</span>
          <span className={`glove-badge ${rightConnected ? 'on' : 'off'}`} title="Right Glove">R</span>
        </div>

        {/* Live Metrics */}
        <div className="header-metric">
          <span className="metric-val">{leftRate || 60}Hz</span>
        </div>

        <div className="header-metric">
          <span className="metric-val">24% CPU</span>
        </div>

        <div className="header-metric">
          <span className="metric-val">5ms LATENCY</span>
        </div>
      </div>
    </header>
  )
}

export default Header
