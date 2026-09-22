import { create } from 'zustand'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import useSensorStore from '../store/sensorStore'

// Canonical 3D Relaxed Hand Coordinates (21 landmarks)
export const CANONICAL_HAND_LANDMARKS = [
  // 0: Wrist
  [0.0, -1.25, 0.0],
  // 1-4: Thumb
  [-0.30, -0.95, 0.05],
  [-0.55, -0.65, 0.15],
  [-0.75, -0.38, 0.28],
  [-0.85, -0.12, 0.38],
  // 5-8: Index
  [-0.38, -0.20, 0.05],
  [-0.42, 0.35, 0.18],
  [-0.40, 0.75, 0.32],
  [-0.36, 1.05, 0.45],
  // 9-12: Middle
  [-0.08, -0.15, 0.02],
  [-0.08, 0.42, 0.18],
  [-0.06, 0.85, 0.35],
  [-0.04, 1.18, 0.50],
  // 13-16: Ring
  [0.24, -0.20, -0.02],
  [0.25, 0.36, 0.14],
  [0.26, 0.76, 0.30],
  [0.26, 1.05, 0.44],
  // 17-20: Pinky
  [0.50, -0.32, -0.06],
  [0.54, 0.15, 0.08],
  [0.55, 0.52, 0.22],
  [0.53, 0.82, 0.35],
]

class HandTrackerService {
  constructor() {
    this.handLandmarker = null
    this.videoElement = null
    this.stream = null
    this.animFrameId = null
    this.isRunning = false
    this.isInitializing = false
    this.lastVideoTime = -1

    // Direct Float32Arrays for Three.js 60 FPS access (zero garbage collection)
    this.leftLandmarks = new Float32Array(21 * 3)
    this.rightLandmarks = new Float32Array(21 * 3)
    this.leftRaw = new Float32Array(21 * 3)
    this.rightRaw = new Float32Array(21 * 3)

    // Normalized 2D landmarks for HUD preview overlay
    this.left2D = null
    this.right2D = null

    this.leftDetected = false
    this.rightDetected = false
    this.lastSeenLeft = 0
    this.lastSeenRight = 0

    // Initialize with canonical pose
    this.resetCanonical('left')
    this.resetCanonical('right')

    // Throttled React/Zustand dispatch timer
    this.lastZustandUpdate = 0

    // FPS measurement
    this.frameCount = 0
    this.lastFpsUpdate = performance.now()
    this.currentFps = 60
  }

  resetCanonical(side) {
    const arr = side === 'left' ? this.leftLandmarks : this.rightLandmarks
    const raw = side === 'left' ? this.leftRaw : this.rightRaw
    const flipX = side === 'left' ? -1.0 : 1.0

    for (let i = 0; i < 21; i++) {
      const p = CANONICAL_HAND_LANDMARKS[i]
      arr[i * 3] = p[0] * flipX
      arr[i * 3 + 1] = p[1]
      arr[i * 3 + 2] = p[2]
      raw[i * 3] = p[0] * flipX
      raw[i * 3 + 1] = p[1]
      raw[i * 3 + 2] = p[2]
    }
  }

  async initialize() {
    if (this.handLandmarker) return this.handLandmarker
    if (this.isInitializing) return null

    this.isInitializing = true
    useHandTrackerStore.getState().setStatus('initializing', 'INITIALIZING NEURAL VISION MODEL...')

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'
      )

      let landmarker = null
      const options = {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2, // Track BOTH hands simultaneously
        minHandDetectionConfidence: 0.50,
        minHandPresenceConfidence: 0.50,
        minTrackingConfidence: 0.50,
      }

      try {
        landmarker = await HandLandmarker.createFromOptions(vision, options)
      } catch (gpuErr) {
        console.warn('GPU vision delegate fallback to CPU:', gpuErr)
        options.baseOptions.delegate = 'CPU'
        landmarker = await HandLandmarker.createFromOptions(vision, options)
      }

      this.handLandmarker = landmarker
      this.isInitializing = false
      return this.handLandmarker
    } catch (err) {
      this.isInitializing = false
      console.error('HandLandmarker init error:', err)
      useHandTrackerStore.getState().setStatus('error', 'TRACKING INIT FAILED')
      throw err
    }
  }

  async startCamera() {
    if (this.isRunning) return

    try {
      useHandTrackerStore.getState().setStatus('initializing', 'REQUESTING OPTICAL SENSOR...')
      await this.initialize()

      if (!this.videoElement) {
        const video = document.createElement('video')
        video.setAttribute('playsinline', '')
        video.setAttribute('muted', '')
        video.style.position = 'fixed'
        video.style.top = '-9999px'
        video.style.left = '-9999px'
        video.style.width = '640px'
        video.style.height = '480px'
        video.style.opacity = '0'
        video.style.pointerEvents = 'none'
        document.body.appendChild(video)
        this.videoElement = video
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 60, max: 60 }
        },
        audio: false
      })

      this.stream = stream
      this.videoElement.srcObject = stream
      await this.videoElement.play()

      this.isRunning = true
      useHandTrackerStore.getState().setCameraActive(true)
      useHandTrackerStore.getState().setStatus('active', 'SHOW YOUR HANDS TO CAMERA')

      this.loop()
    } catch (err) {
      console.error('Camera error:', err)
      useHandTrackerStore.getState().setCameraActive(false)
      useHandTrackerStore.getState().setStatus('error', 'CAMERA ACCESS DENIED')
      this.stopCamera()
    }
  }

  stopCamera() {
    this.isRunning = false
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement)
      }
      this.videoElement = null
    }

    this.leftDetected = false
    this.rightDetected = false
    this.left2D = null
    this.right2D = null
    this.resetCanonical('left')
    this.resetCanonical('right')

    useHandTrackerStore.getState().setCameraActive(false)
    useHandTrackerStore.getState().setStatus('idle', 'TRACKING STANDBY')
    useHandTrackerStore.getState().setHandsDetected(0)
  }

  loop = () => {
    if (!this.isRunning) return

    const now = performance.now()
    this.frameCount++
    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate))
      this.frameCount = 0
      this.lastFpsUpdate = now
      useHandTrackerStore.getState().setFps(this.currentFps)
    }

    // Only run inference when video frame has advanced
    if (
      this.handLandmarker &&
      this.videoElement &&
      this.videoElement.readyState >= 2 &&
      this.videoElement.currentTime !== this.lastVideoTime
    ) {
      this.lastVideoTime = this.videoElement.currentTime
      const results = this.handLandmarker.detectForVideo(this.videoElement, now)

      if (results && results.landmarks && results.landmarks.length > 0) {
        this.processLandmarks(results.landmarks, now)
      } else {
        this.handleLost(now)
      }
    } else {
      // Subtle idle breathing blend if camera not supplying hands
      if (!this.leftDetected) this.blendCanonical('left', now)
      if (!this.rightDetected) this.blendCanonical('right', now)
    }

    this.animFrameId = requestAnimationFrame(this.loop)
  }

  processLandmarks(landmarksList, now) {
    let leftLM = null
    let rightLM = null

    if (landmarksList.length === 1) {
      const lm = landmarksList[0]
      // In mirrored selfie camera: user's physical left hand appears on screen right (x > 0.5)
      if (lm[0].x > 0.5) {
        leftLM = lm
      } else {
        rightLM = lm
      }
    } else if (landmarksList.length >= 2) {
      // Sort by horizontal position: rightmost on screen is user's physical left hand
      if (landmarksList[0][0].x > landmarksList[1][0].x) {
        leftLM = landmarksList[0]
        rightLM = landmarksList[1]
      } else {
        leftLM = landmarksList[1]
        rightLM = landmarksList[0]
      }
    }

    // Scale factors to map normalized MediaPipe coords into 3D scene space
    const scaleX = 4.8
    const scaleY = 5.2
    const scaleZ = 4.8

    if (leftLM) {
      this.leftDetected = true
      this.lastSeenLeft = now
      this.left2D = leftLM
      this.smoothAndStore('left', leftLM, scaleX, scaleY, scaleZ)
    } else if (now - this.lastSeenLeft > 500) {
      this.leftDetected = false
      this.left2D = null
      this.blendCanonical('left', now)
    }

    if (rightLM) {
      this.rightDetected = true
      this.lastSeenRight = now
      this.right2D = rightLM
      this.smoothAndStore('right', rightLM, scaleX, scaleY, scaleZ)
    } else if (now - this.lastSeenRight > 500) {
      this.rightDetected = false
      this.right2D = null
      this.blendCanonical('right', now)
    }

    // Throttled React Zustand store update (40 Hz = every 25ms) for ultra-low latency air drum triggers
    if (now - this.lastZustandUpdate >= 25) {
      this.lastZustandUpdate = now
      this.dispatchThrottledZustand(now)
    }
  }

  smoothAndStore(side, lm, sx, sy, sz) {
    const arr = side === 'left' ? this.leftLandmarks : this.rightLandmarks
    // Landmark 0 (wrist) offset to center hand at wrist origin
    const wristRawX = -(lm[0].x - 0.5) * sx
    const wristRawY = -(lm[0].y - 0.5) * sy
    const wristRawZ = -lm[0].z * sz

    // Subtle spatial follow drift (hand responds to lateral movement in camera space)
    const driftX = Math.max(-0.6, Math.min(0.6, wristRawX * 0.35))
    const driftY = Math.max(-0.4, Math.min(0.4, wristRawY * 0.35))

    // Alpha smoothing factor (0.45 gives crisp responsiveness with zero lag)
    const alpha = 0.45

    for (let i = 0; i < 21; i++) {
      // Relative to wrist landmark with -1.25 Y offset matching CANONICAL_HAND_LANDMARKS
      const rawX = -(lm[i].x - 0.5) * sx - wristRawX + driftX
      const rawY = -(lm[i].y - 0.5) * sy - wristRawY - 1.25 + driftY
      const rawZ = -lm[i].z * sz - wristRawZ

      const idx = i * 3
      arr[idx] += (rawX - arr[idx]) * alpha
      arr[idx + 1] += (rawY - arr[idx + 1]) * alpha
      arr[idx + 2] += (rawZ - arr[idx + 2]) * alpha
    }
  }

  blendCanonical(side, now) {
    const arr = side === 'left' ? this.leftLandmarks : this.rightLandmarks
    const flipX = side === 'left' ? -1.0 : 1.0
    const time = now * 0.0018

    // Read glove flex sensors from sensorStore if camera is off or hand not detected
    const handKey = side === 'left' ? 'leftHand' : 'rightHand'
    const handData = useSensorStore.getState()[handKey]
    const flex = handData?.flex || {}

    // Finger curl mappings for offline glove articulation
    const fingerCurls = {
      thumb: Math.max(0, Math.min(1, (800 - (flex.thumb || 750)) / 450)),
      index: Math.max(0, Math.min(1, (800 - (flex.index || 750)) / 450)),
      middle: Math.max(0, Math.min(1, (800 - (flex.middle || 750)) / 450)),
      ring: Math.max(0, Math.min(1, (800 - (flex.ring || 750)) / 450)),
      pinky: Math.max(0, Math.min(1, (800 - (flex.pinky || 750)) / 450)),
    }

    const jointFingerMap = [
      null, // 0: wrist
      'thumb', 'thumb', 'thumb', 'thumb',       // 1-4
      'index', 'index', 'index', 'index',       // 5-8
      'middle', 'middle', 'middle', 'middle',   // 9-12
      'ring', 'ring', 'ring', 'ring',           // 13-16
      'pinky', 'pinky', 'pinky', 'pinky'        // 17-20
    ]

    for (let i = 0; i < 21; i++) {
      const p = CANONICAL_HAND_LANDMARKS[i]
      const driftY = Math.sin(time + i * 0.3) * 0.025
      const driftZ = Math.cos(time * 0.8 + i * 0.2) * 0.015

      let targetX = p[0] * flipX
      let targetY = p[1] + driftY
      let targetZ = p[2] + driftZ

      // Apply glove sensor curl when available
      const fName = jointFingerMap[i]
      if (fName) {
        const curl = fingerCurls[fName]
        const jointRank = (i - 1) % 4 // 0: MCP, 1: PIP, 2: DIP, 3: TIP
        if (jointRank === 1) {
          targetY -= curl * 0.15
          targetZ += curl * 0.22
        } else if (jointRank === 2) {
          targetY -= curl * 0.38
          targetZ += curl * 0.48
        } else if (jointRank === 3) {
          targetY -= curl * 0.65
          targetZ += curl * 0.70
          if (fName === 'thumb') {
            targetX += curl * 0.22 * flipX
          }
        }
      }

      const idx = i * 3
      arr[idx] += (targetX - arr[idx]) * 0.12
      arr[idx + 1] += (targetY - arr[idx + 1]) * 0.12
      arr[idx + 2] += (targetZ - arr[idx + 2]) * 0.12
    }
  }

  handleLost(now) {
    if (now - this.lastSeenLeft > 500) {
      this.leftDetected = false
      this.left2D = null
      this.blendCanonical('left', now)
    }
    if (now - this.lastSeenRight > 500) {
      this.rightDetected = false
      this.right2D = null
      this.blendCanonical('right', now)
    }

    if (now - this.lastZustandUpdate >= 25) {
      this.lastZustandUpdate = now
      this.dispatchThrottledZustand(now)
    }
  }

  dispatchThrottledZustand(now) {
    const detectedCount = (this.leftDetected ? 1 : 0) + (this.rightDetected ? 1 : 0)
    const store = useHandTrackerStore.getState()
    store.setHandsDetected(detectedCount)

    let statusText = 'TRACKING STANDBY'
    if (detectedCount === 2) {
      statusText = `● TRACKING: BOTH HANDS ACTIVE • ${this.currentFps} FPS`
    } else if (this.rightDetected) {
      statusText = `● TRACKING: RIGHT HAND • ${this.currentFps} FPS`
    } else if (this.leftDetected) {
      statusText = `● TRACKING: LEFT HAND • ${this.currentFps} FPS`
    } else {
      statusText = 'SHOW YOUR HANDS TO CAMERA'
    }
    store.setStatus(detectedCount > 0 ? 'tracking' : 'lost', statusText)

    // Calculate 5-finger flex values for 2D HUD telemetry bars
    const computeFlex = (arr) => {
      const dist = (iA, iB) => Math.hypot(
        arr[iA * 3] - arr[iB * 3],
        arr[iA * 3 + 1] - arr[iB * 3 + 1],
        arr[iA * 3 + 2] - arr[iB * 3 + 2]
      )
      const mapVal = (d, minD, maxD) => {
        const norm = Math.max(0, Math.min(1, (d - minD) / (maxD - minD)))
        return Math.round(280 + norm * 550)
      }
      return {
        thumb: mapVal(dist(4, 2), 0.4, 1.0),
        index: mapVal(dist(8, 5), 0.35, 1.3),
        middle: mapVal(dist(12, 9), 0.35, 1.4),
        ring: mapVal(dist(16, 13), 0.35, 1.3),
        pinky: mapVal(dist(20, 17), 0.30, 1.1),
      }
    }

    // Optical rotation quaternion from landmarks
    const computeOrientation = (arr) => {
      const yaw = -(arr[27] - arr[0]) * 0.95
      const pitch = (arr[28] - arr[1] - 1.10) * 0.85
      const roll = (arr[16] - arr[52]) * 0.85
      const euler = new THREE.Euler(pitch, yaw, roll, 'XYZ')
      const q = new THREE.Quaternion().setFromEuler(euler)
      return { w: q.w, x: q.x, y: q.y, z: q.z }
    }

    const sensorStore = useSensorStore.getState()
    if (this.leftDetected) {
      sensorStore.updateLeftHand({ 
        flex: computeFlex(this.leftLandmarks),
        quaternion: computeOrientation(this.leftLandmarks),
        connected: true 
      })
    }
    if (this.rightDetected) {
      sensorStore.updateRightHand({ 
        flex: computeFlex(this.rightLandmarks),
        quaternion: computeOrientation(this.rightLandmarks),
        connected: true 
      })
    }
  }

  // High-performance Three.js direct buffer access (0ms latency, zero GC)
  getLandmarks(side) {
    return side === 'left' ? this.leftLandmarks : this.rightLandmarks
  }

  isDetected(side) {
    return side === 'left' ? this.leftDetected : this.rightDetected
  }

  getVideoElement() {
    return this.videoElement
  }

  get2DLandmarks(side) {
    return side === 'left' ? this.left2D : this.right2D
  }
}

// Global Singleton
export const handTrackerService = new HandTrackerService()

// Zustand Store for UI
export const useHandTrackerStore = create((set) => ({
  isCameraActive: false,
  status: 'idle', // 'idle' | 'initializing' | 'active' | 'tracking' | 'lost' | 'error'
  statusMessage: 'TRACKING STANDBY',
  handsDetected: 0,
  fps: 60,

  setCameraActive: (isCameraActive) => set({ isCameraActive }),
  setStatus: (status, statusMessage) => set({ status, statusMessage }),
  setHandsDetected: (handsDetected) => set({ handsDetected }),
  setFps: (fps) => set({ fps }),

  toggleCamera: async () => {
    const current = useHandTrackerStore.getState().isCameraActive
    if (current) {
      handTrackerService.stopCamera()
    } else {
      await handTrackerService.startCamera()
    }
  },
  startTracking: async () => {
    await handTrackerService.startCamera()
  },
  stopTracking: () => {
    handTrackerService.stopCamera()
  }
}))
