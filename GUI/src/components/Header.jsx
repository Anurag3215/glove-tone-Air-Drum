import React, { useState } from 'react'
import useSensorStore from '../store/sensorStore'
import WifiModal from './WifiModal'
import './Header.css'

function Header({ currentView, onViewChange }) {
  const [isWifiOpen, setIsWifiOpen] = useState(false)

  const leftConnected = useSensorStore((state) => state.leftHand.connected)
  const rightConnected = useSensorStore((state) => state.rightHand.connected)
  const leftRate = useSensorStore((state) => state.leftHand.sampleRate)
  const wifiStatus = useSensorStore((state) => state.wifiStatus)
  const dataSource = useSensorStore((state) => state.dataSource)

  const isOnline = leftConnected || rightConnected
  const isWifiLive = wifiStatus.isReceiving && dataSource !== 'simulation'

  return (
    <>
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

        {/* Right: System Telemetry & Wi-Fi */}
        <div className="header-status">
          {/* Wi-Fi Hardware Connection Button */}
          <button
            type="button"
            className={`wifi-header-btn ${isWifiLive ? 'live' : wifiStatus.isListening ? 'ready' : ''}`}
            onClick={() => setIsWifiOpen(true)}
            title="Configure ESP32 Wi-Fi Connection (UDP Port 8888 / WebSocket)"
          >
            <span className={`wifi-dot ${isWifiLive ? 'live' : wifiStatus.isListening ? 'ready' : 'off'}`} />
            <span className="wifi-btn-label">
              {isWifiLive
                ? `WIFI LIVE (${wifiStatus.packetRateHz || 200}Hz)`
                : `WIFI :${wifiStatus.udpPort || 8888}`}
            </span>
          </button>

          {/* System Online Badge */}
          <div className="status-pill online-indicator">
            <span className={`status-dot-pulse ${isOnline ? 'online' : 'offline'}`} />
            <span className="status-pill-text">{isOnline ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</span>
          </div>

          {/* Hand Gloves L / R */}
          <div className="glove-badges">
            <span className={`glove-badge ${leftConnected ? 'on' : 'off'}`} title="Left Glove">
              L
            </span>
            <span className={`glove-badge ${rightConnected ? 'on' : 'off'}`} title="Right Glove">
              R
            </span>
          </div>

          {/* Live Metrics */}
          <div className="header-metric">
            <span className="metric-val">{isWifiLive ? `${wifiStatus.packetRateHz || 200}Hz` : `${leftRate || 60}Hz`}</span>
          </div>

          <div className="header-metric">
            <span className="metric-val">5ms LATENCY</span>
          </div>
        </div>
      </header>

      <WifiModal isOpen={isWifiOpen} onClose={() => setIsWifiOpen(false)} />
    </>
  )
}

export default Header
