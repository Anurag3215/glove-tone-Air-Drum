# GloveHost - Musical Glove Control System

**A real-time MIDI controller system for ESP32-based musical gloves with AI-powered gesture recognition.**

---

## 🎵 Overview

GloveHost is a C++ application that receives sensor data from ESP32 gloves via WiFi UDP and translates hand gestures into musical performances. It features AI-powered strum/bow detection, multi-instrument support, loop recording, and professional VST hosting through JUCE.

### Key Features

- **🎸 Guitar Mode**: AI-enhanced strum detection with GS-2 chord system
- **🎻 Violin Mode**: AI bow detection with polyphonic pitch control
- **🥁 Drums**: Flex-based and zone-based triggering
- **🎹 Keys/Chords**: Orientation-based pitch control with chord detection
- **🔄 Loop Recording**: FL Studio-style loop recording and playback
- **🎛️ VST Hosting**: Load VST2/VST3 plugins for professional sound
- **⏸️ Pause Control**: Gesture-based pause/resume

---

## 🏗️ Architecture

### Core Components

- **UDP Receiver**: Thread-safe packet reception from ESP32 gloves (port 8888)
- **Instrument Controllers**: Guitar, Violin, Drums, Keys, Chords
- **JUCE Audio Engine**: VST hosting, sample playback, loop recording
- **AI Models**: TensorFlow Lite for strum/bow detection (8-bit quantized)
- **Loop Manager**: Gesture-based loop control (Wakanda gesture, L-pose)

### Technology Stack

- **Framework**: JUCE 7.x
- **AI**: TensorFlow Lite 2.13 (Bazel build)
- **Networking**: UDP sockets (Windows/POSIX)
- **Audio**: JUCE AudioPluginHost, VST2/VST3
- **Build**: CMake 3.15+, Visual Studio 2022

---

## 📋 Prerequisites

### Required Software

1. **Visual Studio 2022** (Build Tools or Community)
   - C++ Desktop Development workload
   - Windows 10 SDK

2. **CMake 4.2+**
   - Download: https://cmake.org/download/

3. **JUCE Framework 7.x**
   - Install to: `C:\JUCE`
   - Download: https://juce.com/get-juce/

4. **TensorFlow Lite** (for AI models)
   - See [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) for build instructions

5. **Git** (for cloning dependencies)

### Optional

- **ASIO Driver** (for low-latency audio)
- **VST Plugins** (Sylenth1, Analog Lab, SWAM, Strum GS-2, etc.)

---

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd GloveTone/C++
```

### 2. Install Dependencies

Follow the detailed [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) to:
- Build TensorFlow Lite
- Set up JUCE
- Configure VST paths

### 3. Build GloveHost

```cmd
# Configure
cmake -B build

# Build
cmake --build build --config Release
```

### 4. Configure Audio

Edit `build/Release/config.json`:
- Set VST paths
- Configure drum samples
- Set ASIO device (optional)

### 5. Run

```cmd
# Copy TensorFlow Lite DLL
copy C:\TensorFlowLite\lib\tensorflowlite.dll build\Release\

# Run GloveHost
build\Release\GloveHost.exe
```

---

## ⚙️ Configuration

### config.json Structure

```json
{
  "audio": {
    "sample_rate": 44100,
    "buffer_size": 128,
    "asio_device": ""
  },
  "tracks": [
    {
      "id": 3,
      "name": "Keys",
      "type": "vst",
      "vst_path": "./Sylenth1.dll",
      "preset_path": "path/to/preset.fst",
      "open_gui": true
    }
  ],
  "drum_samples": {
    "31": "path/to/kick.wav",
    "30": "path/to/snare.wav"
  }
}
```

### Track Types

- **`vst`**: Load VST2/VST3 plugin
- **`samples`**: Drum sample player
- **`mp3`**: MP3/audio file playback

---

## 🎮 Usage

### Instrument Switching

- **FSR Press (>1500)**: Cycle through instruments
- **Wakanda Gesture**: Switch instruments (via Loop Manager)

### Calibration

- Press **'C'** key to calibrate orientation baselines
- Requires 50 samples from both hands

### Loop Recording

- **Right L-Pose**: Arm loop start/end
- **Left L-Pose + Flick**: Toggle pause

### Pause Control

- **L-Pose + Flick Gesture**: Pause/resume all audio

---

## 🎸 Instruments

### Guitar Controller

**Left Hand (Pitch):**
- Orientation → Zone (Natural/Flats)
- Flex sensors → Finger combinations
- GS-2 chord system (Major, Minor, 7th, m7)

**Right Hand (Strum):**
- FSR activation (>500)
- Gyro-Z motion detection
- AI correction (Peak model: 80ms, Full model: 120ms)

**AI Models:**
- `Guitar/peak_model.tflite` (8-bit quantized)
- `Guitar/full_model.tflite` (8-bit quantized)

### Violin Controller

**Left Hand:** Polyphonic pitch control (multiple fingers = multiple notes)

**Right Hand:** Bow control with AI detection
- FSR pressure sensitivity
- Motion-based bow detection
- AI correction for bow strokes

**AI Models:**
- `Violin/peak_centered_model.tflite`
- `Violin/full_model.tflite`

### Drum Controllers

**DrumFlex:** Individual finger flex → drum sounds

**DrumZones:** Orientation zones → drum mapping

### Keys/Chords

**Keys:** Single note per finger, octave shifting

**Chords:** Chord detection from finger combinations

---

## 🔧 Troubleshooting

### VST Won't Load

1. **Check VST format**: Ensure VST used is `.vst3`
2. **Verify path**: Use absolute paths or relative to executable
3. **Check architecture**: VST must be 64-bit (same as GloveHost)
4. **Enable VST2**: Ensure `JUCE_PLUGINHOST_VST=1` in CMakeLists.txt

### TensorFlow Lite Errors

1. **Missing DLL**: Copy `tensorflowlite.dll` to executable folder
2. **Model not found**: Check paths in `C++/Assets/Models/`
3. **Quantization issues**: Models must be 8-bit quantized

### UDP Connection Issues

1. **Check WiFi**: Ensure PC and ESP32s on same network
2. **Firewall**: Allow UDP port 8888
3. **IP Address**: Verify PC IP is 192.168.137.1
4. **ESP32 Power**: Ensure gloves are powered and streaming

### Audio Issues

1. **No sound**: Check ASIO device in config.json
2. **High latency**: Reduce buffer size (64-128 samples)
3. **Crackling**: Increase buffer size or use ASIO

---

## 📁 Project Structure

```
C++/
├── Source/
│   ├── main.cpp                    # Main controller
│   ├── Audio/
│   │   ├── JuceAudioEngine.cpp     # JUCE audio engine
│   │   ├── AudioTrack.h            # Track management
│   │   ├── MidiRouter.h            # MIDI routing
│   │   ├── LoopRecorder.h          # Loop recording
│   │   └── SamplePlayer.h          # Drum samples
│   ├── Instruments/
│   │   ├── Guitar/                 # Guitar controller + AI
│   │   ├── Violin/                 # Violin controller + AI
│   │   ├── Drums/                  # Drum controllers
│   │   └── Keys/                   # Keys/Chords controllers
│   ├── Looping/
│   │   └── loop.cpp                # Gesture-based loop control
│   └── core/
│       ├── main_controller.h       # System orchestration
│       └── SensorSample.h          # Sensor data structures
├── Assets/
│   ├── Models/                     # TensorFlow Lite models
│   ├── Presets/                    # VST presets
│   └── Vsts/                       # VST plugins
├── CMakeLists.txt                  # Build configuration
├── README.md                       # This file
└── INSTALLATION_GUIDE.md           # Detailed setup guide
```

---

## 🤝 Contributing

This is a personal project for musical glove control. For questions or issues, please open an issue on the repository.

---

## 📄 License



---

## 🙏 Acknowledgments

- **JUCE Framework**: Audio plugin hosting
- **TensorFlow Lite**: AI model inference
- **nlohmann/json**: JSON parsing
- **ESP32**: Wireless sensor platform

---

## 📞 Support

For detailed installation instructions, see [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md).

For troubleshooting, check the console output - GloveHost provides detailed logging with emoji indicators:
- ✅ Success
- ⚠️ Warning
- ❌ Error
- 🎵 Audio events
- 🎸 Guitar events
- 🎻 Violin events
- 🥁 Drum events


