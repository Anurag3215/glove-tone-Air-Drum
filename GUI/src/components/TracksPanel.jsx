import React from 'react'
import TrackLane from './TrackLane'
import useTransportStore from '../store/transportStore'
import './TracksPanel.css'

const tracks = [
  { id: 1, name: 'Drums', color: '#FF6C00' },
  { id: 2, name: 'Drums Z', color: '#FF6C00' },
  { id: 3, name: 'Keys', color: '#00CCFF' },
  { id: 4, name: 'Chords', color: '#9900FF' },
  { id: 5, name: 'Violin', color: '#FF0055' },
  { id: 6, name: 'Guitar', color: '#00FF00' },
  { id: 7, name: 'MP3', color: '#FFFF00' },
]

function TracksPanel() {
  const playing = useTransportStore((state) => state.playing)
  const recording = useTransportStore((state) => state.recording)
  const globalLoopLength = useTransportStore((state) => state.globalLoopLength)
  const currentLoopSample = useTransportStore((state) => state.currentLoopSample)
  const sampleRate = useTransportStore((state) => state.sampleRate)
  
  const togglePlay = useTransportStore((state) => state.togglePlay)
  const toggleRecord = useTransportStore((state) => state.toggleRecord)
  const clearAllLoops = useTransportStore((state) => state.clearAllLoops)
  
  // Calculate playhead position (controls width = 190px)
  const playheadPercent = globalLoopLength > 0 
    ? (currentLoopSample / globalLoopLength) * 100 
    : 0
  
  const samplesPerBar = (sampleRate * 60 / 120) * 4
  const currentBar = globalLoopLength > 0 
    ? Math.floor(currentLoopSample / samplesPerBar) + 1
    : 0
  const totalBars = globalLoopLength > 0
    ? Math.ceil(globalLoopLength / samplesPerBar)
    : 0
  
  return (
    <div className="tracks-panel-juce">
      {/* Transport header */}
      <div className="tracks-header-juce">
        <button 
          className={`juce-btn ${playing ? 'active-play' : ''}`}
          onClick={togglePlay}
        >
          {playing ? 'PAUSE' : 'PLAY'}
        </button>
        
        <button 
          className={`juce-btn ${recording ? 'active-rec' : ''}`}
          onClick={toggleRecord}
        >
          REC
        </button>
        
        <button 
          className="juce-btn"
          onClick={clearAllLoops}
        >
          CLEAR ALL
        </button>
        
        <div className="bar-display">
          {totalBars > 0 ? `Bar ${currentBar}/${totalBars}` : 'Ready'}
        </div>
      </div>
      
      {/* Track list container with playhead overlay */}
      <div className="tracks-container-juce">
        {tracks.map(track => (
          <TrackLane key={track.id} track={track} />
        ))}
        
        {/* Orange playhead line (overlay) */}
        {globalLoopLength > 0 && (
          <div className="playhead-overlay" style={{ left: `calc(190px + ${playheadPercent}% * (100% - 190px) / 100)` }}>
            <div className="playhead-triangle"></div>
            <div className="playhead-line"></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TracksPanel
