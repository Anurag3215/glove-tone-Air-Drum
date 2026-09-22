import React, { useState, useEffect } from 'react'
import Header from './components/Header'
import StatusBar from './components/StatusBar'
import HandsPanel from './components/HandsPanel'
import TracksPanel from './components/TracksPanel'
import CalibrationScreen from './components/CalibrationScreen'
import SettingsScreen from './components/SettingsScreen'
import useSensorStore from './store/sensorStore'
import useTransportStore from './store/transportStore'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('home')
  const [isTracksOpen, setIsTracksOpen] = useState(false)
  const startMockData = useSensorStore((state) => state.startMockData)
  const updatePlayhead = useTransportStore((state) => state.updatePlayhead)
  const startMockRecording = useTransportStore((state) => state.startMockRecording)
  
  const toggleTracks = () => setIsTracksOpen((prev) => !prev)
  
  useEffect(() => {
    startMockData()
    startMockRecording()
  }, [])
  
  // Playhead animation loop (optimized: only updates when playing)
  useEffect(() => {
    let lastTime = Date.now()
    let animationFrame
    
    const animate = () => {
      const now = Date.now()
      const delta = (now - lastTime) / 1000
      lastTime = now
      
      const transport = useTransportStore.getState()
      if (transport.playing && !transport.paused) {
        const sampleDelta = Math.floor(delta * 44100)
        updatePlayhead(sampleDelta)
      }
      
      animationFrame = requestAnimationFrame(animate)
    }
    
    animationFrame = requestAnimationFrame(animate)
    
    return () => cancelAnimationFrame(animationFrame)
  }, [updatePlayhead])
  
  return (
    <div className="app">
      <Header currentView={currentView} onViewChange={setCurrentView} />
      {currentView === 'home' && (
        <StatusBar 
          isTracksOpen={isTracksOpen} 
          onToggleTracks={toggleTracks} 
        />
      )}
      
      {currentView === 'home' ? (
        <div className="main-content">
          <div className="hands-section full-portion">
            <HandsPanel 
              isTracksOpen={isTracksOpen} 
              onToggleTracks={toggleTracks} 
            />
          </div>
          
          {/* On-Demand DAW Tracks Pop-up Modal */}
          {isTracksOpen && (
            <div 
              className="tracks-popup-modal-overlay" 
              onClick={() => setIsTracksOpen(false)}
            >
              <div 
                className="tracks-popup-modal-content" 
                onClick={(e) => e.stopPropagation()}
              >
                <div className="tracks-popup-modal-header">
                  <div className="popup-modal-title">
                    <span className="popup-title-icon">🎹</span>
                    <span className="popup-title-text">CYBER DAW LOOPER & MULTI-TRACKS</span>
                    <span className="popup-title-badge">STUDIO</span>
                  </div>
                  <button
                    type="button"
                    className="popup-modal-close-btn"
                    onClick={() => setIsTracksOpen(false)}
                    aria-label="Close DAW Tracks Panel"
                  >
                    ✕ CLOSE
                  </button>
                </div>
                <div className="tracks-popup-modal-body">
                  <TracksPanel />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : currentView === 'calibrate' ? (
        <div className="main-content">
          <CalibrationScreen />
        </div>
      ) : currentView === 'settings' ? (
        <div className="main-content">
          <SettingsScreen />
        </div>
      ) : null}
    </div>
  )
}

export default App
