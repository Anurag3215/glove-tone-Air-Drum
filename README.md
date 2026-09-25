# GloveTone Air Drum

A high-performance, real-time 3D spatial Air Drum instrument and cybernetic interface for ESP32-based musical gloves.

Built with **React**, **Three.js / React Three Fiber**, **Vite**, **Electron**, and the **Web Audio API**.

---

## Features

### 1. 3D Wireframe Mesh Matrix Air Drum Kit (Calibrate Module)
- **Spatial 3D Arc Layout**: 5 wireframe drum pads positioned in an acoustic arc over an animated perspective cyberspace grid:
  - **KICK** (Cyan `#00f3ff`): Left outer drum pad, deep 808 sub-bass dive and transient punch.
  - **TOM** (Golden Amber `#f59e0b`): Left inner drum pad, warm resonant pitch-sweep body.
  - **SNARE** (Emerald Green `#00ff9d`): Center drum pad, snappy body tone with high-pass filtered noise sizzle.
  - **HI-HAT** (Hot Pink `#ec4899`): Right inner cymbal pad, metallic 6-wave ring modulation with sharp choke.
  - **CRASH** (Violet Purple `#a855f7`): Right outer cymbal pad, wide bandpass noise explosion with shimmering decay.
- **Dynamic Visual Feedback**: Drums expand, spring-rebound, and flash white on each hit with floating 3D holographic badges.
- **Smooth Orbit Navigation**: Jitter-free camera rotation and depth inspection.

### 2. 1:1 Hardware Glove Finger Bend Triggering
- **Real-Time Sampling**: 40 Hz (25ms) polling of ESP32 flex sensor ADC channels.
- **Trigger Thresholds**:
  - `>= 50%` bend immediately triggers acoustic drum sound.
  - `< 30%` bend releases for rapid rolls and rhythmic patterns.
- **Finger Mapping**:
  - **Thumb** ➔ **Kick**
  - **Index Finger** ➔ **Tom**
  - **Middle Finger** ➔ **Snare**
  - **Ring Finger** ➔ **Hi-Hat**
  - **Little Finger (Pinky)** ➔ **Crash**
- **Interactive Telemetry**: Real-time 5-finger bend meters with percentage readouts and click-to-strike testing.

### 3. Pure Procedural Web Audio API Synthesis
- Zero external `.wav` or `.mp3` sample dependencies.
- Multi-layer real-time synthesis using Web Audio oscillators, noise buffers, and bandpass/highpass biquad filters.

### 4. 3D Holographic Hand Visualizer (Home Module)
- Real-time 3D hand orientation tracking using quaternion IMU data.
- Dual visual modes: **3D Mesh Matrix** and **Quantum Point Cloud**.
- Customizable cybernetic palettes (Nebula Cyan, Cyber Violet, Holographic Gold).

### 5. Minimal Settings & Calibration
- Clean 3-column instrument grid selector.
- Sleek sensitivity and threshold sliders with real-time numeric readouts.
- Air drum gesture mode selector (`AIM + FINGER TAP`, `DIRECT FINGERS (1:1)`, `KINETIC AIR STRIKE`).

---

## Project Structure

```
├── Esp32 Streamer/          # Arduino firmware for ESP32 gloves
│   ├── Left_Hand_Dual_Core/
│   ├── Right_Hand_Dual_Core/
│   └── capture_poses_serial/
│
└── GUI/                     # Modern Electron + React + Three.js App
    ├── electron/            # Electron main process & preload
    ├── public/model/        # 3D hand model assets
    └── src/
        ├── components/      # CalibrationScreen, HandsPanel, SettingsScreen, etc.
        ├── store/           # Zustand stores (sensorStore, settingsStore, transportStore)
        └── utils/           # Procedural audio engine (audio.js)
```

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm

### Installation & Run

1. Navigate to the GUI directory:
   ```bash
   cd GUI
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch in development mode (Vite dev server + Electron app):
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

---

## Hardware Connection (ESP32 Glove)

- Flash the firmware from `Esp32 Streamer/` to your ESP32 board.
- Connect via USB serial at **115200 baud** or Bluetooth serial.
- The interface automatically syncs flex sensor ADC values and IMU quaternions to the 3D viewport.
