// Exposes a tiny bridge to the Pengbit pages (js/roam.js in the app window, roam.html in the overlay).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pengbitDesktop', {
  isDesktop: true,
  toggleRoam: () => ipcRenderer.invoke('roam:toggle'),
  isRoaming: () => ipcRenderer.invoke('roam:is'),
  onRoamChanged: (cb) => ipcRenderer.on('roam:changed', (_e, on) => cb(on)),
  setInteractive: (on) => ipcRenderer.send('roam:interactive', !!on),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p.x, p.y)),
});
