import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dgram from 'node:dgram'
import os from 'node:os'

// Helper to get local Wi-Fi / LAN IPv4 addresses
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address })
      }
    }
  }
  return ips
}

// Normalize ADC value (automatically converts 12-bit 0..4095 to 10-bit 0..1023 if needed)
function normalizeAdc(val, is12Bit = false) {
  const num = Number(val)
  if (Number.isNaN(num)) return 750
  if (is12Bit || num > 1024) {
    return Math.max(0, Math.min(1023, Math.round(num / 4)))
  }
  return Math.max(0, Math.min(1023, Math.round(num)))
}

// Universal ESP32 Packet Parser (Binary SensorPacket, JSON, or CSV/Labeled Text)
function parseEsp32Packet(buffer, rinfo) {
  if (!buffer || buffer.length === 0) return null

  const firstByte = buffer[0]
  const looksLikeText =
    firstByte === 0x7b || // '{' JSON
    (firstByte >= 0x30 && firstByte <= 0x39) || // '0'-'9' CSV
    (firstByte >= 0x41 && firstByte <= 0x5a) || // 'A'-'Z' Labeled text
    (firstByte >= 0x61 && firstByte <= 0x7a)    // 'a'-'z' Labeled text

  // 1. Binary SensorPacket struct from Left_Hand_Dual_Core.ino / Right_Hand_Dual_Core.ino (55..64 bytes)
  if (!looksLikeText && buffer.length >= 55 && (firstByte === 1 || firstByte === 2)) {
    try {
      const espId = buffer.readUInt8(0)
      const timestamp = buffer.readUInt32LE(1)
      const qw = buffer.readFloatLE(5)
      const qx = buffer.readFloatLE(9)
      const qy = buffer.readFloatLE(13)
      const qz = buffer.readFloatLE(17)

      const rawThumb = buffer.readUInt16LE(45)
      const rawIndex = buffer.readUInt16LE(47)
      const rawMiddle = buffer.readUInt16LE(49)
      const rawRing = buffer.readUInt16LE(51)
      const rawPinky = buffer.readUInt16LE(53)
      const fsr = buffer.length >= 57 ? buffer.readUInt16LE(55) : 0

      const is12Bit =
        rawThumb > 1024 ||
        rawIndex > 1024 ||
        rawMiddle > 1024 ||
        rawRing > 1024 ||
        rawPinky > 1024

      return {
        hand: espId === 2 ? 'RIGHT' : 'LEFT',
        espId,
        timestamp,
        quaternion: {
          w: Number.isFinite(qw) ? qw : 1,
          x: Number.isFinite(qx) ? qx : 0,
          y: Number.isFinite(qy) ? qy : 0,
          z: Number.isFinite(qz) ? qz : 0
        },
        flex: {
          thumb: normalizeAdc(rawThumb, is12Bit),
          index: normalizeAdc(rawIndex, is12Bit),
          middle: normalizeAdc(rawMiddle, is12Bit),
          ring: normalizeAdc(rawRing, is12Bit),
          pinky: normalizeAdc(rawPinky, is12Bit)
        },
        rawFlex: {
          thumb: rawThumb,
          index: rawIndex,
          middle: rawMiddle,
          ring: rawRing,
          pinky: rawPinky
        },
        fsr,
        sourceIp: rinfo?.address || '127.0.0.1',
        format: 'binary'
      }
    } catch {
      // Fall through to text parsers if binary read fails
    }
  }

  // 2. Try parsing as UTF-8 text (JSON, Labeled text, or CSV)
  const text = buffer.toString('utf8').trim()
  if (!text) return null

  // 2a. JSON format
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text)
      const flexSrc = obj.flex || obj
      const rawThumb = flexSrc.thumb ?? flexSrc.flex_thumb ?? flexSrc.t ?? 750
      const rawIndex = flexSrc.index ?? flexSrc.flex_index ?? flexSrc.i ?? 750
      const rawMiddle = flexSrc.middle ?? flexSrc.flex_middle ?? flexSrc.m ?? 750
      const rawRing = flexSrc.ring ?? flexSrc.flex_ring ?? flexSrc.r ?? 750
      const rawPinky = flexSrc.pinky ?? flexSrc.little ?? flexSrc.flex_pinky ?? flexSrc.p ?? 750

      const is12Bit =
        rawThumb > 1024 ||
        rawIndex > 1024 ||
        rawMiddle > 1024 ||
        rawRing > 1024 ||
        rawPinky > 1024

      const hand =
        obj.hand?.toUpperCase() === 'RIGHT' || obj.esp_id === 2 || obj.espId === 2
          ? 'RIGHT'
          : 'LEFT'

      return {
        hand,
        espId: hand === 'RIGHT' ? 2 : 1,
        timestamp: obj.timestamp || Date.now(),
        quaternion: obj.quaternion || {
          w: obj.quat_w ?? 1,
          x: obj.quat_x ?? 0,
          y: obj.quat_y ?? 0,
          z: obj.quat_z ?? 0
        },
        flex: {
          thumb: normalizeAdc(rawThumb, is12Bit),
          index: normalizeAdc(rawIndex, is12Bit),
          middle: normalizeAdc(rawMiddle, is12Bit),
          ring: normalizeAdc(rawRing, is12Bit),
          pinky: normalizeAdc(rawPinky, is12Bit)
        },
        rawFlex: {
          thumb: rawThumb,
          index: rawIndex,
          middle: rawMiddle,
          ring: rawRing,
          pinky: rawPinky
        },
        sourceIp: rinfo?.address || '127.0.0.1',
        format: 'json'
      }
    } catch {
      return null
    }
  }

  // 2b. Labeled format (e.g., "Thumb: 700 | Index: 500 | Middle: 600 | Ring: 550 | Little: 480")
  if (text.includes(':')) {
    const extract = (regex, fallback = 750) => {
      const m = text.match(regex)
      return m ? parseInt(m[1], 10) : fallback
    }
    const rawThumb = extract(/thumb\s*:\s*(\d+)/i, 750)
    const rawIndex = extract(/index\s*:\s*(\d+)/i, 750)
    const rawMiddle = extract(/middle\s*:\s*(\d+)/i, 750)
    const rawRing = extract(/ring\s*:\s*(\d+)/i, 750)
    const rawPinky = extract(/(?:little|pinky)\s*:\s*(\d+)/i, 750)

    const is12Bit =
      rawThumb > 1024 ||
      rawIndex > 1024 ||
      rawMiddle > 1024 ||
      rawRing > 1024 ||
      rawPinky > 1024

    return {
      hand: 'LEFT',
      espId: 1,
      timestamp: Date.now(),
      quaternion: { w: 1, x: 0, y: 0, z: 0 },
      flex: {
        thumb: normalizeAdc(rawThumb, is12Bit),
        index: normalizeAdc(rawIndex, is12Bit),
        middle: normalizeAdc(rawMiddle, is12Bit),
        ring: normalizeAdc(rawRing, is12Bit),
        pinky: normalizeAdc(rawPinky, is12Bit)
      },
      rawFlex: {
        thumb: rawThumb,
        index: rawIndex,
        middle: rawMiddle,
        ring: rawRing,
        pinky: rawPinky
      },
      sourceIp: rinfo?.address || '127.0.0.1',
      format: 'labeled'
    }
  }

  // 2c. CSV format ("750,420,680,510,390")
  const parts = text.split(/[,\s]+/).map(Number).filter((n) => !Number.isNaN(n))
  if (parts.length >= 4) {
    const rawThumb = parts.length >= 5 ? parts[0] : 750
    const rawIndex = parts.length >= 5 ? parts[1] : parts[0]
    const rawMiddle = parts.length >= 5 ? parts[2] : parts[1]
    const rawRing = parts.length >= 5 ? parts[3] : parts[2]
    const rawPinky = parts.length >= 5 ? parts[4] : parts[3]

    const is12Bit = parts.some((v) => v > 1024)

    return {
      hand: 'LEFT',
      espId: 1,
      timestamp: Date.now(),
      quaternion: { w: 1, x: 0, y: 0, z: 0 },
      flex: {
        thumb: normalizeAdc(rawThumb, is12Bit),
        index: normalizeAdc(rawIndex, is12Bit),
        middle: normalizeAdc(rawMiddle, is12Bit),
        ring: normalizeAdc(rawRing, is12Bit),
        pinky: normalizeAdc(rawPinky, is12Bit)
      },
      rawFlex: {
        thumb: rawThumb,
        index: rawIndex,
        middle: rawMiddle,
        ring: rawRing,
        pinky: rawPinky
      },
      sourceIp: rinfo?.address || '127.0.0.1',
      format: 'csv'
    }
  }

  return null
}

// Vite Plugin: ESP32 Wi-Fi UDP & SSE Stream Bridge
function glovetoneWifiBridge() {
  let udpSocket = null
  let currentPort = 8888
  let isListening = false
  let packetCount = 0
  let packetsThisSecond = 0
  let packetRateHz = 0
  let lastPacketTime = 0
  let lastEspIp = null
  let lastPacketData = null
  const sseClients = new Set()

  const broadcastToClients = (eventType, payload) => {
    const dataStr = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const res of sseClients) {
      try {
        res.write(dataStr)
      } catch {
        sseClients.delete(res)
      }
    }
  }

  const startUdpServer = (port, viteServer) => {
    if (udpSocket) {
      try {
        udpSocket.close()
      } catch {}
      udpSocket = null
    }

    currentPort = port
    udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    udpSocket.on('error', (err) => {
      console.error(`[WiFi UDP] Socket error on port ${currentPort}:`, err.message)
      isListening = false
    })

    udpSocket.on('listening', () => {
      isListening = true
      const addr = udpSocket.address()
      console.log(`[WiFi UDP] Listening for ESP32 packets on UDP ${addr.address}:${addr.port}`)
      broadcastToClients('status', getStatusPayload())
    })

    udpSocket.on('message', (msg, rinfo) => {
      const parsed = parseEsp32Packet(msg, rinfo)
      if (!parsed) return

      packetCount++
      packetsThisSecond++
      lastPacketTime = Date.now()
      lastEspIp = rinfo.address
      lastPacketData = parsed

      // Broadcast via SSE
      broadcastToClients('packet', parsed)

      // Also broadcast via Vite HMR WebSocket if available
      if (viteServer?.ws) {
        viteServer.ws.send('glovetone:wifi-packet', parsed)
      }
    })

    try {
      udpSocket.bind(currentPort, '0.0.0.0')
    } catch (e) {
      console.error('[WiFi UDP] Bind failed:', e.message)
    }
  }

  const getStatusPayload = () => ({
    isListening,
    udpPort: currentPort,
    localIps: getLocalIpAddresses(),
    espIp: lastEspIp,
    packetCount,
    packetRateHz,
    lastPacketTime,
    isReceiving: lastPacketTime > 0 && Date.now() - lastPacketTime < 3000,
    lastPacketData
  })

  return {
    name: 'glovetone-wifi-bridge',
    configureServer(server) {
      startUdpServer(currentPort, server)

      // Calculate packet rate (Hz) every second
      const rateInterval = setInterval(() => {
        packetRateHz = packetsThisSecond
        packetsThisSecond = 0
        if (sseClients.size > 0) {
          broadcastToClients('status', getStatusPayload())
        }
      }, 1000)

      server.httpServer?.on('close', () => {
        clearInterval(rateInterval)
        if (udpSocket) {
          try {
            udpSocket.close()
          } catch {}
        }
      })

      // Middleware for /api/wifi-* endpoints
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()

        // 1. SSE Live Stream: GET /api/wifi-stream
        if (req.url.startsWith('/api/wifi-stream')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          })
          res.write(`event: status\ndata: ${JSON.stringify(getStatusPayload())}\n\n`)
          sseClients.add(res)
          req.on('close', () => {
            sseClients.delete(res)
          })
          return
        }

        // 2. Status Endpoint: GET /api/wifi-status
        if (req.url.startsWith('/api/wifi-status') && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(getStatusPayload()))
          return
        }

        // 3. Config / Test Endpoint: POST /api/wifi-config
        if (req.url.startsWith('/api/wifi-config') && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const cfg = JSON.parse(body || '{}')
              if (cfg.udpPort && Number(cfg.udpPort) !== currentPort) {
                startUdpServer(Number(cfg.udpPort), server)
              }
              if (cfg.sendTestPacket) {
                const testClient = dgram.createSocket('udp4')
                const testJson = JSON.stringify(
                  cfg.testPayload || {
                    hand: 'LEFT',
                    thumb: 400,
                    index: 380,
                    middle: 740,
                    ring: 720,
                    pinky: 700
                  }
                )
                testClient.send(testJson, currentPort, '127.0.0.1', () => {
                  testClient.close()
                })
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, status: getStatusPayload() }))
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: err.message }))
            }
          })
          return
        }

        // 4. Direct HTTP POST from ESP32: POST /api/sensor
        if (req.url.startsWith('/api/sensor') && req.method === 'POST') {
          const chunks = []
          req.on('data', (chunk) => chunks.push(chunk))
          req.on('end', () => {
            const buf = Buffer.concat(chunks)
            const parsed = parseEsp32Packet(buf, { address: req.socket?.remoteAddress })
            if (parsed) {
              packetCount++
              packetsThisSecond++
              lastPacketTime = Date.now()
              lastEspIp = req.socket?.remoteAddress || 'ESP32-HTTP'
              lastPacketData = parsed
              broadcastToClients('packet', parsed)
              if (server?.ws) {
                server.ws.send('glovetone:wifi-packet', parsed)
              }
            }
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            })
            res.end(JSON.stringify({ ok: true }))
          })
          return
        }

        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), glovetoneWifiBridge()],
  base: './',
  build: {
    outDir: 'dist'
  },
  server: {
    host: '0.0.0.0', // Listen on all network interfaces so ESP32 can reach Vite directly if needed
    port: 3000
  }
})
