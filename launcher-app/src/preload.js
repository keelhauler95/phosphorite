const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phosphoriteLauncher', {
  getState: () => ipcRenderer.invoke('launcher:get-state'),
  saveConfig: config => ipcRenderer.invoke('launcher:save-config', config),
  start: () => ipcRenderer.invoke('launcher:start'),
  stop: () => ipcRenderer.invoke('launcher:stop'),
  open: target => ipcRenderer.invoke('launcher:open', target)
});