import React, { useRef, useState, useEffect } from 'react'
import { HolographicDrumScene } from './HolographicDrumScene'
import { HolographicHUD } from './HolographicHUD'
import { useDrumInteraction } from '../hooks/useDrumInteraction'
import { handTrackerService, useHandTrackerStore } from '../utils/handTracker'
import { HOLOGRAPHIC_DRUMS } from '../utils/constants'
import './CalibrationScreen.css'

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
      drawHandSkeleton(right2D, '#0088ff', '#00ff9d')

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

function CalibrationScreen() {
  const [activeHand, setActiveHand] = useState('LEFT')
  const handControllerRef = useRef(null)

  // Camera tracking store hooks
  const isCameraActive = useHandTrackerStore((state) => state.isCameraActive)
  const camStatus = useHandTrackerStore((state) => state.status)
  const camFps = useHandTrackerStore((state) => state.fps)

  // Central interaction hook for 6 drums, audio, particle bursts, and reactive sticks
  const {
    hoveredDrum,
    setHoveredDrum,
    activeBurst,
    triggeredDrums,
    liveBends,
    triggerHit
  } = useDrumInteraction({
    onDrumStrike: (drum) => {
      if (handControllerRef.current) {
        handControllerRef.current.strikeDrum(drum)
      }
    },
    activeHand
  })

  // Stop camera when unmounting calibration module
  useEffect(() => {
    return () => {
      handTrackerService.stopCamera()
    }
  }, [])

  const handleReset = () => {
    // Reset instrument visual state
    window.location.hash = ''
  }

  return (
    <div className="cal-matrix-viewport holo-drum-viewport">
      {/* MINIMAL FUTURISTIC HOLOGRAPHIC HUD */}
      <HolographicHUD
        onReset={handleReset}
        liveBends={liveBends}
        triggeredDrums={triggeredDrums}
        onDrumClick={(drum) => triggerHit(drum, 1.0)}
        activeHand={activeHand}
        onHandChange={setActiveHand}
      />

      {/* 2D OPTICAL SKELETON HUD PREVIEW (PIP) */}
      <OpticalPreviewHUD 
        isCameraActive={isCameraActive}
        fps={camFps}
        status={camStatus}
      />

      {/* 3D HOLOGRAPHIC DRUM SCENE (Three.js WebGL) */}
      <HolographicDrumScene
        activeBurst={activeBurst}
        triggeredDrums={triggeredDrums}
        onDrumHit={(drum) => triggerHit(drum, 1.0)}
        onHoverChange={(drum, isHovered) => setHoveredDrum(isHovered ? drum : null)}
        handControllerRef={handControllerRef}
      />
    </div>
  )
}

export default CalibrationScreen
