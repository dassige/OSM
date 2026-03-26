const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 700,
    title: "FENZ OSM Configurator",
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

// IPC Handlers for reading/writing the config
ipcMain.handle('get-settings', () => {
  if (fs.existsSync(SETTINGS_FILE)) {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  }
  return {};
});

ipcMain.handle('save-settings', (event, data) => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
  return true;
});

app.whenReady().then(createWindow);