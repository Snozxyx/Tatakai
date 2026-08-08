'use strict';

/**
 * external-player.cjs
 *
 * Detects and launches external media players (MPV, VLC, MPC-HC) on Windows.
 * Used by the desktop IPC layer to open torrent stream URLs in external players.
 */

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// ── Known player definitions ──────────────────────────────────────────────────

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
        ].filter(Boolean),
        windowsPaths: [
            'C:\\Program Files\\mpv\\mpv.exe',
            'C:\\Program Files (x86)\\mpv\\mpv.exe',
            process.env.APPDATA ? `${process.env.APPDATA}\\mpv\\mpv.exe` : null,
        ].filter(Boolean),
        execNames: ['mpv.exe', 'mpv'],
    },
    {
        id: 'vlc',
        name: 'VLC',
        description: 'VideoLAN media player',
        args: (url, opts) => [
            url,
            '--play-and-exit',
            opts?.startTime ? `--start-time=${opts.startTime}` : null,
        ].filter(Boolean),
        windowsPaths: [
            'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
            'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
        ],
        execNames: ['vlc.exe'],
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
        windowsPaths: [
            'C:\\Program Files\\MPC-HC\\mpc-hc64.exe',
            'C:\\Program Files\\MPC-HC\\mpc-hc.exe',
            'C:\\Program Files (x86)\\MPC-HC\\mpc-hc64.exe',
            'C:\\Program Files (x86)\\MPC-HC\\mpc-hc.exe',
        ],
        execNames: ['mpc-hc64.exe', 'mpc-hc.exe'],
    },
    {
        id: 'mpc-be',
        name: 'MPC-BE',
        description: 'Media Player Classic - Black Edition',
        args: (url) => [url, '/play'],
        windowsPaths: [
            'C:\\Program Files\\MPC-BE x64\\mpc-be64.exe',
            'C:\\Program Files (x86)\\MPC-BE\\mpc-be.exe',
        ],
        execNames: ['mpc-be64.exe', 'mpc-be.exe'],
    },
];

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
 * Try to find a player executable via PATH using `where` (Windows).
 * Returns null if not found.
 */
async function findInPath(execName) {
    try {
        const { stdout } = await execFileAsync('where', [execName], { timeout: 3000 });
        const first = stdout.trim().split('\n')[0]?.trim();
        return first || null;
    } catch {
        return null;
    }
}

// ── Detect installed players ──────────────────────────────────────────────────

/**
 * Detect all installed external players.
 * Returns array of { id, name, description, executablePath }.
 *
 * @param {object} fs - Node.js fs module
 */
async function detectExternalPlayers(fs) {
    const detected = [];

    for (const player of PLAYERS) {
        let execPath = null;

        // Check known Windows install paths first
        for (const p of (player.windowsPaths || [])) {
            if (await fileExists(fs, p)) { execPath = p; break; }
        }

        // Fall back to PATH search
        if (!execPath) {
            for (const name of player.execNames) {
                execPath = await findInPath(name);
                if (execPath) break;
            }
        }

        if (execPath) {
            detected.push({
                id: player.id,
                name: player.name,
                description: player.description,
                executablePath: execPath,
            });
        }
    }

    return detected;
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
    // Find the player definition for correct arg building
    const playerDef = PLAYERS.find((p) =>
        p.windowsPaths?.includes(executablePath) ||
        p.execNames?.some((n) => executablePath.endsWith(n))
    ) ?? PLAYERS[0]; // default to MPV-style if unknown

    const args = playerDef.args(streamUrl, options);

    logger.info(`[ExternalPlayer] Launching ${executablePath} with args: ${args.join(' ')}`);

    try {
        const proc = spawn(executablePath, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
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
