'use strict';

/**
 * external-player.cjs
 *
 * Detects and launches external media players (MPV, VLC, IINA, MPC-HC/BE)
 * across Windows, macOS, and Linux. Used by the desktop IPC layer to open
 * torrent stream URLs in external players.
 */

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execFileAsync = promisify(execFile);

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

function windowsInstallPaths(...relativePaths) {
    const roots = [...new Set([
        process.env.ProgramW6432,
        process.env.ProgramFiles || 'C:\\Program Files',
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        process.env.LOCALAPPDATA && path.win32.join(process.env.LOCALAPPDATA, 'Programs'),
    ].filter(Boolean))];
    return roots.flatMap(root => relativePaths.map(relative => path.win32.join(root, relative)));
}

// ── Known player definitions ──────────────────────────────────────────────────
// Each player carries per-platform install-path lists; `execNames` is used for
// the PATH fallback (`where` on Windows, `which` elsewhere).

const PLAYERS = [
    {
        id: 'mpv',
        name: 'MPV',
        description: 'Lightweight, scriptable media player',
        args: (url, opts) => [
            url,
            '--no-terminal',
            '--force-window=yes',
            opts?.startTime ? `--start=${opts.startTime}` : null,
            opts?.title ? `--title=${opts.title}` : null,
            ...Object.entries(opts?.headers || {}).filter(([key, value]) => !/[\r\n]/.test(key + value)).map(([key, value]) => `--http-header-fields-append=${key}: ${value}`),
            ...(opts?.subtitles || []).map(sub => `--sub-file=${sub.url}`),
        ].filter(Boolean),
        windowsPaths: [
            ...windowsInstallPaths('mpv\\mpv.exe'),
            process.env.APPDATA ? `${process.env.APPDATA}\\mpv\\mpv.exe` : null,
        ].filter(Boolean),
        macPaths: [
            '/opt/homebrew/bin/mpv',
            '/usr/local/bin/mpv',
            '/Applications/mpv.app/Contents/MacOS/mpv',
        ],
        linuxPaths: [
            '/usr/bin/mpv',
            '/usr/local/bin/mpv',
            '/snap/bin/mpv',
            '/var/lib/flatpak/exports/bin/io.mpv.Mpv',
        ],
        execNames: ['mpv.exe', 'mpv'],
    },
    {
        id: 'iina',
        name: 'IINA',
        description: 'Modern media player for macOS',
        // IINA's CLI shim accepts mpv-style options behind an `--mpv-` prefix.
        args: (url, opts) => [
            url,
            opts?.startTime ? `--mpv-start=${opts.startTime}` : null,
            opts?.title ? `--mpv-title=${opts.title}` : null,
            ...Object.entries(opts?.headers || {}).filter(([key, value]) => !/[\r\n]/.test(key + value)).map(([key, value]) => `--mpv-http-header-fields-append=${key}: ${value}`),
            ...(opts?.subtitles || []).map(sub => `--mpv-sub-file=${sub.url}`),
        ].filter(Boolean),
        macPaths: [
            '/Applications/IINA.app/Contents/MacOS/iina-cli',
            '/Applications/IINA.app/Contents/MacOS/IINA',
        ],
        execNames: ['iina-cli', 'iina'],
    },
    {
        id: 'vlc',
        name: 'VLC',
        description: 'VideoLAN media player',
        args: (url, opts) => [
            url,
            '--play-and-exit',
            opts?.startTime ? `--start-time=${opts.startTime}` : null,
            opts?.headers?.Referer ? `:http-referrer=${opts.headers.Referer}` : null,
            opts?.headers?.['User-Agent'] ? `:http-user-agent=${opts.headers['User-Agent']}` : null,
            opts?.subtitles?.[0]?.url ? `--sub-file=${opts.subtitles[0].url}` : null,
        ].filter(Boolean),
        windowsPaths: windowsInstallPaths('VideoLAN\\VLC\\vlc.exe'),
        macPaths: [
            '/Applications/VLC.app/Contents/MacOS/VLC',
        ],
        linuxPaths: [
            '/usr/bin/vlc',
            '/snap/bin/vlc',
            '/var/lib/flatpak/exports/bin/org.videolan.VLC',
        ],
        execNames: ['vlc.exe', 'vlc'],
    },
    {
        id: 'mpc-hc',
        name: 'MPC-HC',
        description: 'Media Player Classic - Home Cinema',
        args: (url, opts) => [
            url,
            '/play',
            opts?.startTime ? `/start ${Math.round((opts.startTime || 0) * 1000)}` : null,
        ].filter(Boolean),
        windowsPaths: windowsInstallPaths(
            'MPC-HC\\mpc-hc64.exe', 'MPC-HC\\mpc-hc.exe',
            'K-Lite Codec Pack\\MPC-HC64\\mpc-hc64.exe',
            'K-Lite Codec Pack\\MPC-HC\\mpc-hc.exe',
        ),
        execNames: ['mpc-hc64.exe', 'mpc-hc.exe'],
    },
    {
        id: 'mpc-be',
        name: 'MPC-BE',
        description: 'Media Player Classic - Black Edition',
        args: (url) => [url, '/play'],
        windowsPaths: windowsInstallPaths(
            'MPC-BE x64\\mpc-be64.exe', 'MPC-BE\\mpc-be64.exe', 'MPC-BE\\mpc-be.exe',
        ),
        execNames: ['mpc-be64.exe', 'mpc-be.exe'],
    },
];

/**
 * Returns the install-path candidates for a player on the current OS.
 */
function platformPaths(player) {
    if (IS_WIN) return player.windowsPaths || [];
    if (IS_MAC) return player.macPaths || [];
    return player.linuxPaths || [];
}

/**
 * All known install paths across every OS — used when reverse-matching a
 * stored `executablePath` back to its player definition.
 */
function allKnownPaths(player) {
    return [
        ...(player.windowsPaths || []),
        ...(player.macPaths || []),
        ...(player.linuxPaths || []),
    ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fileExists(fs, filePath) {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Try to find a player executable via PATH: `where` on Windows, `which`
 * elsewhere. Returns null if not found.
 */
async function findInPath(execName) {
    // `where` (Windows) and `which` (macOS/Linux) both print the resolved path.
    const finder = IS_WIN ? 'where' : 'which';
    try {
        const { stdout } = await execFileAsync(finder, [execName], { timeout: 3000, windowsHide: true });
        const first = stdout.trim().split('\n')[0]?.trim();
        return first || null;
    } catch {
        return null;
    }
}

/** Find installer-registered executables, including installs on another drive. */
async function findInWindowsRegistry(player, fs) {
    if (!IS_WIN) return null;
    for (const name of player.execNames.filter(name => name.endsWith('.exe'))) {
        const key = `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${name}`;
        const candidates = await Promise.all([
            [`HKCU\\${key}`, '/ve'],
            [`HKLM\\${key}`, '/ve', '/reg:64'],
            [`HKLM\\${key}`, '/ve', '/reg:32'],
        ].map(async args => {
            try {
                const registryTool = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
                const { stdout } = await execFileAsync(registryTool, ['query', ...args], { timeout: 3000, windowsHide: true });
                const value = stdout.split(/\r?\n/).map(line => /\sREG_(?:EXPAND_)?SZ\s+(.+)$/.exec(line)?.[1]).find(Boolean);
                if (!value) return null;
                const executablePath = value.trim().replace(/^"(.*)"$/, '$1').replace(/%([^%]+)%/g, (match, key) => {
                    const envKey = Object.keys(process.env).find(name => name.toLowerCase() === key.toLowerCase());
                    return envKey ? process.env[envKey] : match;
                });
                return await fileExists(fs, executablePath) ? executablePath : null;
            } catch { return null; }
        }));
        const match = candidates.find(Boolean);
        if (match) return match;
    }
    return null;
}

// ── Detect installed players ──────────────────────────────────────────────────

/**
 * Detect all installed external players.
 * Returns array of { id, name, description, executablePath }.
 *
 * @param {object} fs - Node.js fs module
 */
async function detectExternalPlayers(fs) {
    const detected = await Promise.all(PLAYERS.map(async player => {
        let execPath = null;

        // Check known install paths for the current OS first
        for (const p of platformPaths(player)) {
            if (await fileExists(fs, p)) { execPath = p; break; }
        }

        if (!execPath) execPath = await findInWindowsRegistry(player, fs);

        // Fall back to PATH search
        if (!execPath) {
            for (const name of player.execNames) {
                execPath = await findInPath(name);
                if (execPath) break;
            }
        }

        if (execPath) {
            return {
                id: player.id,
                name: player.name,
                description: player.description,
                executablePath: execPath,
            };
        }
        return null;
    }));

    return detected.filter(Boolean);
}

// ── Launch player ─────────────────────────────────────────────────────────────

/**
 * Launch an external player with the given stream URL.
 *
 * @param {string} executablePath - Absolute path to the player binary
 * @param {string} streamUrl - HTTP stream URL (from torrent stream server)
 * @param {{ startTime?: number, title?: string }} [options]
 * @param {object} logger
 * @returns {{ success: boolean, pid?: number, error?: string }}
 */
function launchExternalPlayer(executablePath, streamUrl, options = {}, logger) {
    if (!executablePath || !/^(https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|\/)/i.test(String(streamUrl || ''))) {
        return { success: false, error: 'Select an installed player and a playable media URL.' };
    }
    // Find the player definition for correct arg building. Match against every
    // OS's known paths (a stored pref may have been captured on any platform)
    // plus the exec-name suffix from a PATH-resolved binary.
    const executableName = IS_WIN ? path.win32.basename(executablePath).toLowerCase() : path.basename(executablePath);
    const playerDef = PLAYERS.find((p) =>
        allKnownPaths(p).includes(executablePath) ||
        p.execNames?.some((n) => executableName === n)
    ) ?? PLAYERS[0]; // default to MPV-style if unknown

    const args = playerDef.args(streamUrl, options);

    logger.info(`[ExternalPlayer] Launching ${playerDef.name}`);

    try {
        const proc = spawn(executablePath, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        proc.unref();

        return { success: true, pid: proc.pid, player: playerDef.name };
    } catch (err) {
        logger.error('[ExternalPlayer] Launch failed:', err.message);
        return { success: false, error: err.message };
    }
}

// ── Preference storage ────────────────────────────────────────────────────────

function getPreferencePath(app, path) {
    return path.join(app.getPath('userData'), 'external-player-pref.json');
}

function loadPlayerPreference(app, fs, path) {
    try {
        const p = getPreferencePath(app, path);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return null;
}

function savePlayerPreference(executablePath, app, fs, path) {
    try {
        fs.writeFileSync(getPreferencePath(app, path), JSON.stringify({ executablePath }), 'utf8');
    } catch {}
}

module.exports = {
    detectExternalPlayers,
    launchExternalPlayer,
    loadPlayerPreference,
    savePlayerPreference,
};
