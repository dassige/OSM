// electron-main.js
const { app, BrowserWindow, nativeTheme, ipcMain, Notification, shell } = require('electron');
const path = require('path');

// --- 1. Compatibility Shim for undici/cheerio (Node 20.9 support) ---
const { File, Blob } = require('node:buffer');
if (typeof global.File === 'undefined') global.File = File;
if (typeof global.Blob === 'undefined') global.Blob = Blob;

// --- 2. Load Config & Bootstrap Express Server ---
const config = require('./config');
require('./server.js'); 

let mainWindow;

// --- 3. Handle Native Windows 11 Features (IPC) ---

// Handle Native Desktop Notifications
ipcMain.on('show-notification', (event, { title, body }) => {
    new Notification({ 
        title, 
        body,
        icon: path.join(__dirname, 'public/resources/favicon.ico') 
    }).show();
});

// Handle External Links (Open in System Default Browser)
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

// Provide Application Version to Frontend
ipcMain.handle('get-app-version', () => app.getVersion());

// --- 4. Window Management ---

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        title: config.ui.loginTitle || "FENZ OSM Manager",
        icon: path.join(__dirname, 'public/resources/favicon.ico'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Sync theme with app preferences
    nativeTheme.themeSource = config.ui.theme_dark_mode ? 'dark' : 'light';

    // Intercept window open requests to force default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Load the internal Express server
    mainWindow.loadURL('http://localhost:3000');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// --- 5. App Lifecycle ---

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});