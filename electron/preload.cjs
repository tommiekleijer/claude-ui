const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('claudeUi', {
  platform: process.platform,
  readClipboardFiles: async () => {
    const files = await ipcRenderer.invoke('read-paths', await ipcRenderer.invoke('clipboard-paths'));
    return files.length ? files : ipcRenderer.invoke('clipboard-image');
  },
  pickFolder: (title) => ipcRenderer.invoke('pick-folder', title),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  showInFolder: (filePath) => ipcRenderer.send('show-in-folder', filePath),
  notify: (title, body, tabId) => ipcRenderer.send('notify', { title, body, tabId }),
  onFocusTab: (callback) => ipcRenderer.on('focus-tab', (_event, tabId) => callback(tabId)),
  updates: {
    version: () => ipcRenderer.invoke('app-version'),
    state: () => ipcRenderer.invoke('update-state'),
    check: () => ipcRenderer.invoke('update-check'),
    install: () => ipcRenderer.invoke('update-install'),
    restart: () => ipcRenderer.invoke('update-restart'),
    onState: (callback) => ipcRenderer.on('update-state', (_event, state) => callback(state)),
  },
  readDroppedFiles: (files) => ipcRenderer.invoke('read-paths', files.map((file) => webUtils.getPathForFile(file))),
});
