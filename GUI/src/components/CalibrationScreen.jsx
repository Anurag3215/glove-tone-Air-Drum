import React, { useRef, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { CyberSpaceGrid } from './Hand3D'
import useSensorStore from '../store/sensorStore'
import useSettingsStore from '../store/settingsStore'
import { playDrumSound } from '../utils/audio'
import './CalibrationScreen.css'

// 5 Drum zones mapped directly to finger bends
export const DRUM_ZONES = [
  { 
    id: 'kick', 
    name: 'KICK', 
    finger: 'thumb', 
    fingerLabel: 'THUMB', 
    position: 'Left Outer', 
    color: '#00f3ff', 
    pos3d: [-2.6, -0.65, 0.4], 
    rot3d: [0.1, 0.3, 0], 
    radius: 0.65, 
    height: 0.5,
    isCymbal: false
  },
  { 
    id: 'tom', 
    name: 'TOM', 
    finger: 'index', 
    fingerLabel: 'INDEX FINGER', 
    position: 'Left Inner', 
    color: '#f59e0b', 
    pos3d: [-1.4, 0.25, -0.4], 
    rot3d: [0.25, 0.2, 0], 
    radius: 0.48, 
    height: 0.4,
    isCymbal: false
  },
  { 
    id: 'snare', 
    name: 'SNARE', 
    finger: 'middle', 
    fingerLabel: 'MIDDLE FINGER', 
    position: 'Center', 
    color: '#00ff9d', 
    pos3d: [0.0, -0.45, 0.6], 
    rot3d: [0.08, 0, 0], 
    radius: 0.58, 
    height: 0.35,
    isCymbal: false
  },
  { 
    id: 'hihat', 
    name: 'HI-HAT', 
    finger: 'ring', 
    fingerLabel: 'RING FINGER', 
    position: 'Right Inner', 
    color: '#ec4899', 
    pos3d: [1.4, 0.35, -0.4], 
    rot3d: [-0.15, -0.15, 0], 
    radius: 0.55, 
    height: 0.08, 
    isCymbal: true 
  },
  { 
    id: 'crash', 
    name: 'CRASH', 
    finger: 'pinky', 
    fingerLabel: 'LITTLE FINGER', 
    position: 'Right Outer', 
    color: '#a855f7', 
    pos3d: [2.6, 0.65, 0.3], 
    rot3d: [-0.25, -0.3, 0], 
    radius: 0.68, 
    height: 0.08, 
    isCymbal: true 
  }
]

// 3D Wireframe Drum Pad in Matrix (Responds to Clicks & Finger Bends)
function MatrixDrumPad({ zone, isActive, isCalibrated, isTriggered, onSelect }) {
  const groupRef = useRef()
  const ringRef = useRef()
  const [isHit, setIsHit] = useState(false)
  const scaleRef = useRef(1.0)

  useEffect(() => {
    if (isTriggered) {
      scaleRef.current = 1.35
      setIsHit(true)
      const timer = setTimeout(() => {
        scaleRef.current = 1.0
        setIsHit(false)
      }, 180)
      return () => clearTimeout(timer)
    }
  }, [isTriggered])

  const trigger = (e) => {
    if (e) e.stopPropagation()
    scaleRef.current = 1.35
    setIsHit(true)
    playDrumSound(zone.name)
    onSelect(zone)
    setTimeout(() => {
      scaleRef.current = 1.0
      setIsHit(false)
    }, 180)
  }

  useFrame((_, delta) => {
    if (groupRef.current) {
      const targetScale = (isHit || isTriggered) ? 1.35 : isActive ? (1.1 + Math.sin(Date.now() * 0.005) * 0.05) : scaleRef.current
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 14)
    }
    if (ringRef.current && isActive) {
      ringRef.current.rotation.z += delta * 1.2
    }
  })

  const currentColor = (isHit || isTriggered) ? '#FFFFFF' : isActive ? '#00f3ff' : isCalibrated ? '#00ff9d' : zone.color

  return (
    <group 
      ref={groupRef} 
      position={zone.pos3d} 
      rotation={zone.rot3d} 
      onClick={trigger}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'default' }}
    >
      {/* 3D Wireframe Mesh Cylinder or Cymbal */}
      <mesh>
        {zone.isCymbal ? (
          <coneGeometry args={[zone.radius, zone.height, 22, 3, true]} />
        ) : (
          <cylinderGeometry args={[zone.radius, zone.radius * 0.95, zone.height, 20, 4, true]} />
        )}
        <meshBasicMaterial 
          color={currentColor} 
          wireframe 
          transparent 
          opacity={isActive ? 1.0 : isCalibrated ? 0.9 : 0.65} 
        />
      </mesh>

      {/* Wireframe Head / Concentric Rim */}
      <mesh position={[0, zone.isCymbal ? 0 : zone.height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[zone.radius * 0.25, zone.radius, 20, 2]} />
        <meshBasicMaterial 
          color={currentColor} 
          wireframe 
          transparent 
          opacity={isActive ? 1.0 : 0.65} 
        />
      </mesh>

      {/* Active Targeting Wireframe Aura */}
      {isActive && (
        <mesh ref={ringRef} position={[0, zone.isCymbal ? 0 : zone.height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[zone.radius * 1.15, zone.radius * 1.25, 24]} />
          <meshBasicMaterial color="#00f3ff" wireframe transparent opacity={0.8} />
        </mesh>
      )}

      {/* Floating 3D HUD Badge with Name & Glowing Border */}
      <Html position={[0, zone.isCymbal ? zone.height + 0.35 : zone.height / 2 + 0.35, 0]} center pointerEvents="none">
        <div 
          className={`drum-3d-badge ${(isHit || isTriggered) ? 'hit' : ''}`} 
          style={{ '--badge-color': currentColor }}
        >
          <span className="badge-text">{zone.name}</span>
        </div>
      </Html>
    </group>
  )
}

function CalibrationScreen() {
  const [activeHand, setActiveHand] = useState('LEFT')
  const [currentStepIndex, setCurrentStepIndex] = useState(2) // Default Snare
  const airDrumMode = useSettingsStore((state) => state.airDrumMode || 'hybrid')
  const setAirDrumMode = useSettingsStore((state) => state.setAirDrumMode)

  // Real-time live finger bends and hit triggers
  const [liveBends, setLiveBends] = useState({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 })
  const [triggeredDrums, setTriggeredDrums] = useState({})

  // Real-time finger bend detection & air drum triggering from hardware glove
  useEffect(() => {
    const BEND_TRIGGER = 0.50 // 50% bend triggers hit
    const BEND_RELEASE = 0.30 // 30% bend releases for next hit
    const isBent = { thumb: false, index: false, middle: false, ring: false, pinky: false }

    const interval = setInterval(() => {
      const state = useSensorStore.getState()
      const hand = activeHand === 'LEFT' ? state.leftHand : state.rightHand
      const flex = hand?.flex || {}

      const newBends = {}
      for (const zone of DRUM_ZONES) {
        const raw = flex[zone.finger] ?? 750
        // Map raw 820..320 to 0..100%
        const bendNorm = Math.max(0, Math.min(1, (820 - raw) / 450))
        const pct = Math.round(bendNorm * 100)
        newBends[zone.finger] = pct

        if (bendNorm >= BEND_TRIGGER && !isBent[zone.finger]) {
          isBent[zone.finger] = true
          // Trigger procedural drum sound
          playDrumSound(zone.name)
          // Flash 3D drum pad & trigger state
          setTriggeredDrums(prev => ({ ...prev, [zone.id]: true }))
          setTimeout(() => {
            setTriggeredDrums(prev => ({ ...prev, [zone.id]: false }))
          }, 180)
        } else if (bendNorm < BEND_RELEASE && isBent[zone.finger]) {
          isBent[zone.finger] = false
        }
      }
      setLiveBends(newBends)
    }, 25) // 40 Hz fast sampling

    return () => clearInterval(interval)
  }, [activeHand])

  const [calibratedMap, setCalibratedMap] = useState({
    LEFT: { kick: true, tom: true, snare: true, hihat: false, crash: false },
    RIGHT: { kick: false, tom: false, snare: false, hihat: false, crash: false }
  })
  const [countdown, setCountdown] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [stability, setStability] = useState(98)
  const [lastQuat, setLastQuat] = useState(null)

  const activeZone = DRUM_ZONES[currentStepIndex]
  const currentHandCalibrated = calibratedMap[activeHand] || {}

  // Calculate hand stability for active calibration
  useEffect(() => {
    const interval = setInterval(() => {
      const state = useSensorStore.getState()
      const hand = activeHand === 'LEFT' ? state.leftHand : state.rightHand
      const q = hand?.quaternion
      if (lastQuat && q) {
        const diff = Math.abs(q.w - lastQuat.w) + Math.abs(q.x - lastQuat.x) + Math.abs(q.y - lastQuat.y)
        const stab = Math.min(100, Math.max(70, Math.round(100 - diff * 400)))
        setStability(stab)
      }
      setLastQuat(q)
    }, 150)
    return () => clearInterval(interval)
  }, [activeHand, lastQuat])

  // Start countdown capture
  const handleStartCapture = () => {
    setIsCapturing(true)
    setCountdown(3)
  }

  // Handle countdown
  useEffect(() => {
    if (!isCapturing) return

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 900)
      return () => clearTimeout(timer)
    } else {
      setIsCapturing(false)
      setCalibratedMap(prev => ({
        ...prev,
        [activeHand]: {
          ...prev[activeHand],
          [activeZone.id]: true
        }
      }))
      // Advance to next zone if available
      if (currentStepIndex < DRUM_ZONES.length - 1) {
        setCurrentStepIndex(prev => prev + 1)
      }
    }
  }, [isCapturing, countdown, activeHand, activeZone, currentStepIndex])

  return (
    <div className="cal-matrix-viewport">
      {/* MINIMAL TOPBAR (ZERO CAMERA TRACKING) */}
      <div className="matrix-topbar">
        <div className="topbar-brand">
          <span className="matrix-dot" />
          <span className="matrix-title">WIREFRAME MESH MATRIX</span>
          <span className="matrix-pill">AIR DRUM</span>
        </div>

        {/* Gesture Mode Selector */}
        <div className="matrix-gesture-option">
          <span className="gesture-opt-label">GESTURE:</span>
          <button 
            className="gesture-opt-btn"
            onClick={() => {
              const modes = ['hybrid', 'fingers', 'kinetic']
              const nextIdx = (modes.indexOf(airDrumMode) + 1) % modes.length
              setAirDrumMode(modes[nextIdx])
            }}
            title="Switch Air Drum Gesture Mode"
          >
            <span className="gesture-opt-icon">
              {airDrumMode === 'hybrid' ? '🎯' : airDrumMode === 'fingers' ? '🖐️' : '⚡'}
            </span>
            <span className="gesture-opt-text">
              {airDrumMode === 'hybrid' ? 'AIM + FINGER TAP' : airDrumMode === 'fingers' ? 'DIRECT FINGERS (1:1)' : 'KINETIC AIR STRIKE'}
            </span>
          </button>
        </div>

        {/* Hand Switcher */}
        <div className="matrix-hand-toggle">
          <button 
            className={`hand-btn ${activeHand === 'LEFT' ? 'active' : ''}`}
            onClick={() => setActiveHand('LEFT')}
          >
            LEFT GLOVE
          </button>
          <button 
            className={`hand-btn ${activeHand === 'RIGHT' ? 'active' : ''}`}
            onClick={() => setActiveHand('RIGHT')}
          >
            RIGHT GLOVE
          </button>
        </div>
      </div>

      {/* 3D WIREFRAME MESH MATRIX CANVAS (Clean Viewport - No Giant Hands, No Camera Overlays) */}
      <div className="matrix-canvas-container">
        <Canvas
          camera={{ position: [0, 1.8, 5.2], fov: 44 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        >
          <color attach="background" args={['#000000']} />
          <fog attach="fog" args={['#000000', 8, 28]} />

          {/* Perspective Moving Cyberspace Grid Floor */}
          <CyberSpaceGrid speed={1.2} />

          {/* 5 3D Wireframe Drums with Dynamic Finger Bend Response */}
          {DRUM_ZONES.map((zone, idx) => (
            <MatrixDrumPad
              key={zone.id}
              zone={zone}
              isActive={idx === currentStepIndex}
              isCalibrated={currentHandCalibrated[zone.id]}
              isTriggered={triggeredDrums[zone.id]}
              onSelect={() => setCurrentStepIndex(idx)}
            />
          ))}

          {/* Ambient Lighting */}
          <ambientLight intensity={0.45} />
          <pointLight position={[0, 4, 4]} intensity={0.8} color="#FFFFFF" />
          <pointLight position={[-3, 2, 2]} intensity={0.6} color="#00f3ff" />
          <pointLight position={[3, 2, 2]} intensity={0.6} color="#a855f7" />

          {/* Orbit Controls to smoothly rotate matrix without jitter */}
          <OrbitControls
            enablePan={false}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={3.2}
            maxDistance={8.5}
            dampingFactor={0.05}
          />
        </Canvas>
      </div>

      {/* 5-FINGER BEND AIR DRUM MAPPING BAR */}
      <div className="matrix-finger-bend-bar">
        <div className="finger-bend-header">
          <span className="bend-header-dot" />
          <span className="bend-header-title">FINGER BEND AIR DRUMS:</span>
        </div>
        <div className="finger-bend-list">
          {DRUM_ZONES.map((zone, idx) => {
            const bendPct = liveBends[zone.finger] || 0
            const isHit = triggeredDrums[zone.id]
            const isCurrent = idx === currentStepIndex

            return (
              <div 
                key={zone.id}
                className={`finger-bend-chip ${isHit ? 'hit' : ''} ${isCurrent ? 'active-zone' : ''}`}
                style={{ '--chip-color': zone.color }}
                onClick={() => {
                  playDrumSound(zone.name)
                  setCurrentStepIndex(idx)
                  setTriggeredDrums(prev => ({ ...prev, [zone.id]: true }))
                  setTimeout(() => setTriggeredDrums(prev => ({ ...prev, [zone.id]: false })), 180)
                }}
                title={`Bend ${zone.fingerLabel} to trigger ${zone.name}`}
              >
                <div className="chip-label-row">
                  <span className="chip-finger">{zone.fingerLabel}</span>
                  <span className="chip-arrow">➔</span>
                  <span className="chip-drum" style={{ color: isHit ? '#FFFFFF' : zone.color }}>
                    {zone.name}
                  </span>
                </div>
                <div className="chip-meter-track">
                  <div 
                    className="chip-meter-fill"
                    style={{ 
                      width: `${bendPct}%`,
                      backgroundColor: isHit ? '#FFFFFF' : zone.color 
                    }}
                  />
                </div>
                <div className="chip-footer">
                  <span className="chip-pct">{isHit ? 'HIT!' : `${bendPct}%`}</span>
                  {bendPct >= 50 && <span className="chip-hit-dot" style={{ backgroundColor: zone.color }} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* MINIMAL CALIBRATION CONTROL STRIP */}
      <div className="matrix-bottom-strip">
        {/* Step Navigation & Active Target */}
        <div className="active-zone-hud">
          <button 
            className="hud-nav-btn"
            disabled={currentStepIndex === 0 || isCapturing}
            onClick={() => setCurrentStepIndex(prev => prev - 1)}
          >
            ←
          </button>

          <div className="hud-zone-info">
            <span className="hud-zone-step">ZONE {currentStepIndex + 1} OF 5 • {activeZone.fingerLabel}</span>
            <h2 className="hud-zone-name" style={{ color: activeZone.color }}>
              {activeZone.name}
            </h2>
            <span className="hud-zone-hand">BEND {activeZone.fingerLabel} TO STRIKE • {activeZone.position.toUpperCase()}</span>
          </div>

          <button 
            className="hud-nav-btn"
            disabled={currentStepIndex === DRUM_ZONES.length - 1 || isCapturing}
            onClick={() => setCurrentStepIndex(prev => prev + 1)}
          >
            →
          </button>
        </div>

        {/* Capture / Countdown Center Action */}
        <div className="hud-action-center">
          {isCapturing ? (
            <div className="hud-countdown-pill">
              <span className="countdown-digit">{countdown > 0 ? countdown : '✓'}</span>
              <span className="countdown-msg">HOLD POSITION IN MATRIX</span>
            </div>
          ) : (
            <button 
              className="hud-capture-btn"
              onClick={handleStartCapture}
            >
              {currentHandCalibrated[activeZone.id] ? 'RE-CALIBRATE ZONE' : 'CAPTURE POSITION'}
            </button>
          )}

          <span className="hud-stability-tag">
            STABILITY: {stability}% • ZERO-DRIFT LOCKED
          </span>
        </div>

        {/* 5 Zone Progress Indicators */}
        <div className="hud-zones-pills">
          {DRUM_ZONES.map((zone, idx) => {
            const isDone = currentHandCalibrated[zone.id]
            const isCurrent = idx === currentStepIndex

            return (
              <button
                key={zone.id}
                className={`zone-pill-btn ${isCurrent ? 'active' : ''} ${isDone ? 'done' : ''}`}
                onClick={() => !isCapturing && setCurrentStepIndex(idx)}
              >
                <span className="pill-dot" style={{ backgroundColor: isDone ? '#00ff9d' : zone.color }} />
                <span className="pill-name">{zone.name}</span>
                {isDone && <span className="pill-check">✓</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default CalibrationScreen
