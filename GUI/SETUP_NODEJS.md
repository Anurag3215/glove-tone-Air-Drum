# Node.js Setup Guide

## Issue
`npm` is not recognized - Node.js is not in your PATH.

## Solution Options

### Option 1: Use the Helper Batch File (Easiest)

I created `npm-run.bat` for you. Use it like this:

```bash
cd d:\GloveTone\GUI

# Install dependencies
npm-run.bat install

# Start development server
npm-run.bat run dev
```

### Option 2: Add Node.js to PATH (Permanent Fix)

1. Find where Node.js is installed (usually one of these):
   - `C:\Program Files\nodejs`
   - `C:\Program Files (x86)\nodejs`
   - `%LOCALAPPDATA%\Programs\nodejs`

2. Add to PATH:
   - Press `Win + X` → System
   - Click "Advanced system settings"
   - Click "Environment Variables"
   - Under "System variables", find "Path"
   - Click "Edit"
   - Click "New"
   - Add the Node.js path (e.g., `C:\Program Files\nodejs`)
   - Click "OK" on all dialogs
   - **Restart PowerShell/Terminal**

3. Test:
   ```bash
   npm --version
   ```

### Option 3: Install/Reinstall Node.js

If Node.js isn't installed:

1. Download from: https://nodejs.org/
2. Choose "LTS" version
3. Run installer
4. **Check "Add to PATH"** during installation
5. Restart terminal

### Option 4: Run npm Directly (One-time)

Find npm's location and run directly:

```powershell
# Try these paths:
& "C:\Program Files\nodejs\npm.cmd" install
# OR
& "C:\Program Files (x86)\nodejs\npm.cmd" install
# OR
& "$env:LOCALAPD ATA\Programs\nodejs\npm.cmd" install
```

---

## Quick Start (Using Helper)

```bash
cd d:\GloveTone\GUI
npm-run.bat install
npm-run.bat run dev
```

This will:
1. Install all dependencies
2. Start Vite dev server (port 3000)
3. Launch Electron window with the app

You should see animated 3D hands rotating and fingers changing color!
