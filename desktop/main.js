const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;
const DiscordRPC = require('discord-rpc');

let mainWindow;
const clientId = 'YOUR_DISCORD_CLIENT_ID'; // We can update this later

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        titleBarStyle: 'hidden', // Modern titlebar
        titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#ffffff'
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        backgroundColor: '#000000',
    });

    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => (mainWindow = null));
}

// Discord RPC
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

async function setActivity(details, state) {
    if (!rpc || !mainWindow) return;
    rpc.setActivity({
        details: details || 'Browsing Anime',
        state: state || 'In Main Menu',
        startTimestamp: new Date(),
        largeImageKey: 'logo',
        largeImageText: 'Tatakai',
        instance: false,
    });
}

rpc.on('ready', () => {
    setActivity();
});

rpc.login({ clientId }).catch(console.error);

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC handlers for frontend communication
ipcMain.handle('get-platform', () => process.platform);
ipcMain.on('update-rpc', (event, { details, state }) => {
    setActivity(details, state);
});
