const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("smorxDesktop", {
  getMachine: () => ipcRenderer.sendSync("smorx:machine"),
  getApiUrl: () => ipcRenderer.sendSync("smorx:apiUrl"),
  isActivated: () => ipcRenderer.sendSync("smorx:isActivated"),
  setActivated: (payload) => ipcRenderer.sendSync("smorx:setActivated", payload),
  isDesktop: () => true,
});
