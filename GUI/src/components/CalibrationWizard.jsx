import React, { useEffect } from 'react'
import useCalibrationStore from '../store/calibrationStore'
import './CalibrationWizard.css'

// Step instructions for each calibration type
const stepInstructions = {
  flex: [
    { title: 'Neutral Position', instruction: 'Keep all fingers straight and relaxed', hand: 'both' },
    { title: 'Bent Position', instruction: 'Bend all fingers fully into a fist', hand: 'both' },
  ],
  pose: [
    { title: 'Neutral Pose', instruction: 'Keep both hands in a relaxed neutral position', hand: 'both' },
    { title: 'Left Wakanda', instruction: 'Cross arms, left hand over right chest', hand: 'left' },
    { title: 'Right Wakanda', instruction: 'Cross arms, right hand over left chest', hand: 'right' },
  ],
  drums: [
    { title: 'Left Hand - Waist', instruction: 'Left hand at waist level (Snare)', hand: 'left' },
    { title: 'Left Hand - Left Outer', instruction: 'Left hand to your left, shoulder height (Tom 1)', hand: 'left' },
    { title: 'Left Hand - Left Inner', instruction: 'Left hand slightly left, chest height (Hi-hat)', hand: 'left' },
    { title: 'Left Hand - Right Inner', instruction: 'Left hand slightly right, chest height (Crash)', hand: 'left' },
    { title: 'Left Hand - Right Outer', instruction: 'Left hand to your right, shoulder height (Ride)', hand: 'left' },
    { title: 'Right Hand - Waist', instruction: 'Right hand at waist level (Kick)', hand: 'right' },
    { title: 'Right Hand - Left Outer', instruction: 'Right hand to your left, shoulder height (Floor Tom)', hand: 'right' },
    { title: 'Right Hand - Left Inner', instruction: 'Right hand slightly left, chest height (Tom 2)', hand: 'right' },
    { title: 'Right Hand - Right Inner', instruction: 'Right hand slightly right, chest height (Tom 3)', hand: 'right' },
    { title: 'Right Hand - Right Outer', instruction: 'Right hand to your right, shoulder height (Cymbal)', hand: 'right' },
  ],
  keys: [
    { title: 'Left Hand - Neutral', instruction: 'Left hand in neutral pitch position', hand: 'left' },
    { title: 'Left Hand - Pitch Up', instruction: 'Tilt left hand up', hand: 'left' },
    { title: 'Left Hand - Pitch Down', instruction: 'Tilt left hand down', hand: 'left' },
    { title: 'Right Hand - Neutral', instruction: 'Right hand in neutral pitch position', hand: 'right' },
    { title: 'Right Hand - Pitch Up', instruction: 'Tilt right hand up', hand: 'right' },
    { title: 'Right Hand - Pitch Down', instruction: 'Tilt right hand down', hand: 'right' },
  ],
}

function CalibrationWizard({ type }) {
  const currentStep = useCalibrationStore((state) => state.currentStep)
  const totalSteps = useCalibrationStore((state) => state.totalSteps)
  const countdown = useCalibrationStore((state) => state.countdown)
  const isCountingDown = useCalibrationStore((state) => state.isCountingDown)
  const startCountdown = useCalibrationStore((state) => state.startCountdown)
  const nextStep = useCalibrationStore((state) => state.nextStep)
  const cancelCalibration = useCalibrationStore((state) => state.cancelCalibration)
  
  const steps = stepInstructions[type]
  const currentStepData = steps[currentStep - 1]
  
  // Auto-advance after countdown
  useEffect(() => {
    if (!isCountingDown && countdown === 0 && currentStep > 0 && currentStep < totalSteps) {
      // Wait a bit after countdown finishes, then auto-advance
      const timer = setTimeout(() => {
        nextStep()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isCountingDown, countdown, currentStep, totalSteps, nextStep])
  
  return (
    <div className="calibration-wizard">
      <div className="wizard-header">
        <button className="back-btn" onClick={cancelCalibration}>
          ← Back
        </button>
        <div className="wizard-title">
          {type.toUpperCase()} CALIBRATION
        </div>
        <div className="wizard-progress">
          Step {currentStep}/{totalSteps}
        </div>
      </div>
      
      <div className="wizard-content">
        {/* Visual illustration */}
        <div className="wizard-illustration">
          <div className="illustration-placeholder">
            <div className="hand-emoji">
              {currentStepData.hand === 'left' && '🤚'}
              {currentStepData.hand === 'right' && '✋'}
              {currentStepData.hand === 'both' && '🙌'}
            </div>
          </div>
        </div>
        
        {/* Step info */}
        <div className="wizard-step-info">
          <div className="step-hand">
            {currentStepData.hand === 'left' && 'LEFT HAND'}
            {currentStepData.hand === 'right' && 'RIGHT HAND'}
            {currentStepData.hand === 'both' && 'BOTH HANDS'}
          </div>
          <h2>{currentStepData.title}</h2>
          <p>{currentStepData.instruction}</p>
        </div>
        
        {/* Stability / Countdown */}
        <div className="wizard-capture">
          {isCountingDown ? (
            <>
              <div className="stability-bar">
                <div className="stability-label">Stability</div>
                <div className="stability-meter">
                  <div className="stability-fill excellent"></div>
                </div>
                <div className="stability-status">EXCELLENT</div>
              </div>
              
              <div className="countdown-display">
                <div className="countdown-number">{countdown}</div>
                <div className="countdown-text">Capturing in {countdown}...</div>
              </div>
            </>
          ) : (
            <button className="capture-btn" onClick={startCountdown}>
              Start Capture
            </button>
          )}
        </div>
        
        {/* Progress dots */}
        <div className="wizard-dots">
          {[...Array(totalSteps)].map((_, i) => (
            <div
              key={i}
              className={`progress-dot ${i < currentStep - 1 ? 'done' : i === currentStep - 1 ? 'active' : ''}`}
            ></div>
          ))}
        </div>
        
        {/* Actions */}
        <div className="wizard-actions">
          <button className="skip-btn" onClick={nextStep}>
            Skip
          </button>
          {!isCountingDown && countdown === 0 && currentStep > 1 && (
            <button className="recapture-btn" onClick={startCountdown}>
              Recapture
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CalibrationWizard
