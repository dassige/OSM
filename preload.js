
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Trigger a native Windows 11 desktop notification
    sendNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
    
    // Open external links (like FENZ Portal) in the system's default browser
    openExternal: (url) => ipcRenderer.send('open-external', url),
    
    // Get application version for the UI
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
});