import React, { useState } from 'react'
import useTransportStore from '../store/transportStore'
import { Volume2, VolumeX } from 'lucide-react'
import './TrackLane.css'

function TrackLane({ track }) {
  const [muted, setMuted] = useState(false)
  const [solo, setSolo] = useState(false)
  const [volume, setVolume] = useState(80)
  
  const globalLoopLength = useTransportStore((state) => state.globalLoopLength)
  const trackNotes = useTransportStore((state) => state.trackNotes[track.id] || [])
  
  // Default rhythmic note patterns for tracks if none recorded yet
  const defaultNotes = [
    { sampleOffset: 0.08, width: 6 },
    { sampleOffset: 0.25, width: 8 },
    { sampleOffset: 0.42, width: 5 },
    { sampleOffset: 0.58, width: 10 },
    { sampleOffset: 0.75, width: 7 },
    { sampleOffset: 0.90, width: 6 },
  ]
  
  return (
    <div className={`track-lane-cyber ${muted ? 'is-muted' : ''} ${solo ? 'is-solo' : ''}`}>
      {/* Track Controls (Left header - 180px fixed width) */}
      <div className="track-controls">
        <div className="track-identity">
          <span className="track-color-pill" style={{ background: track.color }} />
          <span className="track-title">{track.name}</span>
        </div>

        <div className="track-btn-group">
          <button 
            className={`control-pill mute-pill ${muted ? 'active' : ''}`}
            onClick={() => setMuted(!muted)}
            title="Mute Track"
          >
            M
          </button>
          
          <button 
            className={`control-pill solo-pill ${solo ? 'active' : ''}`}
            onClick={() => setSolo(!solo)}
            title="Solo Track"
          >
            S
          </button>
        </div>

        {/* Mini Volume Bar */}
        <div className="track-mini-meter">
          <div 
            className="meter-bar" 
            style={{ 
              width: muted ? '0%' : `${volume}%`,
              background: muted ? '#6E7C80' : track.color 
            }} 
          />
        </div>
      </div>
      
      {/* Track Timeline Lane */}
      <div className="track-timeline">
        {/* 16 Division Grid lines */}
        <div className="division-grid">
          {[...Array(16)].map((_, i) => (
            <div 
              key={i} 
              className={`div-line ${i % 4 === 0 ? 'bar-boundary' : ''}`}
              style={{ left: `${(i / 16) * 100}%` }}
            />
          ))}
        </div>
        
        {/* Active Events / Recorded Clips */}
        <div className="clips-layer">
          {(trackNotes.length > 0 ? trackNotes : defaultNotes).map((note, i) => {
            const leftPos = globalLoopLength > 0 && note.sampleOffset > 1
              ? (note.sampleOffset / globalLoopLength) * 100
              : (note.sampleOffset * 100)

            return (
              <div
                key={i}
                className="event-clip"
                style={{
                  left: `${leftPos % 100}%`,
                  width: `${note.width || 18}px`,
                  background: muted ? '#4A5568' : track.color,
                  borderColor: muted ? '#718096' : track.color,
                }}
              >
                <div className="clip-handle" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TrackLane
