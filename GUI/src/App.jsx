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
  const startMockData = useSensorStore((state) => state.startMockData)
  const updatePlayhead = useTransportStore((state) => state.updatePlayhead)
  const startMockRecording = useTransportStore((state) => state.startMockRecording)
  
  useEffect(() => {
    startMockData()
    startMockRecording()
  }, [])
  
  // Playhead animation loop
  useEffect(() => {
    let lastTime = Date.now()
    let animationFrame
    
    const animate = () => {
      const now = Date.now()
      const delta = (now - lastTime) / 1000
      lastTime = now
      
      const sampleDelta = Math.floor(delta * 44100)
      updatePlayhead(sampleDelta)
      
      animationFrame = requestAnimationFrame(animate)
    }
    
    animationFrame = requestAnimationFrame(animate)
    
    return () => cancelAnimationFrame(animationFrame)
  }, [])
  
  return (
    <div className="app">
      <Header currentView={currentView} onViewChange={setCurrentView} />
      {currentView === 'home' && <StatusBar />}
      
      {currentView === 'home' ? (
        <div className="main-content">
          <div className="hands-section">
            <HandsPanel />
          </div>
          
          <div className="tracks-section">
            <TracksPanel />
          </div>
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
