# GloveHost Installation Guide

**Complete setup instructions for building and running GloveHost on Windows.**

---

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Install Prerequisites](#install-prerequisites)
3. [Build TensorFlow Lite](#build-tensorflow-lite)
4. [Build GloveHost](#build-glovehost)
5. [Configuration](#configuration)
6. [Running GloveHost](#running-glovehost)
7. [Troubleshooting](#troubleshooting)

---

## 💻 System Requirements

### Hardware
- **CPU**: x64 processor (Intel/AMD)
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 15GB free space (for build dependencies)
- **Network**: WiFi adapter (for ESP32 communication)

### Software
- **OS**: Windows 10/11 (64-bit)
- **Visual Studio**: 2022 Build Tools or Community Edition
- **CMake**: 4.2 or later
- **Git**: Latest version
- **Python**: 3.8+ (for TensorFlow Lite build)

---

## 🔧 Install Prerequisites

### 1. Visual Studio 2022

**Download**: https://visualstudio.microsoft.com/downloads/

**Required Workload:**
- Desktop development with C++

**Required Components:**
- MSVC v143 - VS 2022 C++ x64/x86 build tools
- Windows 10 SDK (10.0.22621.0 or later)
- C++ CMake tools for Windows

**Installation:**
```cmd
# If using Build Tools installer
vs_buildtools.exe --add Microsoft.VisualStudio.Workload.VCTools
```

### 2. CMake

**Download**: https://cmake.org/download/

**Install to**: `C:\Program Files\CMake`

**Verify:**
```cmd
cmake --version
# Should show: cmake version 4.2.x or later
```

### 3. Git

**Download**: https://git-scm.com/download/win

**Verify:**
```cmd
git --version
```

### 4. Chocolatey (Package Manager)

**Install** (run in PowerShell as Admin):
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### 5. Bazelisk (for TensorFlow Lite)

```powershell
choco install bazelisk -y
```

### 6. MSYS2 (provides bash for Bazel)

```powershell
choco install msys2 -y
refreshenv
```

### 7. JUCE Framework

**Download**: https://juce.com/get-juce/

**Install to**: `C:\JUCE`

**Verify structure:**
```
C:\JUCE\
  ├── modules\
  ├── extras\
  └── examples\
```

---

## 🤖 Build TensorFlow Lite

### Why Build from Source?

GloveHost uses TensorFlow Lite for AI-powered strum/bow detection. Pre-built binaries aren't available for Windows, so we build from source using Bazel.

### Step 1: Clean Previous Builds (if any)

```powershell
Remove-Item -Recurse -Force "C:\Users\$env:USERNAME\tensorflow" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "C:\TensorFlowLite" -ErrorAction SilentlyContinue
```

### Step 2: Clone TensorFlow

```powershell
cd C:\Users\$env:USERNAME
git clone --depth 1 --branch v2.13.0 https://github.com/tensorflow/tensorflow.git
cd tensorflow
```

### Step 3: Build with Bazel

**Open PowerShell (Admin)** and run:

```powershell
cd C:\Users\$env:USERNAME\tensorflow
bazel build -c opt --config=monolithic //tensorflow/lite:tensorflowlite
```

**Expected time**: 30-60 minutes (first build)

**Expected output:**
```
Target //tensorflow/lite:tensorflowlite up-to-date:
  bazel-bin/tensorflow/lite/tensorflowlite.dll
INFO: Build completed successfully
```

### Step 4: Install to C:\TensorFlowLite

```powershell
# Create directories
New-Item -ItemType Directory -Force -Path "C:\TensorFlowLite\lib"
New-Item -ItemType Directory -Force -Path "C:\TensorFlowLite\include"

# Copy DLL and LIB
Copy-Item "bazel-bin\tensorflow\lite\tensorflowlite.dll" "C:\TensorFlowLite\lib\" -Force
Copy-Item "bazel-bin\tensorflow\lite\tensorflowlite.dll.if.lib" "C:\TensorFlowLite\lib\tensorflowlite.lib" -Force

# Copy headers
xcopy /E /I /Y "tensorflow\lite" "C:\TensorFlowLite\include\tensorflow\lite"
xcopy /E /I /Y "bazel-tensorflow\external\flatbuffers\include\*" "C:\TensorFlowLite\include\"
```

### Step 5: Verify Installation

```powershell
Test-Path "C:\TensorFlowLite\lib\tensorflowlite.dll"  # Should return True
Test-Path "C:\TensorFlowLite\lib\tensorflowlite.lib"  # Should return True
Test-Path "C:\TensorFlowLite\include\tensorflow\lite\interpreter.h"  # Should return True
```

---

## 🏗️ Build GloveHost

### Step 1: Clone Repository

```cmd
cd D:\
git clone <repository-url> GloveTone
cd GloveTone\C++
```

### Step 2: Verify Dependencies

```cmd
# Check JUCE
dir C:\JUCE\modules

# Check TensorFlow Lite
dir C:\TensorFlowLite\lib

# Check CMake
cmake --version
```

### Step 3: Configure CMake

```cmd
cmake -B build
```

**Expected output:**
```
-- TensorFlow Lite found at C:/TensorFlowLite
-- GloveHost configuration complete
--   JUCE Directory: C:/JUCE
--   TensorFlow Lite: TRUE
-- Configuring done
-- Generating done
```

### Step 4: Build

```cmd
cmake --build build --config Release
```

**Expected time**: 5-10 minutes (first build)

**Expected output:**
```
GloveHost.vcxproj -> D:\GloveTone\C++\build\Release\GloveHost.exe
Build succeeded.
```

### Step 5: Copy TensorFlow Lite DLL

```cmd
copy C:\TensorFlowLite\lib\tensorflowlite.dll build\Release\
```

---

## ⚙️ Configuration

### Create config.json

**File**: `D:\GloveTone\C++\build\Release\config.json`

**Minimal Example:**
```json
{
  "audio": {
    "sample_rate": 44100,
    "buffer_size": 128,
    "asio_device": ""
  },
  "tracks": [
    {
      "id": 1,
      "name": "Drum Flex",
      "type": "samples",
      "open_gui": false
    },
    {
      "id": 2,
      "name": "Drum Zones",
      "type": "samples",
      "open_gui": false
    },
    {
      "id": 3,
      "name": "Keys",
      "type": "vst",
      "vst_path": "C:/path/to/your/synth.dll",
      "preset_path": "",
      "open_gui": true
    }
  ],
  "drum_samples": {
    "31": "D:/drumm soundss/Kick 808 3.wav",
    "30": "D:/drumm soundss/Snare 909X 2.wav",
    "28": "D:/drumm soundss/MidTom GarageX V15.wav",
    "24": "D:/drumm soundss/Clap 808X.wav",
    "16": "D:/drumm soundss/Shaker Alphabetical 1.wav",
    "0": "D:/drumm soundss/Crash 909X.wav"
  }
}
```

### VST Configuration

**VST2 (.dll):**
```json
{
  "id": 3,
  "type": "vst",
  "vst_path": "C:/Program Files/VSTPlugins/Sylenth1.dll"
}
```

**VST3 (.vst3):**
```json
{
  "id": 6,
  "type": "vst",
  "vst_path": "C:/Program Files/Common Files/VST3/StrumGS2.vst3"
}
```

**Important**: VST must be **64-bit** (same as GloveHost)

---

## 🚀 Running GloveHost

### Method 1: Command Line

```cmd
cd D:\GloveTone\C++\build\Release
GloveHost.exe
```

### Method 2: Double-Click

Navigate to `D:\GloveTone\C++\build\Release\` and double-click `GloveHost.exe`

### Expected Startup Output

```
======================================================================
🎵 DUAL HAND ESP32 MUSICAL GLOVE SYSTEM - WiFi UDP Version
======================================================================
✅ Loop Manager: Gesture engine initialized
✅ Drum Controller (Flex): Initialized
✅ Drum Controller (Zones): Initialized
✅ Keys Controller: Ready
✅ Chords Controller: Ready
🎻 Violin Controller: Initializing...
✅ Peak AI model loaded
✅ Full AI model loaded
✅ Violin Controller: Ready
🎸 Guitar Controller: Initializing...
✅ Guitar AI models loaded - AI correction ENABLED
✅ Guitar Controller: Ready
✅ Instrument Manager: All controllers initialized
✅ JUCE Audio Engine: Created

=== JUCE Audio Engine: Initializing ===
📄 Loading configuration from: config.json
✅ Configuration loaded
🎵 Setting up tracks...
✅ Loaded VST: Sylenth1 (Track 3)
✅ All tracks set up
🔊 Starting audio device...
✅ ASIO Device: FL Studio ASIO
✅ Audio device started
=== JUCE Audio Engine: READY ===

🔌 Starting UDP receiver...
✅ UDP Receiver: Listening on 0.0.0.0:8888
⏳ Waiting for both gloves to connect...
```

---

## 🔧 Troubleshooting

### Build Errors

#### "JUCE not found"
```
Solution: Verify JUCE is installed at C:\JUCE
Check: dir C:\JUCE\modules
```

#### "TensorFlow Lite not found"
```
Solution: Verify TensorFlow Lite installation
Check: dir C:\TensorFlowLite\lib
```

#### "LNK2005: multiply defined symbols"
```
Solution: Clean rebuild
Commands:
  rmdir /s /q build
  cmake -B build
  cmake --build build --config Release
```

### Runtime Errors

#### "tensorflowlite.dll not found"
```
Solution: Copy DLL to executable folder
Command: copy C:\TensorFlowLite\lib\tensorflowlite.dll build\Release\
```

#### "VST failed to load"
```
Causes:
1. VST is 32-bit (GloveHost is 64-bit only)
2. VST path is incorrect
3. VST2 support not enabled

Solution: Check VST architecture with PowerShell:
  $path = "C:\path\to\plugin.dll"
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
  $machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
  if ($machine -eq 0x8664) { "64-bit" } else { "32-bit" }
```

#### "UDP timeout"
```
Causes:
1. ESP32 gloves not powered
2. WiFi network mismatch
3. Firewall blocking port 8888

Solution:
1. Check ESP32 power and WiFi connection
2. Verify PC and ESP32s on same network
3. Allow UDP port 8888 in Windows Firewall
```

### AI Model Errors

#### "Model not found"
```
Solution: Verify model files exist
Check: dir D:\GloveTone\C++\Assets\Models\Guitar\*.tflite
       dir D:\GloveTone\C++\Assets\Models\Violin\*.tflite
```

#### "Quantization error"
```
Cause: Models must be 8-bit quantized
Solution: Re-export models with 8-bit quantization
```

---

## 📝 Post-Installation

### Verify AI Models

```cmd
cd D:\GloveTone
python check_models.py
```

**Expected output:**
```
[MODEL] C++/Assets/Models/Guitar/peak_model.tflite
  [OK] Uses 8-bit quantization (COMPATIBLE)

[MODEL] C++/Assets/Models/Guitar/full_model.tflite
  [OK] Uses 8-bit quantization (COMPATIBLE)
```

### Test Audio Output

1. Run GloveHost
2. Check console for "Audio device started"
3. Verify VST GUIs open (if configured)

### Connect ESP32 Gloves

1. Power on both gloves
2. Ensure WiFi connection to 'GloveTone2025'
3. Wait for "Both hands detected and streaming!"

---

## 🎯 Next Steps

- Read [README.md](README.md) for usage instructions
- Configure VST paths in `config.json`
- Calibrate gloves with 'C' key
- Start playing!

---

## 💡 Tips

- **Low Latency**: Use ASIO driver with 64-128 sample buffer
- **VST Performance**: Close unused VST GUIs to save CPU
- **Model Accuracy**: Calibrate regularly for best AI performance
- **Network Stability**: Use 5GHz WiFi for lower latency

---

## 📞 Support

For issues:
1. Check console output (detailed logging with emoji indicators)
2. Review this guide's troubleshooting section
3. Verify all prerequisites are installed correctly
4. Check that all paths in `config.json` are correct

---

**Installation complete! You're ready to rock! 🎸🎻🥁**
