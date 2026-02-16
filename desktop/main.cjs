const { app, BrowserWindow, ipcMain, shell, Notification, dialog, Tray, Menu, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('./logger.cjs');
const isDev = !app.isPackaged;
const DiscordRPC = require('discord-rpc');

// Set app name to Tatakai
app.setName('Tatakai');

let mainWindow;
let splash;
let tray;
const clientId = '1466113024929697836';

// ── Client ID (CID) — persistent device identifier for rate limiting ──
function getOrCreateCID() {
    const cidPath = path.join(app.getPath('userData'), '.tatakai-cid');
    try {
        if (fs.existsSync(cidPath)) {
            const existing = fs.readFileSync(cidPath, 'utf-8').trim();
            if (existing && existing.length >= 32) return existing;
        }
    } catch { }
    const cid = `electron-${crypto.randomUUID()}`;
    try { fs.writeFileSync(cidPath, cid, 'utf-8'); } catch (e) { logger.error('Failed to write CID:', e); }
    return cid;
}
const appCID = getOrCreateCID();
logger.info(`[CID] Device ID: ${appCID}`);

// Register Deep Linking
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('tatakai', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('tatakai');
}

function registerShortcuts() {
    // Register global shortcuts for developer tools
    // Ctrl+Shift+I opens the in-app console (LogViewer)
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        if (mainWindow && mainWindow.webContents) {
            // Send message to renderer to toggle LogViewer
            mainWindow.webContents.send('toggle-log-viewer');
        }
    });

    // F12 opens native DevTools (for debugging)
    globalShortcut.register('F12', () => {
        if (mainWindow && mainWindow.webContents) {
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            } else {
                mainWindow.webContents.openDevTools();
            }
        }
    });

    globalShortcut.register('CommandOrControl+R', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.reload();
        }
    });

    globalShortcut.register('CommandOrControl+Shift+R', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.reloadIgnoringCache();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 1000,
        minHeight: 600,
        frame: false,
        show: false,
        title: 'Tatakai',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: true,
            webSecurity: false,
            sandbox: false,
            allowRunningInsecureContent: true,
            webviewTag: true,
            plugins: true,
            experimentalFeatures: true,
            enableBlinkFeatures: 'CSSContainerQueries'
        },
        backgroundColor: '#09090b',
        icon: path.join(__dirname, '..', 'resources', 'icon.ico')
    });

    const startUrl = isDev
        ? 'http://localhost:8088'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    console.log('Loading URL:', startUrl);
    console.log('Is development mode:', isDev);

    const loadURL = async (url) => {
        try {
            await mainWindow.loadURL(url);
            console.log('Successfully loaded URL:', url);
        } catch (err) {
            console.error(`Failed to load URL ${url}:`, err);
            // If 8088 fails in dev, try 8089
            if (isDev && url === 'http://localhost:8088') {
                console.log('Trying fallback port 8089...');
                await loadURL('http://localhost:8089');
            } else {
                mainWindow.loadFile(path.join(__dirname, 'offline.html'));
            }
        }
    };

    loadURL(startUrl);

    // Ensure splash screen is closed eventually even if main window hangs
    setTimeout(() => {
        if (splash && !splash.isDestroyed()) {
            splash.close();
            splash = null;
        }
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    }, 10000); // 10s safety timeout for splash

    // Disable any ad-blocking and allow all content
    const session = mainWindow.webContents.session;

    // Clear any existing cache that might have blocked content
    session.clearCache();

    // Allow all web requests (disable ad-blocking)
    session.webRequest.onBeforeRequest((details, callback) => {
        // Allow all requests without blocking
        callback({ cancel: false });
    });

    // Modify headers to prevent ad-blocking detection
    session.webRequest.onBeforeSendHeaders((details, callback) => {
        // Remove any headers that might indicate ad-blocking
        if (details.requestHeaders['X-Requested-With']) {
            delete details.requestHeaders['X-Requested-With'];
        }
        callback({ requestHeaders: details.requestHeaders });
    });

    // Set permissions to allow all (including ads)
    session.setPermissionRequestHandler((webContents, permission, callback) => {
        // Grant all permissions
        callback(true);
    });

    // Create application menu
    const template = [
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Developer Tools',
                    accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
                    click: () => {
                        if (mainWindow.webContents.isDevToolsOpened()) {
                            mainWindow.webContents.closeDevTools();
                        } else {
                            mainWindow.webContents.openDevTools();
                        }
                    }
                },
                {
                    label: 'Reload',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.webContents.reload();
                    }
                },
                {
                    label: 'Force Reload',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: () => {
                        mainWindow.webContents.reloadIgnoringCache();
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow.once('ready-to-show', () => {
        if (splash && !splash.isDestroyed()) {
            splash.close();
            splash = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();

            // Register keyboard shortcuts
            registerShortcuts();
        }
    });

    mainWindow.on('closed', () => (mainWindow = null));

    // Handle external links - allow ad popups but block actual navigation
    mainWindow.webContents.setWindowOpenHandler(({ url, disposition }) => {
        // Silently block all popup attempts from embeds (click hijacking)
        return { action: 'deny' };
    });

    // Block navigation hijacking from iframes/embeds
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const currentURL = mainWindow.webContents.getURL();

        // Allow navigation within the app (localhost or file://)
        if (url.startsWith('http://localhost') || url.startsWith('file://')) {
            return;
        }

        // Block any navigation attempts from within the app (click hijacking)
        if (!currentURL.startsWith('http://localhost') && !currentURL.startsWith('file://')) {
            return;
        }

        // Block the navigation
        event.preventDefault();
        console.log('Blocked navigation hijacking attempt to:', url);
    });

    // Block frame navigation (for iframes trying to redirect)
    mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
        webContents.on('will-navigate', (event, url) => {
            // Allow the initial load but block subsequent navigation
            if (!url.includes('megacloud') && !url.includes('rabbitstream')) {
                event.preventDefault();
                console.log('Blocked frame navigation to:', url);
            }
        });
    });

    // Intercept and block navigation in all frames
    mainWindow.webContents.on('frame-created', (event, details) => {
        details.frame.on('dom-ready', () => {
            // Skip about:blank and destroyed frames
            const frameURL = details.frame.url || '';
            if (frameURL === 'about:blank' || frameURL === '' || details.frame.isDestroyed?.()) {
                return;
            }

            // Inject script to prevent click hijacking (with defensive checks)
            details.frame.executeJavaScript(`
                (function() {
                    try {
                        // Prevent window.open from ads
                        if (typeof window.open !== 'undefined') {
                            window.open = function() { return null; };
                        }
                        
                        // Prevent location changes (check if not already defined)
                        try {
                            const desc = Object.getOwnPropertyDescriptor(window, 'location');
                            if (!desc || desc.configurable) {
                                Object.defineProperty(window, 'location', {
                                    get: function() { return window.location; },
                                    set: function() { return false; },
                                    configurable: false
                                });
                            }
                        } catch(e) {}
                        
                        // Block top navigation
                        try {
                            if (window.top && window.top !== window) {
                                const topDesc = Object.getOwnPropertyDescriptor(window.top, 'location');
                                if (!topDesc || topDesc.configurable) {
                                    Object.defineProperty(window.top, 'location', {
                                        get: function() { return window.top.location; },
                                        set: function() { return false; },
                                        configurable: false
                                    });
                                }
                            }
                        } catch(e) {}
                        
                        // Intercept all clicks and prevent default on suspicious links
                        document.addEventListener('click', function(e) {
                            try {
                                let target = e.target;
                                while (target && target.tagName !== 'A') {
                                    target = target.parentElement;
                                }
                                if (target && target.href && 
                                    !target.href.includes('megacloud') && 
                                    !target.href.includes('rabbitstream') &&
                                    !target.href.includes('blob:') &&
                                    !target.href.includes('data:')) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return false;
                                }
                            } catch(err) {}
                        }, true);
                    } catch(err) {
                        // Silent fail if frame is sandboxed
                    }
                })();
            `).catch(() => { });
        });
    });

    // Add error handling for loading failures
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('Failed to load:', { errorCode, errorDescription, validatedURL });
        if (isDev) {
            // In dev mode, try to reload after a delay
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.reload();
                }
            }, 3000);
        }
    });

    // Add debugging for DOM ready
    mainWindow.webContents.on('dom-ready', () => {
        console.log('DOM is ready');
    });

    // Add debugging for page finish load
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Page finished loading');
    });

    // Add console message listener for debugging
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`Console [${level}]: ${message}`);
    });
}

// Logger IPC
ipcMain.on('log', (event, { level, message, data }) => {
    if (logger[level]) {
        logger[level](message, data);
    }
});

ipcMain.handle('export-logs', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Logs',
        defaultPath: 'tatakai-logs.txt',
        filters: [{ name: 'Text Files', extensions: ['txt', 'log'] }]
    });

    if (canceled || !filePath) return false;

    try {
        const logPath = logger.getLogPath();
        fs.copyFileSync(logPath, filePath);
        return true;
    } catch (e) {
        logger.error('Failed to export logs', e);
        return false;
    }
});

// Deep Linking Handler
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        // Handle URL from commandLine
        const url = commandLine.pop();
        if (url && url.startsWith('tatakai://')) {
            handleDeepLink(url);
        }
    });
}

function handleDeepLink(url) {
    const path = url.replace('tatakai://', '/');
    if (mainWindow) {
        mainWindow.webContents.send('navigate', path);
    }
}

// Discord RPC
let rpc;
function initRPC() {
    rpc = new DiscordRPC.Client({ transport: 'ipc' });
    rpc.on('ready', () => {
        setActivity('Browsing Anime', 'Main Menu');
    });
    rpc.login({ clientId }).catch(console.error);
}

async function setActivity(details, state, extra = {}) {
    if (!rpc || !mainWindow) return;
    const activity = {
        details: details || 'Browsing Anime',
        state: state || 'In Main Menu',
        startTimestamp: extra.startTime || new Date(),
        largeImageKey: 'logo',
        largeImageText: 'Tatakai - Watch Anime Online',
        instance: false,
        buttons: [
            { label: 'Watch with me!', url: 'https://tatakai.me' }
        ]
    };

    if (extra.endTime) activity.endTimestamp = extra.endTime;
    if (extra.smallImageKey) activity.smallImageKey = extra.smallImageKey;
    if (extra.smallImageText) activity.smallImageText = extra.smallImageText;

    rpc.setActivity(activity);
}

function createSplash() {
    splash = new BrowserWindow({
        width: 400,
        height: 400,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        icon: path.join(__dirname, '..', 'resources', 'icon-512.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    splash.loadFile(path.join(__dirname, 'splash.html'));
    splash.center();
}

app.on('ready', () => {
    createSplash();

    // Initialize main window after a short delay
    setTimeout(() => {
        if (app.isQuitting) return;

        createWindow();
        initRPC(); // Initialize Discord RPC

        // Create System Tray
        const trayIconPath = path.join(__dirname, '..', 'resources', 'icon-512.png');
        try {
            if (fs.existsSync(trayIconPath)) {
                tray = new Tray(trayIconPath);
                const contextMenu = Menu.buildFromTemplate([
                    {
                        label: 'Show App', click: () => {
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.show();
                            }
                        }
                    },
                    { type: 'separator' },
                    { label: 'Quit', click: () => app.quit() }
                ]);
                tray.setToolTip('Tatakai');
                tray.setContextMenu(contextMenu);
                tray.on('click', () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.show();
                    }
                });
            }
        } catch (e) {
            console.error('Failed to create tray:', e);
        }
    }, 1500);
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

app.on('will-quit', () => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();
});

// Deep Link for macOS
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});

const { downloadEpisode, downloadFile, cancelDownload } = require('./downloader.cjs');

// IPC handlers
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.on('open-devtools', () => {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.openDevTools();
    }
});

ipcMain.handle('get-platform', () => process.platform);

ipcMain.on('update-rpc', (event, data) => {
    setActivity(data.details, data.state, data.extra);
});

ipcMain.on('notify', (event, { title, body }) => {
    new Notification({
        title: title || 'Tatakai',
        body,
        icon: isDev
            ? path.join(__dirname, '../resources/icon.png')
            : path.join(process.resourcesPath, 'resources/icon.png')
    }).show();
});

// Download Management
const activeDownloads = new Map();

ipcMain.handle('start-download', async (event, payload) => {
    const { episodeId, animeName, episodeNumber, url, headers, downloadPath, posterUrl, subtitles } = payload;
    const animeDir = path.join(downloadPath, animeName.replace(/[<>:"/\\|?*]/g, ''));
    const outputFilePath = path.join(animeDir, `Episode_${episodeNumber}.mp4`);

    if (activeDownloads.has(episodeId)) {
        return { success: false, error: 'Download already in progress' };
    }

    try {
        // 1. Create Anime Directory
        if (!fs.existsSync(animeDir)) fs.mkdirSync(animeDir, { recursive: true });

        // 2. Download Poster if missing
        const posterPath = path.join(animeDir, 'poster.jpg');
        if (!fs.existsSync(posterPath) && posterUrl) {
            try {
                await downloadFile(posterUrl, posterPath);
                console.log('Poster downloaded:', posterPath);
            } catch (posterErr) {
                console.error('Failed to download poster:', posterErr.message);
            }
        }

        // 3. Download subtitles if available - enhanced to handle all formats
        const subtitleFiles = [];
        if (subtitles && Array.isArray(subtitles)) {
            console.log(`Processing ${subtitles.length} subtitle tracks...`);
            for (const sub of subtitles) {
                if (sub.url) {
                    const langCode = sub.lang || sub.language || 'en';
                    const label = sub.label || sub.lang || langCode;
                    const subPath = path.join(animeDir, `Episode_${episodeNumber}_${langCode}.vtt`);

                    if (!fs.existsSync(subPath)) {
                        try {
                            console.log(`Downloading subtitle: ${label} (${langCode}) from ${sub.url}`);
                            // Use direct URL with proper headers (no proxy needed in Electron)
                            await downloadFile(sub.url, subPath, {
                                headers: {
                                    'Referer': headers?.Referer || 'https://megacloud.blog/',
                                    'Origin': 'https://megacloud.blog',
                                    'User-Agent': headers?.['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                                },
                                timeout: 30000
                            });

                            // Verify subtitle was downloaded successfully
                            if (fs.existsSync(subPath)) {
                                const stats = fs.statSync(subPath);
                                console.log(`✓ Subtitle downloaded: ${label} (${stats.size} bytes)`);
                            } else {
                                console.error(`✗ Subtitle file not created: ${label}`);
                                continue;
                            }

                            subtitleFiles.push({
                                lang: langCode,
                                label: label,
                                file: `Episode_${episodeNumber}_${langCode}.vtt`
                            });
                        } catch (subErr) {
                            console.error(`Failed to download subtitle ${label}:`, subErr.message);
                        }
                    } else {
                        console.log(`✓ Subtitle already exists: ${label}`);
                        // File exists, add to manifest
                        subtitleFiles.push({
                            lang: langCode,
                            label: label,
                            file: `Episode_${episodeNumber}_${langCode}.vtt`
                        });
                    }
                }
            }
            console.log(`Successfully processed ${subtitleFiles.length} subtitle files.`);
        }

        // 4. Create/Update Manifest
        const manifestPath = path.join(animeDir, 'manifest.json');
        let manifest = { animeName, episodes: [], posterUrl };
        if (fs.existsSync(manifestPath)) {
            const existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest = {
                ...existingManifest,
                animeName: existingManifest.animeName || animeName, // Preserve or set animeName
                posterUrl: existingManifest.posterUrl || posterUrl
            };
        }

        // Collect subtitle files for this episode from the subtitle download process above
        // (subtitleFiles was populated during the download loop)

        // Add this episode to manifest if not present
        if (!manifest.episodes.find(e => e.id === episodeId)) {
            manifest.episodes.push({
                id: episodeId,
                number: episodeNumber,
                file: `Episode_${episodeNumber}.mp4`,
                subtitles: subtitleFiles,
                addedAt: new Date().toISOString()
            });
        } else {
            // Update existing episode with subtitle info
            const epIndex = manifest.episodes.findIndex(e => e.id === episodeId);
            if (epIndex !== -1 && subtitleFiles.length > 0) {
                manifest.episodes[epIndex].subtitles = subtitleFiles;
            }
        }

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // 5. Start M3U8 -> MP4 Conversion
        console.log(`Queuing download for ${episodeId}:`, { url, outputFilePath });

        // Define the download task
        const startConversion = () => {
            console.log(`Starting download execution for ${episodeId}`);
            const downloadPromise = downloadEpisode({
                url,
                output: outputFilePath,
                headers: headers || {},
                episodeId,
                onProgress: (progressData) => {
                    // Ensure window is still available
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        // progressData can be number (old) or object (new with speed)
                        const data = typeof progressData === 'object'
                            ? { episodeId, ...progressData }
                            : { episodeId, percent: progressData };
                        mainWindow.webContents.send('download-progress', data);
                    }
                }
            });

            activeDownloads.set(episodeId, downloadPromise);

            downloadPromise
                .then((filePath) => {
                    activeDownloads.delete(episodeId);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        // Get file size for the completion message
                        let fileSize = 0;
                        try {
                            const stats = fs.statSync(filePath);
                            fileSize = stats.size;
                        } catch (e) { }
                        mainWindow.webContents.send('download-completed', {
                            episodeId,
                            path: filePath,
                            size: fileSize
                        });
                    }
                    processQueue(); // Trigger next download
                })
                .catch(err => {
                    activeDownloads.delete(episodeId);
                    console.error(`Download failed for ${episodeId}:`, err);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('download-error', { episodeId, error: err.message });
                    }
                    processQueue(); // Trigger next download even on error
                });
        };

        // Simple Queue Management - max 3 concurrent downloads
        if (activeDownloads.size < 3) {
            startConversion();
        } else {
            // Add to pending queue
            downloadQueue.push(startConversion);
            console.log(`Added to queue, position: ${downloadQueue.length}`);
        }

        return { success: true, status: 'queued' };
    } catch (err) {
        console.error('Download initiation failed:', err);
        return { success: false, error: err.message };
    }
});

// Queue definition (add this at top level of file)
const downloadQueue = [];
const processQueue = () => {
    if (downloadQueue.length > 0 && activeDownloads.size < 3) {
        const nextTask = downloadQueue.shift();
        if (nextTask) nextTask();
    }
};

ipcMain.handle('cancel-download', async (event, { episodeId, animePath }) => {
    console.log('Cancelling download:', episodeId, animePath);

    try {
        // Cancel the download process
        if (activeDownloads.has(episodeId)) {
            cancelDownload(episodeId);
            activeDownloads.delete(episodeId);
        }

        // Clean up files if animePath provided
        if (animePath && fs.existsSync(animePath)) {
            console.log('Cleaning up files at:', animePath);

            // Delete manifest to invalidate the anime entry
            const manifestPath = path.join(animePath, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                fs.unlinkSync(manifestPath);
            }

            // Delete all .tmp files
            const files = fs.readdirSync(animePath);
            for (const file of files) {
                if (file.endsWith('.tmp')) {
                    const filePath = path.join(animePath, file);
                    fs.unlinkSync(filePath);
                    console.log('Deleted temp file:', file);
                }
            }

            // If no valid video files remain, delete the entire folder
            const remainingVideos = files.filter(f =>
                (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')) &&
                !f.endsWith('.tmp')
            );

            if (remainingVideos.length === 0) {
                fs.rmSync(animePath, { recursive: true, force: true });
                console.log('Deleted empty anime folder');
            }
        }

        return { success: true };
    } catch (err) {
        console.error('Failed to cancel download:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0];
    }
});

ipcMain.handle('get-downloads-dir', async (event, customPath) => {
    return customPath || path.join(app.getPath('videos'), 'Tatakai');
});

ipcMain.handle('get-offline-library', async (event, customPath) => {
    const downloadPath = customPath || path.join(app.getPath('videos'), 'Tatakai');
    console.log('Getting offline library from:', downloadPath);

    if (!fs.existsSync(downloadPath)) {
        console.log('Download path does not exist');
        return [];
    }

    const library = [];
    const animeDirs = fs.readdirSync(downloadPath).filter(f => {
        const fullPath = path.join(downloadPath, f);
        return fs.statSync(fullPath).isDirectory();
    });

    console.log('Found anime directories:', animeDirs);

    for (const dirName of animeDirs) {
        const animeDir = path.join(downloadPath, dirName);
        const manifestPath = path.join(animeDir, 'manifest.json');

        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                const posterPath = path.join(animeDir, 'poster.jpg');

                // Filter episodes to only include ones with actual video files > 1KB
                const validEpisodes = (manifest.episodes || []).filter(ep => {
                    const videoPath = path.join(animeDir, ep.file);
                    if (fs.existsSync(videoPath)) {
                        const stats = fs.statSync(videoPath);
                        return stats.size > 1024; // More than 1KB
                    }
                    return false;
                });

                // Only add to library if there's at least one valid episode
                if (validEpisodes.length > 0 || manifest.episodes?.length > 0) {
                    const posterExists = fs.existsSync(posterPath);
                    console.log(`Anime: ${dirName}, Poster exists: ${posterExists}, Episodes: ${validEpisodes.length}`);

                    library.push({
                        name: manifest.animeName || dirName,
                        path: animeDir,
                        poster: posterExists ? `file://${posterPath.replace(/\\/g, '/')}` : null,
                        episodes: validEpisodes.length > 0 ? validEpisodes : manifest.episodes || [],
                        totalEpisodes: manifest.episodes?.length || 0,
                        downloadedEpisodes: validEpisodes.length
                    });
                }
            } catch (err) {
                console.error(`Error reading manifest for ${dirName}:`, err);
            }
        } else {
            console.log(`No manifest found for ${dirName}`);
        }
    }

    console.log('Returning library with', library.length, 'items');
    return library;
});

// Sync library - scan folder for videos and create/update manifests
ipcMain.handle('sync-offline-library', async (event, customPath) => {
    const downloadPath = customPath || path.join(app.getPath('videos'), 'Tatakai');
    console.log('Syncing offline library at:', downloadPath);

    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
        return { synced: 0, total: 0, message: 'Download folder created' };
    }

    let synced = 0;
    let total = 0;
    const results = [];

    const animeDirs = fs.readdirSync(downloadPath).filter(f => {
        const fullPath = path.join(downloadPath, f);
        return fs.statSync(fullPath).isDirectory();
    });

    for (const dirName of animeDirs) {
        const animeDir = path.join(downloadPath, dirName);
        const manifestPath = path.join(animeDir, 'manifest.json');

        // Find all video files in the directory
        const videoFiles = fs.readdirSync(animeDir).filter(f =>
            f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')
        );

        if (videoFiles.length === 0) continue;
        total += videoFiles.length;

        // Load or create manifest
        let manifest = { animeName: dirName, episodes: [] };
        if (fs.existsSync(manifestPath)) {
            try {
                manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            } catch (e) {
                console.error('Failed to parse manifest:', e);
            }
        }

        // Check each video file and add to manifest if missing
        for (const videoFile of videoFiles) {
            const videoPath = path.join(animeDir, videoFile);
            const stats = fs.statSync(videoPath);

            // Skip files smaller than 1MB (likely incomplete)
            if (stats.size < 1024 * 1024) {
                console.log(`Skipping small file: ${videoFile} (${stats.size} bytes)`);
                continue;
            }

            // Extract episode number from filename (e.g., "Episode_1.mp4" -> 1)
            const match = videoFile.match(/Episode[_\s]?(\d+)/i) || videoFile.match(/(\d+)/);
            const episodeNumber = match ? parseInt(match[1]) : videoFiles.indexOf(videoFile) + 1;

            // Check if episode already exists in manifest
            const existingEp = manifest.episodes.find(e =>
                e.file === videoFile || e.number === episodeNumber
            );

            if (!existingEp) {
                // Add new episode to manifest
                manifest.episodes.push({
                    id: `${dirName.toLowerCase().replace(/\s+/g, '-')}-ep-${episodeNumber}`,
                    number: episodeNumber,
                    file: videoFile,
                    addedAt: new Date().toISOString(),
                    size: stats.size,
                    synced: true
                });
                synced++;
                console.log(`Added ${videoFile} to ${dirName} manifest`);
            }
        }

        // Sort episodes by number
        manifest.episodes.sort((a, b) => a.number - b.number);

        // Save updated manifest
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        results.push({
            name: dirName,
            episodes: manifest.episodes.length,
            newlyAdded: synced
        });
    }

    console.log(`Sync complete: ${synced} new episodes found out of ${total} video files`);
    return {
        synced,
        total,
        results,
        message: synced > 0
            ? `Found and added ${synced} episode(s) to your library!`
            : 'Library is already up to date'
    };
});

// Import external video files
ipcMain.handle('import-video-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Video Files',
        filters: [
            { name: 'Video Files', extensions: ['mp4', 'mkv', 'webm', 'avi'] }
        ],
        properties: ['openFile', 'multiSelections']
    });

    if (canceled || filePaths.length === 0) {
        return { success: false, message: 'No files selected' };
    }

    const downloadPath = path.join(app.getPath('videos'), 'Tatakai');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    // Ask for anime name
    const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Cancel', 'Import'],
        defaultId: 1,
        title: 'Import Videos',
        message: `Import ${filePaths.length} video file(s)?`,
        detail: 'Files will be copied to your Tatakai library. You can organize them into anime folders later.',
    });

    if (response === 0) {
        return { success: false, message: 'Import cancelled' };
    }

    let imported = 0;
    const importedDir = path.join(downloadPath, 'Imported');
    if (!fs.existsSync(importedDir)) {
        fs.mkdirSync(importedDir, { recursive: true });
    }

    for (const filePath of filePaths) {
        const fileName = path.basename(filePath);
        const destPath = path.join(importedDir, fileName);

        try {
            fs.copyFileSync(filePath, destPath);
            imported++;
        } catch (err) {
            console.error(`Failed to copy ${fileName}:`, err);
        }
    }

    // Create/update manifest for imported folder
    const manifestPath = path.join(importedDir, 'manifest.json');
    let manifest = { animeName: 'Imported Videos', episodes: [] };
    if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    const videoFiles = fs.readdirSync(importedDir).filter(f =>
        f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')
    );

    manifest.episodes = videoFiles.map((file, i) => ({
        id: `imported-${i + 1}`,
        number: i + 1,
        file,
        addedAt: new Date().toISOString()
    }));

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return {
        success: true,
        imported,
        message: `Successfully imported ${imported} video(s)`
    };
});

// Open downloads folder in file explorer
ipcMain.handle('open-downloads-folder', async (event, customPath) => {
    const downloadPath = customPath || path.join(app.getPath('videos'), 'Tatakai');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }
    await shell.openPath(downloadPath);
    return { success: true };
});

// Repair anime - re-download missing posters and subtitles
ipcMain.handle('repair-anime', async (event, { animePath, posterUrl, subtitles, animeName }) => {
    console.log('Repairing anime:', { animePath, posterUrl, animeName });

    if (!fs.existsSync(animePath)) {
        return { success: false, error: 'Anime folder not found' };
    }

    const results = {
        poster: { needed: false, success: false },
        subtitles: { needed: 0, downloaded: 0 },
        manifest: { updated: false }
    };

    try {
        // 1. Check and download poster if missing
        const posterPath = path.join(animePath, 'poster.jpg');
        if (!fs.existsSync(posterPath) && posterUrl) {
            results.poster.needed = true;
            try {
                await downloadFile(posterUrl, posterPath);
                results.poster.success = true;
                console.log('Poster repaired:', posterPath);
            } catch (err) {
                console.error('Failed to repair poster:', err.message);
            }
        }

        // 2. Check and download subtitles if missing
        const manifestPath = path.join(animePath, 'manifest.json');
        let manifest = { animeName: animeName || path.basename(animePath), episodes: [] };

        if (fs.existsSync(manifestPath)) {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }

        // If subtitles provided externally (from API), download them for each episode
        if (subtitles && Array.isArray(subtitles) && subtitles.length > 0) {
            console.log('[REPAIR] Processing', subtitles.length, 'subtitle tracks for', manifest.episodes.length, 'episodes');
            for (const episode of manifest.episodes) {
                for (const sub of subtitles) {
                    if (sub.url) {
                        const subFileName = `Episode_${episode.number}_${sub.lang || 'en'}.vtt`;
                        const subPath = path.join(animePath, subFileName);

                        if (!fs.existsSync(subPath)) {
                            results.subtitles.needed++;
                            try {
                                console.log('[REPAIR] Downloading:', subFileName);
                                console.log('[REPAIR] URL:', sub.url);
                                await downloadFile(sub.url, subPath);

                                // Verify file exists and has content
                                if (fs.existsSync(subPath)) {
                                    const stats = fs.statSync(subPath);
                                    console.log('[REPAIR] ✓ Subtitle saved:', subFileName, `(${stats.size} bytes)`);
                                    results.subtitles.downloaded++;
                                } else {
                                    console.error('[REPAIR] ✗ Subtitle file not created:', subFileName);
                                }

                                // Update episode manifest with subtitle info
                                if (!episode.subtitles) episode.subtitles = [];
                                if (!episode.subtitles.find(s => s.file === subFileName)) {
                                    episode.subtitles.push({
                                        lang: sub.lang || 'en',
                                        label: sub.label || sub.lang || 'English',
                                        file: subFileName
                                    });
                                }
                            } catch (err) {
                                console.error(`[REPAIR] Failed to repair subtitle ${subFileName}:`, err.message);
                            }
                        } else {
                            console.log('[REPAIR] ✓ Subtitle already exists:', subFileName);
                        }
                    }
                }
            }
        } else {
            console.log('[REPAIR] No subtitles provided');
        }

        // 3. Update manifest with animeName if missing
        if (!manifest.animeName && animeName) {
            manifest.animeName = animeName;
            results.manifest.updated = true;
        }

        // 4. Update posterUrl in manifest if provided
        if (posterUrl && !manifest.posterUrl) {
            manifest.posterUrl = posterUrl;
            results.manifest.updated = true;
        }

        // Save updated manifest
        if (results.manifest.updated || results.subtitles.downloaded > 0) {
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }

        const message = [];
        if (results.poster.success) message.push('Poster downloaded');
        if (results.subtitles.downloaded > 0) message.push(`${results.subtitles.downloaded} subtitle(s) downloaded`);
        if (results.manifest.updated) message.push('Manifest updated');

        if (message.length === 0) {
            message.push('Everything looks good!');
        }

        return {
            success: true,
            results,
            message: message.join(', ')
        };
    } catch (err) {
        console.error('Repair failed:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('open-path', async (event, filePath) => {
    await shell.openPath(filePath);
});

// Delete anime and all its files
ipcMain.handle('delete-anime', async (event, animePath) => {
    console.log('Deleting anime at:', animePath);

    try {
        if (!fs.existsSync(animePath)) {
            return { success: false, error: 'Anime folder not found' };
        }

        // Recursively delete the entire anime directory
        fs.rmSync(animePath, { recursive: true, force: true });
        console.log('Successfully deleted:', animePath);

        return { success: true, message: 'Anime deleted successfully' };
    } catch (err) {
        console.error('Failed to delete anime:', err);
        return { success: false, error: err.message };
    }
});

// Reset app data and redirect to setup
ipcMain.handle('reset-app-data', async () => {
    console.log('Resetting app data...');

    try {
        // Get all potential download paths
        const userDataPath = app.getPath('userData');
        const defaultDownloadPath = path.join(app.getPath('videos'), 'Tatakai');

        // Delete downloaded anime from default location
        if (fs.existsSync(defaultDownloadPath)) {
            fs.rmSync(defaultDownloadPath, { recursive: true, force: true });
            console.log('Deleted download folder:', defaultDownloadPath);
        }

        // Clear cache and non-locked files
        const itemsToDelete = [
            'Cache',
            'Code Cache',
            'GPUCache'
        ];

        for (const item of itemsToDelete) {
            const itemPath = path.join(userDataPath, item);
            if (fs.existsSync(itemPath)) {
                try {
                    fs.rmSync(itemPath, { recursive: true, force: true });
                    console.log('Deleted:', item);
                } catch (err) {
                    console.log('Could not delete', item, err.message);
                }
            }
        }

        // Schedule deletion of locked files (Local Storage, Session Storage, Preferences) on next startup
        // by using app.relaunch() which will close the app and restart

        // Return success and let the frontend handle the restart
        return { success: true, message: 'App data reset successfully', needsRestart: true };
    } catch (err) {
        console.error('Failed to reset app:', err);
        return { success: false, error: err.message };
    }
});

// Handle app relaunch for reset
ipcMain.handle('app-relaunch', () => {
    app.relaunch();
    app.quit();
});

// Auto Updater
autoUpdater.logger = logger;
autoUpdater.autoDownload = false;

// Configure GitHub releases for auto-update
if (!isDev) {
    autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'snozxyx',
        repo: 'Tatakai'
    });
    // Include CID in update request headers for per-device tracking
    autoUpdater.requestHeaders = { 'X-Client-Id': appCID };
}

ipcMain.handle('check-for-updates', async () => {
    if (isDev) {
        console.log('Skipping update check in dev mode');
        return { status: 'dev-mode' };
    }
    try {
        const result = await autoUpdater.checkForUpdates();
        return { status: 'checked', result };
    } catch (error) {
        console.error('Update check failed:', error);
        return { status: 'error', error: error.message };
    }
});

ipcMain.handle('download-update', () => {
    autoUpdater.downloadUpdate();
});

ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
});

// Updater Events
autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater-event', { type: 'update-available', info });
});

autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('updater-event', { type: 'update-not-available', info });
});

autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater-event', { type: 'download-progress', progress });
});

autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater-event', { type: 'update-downloaded', info });
});

autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater-event', { type: 'error', error: err.message });
});

// App Reset and Additional Settings
ipcMain.handle('reset-app', async () => {
    try {
        const { canceled } = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            buttons: ['Reset App', 'Cancel'],
            defaultId: 1,
            title: 'Reset Tatakai App',
            message: 'Are you sure you want to reset the app?',
            detail: 'This will:\n• Clear all app settings\n• Remove download history (files will remain)\n• Reset window preferences\n• Require setup again\n\nThe app will restart automatically.'
        });

        if (canceled) return { success: false, cancelled: true };

        // Clear app data
        const userData = app.getPath('userData');
        const settingsFile = path.join(userData, 'settings.json');
        const logFile = path.join(userData, 'logs');

        // Clear localStorage equivalent data if any
        if (fs.existsSync(settingsFile)) {
            fs.unlinkSync(settingsFile);
        }

        // Clear some specific files but keep logs
        const sessionData = app.getPath('sessionData');
        const cacheDir = path.join(userData, 'Cache');

        try {
            if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir);
                for (const file of files) {
                    const filePath = path.join(cacheDir, file);
                    try {
                        if (fs.statSync(filePath).isFile()) {
                            fs.unlinkSync(filePath);
                        }
                    } catch (e) {
                        // Ignore individual file errors
                    }
                }
            }
        } catch (e) {
            console.warn('Cache cleanup failed:', e);
        }

        // Restart the app
        app.relaunch();
        app.quit();
        return { success: true };
    } catch (error) {
        console.error('Reset app failed:', error);
        return { success: false, error: error.message };
    }
});

// Auto-launch setting
ipcMain.handle('set-auto-launch', async (event, enabled) => {
    try {
        if (enabled) {
            app.setLoginItemSettings({
                openAtLogin: true,
                path: process.execPath
            });
        } else {
            app.setLoginItemSettings({
                openAtLogin: false
            });
        }
        return { success: true };
    } catch (error) {
        console.error('Set auto-launch failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-auto-launch', async () => {
    try {
        const settings = app.getLoginItemSettings();
        return { success: true, enabled: settings.openAtLogin };
    } catch (error) {
        console.error('Get auto-launch failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-system-info', async () => {
    const os = require('os');
    return {
        platform: process.platform,
        arch: process.arch,
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100,
        freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100,
        cpus: os.cpus().length,
        cid: appCID
    };
});

ipcMain.handle('get-client-id', () => appCID);