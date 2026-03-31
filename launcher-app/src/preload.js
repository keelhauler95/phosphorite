const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phosphoriteLauncher', {
  getState: () => ipcRenderer.invoke('launcher:get-state'),
  saveConfig: config => ipcRenderer.invoke('launcher:save-config', config),
  start: () => ipcRenderer.invoke('launcher:start'),
  stop: () => ipcRenderer.invoke('launcher:stop'),
  startService: service => ipcRenderer.invoke('launcher:start-service', service),
  stopService: service => ipcRenderer.invoke('launcher:stop-service', service),
  open: target => ipcRenderer.invoke('launcher:open', target)
});