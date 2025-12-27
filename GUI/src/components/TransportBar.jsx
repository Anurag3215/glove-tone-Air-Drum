import React from 'react'
import useTransportStore from '../store/transportStore'
import './TransportBar.css'

function TransportBar() {
  const { 
    playing, 
    recording, 
    looping, 
    paused,
    globalLoopLength,
    currentLoopSample,
    sampleRate,
    togglePlay,
    toggleRecord,
    toggleLoop,
    togglePause,
    clearAll
  } = useTransportStore()
  
  // Calculate loop progress in bars (assuming 4 beats per bar, 120 BPM)
  const samplesPerBar = (sampleRate * 60 / 120) * 4
  const currentBar = globalLoopLength > 0 
    ? Math.floor(currentLoopSample / samplesPerBar) + 1
    : 0
  const totalBars = globalLoopLength > 0
    ? Math.ceil(globalLoopLength / samplesPerBar)
    : 0
  
  return (
    <div className="transport-bar">
      <div className="transport-controls">
        <button
          className={`transport-btn ${playing ? 'active play' : ''}`}
          onClick={togglePlay}
          title="Play"
        >
          ▶️ PLAY
        </button>
        
        <button
          className={`transport-btn ${recording ? 'active record' : ''}`}
          onClick={toggleRecord}
          title="Record"
        >
          ⏺️ REC
        </button>
        
        <button
          className={`transport-btn ${looping ? 'active loop' : ''}`}
          onClick={toggleLoop}
          title="Loop"
        >
          🔁 LOOP
        </button>
        
        <button
          className={`transport-btn ${paused ? 'active pause' : ''}`}
          onClick={togglePause}
          title="Pause"
        >
          ⏸️ PAUSE
        </button>
        
        <button
          className="transport-btn"
          onClick={clearAll}
          title="Clear All"
        >
          🗑️ CLEAR
        </button>
      </div>
      
      <div className="transport-info">
        <div className="loop-info">
          {totalBars > 0 ? `Loop: ${currentBar}/${totalBars} bars` : 'No loop'}
        </div>
      </div>
    </div>
  )
}

export default TransportBar
