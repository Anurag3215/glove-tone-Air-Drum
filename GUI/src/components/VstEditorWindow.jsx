import React from 'react'
import useTrackStore from '../store/trackStore'
import './VstEditorWindow.css'

function VstEditorWindow({ trackId, trackName, trackColor }) {
  const toggleVstEditor = useTrackStore((state) => state.toggleVstEditor)
  
  return (
    <div className="vst-overlay">
      <div className="vst-window">
        {/* Window header */}
        <div className="vst-header" style={{ borderTopColor: trackColor }}>
          <div className="vst-title">
            <span className="vst-icon">🎛️</span>
            {trackName} - VST Plugin
          </div>
          <button 
            className="vst-close"
            onClick={() => toggleVstEditor(trackId)}
          >
            ✕
          </button>
        </div>
        
        {/* Mock VST content */}
        <div className="vst-content">
          <div className="vst-message">
            <div className="vst-message-icon">🎹</div>
            <h3>VST Plugin Editor</h3>
            <p>Track: <strong>{trackName}</strong></p>
            <p className="vst-message-note">
              In the full integration, this will open the actual VST plugin window
              from the C++ backend using Electron's native window API.
            </p>
            
            {/* Mock controls */}
            <div className="vst-mock-controls">
              <div className="vst-knob-group">
                <div className="vst-knob"></div>
                <div className="vst-label">Cutoff</div>
              </div>
              <div className="vst-knob-group">
                <div className="vst-knob"></div>
                <div className="vst-label">Resonance</div>
              </div>
              <div className="vst-knob-group">
                <div className="vst-knob"></div>
                <div className="vst-label">Attack</div>
              </div>
              <div className="vst-knob-group">
                <div className="vst-knob"></div>
                <div className="vst-label">Release</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VstEditorWindow
