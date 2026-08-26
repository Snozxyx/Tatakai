const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    persistTheme: (payload) => ipcRenderer.invoke('theme:persist', payload),
    getSplashTheme: () => ipcRenderer.invoke('theme:get-splash'),
    updateRPC: (data) => ipcRenderer.send('update-rpc', data),
    clearRPC: () => ipcRenderer.send('clear-rpc'),
    notify: (data) => ipcRenderer.send('notify', data),
    onNavigate: (callback) => {
        const handler = (_event, path) => callback(path);
        ipcRenderer.on('navigate', handler);
        return () => ipcRenderer.removeListener('navigate', handler);
    },
    onMagnetOpen: (callback) => {
        const handler = (_event, magnetUrl) => callback(magnetUrl);
        ipcRenderer.on('torrent:open-magnet', handler);
        return () => ipcRenderer.removeListener('torrent:open-magnet', handler);
    },
    onFileOpen: (callback) => {
        const handler = (_event, filePath) => callback(filePath);
        ipcRenderer.on('torrent:open-file', handler);
        return () => ipcRenderer.removeListener('torrent:open-file', handler);
    },
    startDownload: (payload) => ipcRenderer.invoke('start-download', payload),
    cancelDownload: (params) => ipcRenderer.invoke('cancel-download', params),
    deleteAnime: (animePath) => ipcRenderer.invoke('delete-anime', animePath),
    getDownloadsDir: (customPath) => ipcRenderer.invoke('get-downloads-dir', customPath),
    getOfflineLibrary: (customPath) => ipcRenderer.invoke('get-offline-library', customPath),
    scanLocalLibrary: (directoryPath) => ipcRenderer.invoke('scan-local-library', directoryPath),
    syncOfflineLibrary: (customPath) => ipcRenderer.invoke('sync-offline-library', customPath),
    importVideoFiles: () => ipcRenderer.invoke('import-video-files'),
    analyzeImportPaths: (paths) => ipcRenderer.invoke('analyze-import-paths', paths),
    finalizeImport: (payload) => ipcRenderer.invoke('finalize-import', payload),
    selectImportFiles: () => ipcRenderer.invoke('select-import-files'),
    selectImportDirectory: () => ipcRenderer.invoke('select-import-directory'),
    parseReleaseName: (name) => ipcRenderer.invoke('parse-release-name', name),
    openDownloadsFolder: (customPath) => ipcRenderer.invoke('open-downloads-folder', customPath),
    repairAnime: (params) => ipcRenderer.invoke('repair-anime', params),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    streamLocalFile: (filePath) => ipcRenderer.invoke('media:stream-local-file', filePath),
    openExternal: (url) => {
        if (/^https?:\/\//i.test(String(url || ''))) {
            return ipcRenderer.invoke('shell:open-external', url);
        }
        return Promise.resolve({ success: false });
    },
    
    // Auto Downloader
    autoDownload: {
        subscribe: (animeId, title, nextEpisode) => ipcRenderer.invoke('auto-download:subscribe', animeId, title, nextEpisode),
        unsubscribe: (animeId) => ipcRenderer.invoke('auto-download:unsubscribe', animeId),
        list: () => ipcRenderer.invoke('auto-download:list')
    },
    
    // Phase 0: generic invoke() removed — all IPC must be explicit named handlers.
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
    onDownloadCompleted: (callback) => ipcRenderer.on('download-completed', (event, data) => callback(data)),
    onDownloadError: (callback) => ipcRenderer.on('download-error', (event, data) => callback(data)),
    removeDownloadListeners: () => {
        ipcRenderer.removeAllListeners('download-progress');
        ipcRenderer.removeAllListeners('download-completed');
        ipcRenderer.removeAllListeners('download-error');
    },
    onToggleLogViewer: (callback) => ipcRenderer.on('toggle-log-viewer', () => callback()),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    setFullscreen: (enabled) => ipcRenderer.invoke('window:set-fullscreen', enabled),
    isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
    onFullscreenChanged: (callback) => {
        const handler = (_event, isFullscreen) => callback(isFullscreen);
        ipcRenderer.on('window:fullscreen-changed', handler);
        return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
    },
    log: (level, message, data) => ipcRenderer.send('log', { level, message, data }),
    exportLogs: () => ipcRenderer.invoke('export-logs'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    onUpdaterEvent: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('updater-event', handler);
        return () => ipcRenderer.removeListener('updater-event', handler);
    },
    resetAppData: () => ipcRenderer.invoke('reset-app-data'),
    appRelaunch: () => ipcRenderer.invoke('app-relaunch'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
    getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getClientId: () => ipcRenderer.invoke('get-client-id'),
    openDevTools: () => ipcRenderer.send('open-devtools'),

    // ── Production-readiness IPC bridge (Req 8.1, 8.2, 8.3, 8.4, 8.5) ─────────
    logTail: (lines) => ipcRenderer.invoke('log:tail', lines),
    perfGetHistory: (lastN) => ipcRenderer.invoke('perf:get-history', lastN),
    updateCheck: (channel) => ipcRenderer.invoke('update:check', channel),
    updateDownload: () => ipcRenderer.invoke('update:download'),
    updateInstall: () => ipcRenderer.invoke('update:install'),
    updateRollback: (version) => ipcRenderer.invoke('update:rollback', version),
    updateGetHistory: () => ipcRenderer.invoke('update:get-history'),
    updateGetPolicy: (channel) => ipcRenderer.invoke('update:get-policy', channel),
    onCrashPrevious: (cb) => {
        const h = (_event, d) => cb(d);
        ipcRenderer.on('crash:previous', h);
        return () => ipcRenderer.removeListener('crash:previous', h);
    },

    // Extension discovery — used by manga-extension-runtime.ts and other consumers
    // to detect which extensions are loaded and what capabilities they expose.
    // Requirements: 1.5, 12.3
    listInstalledExtensions: () => ipcRenderer.invoke('electron.listInstalledExtensions'),

    // Home Server — must live on window.electron (settings UI)
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    homeServerGetStatus: () => ipcRenderer.invoke('home-server:get-status'),
    homeServerGetConfig: () => ipcRenderer.invoke('home-server:get-config'),
    homeServerSetConfig: (patch) => ipcRenderer.invoke('home-server:set-config', patch),
    homeServerStart: (overrides) => ipcRenderer.invoke('home-server:start', overrides || {}),
    homeServerStop: () => ipcRenderer.invoke('home-server:stop'),
    homeServerCreateToken: (opts) => ipcRenderer.invoke('home-server:create-token', opts || {}),
    homeServerRevokeToken: (token) => ipcRenderer.invoke('home-server:revoke-token', token),
    homeServerUpsertUser: (user) => ipcRenderer.invoke('home-server:upsert-user', user),
    homeServerListConsent: () => ipcRenderer.invoke('home-server:list-consent'),
    homeServerDecideConsent: (payload) => ipcRenderer.invoke('home-server:decide-consent', payload),
    homeServer: {
        getStatus: () => ipcRenderer.invoke('home-server:get-status'),
        getConfig: () => ipcRenderer.invoke('home-server:get-config'),
        setConfig: (patch) => ipcRenderer.invoke('home-server:set-config', patch),
        start: (overrides) => ipcRenderer.invoke('home-server:start', overrides || {}),
        stop: () => ipcRenderer.invoke('home-server:stop'),
        createToken: (opts) => ipcRenderer.invoke('home-server:create-token', opts || {}),
        revokeToken: (token) => ipcRenderer.invoke('home-server:revoke-token', token),
        upsertUser: (user) => ipcRenderer.invoke('home-server:upsert-user', user),
        listConsent: () => ipcRenderer.invoke('home-server:list-consent'),
        decideConsent: (payload) => ipcRenderer.invoke('home-server:decide-consent', payload),
    },
    onHomeServerStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('home-server:status', handler);
        return () => ipcRenderer.removeListener('home-server:status', handler);
    },

    // App-level ad / popunder blocker, scoped to the watch page.
    // `setWatchActive` arms the network filter (nothing is filtered elsewhere);
    // `setEmbedActive` additionally tells the main process an untrusted embed is on
    // screen so popups from it are refused instead of being opened in the user's
    // real browser.
    security: {
        getAdBlockStats: () => ipcRenderer.invoke('security:get-adblock-stats'),
        setWatchActive: (active) => ipcRenderer.invoke('security:set-watch-active', active === true),
        setEmbedActive: (active) => ipcRenderer.invoke('security:set-embed-active', active === true),
        setAdBlockEnabled: (enabled) => ipcRenderer.invoke('security:set-adblock-enabled', enabled !== false),
    },
    onSecurityBlocked: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('security:blocked', handler);
        return () => ipcRenderer.removeListener('security:blocked', handler);
    },
});

// Phase 0+: tatakaiRuntime — typed IPC bridge for the V6 local runtime.
// Stubs filled progressively: Phase 4 (local runtime / WARP), Phase 5 (torrent), Phase 7 (extensions).
contextBridge.exposeInMainWorld('tatakaiRuntime', {
    // Runtime health
    health: () => ipcRenderer.invoke('runtime:health'),

    // Extension-API host base URL + mounted namespaces (generic SSE consumer).
    // Renderer resolves this once and builds `${baseUrl}/api/v3/<namespace>/...`.
    getExtensionApiBase: () => ipcRenderer.invoke('runtime:get-api-base'),

    // Source resolution (Phase 4 — local extension scraping)
    resolveEpisodeSources: (options) =>
        ipcRenderer.invoke('runtime:resolve-sources', options),

    // Extension execution (Phase 7 — Extension Hub)
    loadExtension: (extensionId, manifest) =>
        ipcRenderer.invoke('extension:load', { extensionId, manifest }),
    unloadExtension: (extensionId) =>
        ipcRenderer.invoke('extension:unload', extensionId),
    invokeExtension: (extensionId, method, args) =>
        ipcRenderer.invoke('extension:invoke', { extensionId, method, args }),
    sideloadManifest: (manifest, bundleCode) =>
        ipcRenderer.invoke('extension:sideload-manifest', manifest, bundleCode),
    setExtensionKillSwitch: (extensionId, blocked) =>
        ipcRenderer.invoke('extension:set-kill-switch', extensionId, blocked),
    getExtensionAuditLog: (limit) =>
        ipcRenderer.invoke('extension:get-audit-log', limit),
    // .kai format
    // NOTE: ArrayBuffer is NOT transferred by contextBridge — convert to Uint8Array first
    // so Electron serialises it correctly as a Buffer on the main-process side.
    loadKaiExtension: (kaiBuffer, skipSignatureCheck) => {
        const buf = kaiBuffer instanceof ArrayBuffer ? new Uint8Array(kaiBuffer) : kaiBuffer;
        return ipcRenderer.invoke('extension:load-kai', { kaiBuffer: buf, skipSignatureCheck });
    },
    getKaiMeta: (extensionId) =>
        ipcRenderer.invoke('extension:get-kai-meta', extensionId),

    // Extension marketplace (Phase 11 — submission, review, source transparency)
    submitExtension: (kaiBuffer, metadata) => {
        const buf = kaiBuffer instanceof ArrayBuffer ? new Uint8Array(kaiBuffer) : kaiBuffer;
        return ipcRenderer.invoke('extension:submit', { kaiBuffer: buf, metadata });
    },
    getReviewStatus: (submissionId) =>
        ipcRenderer.invoke('extension:review-status', { submissionId }),
    getExtensionSourceCode: (extensionId) =>
        ipcRenderer.invoke('extension:get-source-code', extensionId),

    // Local cache (Phase 4)
    readLocalCache: (key) => ipcRenderer.invoke('cache:read', key),
    writeLocalCache: (key, value) => ipcRenderer.invoke('cache:write', { key, value }),

    // Network (WARP/DoH)
    getWarpStatus: () => ipcRenderer.invoke('network:get-warp-status'),
    toggleWarp: (enabled) => ipcRenderer.invoke('network:toggle-warp', enabled),
    setWarpMode: (mode) => ipcRenderer.invoke('network:set-warp-mode', mode),
    getWarpRoutingLog: () => ipcRenderer.invoke('network:get-warp-routing-log'),

    // Torrent (Phase 5 — desktop only)
    searchTorrentCandidates: (options) => ipcRenderer.invoke('torrent:search', options),
    startTorrentSession: (infoHash, options) => ipcRenderer.invoke('torrent:start', infoHash, options),
    restoreTorrentSession: (snapshot) => ipcRenderer.invoke('torrent:restore-session', snapshot),
    stopTorrentSession: (sessionId, options) => ipcRenderer.invoke('torrent:stop', sessionId, options),
    disconnectTorrentPeers: (sessionId) => ipcRenderer.invoke('torrent:disconnect-peers', sessionId),
    getTorrentStats: (sessionId) => ipcRenderer.invoke('torrent:stats', sessionId),
    updateTorrentPlayback: (sessionId, currentTime, duration) =>
        ipcRenderer.invoke('torrent:update-playback', sessionId, currentTime, duration),
    getTorrentStreamUrl: (sessionId, fileIndex, options) => ipcRenderer.invoke('torrent:stream', sessionId, fileIndex, options),
    clearAllTorrentData: () => ipcRenderer.invoke('torrent:clear-all'),
    restartTorrentService: () => ipcRenderer.invoke('torrent:restart-service'),
    updateTorrentSettings: (settings) => ipcRenderer.invoke('torrent:update-settings', settings),
    importMagnetFile: (filePath) => ipcRenderer.invoke('torrent:import-magnet-file', filePath),
    importTorrentFile: (filePath) => ipcRenderer.invoke('torrent:import-file', filePath),
    resolveMagnetMetadata: (magnetLink) => ipcRenderer.invoke('torrent:resolve-metadata', magnetLink),
    // New torrent channels (Phase 15)
    previewTorrent: (magnet) => ipcRenderer.invoke('torrent:preview', magnet),
    getTorrentPeers: (sessionId) => ipcRenderer.invoke('torrent:peers', sessionId),
    getTorrentFilePath: (sessionId) => ipcRenderer.invoke('torrent:get-file-path', sessionId),
    getTorrentStoragePaths: () => ipcRenderer.invoke('torrent:get-storage-paths'),
    setTorrentStoragePath: (nextPath) => ipcRenderer.invoke('torrent:set-storage-path', nextPath),
    ensureTorrentPrebuffer: (sessionId, fileIndex, options) =>
        ipcRenderer.invoke('torrent:ensure-prebuffer', sessionId, fileIndex, options),
    startTorrentFromFile: (torrentBuffer, options) => {
        // ArrayBuffer is NOT transferred by contextBridge — convert to Uint8Array
        const buf = torrentBuffer instanceof ArrayBuffer ? new Uint8Array(torrentBuffer) : torrentBuffer;
        return ipcRenderer.invoke('torrent:start-file', { torrentBuffer: buf, options });
    },
    onTorrentMetadataReady: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('torrent:metadata-ready', handler);
        return () => ipcRenderer.removeListener('torrent:metadata-ready', handler);
    },
    reannounceTorrent: (sessionId) => ipcRenderer.invoke('torrent:reannounce', sessionId),
    dumpTorrentDiagnostics: (sessionId) => ipcRenderer.invoke('torrent:dump-diagnostics', sessionId),
    listTorrentSessions: () => ipcRenderer.invoke('torrent:list-sessions'),
    onTorrentBlocked: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('torrent:blocked', handler);
        return () => ipcRenderer.removeListener('torrent:blocked', handler);
    },
    onTorrentRestartShortcut: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('torrent:restart-shortcut', handler);
        return () => ipcRenderer.removeListener('torrent:restart-shortcut', handler);
    },

    // External Player
    detectExternalPlayers: () => ipcRenderer.invoke('external-player:detect'),
    launchExternalPlayer: (opts) => ipcRenderer.invoke('external-player:launch', opts),
    getExternalPlayerPref: () => ipcRenderer.invoke('external-player:get-pref'),
    saveExternalPlayerPref: (executablePath) => ipcRenderer.invoke('external-player:save-pref', executablePath),

    // Media Probe
    probeMedia: (url) => ipcRenderer.invoke('media:probe', url),
    extractSubtitle: (url, trackIndex) => ipcRenderer.invoke('media:extract-subtitle', url, trackIndex),
    extractAudioTrack: (url, trackIndex) => ipcRenderer.invoke('media:extract-audio-track', url, trackIndex),
    readLocalFile: (filePath) => ipcRenderer.invoke('media:read-local-file', filePath),

    // Generic invoke (fallback for newer channels if preload is stale)
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

    // FlareSolverr — configure and query the external bypass service
    flareSolverrConfig: (config) => ipcRenderer.invoke('runtime:flaresolverr-config', config),
    flareSolverrStatus: () => ipcRenderer.invoke('runtime:flaresolverr-status'),
    flareSolverrSetBypassMode: (mode) => ipcRenderer.invoke('runtime:bypass-mode', mode),

    // Tatakai Home Server (LAN / remote media server)
    homeServerGetStatus: () => ipcRenderer.invoke('home-server:get-status'),
    homeServerGetConfig: () => ipcRenderer.invoke('home-server:get-config'),
    homeServerSetConfig: (patch) => ipcRenderer.invoke('home-server:set-config', patch),
    homeServerStart: (overrides) => ipcRenderer.invoke('home-server:start', overrides || {}),
    homeServerStop: () => ipcRenderer.invoke('home-server:stop'),
    homeServerCreateToken: (opts) => ipcRenderer.invoke('home-server:create-token', opts || {}),
    homeServerRevokeToken: (token) => ipcRenderer.invoke('home-server:revoke-token', token),
    homeServerUpsertUser: (user) => ipcRenderer.invoke('home-server:upsert-user', user),
    homeServerListConsent: () => ipcRenderer.invoke('home-server:list-consent'),
    homeServerDecideConsent: (payload) => ipcRenderer.invoke('home-server:decide-consent', payload),
    homeServer: {
        getStatus: () => ipcRenderer.invoke('home-server:get-status'),
        getConfig: () => ipcRenderer.invoke('home-server:get-config'),
        setConfig: (patch) => ipcRenderer.invoke('home-server:set-config', patch),
        start: (overrides) => ipcRenderer.invoke('home-server:start', overrides || {}),
        stop: () => ipcRenderer.invoke('home-server:stop'),
        createToken: (opts) => ipcRenderer.invoke('home-server:create-token', opts || {}),
        revokeToken: (token) => ipcRenderer.invoke('home-server:revoke-token', token),
        upsertUser: (user) => ipcRenderer.invoke('home-server:upsert-user', user),
        listConsent: () => ipcRenderer.invoke('home-server:list-consent'),
        decideConsent: (payload) => ipcRenderer.invoke('home-server:decide-consent', payload),
    },
    onHomeServerStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('home-server:status', handler);
        return () => ipcRenderer.removeListener('home-server:status', handler);
    },

    // Events
    onTorrentProgress: (callback) =>
    {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('torrent:progress', handler);
        return () => ipcRenderer.removeListener('torrent:progress', handler);
    },
    onPlaybackEvent: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('player:event', handler);
        return () => ipcRenderer.removeListener('player:event', handler);
    },

    // Home Server (also on tatakaiRuntime for settings UI)
    homeServerGetStatus: () => ipcRenderer.invoke('home-server:get-status'),
    homeServerGetConfig: () => ipcRenderer.invoke('home-server:get-config'),
    homeServerSetConfig: (patch) => ipcRenderer.invoke('home-server:set-config', patch),
    homeServerStart: (overrides) => ipcRenderer.invoke('home-server:start', overrides || {}),
    homeServerStop: () => ipcRenderer.invoke('home-server:stop'),
    homeServerCreateToken: (opts) => ipcRenderer.invoke('home-server:create-token', opts || {}),
    homeServerRevokeToken: (token) => ipcRenderer.invoke('home-server:revoke-token', token),
    homeServerUpsertUser: (user) => ipcRenderer.invoke('home-server:upsert-user', user),
    homeServerListConsent: () => ipcRenderer.invoke('home-server:list-consent'),
    homeServerDecideConsent: (payload) => ipcRenderer.invoke('home-server:decide-consent', payload),
    homeServer: {
        getStatus: () => ipcRenderer.invoke('home-server:get-status'),
        getConfig: () => ipcRenderer.invoke('home-server:get-config'),
        setConfig: (patch) => ipcRenderer.invoke('home-server:set-config', patch),
        start: (overrides) => ipcRenderer.invoke('home-server:start', overrides || {}),
        stop: () => ipcRenderer.invoke('home-server:stop'),
        createToken: (opts) => ipcRenderer.invoke('home-server:create-token', opts || {}),
        revokeToken: (token) => ipcRenderer.invoke('home-server:revoke-token', token),
        upsertUser: (user) => ipcRenderer.invoke('home-server:upsert-user', user),
        listConsent: () => ipcRenderer.invoke('home-server:list-consent'),
        decideConsent: (payload) => ipcRenderer.invoke('home-server:decide-consent', payload),
    },
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

    // Cleanup
    removeTorrentProgressListeners: () => ipcRenderer.removeAllListeners('torrent:progress'),
    removePlaybackEventListeners: () => ipcRenderer.removeAllListeners('player:event'),
});
