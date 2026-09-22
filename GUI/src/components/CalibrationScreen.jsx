import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CyberSpaceGrid } from './Hand3D'
import useSensorStore from '../store/sensorStore'
import useSettingsStore from '../store/settingsStore'
import { handTrackerService, useHandTrackerStore } from '../utils/handTracker'
import './CalibrationScreen.css'

// 5 Drum zones to calibrate per hand
const DRUM_ZONES = [
  { id: 'kick', name: 'KICK', position: 'Left Outer', color: '#00f3ff', pos3d: [-2.6, -0.65, 0.4], rot3d: [0.1, 0.3, 0], radius: 0.65, height: 0.5 },
  { id: 'tom', name: 'TOM', position: 'Left Inner', color: '#f59e0b', pos3d: [-1.4, 0.25, -0.4], rot3d: [0.25, 0.2, 0], radius: 0.48, height: 0.4 },
  { id: 'snare', name: 'SNARE', position: 'Center', color: '#00ff9d', pos3d: [0.0, -0.45, 0.6], rot3d: [0.08, 0, 0], radius: 0.58, height: 0.35 },
  { id: 'hihat', name: 'HI-HAT', position: 'Right Inner', color: '#ec4899', pos3d: [1.4, 0.35, -0.4], rot3d: [-0.15, -0.15, 0], radius: 0.55, height: 0.08, isCymbal: true },
  { id: 'crash', name: 'CRASH', position: 'Right Outer', color: '#a855f7', pos3d: [2.6, 0.65, 0.3], rot3d: [-0.25, -0.3, 0], radius: 0.68, height: 0.08, isCymbal: true },
]

// Synthesized drum audio feedback
function playDrumSound(type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    if (type === 'KICK') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.setValueAtTime(140, now)
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.35)
      gain.gain.setValueAtTime(1, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.35)
    } else if (type === 'SNARE') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate)
      const out = buf.getChannelData(0)
      for (let i = 0; i < buf.length; i++) out[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 900
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.7, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    } else if (type === 'HI-HAT') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.07, ctx.sampleRate)
      const out = buf.getChannelData(0)
      for (let i = 0; i < buf.length; i++) out[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 8000
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.5, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    } else if (type === 'TOM') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.setValueAtTime(200, now)
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.3)
      gain.gain.setValueAtTime(0.9, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.3)
    } else if (type === 'CRASH') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate)
      const out = buf.getChannelData(0)
      for (let i = 0; i < buf.length; i++) out[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 5500
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.8, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    }
  } catch {
    // Audio fallback
  }
}

// 3D Pure Wireframe Hand Mesh in Matrix (Supports Optical Camera Tracking & Glove Sensors)
function MatrixWireframeHand({ activeHand, isCameraActive }) {
  const rootGroupRef = useRef()
  const pivotRef = useRef()
  const modelRef = useRef()
  const { scene } = useGLTF('/model/hand.glb')
  
  const handScene = useMemo(() => {
    const cloned = scene.clone()
    const box = new THREE.Box3().setFromObject(cloned)
    const center = box.getCenter(new THREE.Vector3())
    cloned.position.set(-center.x, -center.y, -center.z)

    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00f3ff'),
      wireframe: true,
      transparent: true,
      opacity: 0.92,
      side: THREE.FrontSide,
    })

    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = wireMat
      }
    })
    return cloned
  }, [scene])

  useFrame(() => {
    const side = activeHand === 'LEFT' ? 'left' : 'right'
    const isOptical = isCameraActive && handTrackerService.isDetected(side)

    if (isOptical) {
      const lm = handTrackerService.getLandmarks(side)

      // 60 FPS Optical Hand Orientation directly from MediaPipe landmarks
      const yaw = -(lm[27] - lm[0]) * 0.95
      const pitch = (lm[28] - lm[1] - 1.10) * 0.85
      const roll = (lm[16] - lm[52]) * 0.85
      const euler = new THREE.Euler(pitch, yaw, roll, 'XYZ')
      const opticalQuat = new THREE.Quaternion().setFromEuler(euler)

      if (pivotRef.current) {
        pivotRef.current.quaternion.slerp(opticalQuat, 0.25)
      }

      // 60 FPS Optical Spatial Aim Drift towards drums
      if (rootGroupRef.current) {
        const driftX = (lm[0] || 0) * 1.0
        const driftY = ((lm[1] + 1.25) || 0) * 0.5
        const driftZ = (lm[2] || 0) * 0.7
        const baseX = activeHand === 'LEFT' ? -0.25 : 0.25
        rootGroupRef.current.position.lerp(
          new THREE.Vector3(baseX + driftX, -0.5 + driftY, 0.8 + driftZ),
          0.18
        )
      }
    } else {
      // Glove hardware / mock sensor fallback
      const state = useSensorStore.getState()
      const target = activeHand === 'LEFT' ? state.leftHand : state.rightHand
      if (rootGroupRef.current) {
        rootGroupRef.current.position.lerp(new THREE.Vector3(0, -0.5, 0.8), 0.12)
      }
      if (pivotRef.current && target?.quaternion) {
        const q = target.quaternion
        pivotRef.current.quaternion.slerp(new THREE.Quaternion(q.x, q.y, q.z, q.w), 0.2)
      }
    }
  })

  const scale = activeHand === 'LEFT' ? [-0.045, 0.045, 0.045] : [0.045, 0.045, 0.045]

  return (
    <group ref={rootGroupRef} position={[0, -0.5, 0.8]}>
      <group ref={pivotRef}>
        <group ref={modelRef} scale={scale}>
          <primitive object={handScene} />
        </group>
      </group>
    </group>
  )
}

// 2D Cybernetic Optical Tracking HUD with Skeleton Overlay
function OpticalPreviewHUD({ isCameraActive, fps, status }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const [isMinimized, setIsMinimized] = useState(false)

  useEffect(() => {
    if (!isCameraActive || isMinimized) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height

    const BONES = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ]

    const renderLoop = () => {
      ctx.clearRect(0, 0, width, height)

      // Draw mirrored video element
      const video = handTrackerService.getVideoElement()
      if (video && video.readyState >= 2) {
        ctx.save()
        ctx.translate(width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(video, 0, 0, width, height)
        // Cybernetic subtle dark grid tint
        ctx.fillStyle = 'rgba(0, 15, 25, 0.4)'
        ctx.fillRect(0, 0, width, height)
        ctx.restore()
      } else {
        ctx.fillStyle = '#070b12'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#6C7A8E'
        ctx.font = '9px Roboto Mono, monospace'
        ctx.textAlign = 'center'
        ctx.fillText('CAMERA STREAM READY', width / 2, height / 2)
      }

      // Draw tracked hand skeletons
      const drawHandSkeleton = (landmarks, color, tipColor) => {
        if (!landmarks || landmarks.length < 21) return

        const toScreen = (pt) => ({
          x: (1.0 - pt.x) * width,
          y: pt.y * height
        })

        // Bones
        ctx.strokeStyle = color
        ctx.lineWidth = 1.6
        ctx.beginPath()
        for (const [iA, iB] of BONES) {
          const pA = toScreen(landmarks[iA])
          const pB = toScreen(landmarks[iB])
          ctx.moveTo(pA.x, pA.y)
          ctx.lineTo(pB.x, pB.y)
        }
        ctx.stroke()

        // Joints & Tips
        for (let i = 0; i < 21; i++) {
          const p = toScreen(landmarks[i])
          const isTip = [4, 8, 12, 16, 20].includes(i)
          ctx.beginPath()
          ctx.arc(p.x, p.y, isTip ? 3.0 : 1.8, 0, Math.PI * 2)
          ctx.fillStyle = isTip ? tipColor : color
          ctx.fill()
          if (isTip) {
            ctx.strokeStyle = '#FFFFFF'
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }

      const left2D = handTrackerService.get2DLandmarks('left')
      const right2D = handTrackerService.get2DLandmarks('right')

      drawHandSkeleton(left2D, '#00f3ff', '#00ff9d')
      drawHandSkeleton(right2D, '#a855f7', '#00ff9d')

      animRef.current = requestAnimationFrame(renderLoop)
    }

    animRef.current = requestAnimationFrame(renderLoop)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [isCameraActive, isMinimized])

  if (!isCameraActive) return null

  const leftActive = handTrackerService.isDetected('left')
  const rightActive = handTrackerService.isDetected('right')

  return (
    <div className={`matrix-optical-hud ${isMinimized ? 'minimized' : ''}`}>
      <div className="optical-hud-header">
        <div className="optical-hud-title-wrap">
          <span className="optical-hud-live-dot" />
          <span className="optical-hud-title">OPTICAL TRACKING</span>
          <span className="optical-hud-fps">{fps} FPS</span>
        </div>
        <button 
          className="optical-hud-min-btn" 
          onClick={() => setIsMinimized(!isMinimized)}
          title={isMinimized ? 'Expand Camera View' : 'Minimize Camera View'}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {!isMinimized && (
        <>
          <div className="optical-hud-body">
            <canvas 
              ref={canvasRef} 
              width={180} 
              height={135} 
              className="optical-hud-canvas" 
            />
            <div className="optical-hud-reticle-tl" />
            <div className="optical-hud-reticle-br" />
          </div>

          <div className="optical-hud-status-strip">
            <span className={`hud-hand-tag ${leftActive ? 'active' : ''}`}>
              LEFT: {leftActive ? 'LOCKED' : 'SEEKING'}
            </span>
            <span className={`hud-hand-tag ${rightActive ? 'active' : ''}`}>
              RIGHT: {rightActive ? 'LOCKED' : 'SEEKING'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// 3D Wireframe Drum Pad in Matrix
function MatrixDrumPad({ zone, isActive, isCalibrated, onSelect }) {
  const groupRef = useRef()
  const ringRef = useRef()
  const [isHit, setIsHit] = useState(false)
  const scaleRef = useRef(1.0)

  const trigger = (e) => {
    if (e) e.stopPropagation()
    scaleRef.current = 1.3
    setIsHit(true)
    playDrumSound(zone.name)
    onSelect(zone)
    setTimeout(() => {
      scaleRef.current = 1.0
      setIsHit(false)
    }, 200)
  }

  useFrame((_, delta) => {
    if (groupRef.current) {
      const targetScale = isActive ? (1.1 + Math.sin(Date.now() * 0.005) * 0.05) : scaleRef.current
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 12)
    }
    if (ringRef.current && isActive) {
      ringRef.current.rotation.z += delta * 1.2
    }
  })

  const currentColor = isHit ? '#FFFFFF' : isActive ? '#00f3ff' : isCalibrated ? '#00ff9d' : zone.color

  return (
    <group 
      ref={groupRef} 
      position={zone.pos3d} 
      rotation={zone.rot3d} 
      onClick={trigger}
    >
      {/* 3D Wireframe Mesh Cylinder/Cymbal */}
      <mesh>
        {zone.isCymbal ? (
          <coneGeometry args={[zone.radius, zone.height, 18, 2, true]} />
        ) : (
          <cylinderGeometry args={[zone.radius, zone.radius * 0.95, zone.height, 18, 4, true]} />
        )}
        <meshBasicMaterial 
          color={currentColor} 
          wireframe 
          transparent 
          opacity={isActive ? 1.0 : isCalibrated ? 0.85 : 0.6} 
        />
      </mesh>

      {/* Wireframe Head / Concentric Rim */}
      <mesh position={[0, zone.isCymbal ? 0 : zone.height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[zone.radius * 0.25, zone.radius, 18, 2]} />
        <meshBasicMaterial 
          color={currentColor} 
          wireframe 
          transparent 
          opacity={isActive ? 1.0 : 0.6} 
        />
      </mesh>

      {/* Active Targeting Wireframe Aura */}
      {isActive && (
        <mesh ref={ringRef} position={[0, zone.isCymbal ? 0 : zone.height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[zone.radius * 1.15, zone.radius * 1.25, 24]} />
          <meshBasicMaterial color="#00f3ff" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  )
}

function CalibrationScreen() {
  const [activeHand, setActiveHand] = useState('LEFT')
  const [currentStepIndex, setCurrentStepIndex] = useState(2) // Default Snare
  const airDrumMode = useSettingsStore((state) => state.airDrumMode || 'hybrid')
  const setAirDrumMode = useSettingsStore((state) => state.setAirDrumMode)

  // Camera tracking store hooks
  const isCameraActive = useHandTrackerStore((state) => state.isCameraActive)
  const camStatus = useHandTrackerStore((state) => state.status)
  const camFps = useHandTrackerStore((state) => state.fps)
  const handsDetected = useHandTrackerStore((state) => state.handsDetected)
  const toggleCamera = useHandTrackerStore((state) => state.toggleCamera)

  // Stop camera when unmounting calibration module
  useEffect(() => {
    return () => {
      handTrackerService.stopCamera()
    }
  }, [])

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
      const q = hand.quaternion
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
    }

    if (countdown === 0) {
      // Complete calibration for this zone
      playDrumSound(activeZone.name)
      setCalibratedMap(prev => ({
        ...prev,
        [activeHand]: {
          ...prev[activeHand],
          [activeZone.id]: true
        }
      }))

      const timer = setTimeout(() => {
        setIsCapturing(false)
        if (currentStepIndex < DRUM_ZONES.length - 1) {
          setCurrentStepIndex(currentStepIndex + 1)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [countdown, isCapturing, currentStepIndex, activeHand, activeZone])

  return (
    <div className="cal-matrix-viewport">
      {/* MINIMAL TOP BAR */}
      <div className="matrix-topbar">
        <div className="topbar-brand">
          <span className="matrix-dot"></span>
          <span className="matrix-title">DRUM CALIBRATION</span>
          <span className="matrix-pill">3D MESH MATRIX</span>
        </div>

        {/* Optical Camera Tracking Toggle Button */}
        <div className="matrix-camera-toggle">
          <button 
            className={`matrix-cam-btn ${isCameraActive ? 'active' : ''}`}
            onClick={toggleCamera}
            title="Toggle Optical Webcam Hand Tracking"
          >
            <span className={`matrix-cam-dot ${isCameraActive ? (handsDetected > 0 ? 'tracking' : 'on') : 'off'}`} />
            <span className="matrix-cam-icon">📷</span>
            <span className="matrix-cam-text">
              {isCameraActive 
                ? (camStatus === 'initializing' ? 'INITIALIZING...' : `CAMERA ON • ${camFps} FPS`) 
                : 'CAMERA: OFF'}
            </span>
          </button>
        </div>

        {/* Air Drum Gesture Control Mode Option */}
        <div className="matrix-gesture-option">
          <span className="gesture-opt-label">GESTURE:</span>
          <button 
            className="gesture-opt-btn"
            onClick={() => {
              const modes = ['hybrid', 'fingers', 'kinetic']
              const nextIdx = (modes.indexOf(airDrumMode) + 1) % modes.length
              setAirDrumMode(modes[nextIdx])
            }}
            title="Switch Air Drum Gesture Mode (Spatial Aim + Finger Tap, Direct Fingers, or Kinetic Strike)"
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

      {/* 2D OPTICAL SKELETON HUD PREVIEW */}
      <OpticalPreviewHUD 
        isCameraActive={isCameraActive}
        fps={camFps}
        status={camStatus}
      />

      {/* 3D WIREFRAME MESH MATRIX CANVAS */}
      <div className="matrix-canvas-container">
        <Canvas
          camera={{ position: [0, 2.0, 5.6], fov: 42 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        >
          <color attach="background" args={['#000000']} />
          <fog attach="fog" args={['#000000', 8, 28]} />

          {/* Perspective Moving Cyberspace Grid Floor */}
          <CyberSpaceGrid speed={1.2} />

          {/* 3D Wireframe Hand in Matrix (Tracks optical camera or glove sensors) */}
          <Suspense fallback={null}>
            <MatrixWireframeHand activeHand={activeHand} isCameraActive={isCameraActive} />
          </Suspense>

          {/* 5 3D Wireframe Drums */}
          {DRUM_ZONES.map((zone, idx) => (
            <MatrixDrumPad
              key={zone.id}
              zone={zone}
              isActive={idx === currentStepIndex}
              isCalibrated={currentHandCalibrated[zone.id]}
              onSelect={() => setCurrentStepIndex(idx)}
            />
          ))}

          {/* Ambient Lighting */}
          <ambientLight intensity={0.4} />
          <pointLight position={[0, 4, 4]} intensity={0.8} color="#FFFFFF" />
          <pointLight position={[-3, 2, 2]} intensity={0.6} color="#00f3ff" />
          <pointLight position={[3, 2, 2]} intensity={0.6} color="#a855f7" />

          {/* Orbit Controls to rotate matrix */}
          <OrbitControls
            enablePan={false}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={3.8}
            maxDistance={8.5}
          />
        </Canvas>
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
            <span className="hud-zone-step">ZONE {currentStepIndex + 1} OF 5</span>
            <h2 className="hud-zone-name" style={{ color: activeZone.color }}>
              {activeZone.name}
            </h2>
            <span className="hud-zone-hand">{activeHand} GLOVE • {activeZone.position.toUpperCase()}</span>
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
                <span className="pill-dot" style={{ backgroundColor: isDone ? '#00ff9d' : zone.color }}></span>
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
