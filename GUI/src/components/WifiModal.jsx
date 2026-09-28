import React, { useState } from 'react'
import useSensorStore from '../store/sensorStore'
import './WifiModal.css'

function WifiModal({ isOpen, onClose }) {
  const dataSource = useSensorStore((state) => state.dataSource)
  const setDataSource = useSensorStore((state) => state.setDataSource)
  const wifiStatus = useSensorStore((state) => state.wifiStatus)
  const leftHand = useSensorStore((state) => state.leftHand)
  const setUdpPort = useSensorStore((state) => state.setUdpPort)
  const sendTestWifiPacket = useSensorStore((state) => state.sendTestWifiPacket)
  const connectDirectWebSocket = useSensorStore((state) => state.connectDirectWebSocket)
  const disconnectDirectWebSocket = useSensorStore((state) => state.disconnectDirectWebSocket)

  const [portInput, setPortInput] = useState(String(wifiStatus.udpPort || 8888))
  const [wsInput, setWsInput] = useState(wifiStatus.directWsUrl || 'ws://192.168.4.1:81')
  const [copiedIp, setCopiedIp] = useState(null)

  if (!isOpen) return null

  const handleCopyIp = (ip) => {
    navigator.clipboard?.writeText(ip)
    setCopiedIp(ip)
    setTimeout(() => setCopiedIp(null), 1500)
  }

  const handlePortSave = (e) => {
    e.preventDefault()
    setUdpPort(Number(portInput))
  }

  const handleWsConnect = (e) => {
    e.preventDefault()
    if (wifiStatus.directWsStatus === 'connected') {
      disconnectDirectWebSocket()
    } else {
      connectDirectWebSocket(wsInput)
    }
  }

  const flex = leftHand?.flex || { thumb: 750, index: 750, middle: 750, ring: 750, pinky: 750 }
  const fingers = [
    { key: 'thumb', label: 'THUMB (KICK)', val: flex.thumb },
    { key: 'index', label: 'INDEX (TOM)', val: flex.index },
    { key: 'middle', label: 'MIDDLE (SNARE)', val: flex.middle },
    { key: 'ring', label: 'RING (HI-HAT)', val: flex.ring },
    { key: 'pinky', label: 'PINKY (CRASH)', val: flex.pinky }
  ]

  return (
    <div className="wifi-modal-overlay" onClick={onClose}>
      <div className="wifi-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="wifi-modal-header">
          <div className="wifi-title-wrap">
            <span className={`wifi-live-dot ${wifiStatus.isReceiving ? 'receiving' : wifiStatus.isListening ? 'listening' : 'off'}`} />
            <h2>Wi-Fi Hardware Connection</h2>
          </div>
          <button type="button" className="wifi-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="wifi-modal-body">
          {/* 1. Data Source Mode */}
          <div className="wifi-section">
            <div className="wifi-section-header">
              <span className="wifi-section-title">INPUT SOURCE MODE</span>
              <span className="wifi-badge">
                {wifiStatus.isReceiving ? 'ESP32 STREAMING LIVE' : 'STANDBY'}
              </span>
            </div>
            <div className="wifi-mode-grid">
              <button
                type="button"
                className={`wifi-mode-btn ${dataSource === 'auto' ? 'active' : ''}`}
                onClick={() => setDataSource('auto')}
              >
                <span className="mode-btn-title">Auto (Wi-Fi Priority)</span>
                <span className="mode-btn-sub">Uses ESP32 Wi-Fi automatically when packets arrive</span>
              </button>
              <button
                type="button"
                className={`wifi-mode-btn ${dataSource === 'wifi' ? 'active' : ''}`}
                onClick={() => setDataSource('wifi')}
              >
                <span className="mode-btn-title">Wi-Fi Hardware Only</span>
                <span className="mode-btn-sub">Disables simulation; strictly reads live ESP32 data</span>
              </button>
              <button
                type="button"
                className={`wifi-mode-btn ${dataSource === 'simulation' ? 'active' : ''}`}
                onClick={() => setDataSource('simulation')}
              >
                <span className="mode-btn-title">Simulation Only</span>
                <span className="mode-btn-sub">Test 3D visuals with synthetic sensor motion</span>
              </button>
            </div>
          </div>

          {/* 2. UDP Server Details (Port 8888) */}
          <div className="wifi-section">
            <div className="wifi-section-header">
              <span className="wifi-section-title">UDP STREAM RECEIVER (ESP32 ➔ PC)</span>
              <span className="wifi-mono-tag">
                {wifiStatus.isListening ? `LISTENING ON UDP :${wifiStatus.udpPort}` : 'OFFLINE'}
              </span>
            </div>

            <div className="wifi-ip-box">
              <div className="wifi-ip-col">
                <span className="ip-label">PC LOCAL WI-FI IP (SET AS PC_IP IN ESP32)</span>
                <div className="ip-list">
                  {wifiStatus.localIps && wifiStatus.localIps.length > 0 ? (
                    wifiStatus.localIps.map((item) => (
                      <button
                        key={item.address}
                        type="button"
                        className="ip-pill"
                        onClick={() => handleCopyIp(item.address)}
                        title="Click to copy IP address"
                      >
                        <span className="ip-addr">{item.address}</span>
                        <span className="ip-iface">{copiedIp === item.address ? 'COPIED ✓' : item.name}</span>
                      </button>
                    ))
                  ) : (
                    <span className="ip-empty">127.0.0.1 (Localhost)</span>
                  )}
                </div>
              </div>

              <form className="wifi-port-form" onSubmit={handlePortSave}>
                <label className="ip-label">UDP PORT</label>
                <div className="port-input-row">
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    value={portInput}
                    onChange={(e) => setPortInput(e.target.value)}
                  />
                  <button type="submit" className="wifi-action-btn">
                    Bind
                  </button>
                </div>
              </form>
            </div>

            {/* Telemetry Counters */}
            <div className="wifi-metrics-row">
              <div className="wifi-metric-tile">
                <span className="tile-label">ESP32 SENDER IP</span>
                <span className="tile-val">{wifiStatus.espIp || 'Waiting...'}</span>
              </div>
              <div className="wifi-metric-tile">
                <span className="tile-label">PACKET RATE</span>
                <span className="tile-val">{wifiStatus.packetRateHz} Hz</span>
              </div>
              <div className="wifi-metric-tile">
                <span className="tile-label">TOTAL PACKETS</span>
                <span className="tile-val">{wifiStatus.packetCount}</span>
              </div>
              <div className="wifi-metric-tile">
                <span className="tile-label">TEST PIPELINE</span>
                <button
                  type="button"
                  className="wifi-test-btn"
                  onClick={() => sendTestWifiPacket()}
                >
                  Send Test Packet
                </button>
              </div>
            </div>
          </div>

          {/* 3. Direct WebSocket Option */}
          <div className="wifi-section">
            <div className="wifi-section-header">
              <span className="wifi-section-title">DIRECT ESP32 WEBSOCKET (OPTIONAL)</span>
              <span className="wifi-mono-tag">
                {wifiStatus.directWsStatus.toUpperCase()}
              </span>
            </div>
            <form className="wifi-ws-row" onSubmit={handleWsConnect}>
              <input
                type="text"
                placeholder="ws://192.168.4.1:81"
                value={wsInput}
                onChange={(e) => setWsInput(e.target.value)}
              />
              <button
                type="submit"
                className={`wifi-action-btn ${wifiStatus.directWsStatus === 'connected' ? 'danger' : ''}`}
              >
                {wifiStatus.directWsStatus === 'connected' ? 'Disconnect' : 'Connect WS'}
              </button>
            </form>
          </div>

          {/* 4. Live 5-Finger ADC Readout */}
          <div className="wifi-section last">
            <div className="wifi-section-header">
              <span className="wifi-section-title">LIVE 5-FINGER FLEX TELEMETRY (ADC 0–1023)</span>
            </div>
            <div className="wifi-fingers-list">
              {fingers.map((f) => {
                const bendPct = Math.max(0, Math.min(100, Math.round(((820 - f.val) / 450) * 100)))
                return (
                  <div key={f.key} className="wifi-finger-row">
                    <span className="wf-name">{f.label}</span>
                    <div className="wf-bar-bg">
                      <div className="wf-bar-fill" style={{ width: `${bendPct}%` }} />
                    </div>
                    <span className="wf-raw">{f.val} ({bendPct}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WifiModal
