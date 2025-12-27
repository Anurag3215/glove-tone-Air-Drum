const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Will add IPC methods here later for C++ communication
  send: (channel, data) => {
    ipcRenderer.send(channel, data)
  },
  receive: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args))
  }
})
