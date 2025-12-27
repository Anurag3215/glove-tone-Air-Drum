import React, { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Grid } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import HolographicHand from './Hand3D'
import useSensorStore from '../store/sensorStore'
import './HandsPanel.css'

function HandsPanel() {
  const [showDataOverlay, setShowDataOverlay] = useState(true)
  const leftHand = useSensorStore((state) => state.leftHand)
  const rightHand = useSensorStore((state) => state.rightHand)
  
  return (
    <div className="hands-panel-pro">
      {/* Header Controls */}
      <div className="hands-header">
        <div className="hands-title">
          <span className="title-icon">◆</span>
          HOLOGRAPHIC VISUALIZATION
        </div>
        <div className="hands-controls">
          <button 
            className={`control-btn ${showDataOverlay ? 'active' : ''}`}
            onClick={() => setShowDataOverlay(!showDataOverlay)}
            title="Toggle Data Overlay"
          >
            <span className="btn-icon">📊</span> DATA
          </button>
        </div>
      </div>
      
      {/* 3D Canvas with hands */}
      <div className="hands-container-pro">
        <div className="hand-view-pro">
          <Canvas 
            camera={{ position: [0, 0, 8], fov: 70 }} 
            gl={{ antialias: false }}
          >
            <color attach="background" args={['#0A0E14']} />
            
            {/* Simple lighting */}
            <ambientLight intensity={0.4} />
            <pointLight position={[5, 5, 5]} intensity={0.6} />
            
            <HolographicHand position={[0, 0, 0]} rotation={[0, 0, 0]} label="LEFT" />
            

            <EffectComposer>
              <Bloom luminanceThreshold={0} luminanceSmoothing={0.9} height={300} intensity={1.5} />
            </EffectComposer>
          </Canvas>
          
          {/* Data Overlay */}
          {showDataOverlay && (
            <div className="data-overlay">
              <div className="data-section">
                <div className="data-label">QUATERNION</div>
                <div className="data-grid">
                  <div className="data-item">
                    <span className="data-key">W:</span>
                    <span className="data-value mono">{leftHand.quaternion.w.toFixed(3)}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">X:</span>
                    <span className="data-value mono">{leftHand.quaternion.x.toFixed(3)}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">Y:</span>
                    <span className="data-value mono">{leftHand.quaternion.y.toFixed(3)}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">Z:</span>
                    <span className="data-value mono">{leftHand.quaternion.z.toFixed(3)}</span>
                  </div>
                </div>
              </div>
              
              <div className="data-section">
                <div className="data-label">FLEX SENSORS</div>
                <div className="data-grid">
                  {Object.entries(leftHand.flex).map(([finger, value]) => (
                    <div key={finger} className="data-item">
                      <span className="data-key">{finger.substring(0, 3).toUpperCase()}:</span>
                      <span className="data-value mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="data-section">
                <div className="data-label">SYSTEM</div>
                <div className="data-grid">
                  <div className="data-item">
                    <span className="data-key">RATE:</span>
                    <span className="data-value mono">{leftHand.sampleRate}Hz</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">FPS:</span>
                    <span className="data-value mono">60</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="hand-label-pro">LEFT HAND</div>
        </div>
        
        <div className="hand-view-pro">
          <Canvas 
            camera={{ position: [0, 0, 8], fov: 70 }} 
            gl={{ antialias: false }}
          >
            <color attach="background" args={['#0A0E14']} />
            
            {/* Simple lighting */}
            <ambientLight intensity={0.4} />
            <pointLight position={[5, 5, 5]} intensity={0.6} />
            
            <HolographicHand position={[0, 0, 0]} rotation={[0, 0, 0]} label="RIGHT" />
            

            <EffectComposer>
              <Bloom luminanceThreshold={0} luminanceSmoothing={0.9} height={300} intensity={1.5} />
            </EffectComposer>
          </Canvas>
          
          {showDataOverlay && (
            <div className="data-overlay">
              <div className="data-section">
                <div className="data-label">QUATERNION</div>
                <div className="data-grid">
                  <div className="data-item">
                    <span className="data-key">W:</span>
                    <span className="data-value mono">{rightHand.quaternion.w.toFixed(3)}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">X:</span>
                    <span className="data-value mono">{rightHand.quaternion.x.toFixed(3)}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">Y:</span>
                    <span className="data-value mono">{rightHand.quaternion.y.toFixed(3)}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">Z:</span>
                    <span className="data-value mono">{rightHand.quaternion.z.toFixed(3)}</span>
                  </div>
                </div>
              </div>
              
              <div className="data-section">
                <div className="data-label">FLEX SENSORS</div>
                <div className="data-grid">
                  {Object.entries(rightHand.flex).map(([finger, value]) => (
                    <div key={finger} className="data-item">
                      <span className="data-key">{finger.substring(0, 3).toUpperCase()}:</span>
                      <span className="data-value mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="data-section">
                <div className="data-label">SYSTEM</div>
                <div className="data-grid">
                  <div className="data-item">
                    <span className="data-key">RATE:</span>
                    <span className="data-value mono">{rightHand.sampleRate}Hz</span>
                  </div>
                  <div className="data-item">
                    <span className="data-key">FPS:</span>
                    <span className="data-value mono">60</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="hand-label-pro">RIGHT HAND</div>
        </div>
      </div>
      
      {/* Instrument selector */}
      <div className="instrument-selector-pro">
        <button className="instrument-arrow-pro">◀</button>
        <div className="instrument-display-pro">
          <div className="instrument-icon-pro">🎻</div>
          <div className="instrument-info">
            <div className="instrument-name-pro">VIOLIN</div>
            <div className="instrument-mode-pro">MODE: ZONES • CH: 1</div>
          </div>
        </div>
        <button className="instrument-arrow-pro">▶</button>
      </div>
    </div>
  )
}

export default HandsPanel
