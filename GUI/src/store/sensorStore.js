import { create } from 'zustand'
import * as THREE from 'three'

let mockInterval = null
let sseSource = null
let directWs = null

// Normalize 12-bit (0..4095) or 10-bit (0..1023) ADC values
function normalizeFlexValue(val, force12Bit = false) {
  const n = Number(val)
  if (Number.isNaN(n)) return 750
  if (force12Bit || n > 1024) {
    return Math.max(0, Math.min(1023, Math.round(n / 4)))
  }
  return Math.max(0, Math.min(1023, Math.round(n)))
}

const useSensorStore = create((set, get) => ({
  // Global connection state
  isConnected: true,

  // Data source mode: 'auto' (uses Wi-Fi when receiving, otherwise simulation), 'wifi' (hardware only), 'simulation' (mock only)
  dataSource: 'auto',

  // Wi-Fi Hardware Telemetry State
  wifiStatus: {
    isListening: false,
    isReceiving: false,
    udpPort: 8888,
    localIps: [],
    espIp: null,
    packetCount: 0,
    packetRateHz: 0,
    lastPacketTime: 0,
    lastFormat: null,
    directWsUrl: 'ws://192.168.4.1:81',
    directWsStatus: 'disconnected'
  },

  // Left hand data
  leftHand: {
    quaternion: { w: 1, x: 0, y: 0, z: 0 },
    flex: {
      thumb: 820,
      index: 750,
      middle: 710,
      ring: 680,
      pinky: 590
    },
    rawFlex: {
      thumb: 820,
      index: 750,
      middle: 710,
      ring: 680,
      pinky: 590
    },
    connected: true,
    sampleRate: 120
  },

  // Right hand data
  rightHand: {
    quaternion: { w: 1, x: 0, y: 0, z: 0 },
    flex: {
      thumb: 850,
      index: 800,
      middle: 790,
      ring: 720,
      pinky: 680
    },
    rawFlex: {
      thumb: 850,
      index: 800,
      middle: 790,
      ring: 720,
      pinky: 680
    },
    fsr: 0,
    connected: true,
    sampleRate: 120
  },

  // Switch data source ('auto' | 'wifi' | 'simulation')
  setDataSource: (mode) => {
    set({ dataSource: mode })
  },

  // Toggle master connection
  toggleConnection: (forceState) =>
    set((state) => {
      const nextState = forceState !== undefined ? forceState : !state.isConnected
      return {
        isConnected: nextState,
        leftHand: { ...state.leftHand, connected: nextState },
        rightHand: { ...state.rightHand, connected: nextState }
      }
    }),

  // Toggle individual hands
  toggleLeftHand: () =>
    set((state) => {
      const nextConnected = !state.leftHand.connected
      return {
        leftHand: { ...state.leftHand, connected: nextConnected },
        isConnected: nextConnected || state.rightHand.connected
      }
    }),

  toggleRightHand: () =>
    set((state) => {
      const nextConnected = !state.rightHand.connected
      return {
        rightHand: { ...state.rightHand, connected: nextConnected },
        isConnected: state.leftHand.connected || nextConnected
      }
    }),

  // Update left hand
  updateLeftHand: (data) =>
    set((state) => ({
      leftHand: { ...state.leftHand, ...data }
    })),

  // Update right hand
  updateRightHand: (data) =>
    set((state) => ({
      rightHand: { ...state.rightHand, ...data }
    })),

  // Process incoming ESP32 Wi-Fi packet
  handleWifiPacket: (packet) => {
    if (!packet || get().dataSource === 'simulation') return

    const now = Date.now()
    const targetHand = packet.hand === 'RIGHT' || packet.espId === 2 ? 'rightHand' : 'leftHand'

    set((state) => {
      const prevHand = state[targetHand]
      const nextQuat = packet.quaternion || prevHand.quaternion
      const nextFlex = packet.flex || prevHand.flex
      const nextRawFlex = packet.rawFlex || nextFlex

      return {
        isConnected: true,
        [targetHand]: {
          ...prevHand,
          connected: true,
          quaternion: nextQuat,
          flex: nextFlex,
          rawFlex: nextRawFlex,
          sampleRate: state.wifiStatus.packetRateHz || 200
        },
        wifiStatus: {
          ...state.wifiStatus,
          isReceiving: true,
          espIp: packet.sourceIp || state.wifiStatus.espIp || 'ESP32',
          packetCount: state.wifiStatus.packetCount + 1,
          lastPacketTime: now,
          lastFormat: packet.format || 'udp'
        }
      }
    })
  },

  // Initialize Wi-Fi SSE & WebSocket listeners
  initWifiConnection: () => {
    if (typeof window === 'undefined') return

    // Fetch initial status
    fetch('/api/wifi-status')
      .then((r) => r.json())
      .then((status) => {
        set((state) => ({
          wifiStatus: {
            ...state.wifiStatus,
            isListening: status.isListening ?? true,
            udpPort: status.udpPort || 8888,
            localIps: status.localIps || [],
            espIp: status.espIp || state.wifiStatus.espIp,
            packetCount: status.packetCount || state.wifiStatus.packetCount,
            packetRateHz: status.packetRateHz || 0,
            isReceiving: Boolean(status.isReceiving)
          }
        }))
      })
      .catch(() => {})

    // Subscribe to Server-Sent Events (/api/wifi-stream)
    if (!sseSource) {
      try {
        sseSource = new EventSource('/api/wifi-stream')

        sseSource.addEventListener('status', (e) => {
          try {
            const status = JSON.parse(e.data)
            set((state) => ({
              wifiStatus: {
                ...state.wifiStatus,
                isListening: status.isListening ?? true,
                udpPort: status.udpPort || state.wifiStatus.udpPort,
                localIps: status.localIps || state.wifiStatus.localIps,
                espIp: status.espIp || state.wifiStatus.espIp,
                packetCount: status.packetCount ?? state.wifiStatus.packetCount,
                packetRateHz: status.packetRateHz ?? 0,
                isReceiving:
                  Boolean(status.isReceiving) ||
                  state.wifiStatus.directWsStatus === 'connected'
              }
            }))
          } catch {}
        })

        sseSource.addEventListener('packet', (e) => {
          try {
            const packet = JSON.parse(e.data)
            get().handleWifiPacket(packet)
          } catch {}
        })

        sseSource.onerror = () => {
          // Will auto-reconnect via browser EventSource
        }
      } catch {}
    }

    // Also listen via Electron IPC if running inside Electron with main process UDP
    if (window.electron?.receive) {
      window.electron.receive('wifi-sensor-data', (packet) => {
        get().handleWifiPacket(packet)
      })
    }
  },

  // Configure UDP Port on Backend
  setUdpPort: async (port) => {
    const numPort = Number(port)
    if (!numPort || numPort < 1024 || numPort > 65535) return false
    try {
      const res = await fetch('/api/wifi-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ udpPort: numPort })
      })
      const data = await res.json()
      if (data.ok && data.status) {
        set((state) => ({
          wifiStatus: {
            ...state.wifiStatus,
            udpPort: data.status.udpPort,
            isListening: data.status.isListening
          }
        }))
        return true
      }
    } catch {}
    return false
  },

  // Send a loopback UDP test packet to verify Wi-Fi pipeline & drum triggers
  sendTestWifiPacket: async (customFlex) => {
    try {
      await fetch('/api/wifi-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendTestPacket: true,
          testPayload: customFlex || {
            hand: 'LEFT',
            thumb: 360,
            index: 370,
            middle: 360,
            ring: 720,
            pinky: 700
          }
        })
      })
    } catch {}
  },

  // Connect directly to an ESP32 WebSocket server (e.g., ws://192.168.4.1:81)
  connectDirectWebSocket: (url) => {
    const targetUrl = (url || get().wifiStatus.directWsUrl || '').trim()
    if (!targetUrl) return

    if (directWs) {
      try {
        directWs.close()
      } catch {}
      directWs = null
    }

    set((state) => ({
      wifiStatus: {
        ...state.wifiStatus,
        directWsUrl: targetUrl,
        directWsStatus: 'connecting'
      }
    }))

    try {
      directWs = new WebSocket(targetUrl)

      directWs.onopen = () => {
        set((state) => ({
          dataSource: state.dataSource === 'simulation' ? 'auto' : state.dataSource,
          wifiStatus: {
            ...state.wifiStatus,
            directWsStatus: 'connected',
            isReceiving: true,
            espIp: targetUrl
          }
        }))
      }

      directWs.onmessage = (event) => {
        try {
          const text = String(event.data).trim()
          if (text.startsWith('{')) {
            const obj = JSON.parse(text)
            const flexSrc = obj.flex || obj
            const rawThumb = flexSrc.thumb ?? flexSrc.flex_thumb ?? 750
            const rawIndex = flexSrc.index ?? flexSrc.flex_index ?? 750
            const rawMiddle = flexSrc.middle ?? flexSrc.flex_middle ?? 750
            const rawRing = flexSrc.ring ?? flexSrc.flex_ring ?? 750
            const rawPinky = flexSrc.pinky ?? flexSrc.little ?? flexSrc.flex_pinky ?? 750
            const is12Bit =
              rawThumb > 1024 ||
              rawIndex > 1024 ||
              rawMiddle > 1024 ||
              rawRing > 1024 ||
              rawPinky > 1024

            get().handleWifiPacket({
              hand: obj.hand || (obj.esp_id === 2 ? 'RIGHT' : 'LEFT'),
              espId: obj.esp_id || 1,
              quaternion: obj.quaternion || {
                w: obj.quat_w ?? 1,
                x: obj.quat_x ?? 0,
                y: obj.quat_y ?? 0,
                z: obj.quat_z ?? 0
              },
              flex: {
                thumb: normalizeFlexValue(rawThumb, is12Bit),
                index: normalizeFlexValue(rawIndex, is12Bit),
                middle: normalizeFlexValue(rawMiddle, is12Bit),
                ring: normalizeFlexValue(rawRing, is12Bit),
                pinky: normalizeFlexValue(rawPinky, is12Bit)
              },
              rawFlex: {
                thumb: rawThumb,
                index: rawIndex,
                middle: rawMiddle,
                ring: rawRing,
                pinky: rawPinky
              },
              sourceIp: targetUrl,
              format: 'websocket'
            })
          } else {
            // CSV or labeled text over WebSocket
            const nums = text
              .split(/[,\s|]+/)
              .map(Number)
              .filter((n) => !Number.isNaN(n))
            if (nums.length >= 4) {
              const rawThumb = nums.length >= 5 ? nums[0] : 750
              const rawIndex = nums.length >= 5 ? nums[1] : nums[0]
              const rawMiddle = nums.length >= 5 ? nums[2] : nums[1]
              const rawRing = nums.length >= 5 ? nums[3] : nums[2]
              const rawPinky = nums.length >= 5 ? nums[4] : nums[3]
              const is12Bit = nums.some((v) => v > 1024)

              get().handleWifiPacket({
                hand: 'LEFT',
                espId: 1,
                quaternion: { w: 1, x: 0, y: 0, z: 0 },
                flex: {
                  thumb: normalizeFlexValue(rawThumb, is12Bit),
                  index: normalizeFlexValue(rawIndex, is12Bit),
                  middle: normalizeFlexValue(rawMiddle, is12Bit),
                  ring: normalizeFlexValue(rawRing, is12Bit),
                  pinky: normalizeFlexValue(rawPinky, is12Bit)
                },
                sourceIp: targetUrl,
                format: 'websocket'
              })
            }
          }
        } catch {}
      }

      directWs.onerror = () => {
        set((state) => ({
          wifiStatus: {
            ...state.wifiStatus,
            directWsStatus: 'error'
          }
        }))
      }

      directWs.onclose = () => {
        set((state) => ({
          wifiStatus: {
            ...state.wifiStatus,
            directWsStatus:
              state.wifiStatus.directWsStatus === 'error' ? 'error' : 'disconnected'
          }
        }))
      }
    } catch {
      set((state) => ({
        wifiStatus: {
          ...state.wifiStatus,
          directWsStatus: 'error'
        }
      }))
    }
  },

  disconnectDirectWebSocket: () => {
    if (directWs) {
      try {
        directWs.close()
      } catch {}
      directWs = null
    }
    set((state) => ({
      wifiStatus: {
        ...state.wifiStatus,
        directWsStatus: 'disconnected'
      }
    }))
  },

  // Start mock sensor simulation (automatically yields to real Wi-Fi hardware packets)
  startMockData: () => {
    // Also initialize the Wi-Fi connection listener
    get().initWifiConnection()

    if (mockInterval) clearInterval(mockInterval)

    let time = 0
    mockInterval = setInterval(() => {
      const state = get()
      if (!state.isConnected) return

      // If in 'wifi' only mode, never generate fake simulation data
      if (state.dataSource === 'wifi') return

      // If in 'auto' mode and real Wi-Fi packets arrived within the last 3 seconds, yield to real hardware!
      const isActivelyReceivingWifi =
        state.wifiStatus.isReceiving &&
        Date.now() - state.wifiStatus.lastPacketTime < 3000
      if (
        state.dataSource === 'auto' &&
        (isActivelyReceivingWifi || state.wifiStatus.directWsStatus === 'connected')
      ) {
        return
      }

      time += 0.016 // Smooth 60Hz simulation

      const rotX = Math.sin(time * 1.5) * 0.5
      const rotY = Math.cos(time * 1.2) * 0.5
      const rotZ = Math.sin(time * 0.8) * 0.3

      const euler = new THREE.Euler(rotX, rotY, rotZ, 'XYZ')
      const quat = new THREE.Quaternion().setFromEuler(euler)

      const leftFlex = {
        thumb: Math.round(350 + Math.sin(time * 2.1) * 150),
        index: Math.round(350 + Math.sin(time * 1.8) * 200),
        middle: Math.round(350 + Math.cos(time * 2.3) * 180),
        ring: Math.round(550 + Math.sin(time * 1.5) * 250),
        pinky: Math.round(650 + Math.cos(time * 1.9) * 150)
      }

      const rightEuler = new THREE.Euler(-rotX * 0.8, rotY * 1.1, -rotZ * 0.9, 'XYZ')
      const rightQuat = new THREE.Quaternion().setFromEuler(rightEuler)

      const rightFlex = {
        thumb: Math.round(760 + Math.cos(time * 1.7) * 100),
        index: Math.round(550 + Math.sin(time * 2.2) * 180),
        middle: Math.round(650 + Math.cos(time * 1.6) * 150),
        ring: Math.round(560 + Math.sin(time * 2.0) * 160),
        pinky: Math.round(560 + Math.cos(time * 1.4) * 140)
      }

      const fsr = Math.sin(time * 0.5) > 0.7 ? 850 : 100

      set({
        leftHand: {
          quaternion: { w: quat.w, x: quat.x, y: quat.y, z: quat.z },
          flex: leftFlex,
          rawFlex: leftFlex,
          connected: true,
          sampleRate: 120
        },
        rightHand: {
          quaternion: { w: rightQuat.w, x: rightQuat.x, y: rightQuat.y, z: rightQuat.z },
          flex: rightFlex,
          rawFlex: rightFlex,
          fsr,
          connected: true,
          sampleRate: 120
        }
      })
    }, 16)

    return () => clearInterval(mockInterval)
  }
}))

export default useSensorStore
