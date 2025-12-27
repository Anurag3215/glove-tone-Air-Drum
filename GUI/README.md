# GloveTone Studio GUI


## Project Structure

```
GUI/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # IPC bridge
├── src/
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── HandsPanel.jsx
│   │   ├── Hand3D.jsx    # 3D hand visualization
│   │   ├── TracksPanel.jsx
│   │   ├── TrackLane.jsx
│   │   └── TransportBar.jsx
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx         # React entry point
│   └── index.css
├── index.html
├── vite.config.js
└── package.json
```

