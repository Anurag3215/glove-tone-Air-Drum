import React from 'react'
import TrackLane from './TrackLane'
import useTransportStore from '../store/transportStore'
import useSettingsStore from '../store/settingsStore'
import useSensorStore from '../store/sensorStore'
import {
  Play,
  Pause,
  Circle,
  Square,
  Trash2,
  Clock,
  Music,
  Activity,
  Cpu,
} from 'lucide-react'
import './TracksPanel.css'

const TRACKS = [
  { id: 1, name: 'Drums', color: '#00D6A3' },
  { id: 2, name: 'Drums Z', color: '#35F5C0' },
  { id: 3, name: 'Keys', color: '#00CCFF' },
  { id: 4, name: 'Chords', color: '#9900FF' },
  { id: 5, name: 'Guitar', color: '#FFB020' },
  { id: 6, name: 'MP3', color: '#FFFF00' },
]

const INSTRUMENT_NAMES = ['DRUMS', 'DRUMS Z', 'KEYS', 'CHORDS', 'GUITAR', 'MP3']

function TracksPanel() {
  const playing = useTransportStore((state) => state.playing)
  const recording = useTransportStore((state) => state.recording)
  const globalLoopLength = useTransportStore((state) => state.globalLoopLength)
  const currentLoopSample = useTransportStore((state) => state.currentLoopSample)
  const sampleRate = useTransportStore((state) => state.sampleRate)
  const bpm = useTransportStore((state) => state.bpm || 120)
  const trackNotes = useTransportStore((state) => state.trackNotes)
  
  const togglePlay = useTransportStore((state) => state.togglePlay)
  const toggleRecord = useTransportStore((state) => state.toggleRecord)
  const stopPlayback = useTransportStore((state) => state.stopPlayback)
  const clearAllLoops = useTransportStore((state) => state.clearAllLoops)
  
  const currentInstrument = useSettingsStore((state) => state.currentInstrument)
  const leftRate = useSensorStore((state) => state.leftHand.sampleRate)
  
  // Calculate total recorded notes
  const totalNotes = Object.values(trackNotes || {}).reduce((acc, notes) => acc + (notes?.length || 0), 0)
  
  // Calculate playhead position (controls width = 180px)
  const playheadPercent = globalLoopLength > 0 
    ? (currentLoopSample / globalLoopLength) * 100 
    : 0
  
  const samplesPerBar = (sampleRate * 60 / bpm) * 4
  const currentBar = globalLoopLength > 0 
    ? Math.floor(currentLoopSample / samplesPerBar) + 1
    : 1
  const currentBeat = globalLoopLength > 0
    ? (Math.floor((currentLoopSample % samplesPerBar) / (samplesPerBar / 4)) + 1)
    : 1
  const totalBars = globalLoopLength > 0
    ? Math.ceil(globalLoopLength / samplesPerBar)
    : 4

  // Time division ticks (16 steps across 4 bars: 1.1 to 4.4)
  const divisions = [
    '1.1', '1.2', '1.3', '1.4',
    '2.1', '2.2', '2.3', '2.4',
    '3.1', '3.2', '3.3', '3.4',
    '4.1', '4.2', '4.3', '4.4'
  ]

  return (
    <div className="tracks-panel-daw">
      {/* 1. DAW Transport Bar */}
      <div className="daw-transport-bar">
        <div className="transport-btn-group">
          {/* PLAY / PAUSE */}
          <button 
            className={`daw-btn play-btn ${playing ? 'active-play' : ''}`}
            onClick={togglePlay}
            title={playing ? 'Pause Playback' : 'Start Playback'}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
            <span>{playing ? 'PAUSE' : 'PLAY'}</span>
          </button>
          
          {/* REC */}
          <button 
            className={`daw-btn rec-btn ${recording ? 'active-rec' : ''}`}
            onClick={toggleRecord}
            title="Arm / Toggle Recording"
          >
            <Circle size={10} className={recording ? 'rec-pulse' : ''} />
            <span>REC</span>
          </button>
          
          {/* STOP */}
          <button 
            className="daw-btn stop-btn"
            onClick={stopPlayback}
            title="Stop and Return to Zero"
          >
            <Square size={11} />
            <span>STOP</span>
          </button>
          
          {/* CLEAR ALL */}
          <button 
            className="daw-btn clear-btn"
            onClick={clearAllLoops}
            title="Clear all recorded notes"
          >
            <Trash2 size={11} />
            <span>CLEAR ALL</span>
          </button>
        </div>

        {/* Measure Bar Display */}
        <div className="daw-meter-display">
          <Clock size={12} className="teal-icon" />
          <span className="meter-text mono">
            {globalLoopLength > 0 ? `BAR ${currentBar}.${currentBeat} / ${totalBars}` : 'BAR 1.1 READY'}
          </span>
        </div>
      </div>

      {/* 2. Performance Information Strip */}
      <div className="daw-performance-strip">
        <div className="perf-item">
          <span className="perf-label">TEMPO</span>
          <span className="perf-val mono">{bpm} BPM</span>
        </div>
        <div className="perf-divider" />
        <div className="perf-item">
          <span className="perf-label">KEY</span>
          <span className="perf-val">C MINOR</span>
        </div>
        <div className="perf-divider" />
        <div className="perf-item">
          <span className="perf-label">ACTIVE</span>
          <span className="perf-val active-teal">{INSTRUMENT_NAMES[currentInstrument] || 'DRUMS'}</span>
        </div>
        <div className="perf-divider" />
        <div className="perf-item">
          <span className="perf-label">NOTES</span>
          <span className="perf-val mono">{totalNotes}</span>
        </div>
      </div>

      {/* 3. Time Division Ruler */}
      <div className="daw-ruler-header">
        <div className="ruler-spacer">TRACKS</div>
        <div className="ruler-timeline">
          {divisions.map((div, i) => (
            <div key={i} className={`ruler-mark ${i % 4 === 0 ? 'major' : 'minor'}`}>
              <span>{div}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Multi-Track Timeline Container with Playhead */}
      <div className="daw-tracks-container">
        {TRACKS.map(track => (
          <TrackLane key={track.id} track={track} />
        ))}
        
        {/* Dynamic Animated Playhead */}
        {globalLoopLength > 0 && (
          <div 
            className="daw-playhead-overlay" 
            style={{ left: `calc(180px + ${playheadPercent}% * (100% - 180px) / 100)` }}
          >
            <div className="daw-playhead-pointer" />
            <div className="daw-playhead-beam" />
          </div>
        )}
      </div>

      {/* 5. Compact System Telemetry Panel */}
      <div className="daw-telemetry-panel">
        <div className="telemetry-item">
          <span className="t-label">FPS</span>
          <span className="t-val mono">60</span>
        </div>
        <div className="telemetry-item">
          <span className="t-label">CPU</span>
          <span className="t-val mono">24%</span>
        </div>
        <div className="telemetry-item">
          <span className="t-label">RATE</span>
          <span className="t-val mono">{leftRate || 60}Hz</span>
        </div>
        <div className="telemetry-item">
          <span className="t-label">LATENCY</span>
          <span className="t-val mono">5ms</span>
        </div>
        <div className="telemetry-item status-col">
          <span className="t-label">STATUS</span>
          <span className="t-status">ONLINE</span>
        </div>
      </div>
    </div>
  )
}

export default TracksPanel
