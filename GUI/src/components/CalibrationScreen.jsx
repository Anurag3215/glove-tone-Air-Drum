import React, { useState, useEffect, useCallback } from 'react'
import useSensorStore from '../store/sensorStore'
import './CalibrationScreen.css'

const CALIBRATION_MODES = [
  { id: 'W', name: 'Wakanda Poses', description: 'Calibrate 3 controller poses for gesture detection', steps: 3, category: 'Pose Detection' },
  { id: 'D', name: 'Drum Zones', description: 'Calibrate 10 drum hit positions (5 per hand)', steps: 10, category: 'Spatial Mapping' },
  { id: 'V', name: 'Violin Zones', description: 'Calibrate 5 violin positions for pitch control', steps: 5, category: 'Spatial Mapping' },
  { id: 'K', name: 'Keys Zones', description: 'Calibrate 6 pitch positions for keyboard play', steps: 6, category: 'Spatial Mapping' },
]

const POSE_STEPS = [
  { name: 'Neutral Pose', instruction: 'Hold both hands in relaxed neutral position', hand: 'BOTH' },
  { name: 'Left Wakanda', instruction: 'Cross arms, LEFT hand forward (Wakanda pose)', hand: 'LEFT', countdown: 5 },
  { name: 'Right Wakanda', instruction: 'Cross arms, RIGHT hand forward (Wakanda pose)', hand: 'RIGHT', countdown: 5 },
]

const DRUM_ZONES = [
  { id: 1, hand: 'LEFT', position: 'Left Outer', sound: 'Kick Drum' },
  { id: 2, hand: 'LEFT', position: 'Left Inner', sound: 'Tom' },
  { id: 3, hand: 'LEFT', position: 'Waist Center', sound: 'Snare' },
  { id: 4, hand: 'LEFT', position: 'Right Inner', sound: 'Hi-Hat' },
  { id: 5, hand: 'LEFT', position: 'Right Outer', sound: 'Crash Cymbal' },
  { id: 6, hand: 'RIGHT', position: 'Left Outer', sound: 'Kick Drum' },
  { id: 7, hand: 'RIGHT', position: 'Left Inner', sound: 'Tom' },
  { id: 8, hand: 'RIGHT', position: 'Waist Center', sound: 'Snare' },
  { id: 9, hand: 'RIGHT', position: 'Right Inner', sound: 'Hi-Hat' },
  { id: 10, hand: 'RIGHT', position: 'Right Outer', sound: 'Crash Cymbal' },
]

const VIOLIN_ZONES = [
  { id: 1, position: 'Neutral', instruction: 'Hold LEFT hand at center position' },
  { id: 2, position: 'Flats', instruction: 'Tilt LEFT hand to the left' },
  { id: 3, position: 'Sharps', instruction: 'Tilt LEFT hand to the right' },
  { id: 4, position: 'Octave Up', instruction: 'Roll LEFT hand thumb-side up' },
  { id: 5, position: 'Octave Down', instruction: 'Roll LEFT hand pinky-side up' },
]

const KEYS_ZONES = [
  { id: 1, hand: 'LEFT', position: 'Neutral', instruction: 'Hold LEFT hand at neutral height' },
  { id: 2, hand: 'LEFT', position: 'Up', instruction: 'Raise LEFT hand up' },
  { id: 3, hand: 'LEFT', position: 'Down', instruction: 'Lower LEFT hand down' },
  { id: 4, hand: 'RIGHT', position: 'Neutral', instruction: 'Hold RIGHT hand at neutral height' },
  { id: 5, hand: 'RIGHT', position: 'Up', instruction: 'Raise RIGHT hand up' },
  { id: 6, hand: 'RIGHT', position: 'Down', instruction: 'Lower RIGHT hand down' },
]

function CalibrationScreen() {
  const [selectedMode, setSelectedMode] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [capturedSteps, setCapturedSteps] = useState([])
  const [capturedData, setCapturedData] = useState([])
  
  // Get live sensor data
  const leftHand = useSensorStore((state) => state.leftHand)
  const rightHand = useSensorStore((state) => state.rightHand)
  
  // Calculate stability (how still the hand is)
  const [stability, setStability] = useState(0)
  const [prevQuat, setPrevQuat] = useState(null)
  
  useEffect(() => {
    if (!isCapturing || countdown > 0) return
    
    const currentQuat = leftHand.quaternion
    if (prevQuat) {
      const diff = Math.abs(currentQuat.w - prevQuat.w) +
                   Math.abs(currentQuat.x - prevQuat.x) +
                   Math.abs(currentQuat.y - prevQuat.y) +
                   Math.abs(currentQuat.z - prevQuat.z)
      const newStability = Math.max(0, 100 - diff * 1000)
      setStability(newStability)
    }
    setPrevQuat(currentQuat)
  }, [leftHand.quaternion, isCapturing, countdown])
  
  const getCurrentStepData = useCallback(() => {
    if (!selectedMode) return null
    if (selectedMode.id === 'W') return POSE_STEPS[currentStep]
    if (selectedMode.id === 'D') return DRUM_ZONES[currentStep]
    if (selectedMode.id === 'V') return VIOLIN_ZONES[currentStep]
    if (selectedMode.id === 'K') return KEYS_ZONES[currentStep]
    return null
  }, [selectedMode, currentStep])
  
  const handleCapture = useCallback(() => {
    if (!selectedMode) return
    
    // Save captured data
    const data = {
      step: currentStep,
      leftQuat: { ...leftHand.quaternion },
      rightQuat: { ...rightHand.quaternion },
      leftFlex: { ...leftHand.flex },
      rightFlex: { ...rightHand.flex },
    }
    setCapturedData(prev => [...prev, data])
    setCapturedSteps(prev => [...prev, currentStep])
    
    setTimeout(() => {
      if (currentStep < selectedMode.steps - 1) {
        setCurrentStep(currentStep + 1)
        setIsCapturing(false)
        setCountdown(0)
        setStability(0)
      } else {
        alert(`${selectedMode.name} calibration complete!`)
        setSelectedMode(null)
        setCapturedSteps([])
        setCurrentStep(0)
        setCountdown(0)
        setIsCapturing(false)
        setCapturedData([])
      }
    }, 800)
  }, [selectedMode, currentStep, leftHand, rightHand])
  
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0 && isCapturing && !capturedSteps.includes(currentStep)) {
      const timer = setTimeout(() => handleCapture(), 100)
      return () => clearTimeout(timer)
    }
  }, [countdown, isCapturing, currentStep, capturedSteps, handleCapture])
  
  const handleModeSelect = (mode) => {
    setSelectedMode(mode)
    setCurrentStep(0)
    setCountdown(0)
    setIsCapturing(false)
    setCapturedSteps([])
    setCapturedData([])
  }
  
  const handleStartStep = () => {
    setIsCapturing(true)
    setStability(0)
    const stepData = getCurrentStepData()
    if (stepData?.countdown || (selectedMode && selectedMode.id !== 'W')) {
      setCountdown(5)
    } else {
      setTimeout(() => handleCapture(), 500)
    }
  }
  
  const stepData = getCurrentStepData()
  
  if (!selectedMode) {
    return (
      <div className="cal-screen-pro">
        <div className="cal-header-pro">
          <h1>Calibration Protocol</h1>
          <p>Select calibration mode to begin sensor configuration</p>
        </div>
        
        <div className="cal-mode-cards">
          {CALIBRATION_MODES.map(mode => (
            <div key={mode.id} className="mode-card-pro" onClick={() => handleModeSelect(mode)}>
              <div className="mode-category">{mode.category}</div>
              <h3>{mode.name}</h3>
              <p>{mode.description}</p>
              <div className="mode-meta">
                <span className="mode-steps">{mode.steps} steps</span>
                <span className="mode-key">KEY: {mode.id}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  
  return (
    <div className="cal-screen-pro">
      <button className="cal-back-btn" onClick={() => setSelectedMode(null)}>
        ← Back
      </button>
      
      <div className="cal-session-header">
        <div className="session-title">
          <h2>{selectedMode.name}</h2>
          <span className="session-progress">Step {currentStep + 1} / {selectedMode.steps}</span>
        </div>
        <div className="session-progress-bar">
          {[...Array(selectedMode.steps)].map((_, i) => (
            <div 
              key={i} 
              className={`progress-segment ${i < currentStep ? 'completed' : i === currentStep ? 'active' : ''}`}
            />
          ))}
        </div>
      </div>
      
      <div className="cal-workspace">
        <div className="cal-step-list">
          {selectedMode.id === 'W' && POSE_STEPS.map((step, i) => (
            <div key={i} className={`step-item ${i === currentStep ? 'active' : i < currentStep ? 'completed' : ''}`}>
              <div className="step-number">{i + 1}</div>
              <div className="step-content">
                <div className="step-name">{step.name}</div>
                <div className="step-hand">{step.hand} HAND</div>
              </div>
            </div>
          ))}
          
          {selectedMode.id === 'D' && DRUM_ZONES.map((zone, i) => (
            <div key={i} className={`step-item ${i === currentStep ? 'active' : i < currentStep ? 'completed' : ''}`}>
              <div className="step-number">{i + 1}</div>
              <div className="step-content">
                <div className="step-name">{zone.position}</div>
                <div className="step-hand">{zone.hand} • {zone.sound}</div>
              </div>
            </div>
          ))}
          
          {selectedMode.id === 'V' && VIOLIN_ZONES.map((zone, i) => (
            <div key={i} className={`step-item ${i === currentStep ? 'active' : i < currentStep ? 'completed' : ''}`}>
              <div className="step-number">{i + 1}</div>
              <div className="step-content">
                <div className="step-name">{zone.position}</div>
              </div>
            </div>
          ))}
          
          {selectedMode.id === 'K' && KEYS_ZONES.map((zone, i) => (
            <div key={i} className={`step-item ${i === currentStep ? 'active' : i < currentStep ? 'completed' : ''}`}>
              <div className="step-number">{i + 1}</div>
              <div className="step-content">
                <div className="step-name">{zone.hand} {zone.position}</div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="cal-main-area">
          <div className="cal-instruction-panel">
            <h3>{stepData?.name || stepData?.position}</h3>
            <p className="instruction-text">{stepData?.instruction}</p>
            {stepData?.hand && (
              <div className="hand-indicator">
                <span className="hand-badge">{stepData.hand} HAND</span>
              </div>
            )}
          </div>
          
          <div className="cal-capture-zone">
            {countdown > 0 ? (
              <div className="countdown-circle">
                <div className="countdown-ring">
                  <svg width="200" height="200">
                    <circle cx="100" cy="100" r="90" className="countdown-bg" />
                    <circle cx="100" cy="100" r="90" className="countdown-progress"
                      style={{ strokeDashoffset: `${565 - (565 / 5) * (5 - countdown)}` }}
                    />
                  </svg>
                  <div className="countdown-number">{countdown}</div>
                </div>
                <p>Hold position...</p>
              </div>
            ) : capturedSteps.includes(currentStep) ? (
              <div className="capture-success">
                <div className="success-checkmark">✓</div>
                <p>Position Captured</p>
              </div>
            ) : (
              <div className="capture-ready">
                <div className="ready-pulse"></div>
                <p>Ready to capture</p>
                {isCapturing && (
                  <div className="stability-meter">
                    <div className="stability-label">Stability</div>
                    <div className="stability-bar">
                      <div className="stability-fill" style={{ width: `${stability}%` }}></div>
                    </div>
                    <div className="stability-value">{Math.round(stability)}%</div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {!isCapturing && !capturedSteps.includes(currentStep) && (
            <button className="cal-capture-btn" onClick={handleStartStep}>
              Capture Position
            </button>
          )}
        </div>
        
        <div className="cal-visual-guide">
          <div className="sensor-data-panel">
            <h4>Live Sensor Data</h4>
            
            <div className="data-section">
              <div className="data-label">LEFT HAND QUATERNION</div>
              <div className="quat-grid">
                <div className="quat-value">
                  <span className="quat-key">W</span>
                  <span className="quat-val">{leftHand.quaternion.w.toFixed(3)}</span>
                </div>
                <div className="quat-value">
                  <span className="quat-key">X</span>
                  <span className="quat-val">{leftHand.quaternion.x.toFixed(3)}</span>
                </div>
                <div className="quat-value">
                  <span className="quat-key">Y</span>
                  <span className="quat-val">{leftHand.quaternion.y.toFixed(3)}</span>
                </div>
                <div className="quat-value">
                  <span className="quat-key">Z</span>
                  <span className="quat-val">{leftHand.quaternion.z.toFixed(3)}</span>
                </div>
              </div>
            </div>
            
            <div className="data-section">
              <div className="data-label">FLEX SENSORS</div>
              <div className="flex-list">
                {Object.entries(leftHand.flex).map(([finger, value]) => (
                  <div key={finger} className="flex-item">
                    <span className="flex-finger">{finger.toUpperCase()}</span>
                    <div className="flex-bar">
                      <div className="flex-fill" style={{ width: `${(value / 1023) * 100}%` }}></div>
                    </div>
                    <span className="flex-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {capturedData.length > 0 && (
              <div className="data-section">
                <div className="data-label">CAPTURED DATA</div>
                <div className="captured-list">
                  {capturedData.map((data, i) => (
                    <div key={i} className="captured-item">
                      <span className="captured-step">Step {data.step + 1}</span>
                      <span className="captured-quat">
                        {data.leftQuat.w.toFixed(2)} {data.leftQuat.x.toFixed(2)} {data.leftQuat.y.toFixed(2)} {data.leftQuat.z.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CalibrationScreen
