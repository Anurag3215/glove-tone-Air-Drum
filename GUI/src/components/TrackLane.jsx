import React, { useState } from 'react'
import useTransportStore from '../store/transportStore'
import './TrackLane.css'

function TrackLane({ track }) {
  const [muted, setMuted] = useState(false)
  const [solo, setSolo] = useState(false)
  
  const globalLoopLength = useTransportStore((state) => state.globalLoopLength)
  const currentLoopSample = useTransportStore((state) => state.currentLoopSample)
  
  const playheadPercent = globalLoopLength > 0 
    ? (currentLoopSample / globalLoopLength) * 100 
    : 0
  
  // Simulated MIDI notes (would come from actual recording data)
  const midiNotes = [
    { sampleOffset: globalLoopLength * 0.1 },
    { sampleOffset: globalLoopLength * 0.25 },
    { sampleOffset: globalLoopLength * 0.4 },
    { sampleOffset: globalLoopLength * 0.55 },
    { sampleOffset: globalLoopLength * 0.7 },
    { sampleOffset: globalLoopLength * 0.85 },
  ]
  
  return (
    <div className="track-juce-exact">
      {/* Controls area (dark background) */}
      <div className="track-controls-dark">
        <div className="track-name-label">{track.name}</div>
        <button 
          className={`btn-m ${muted ? 'active' : ''}`}
          onClick={() => setMuted(!muted)}
        >
          M
        </button>
        <button 
          className={`btn-s ${solo ? 'active' : ''}`}
          onClick={() => setSolo(!solo)}
        >
          S
        </button>
        <button className="btn-v">V</button>
        <button className="btn-x">X</button>
      </div>
      
      {/* Timeline area (darker background with grid) */}
      <div className="track-timeline-dark">
        {/* Grid lines (16 divisions) */}
        <div className="timeline-grid">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="grid-line" style={{ left: `${(i / 16) * 100}%` }}></div>
          ))}
        </div>
        
        {/* MIDI Notes */}
        {globalLoopLength > 0 && midiNotes.map((note, i) => {
          const xPos = (note.sampleOffset / globalLoopLength) * 100
          return (
            <div
              key={i}
              className="midi-note"
              style={{
                left: `${xPos}%`,
                background: track.color,
                borderColor: track.color,
              }}
            >
              <div className="note-highlight"></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TrackLane
