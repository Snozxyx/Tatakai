'use strict';

const nodeFs = require('node:fs');
const nodePath = require('node:path');
const nodeOs = require('node:os');
const { readThemeForSplash } = require('./theme-bridge.cjs');
const TRANSPARENT = '#00000000';
const FALLBACK = '#0f0b0c';
const DEFAULT_OPACITY = 0.82;
const MODES = new Set(['solid', 'system-blur', 'transparent']);
const linuxCompositorAvailable = () => !!process.env.WAYLAND_DISPLAY || !!process.env.DISPLAY && /gnome|kde|cinnamon|pantheon|budgie|unity|deepin|cosmic/i.test(process.env.XDG_CURRENT_DESKTOP || '');

function opaqueThemeColor(value) {
    if (typeof value !== 'string') return FALLBACK;
    if (/^#[a-f\d]{6}$/i.test(value)) return value.toLowerCase();
    const match = value.match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
    if (!match) return FALLBACK;
    const hue = ((Number(match[1]) % 360) + 360) % 360, saturation = Math.min(1, Number(match[2]) / 100), light = Math.min(1, Number(match[3]) / 100);
    const amplitude = saturation * Math.min(light, 1 - light);
    return '#' + [0, 8, 4].map(offset => {
        const position = (offset + hue / 30) % 12;
        return Math.round(255 * (light - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1)))).toString(16).padStart(2, '0');
    }).join('');
}

/** OS materials belong to BrowserWindow, independently of renderer theme drafts. */
function createWindowBackdropRuntime({ app, BrowserWindow, getMainWindow, fs = nodeFs, path = nodePath, platform = process.platform, release = nodeOs.release(), compositorAvailable = linuxCompositorAvailable(), logger }) {
    const file = path.join(app.getPath('userData'), 'backdrop.json');
    let attached;
    let solidColor = opaqueThemeColor(readThemeForSplash(app, fs, path).background);
    const window = () => attached && !attached.isDestroyed?.() ? attached : getMainWindow?.();
    function getCapabilities() {
        const api = window() || BrowserWindow?.prototype;
        const transparentSupported = typeof BrowserWindow === 'function' && (platform === 'win32' || platform === 'darwin' || platform === 'linux' && compositorAvailable);
        const capabilities = { platform, transparentSupported };
        if (platform === 'win32') {
            const build = Number(String(release).split('.')[2]);
            if (!(build >= 22621)) return { supported: false, ...capabilities, reason: 'System blur requires Windows 11 22H2 or later.' };
            if (typeof api?.setBackgroundMaterial !== 'function' || typeof api?.setBackgroundColor !== 'function') return { supported: false, ...capabilities, reason: 'This Electron runtime does not support Windows background materials.' };
            return { supported: true, ...capabilities, material: 'acrylic' };
        }
        if (platform === 'darwin') {
            if (typeof api?.setVibrancy !== 'function' || typeof api?.setBackgroundColor !== 'function') return { supported: false, ...capabilities, reason: 'This Electron runtime does not support macOS vibrancy.' };
            return { supported: true, ...capabilities, material: 'under-window' };
        }
        return { supported: false, ...capabilities, reason: 'Native system blur is available on supported Windows and macOS desktops.' };
    }
    function supported(value) { const capabilities = getCapabilities(); return value === 'solid' || (value === 'transparent' ? capabilities.transparentSupported : capabilities.supported); }
    let mode = 'solid', opacity = DEFAULT_OPACITY;
    try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (MODES.has(saved.mode) && (saved.opacity === undefined || typeof saved.opacity === 'number' && Number.isFinite(saved.opacity) && saved.opacity >= 0 && saved.opacity <= 1)) {
            mode = saved.mode; opacity = saved.opacity ?? DEFAULT_OPACITY;
        }
    } catch { /* Fresh or invalid preferences keep the original solid window. */ }
    let activeMode = supported(mode) ? mode : 'solid';
    let nextWindowMode = activeMode;
    function getSelection() {
        const capabilities = getCapabilities();
        return { mode, activeMode, opacity, restartRequired: mode !== activeMode, supported: activeMode === 'transparent' ? capabilities.transparentSupported : capabilities.supported, ...(activeMode === 'system-blur' ? { material: capabilities.material } : {}) };
    }
    function windowOptions(forceSolid = false) {
        nextWindowMode = !forceSolid && supported(mode) ? mode : 'solid';
        if (nextWindowMode === 'transparent') return { transparent: true, backgroundColor: TRANSPARENT, ...(platform === 'win32' && getCapabilities().supported ? { backgroundMaterial: 'none' } : {}) };
        if (nextWindowMode === 'solid') return { transparent: false, backgroundColor: solidColor, ...(platform === 'win32' && getCapabilities().supported ? { backgroundMaterial: 'none' } : {}) };
        return platform === 'darwin'
            ? { transparent: true, backgroundColor: TRANSPARENT, vibrancy: 'under-window', visualEffectState: 'active' }
            : { transparent: false, backgroundColor: TRANSPARENT, backgroundMaterial: 'acrylic' };
    }
    function apply(target, value) {
        if (platform === 'win32' && getCapabilities().supported && typeof target.setBackgroundMaterial === 'function') target.setBackgroundMaterial(value === 'system-blur' ? 'acrylic' : 'none');
        if (platform === 'darwin' && typeof target.setVibrancy === 'function') target.setVibrancy(value === 'system-blur' ? 'under-window' : null);
        target.setBackgroundColor(value === 'solid' ? solidColor : TRANSPARENT);
    }
    function constructorFallback(error) { nextWindowMode = 'solid'; logger?.warn?.('[Backdrop] Native constructor fell back to solid:', error?.message); }
    function attach(target) {
        attached = target;
        activeMode = nextWindowMode;
        try { apply(target, activeMode); }
        catch (error) {
            activeMode = 'solid';
            try { apply(target, activeMode); } catch { try { target.setBackgroundColor(solidColor); } catch { /* Keep the constructed window usable. */ } }
            logger?.warn?.('[Backdrop] Native startup fell back to solid:', error.message);
        }
        return getSelection();
    }
    function setSelection(input) {
        const previous = activeMode;
        if (!MODES.has(input?.mode)) return { success: false, ...getSelection(), error: 'Choose Solid, System blur, or Transparent.' };
        if (input.opacity !== undefined && (typeof input.opacity !== 'number' || !Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1)) return { success: false, ...getSelection(), error: 'Choose a surface opacity between 0 and 1.' };
        const capabilities = getCapabilities();
        if (input.mode === 'system-blur' && !capabilities.supported) return { success: false, ...getSelection(), error: capabilities.reason };
        if (input.mode === 'transparent' && !capabilities.transparentSupported) return { success: false, ...getSelection(), error: 'Native transparency requires an available compositor on this desktop.' };
        const target = window();
        if (!target || target.isDestroyed?.()) return { success: false, ...getSelection(), error: 'The desktop window is not available yet.' };
        const temporary = file + '.tmp';
        const restart = input.mode !== activeMode && (input.mode === 'transparent' || activeMode === 'transparent');
        try {
            if (!restart) apply(target, input.mode);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(temporary, JSON.stringify({ version: 1, mode: input.mode, opacity: input.opacity ?? opacity }), 'utf8');
            fs.renameSync(temporary, file);
            mode = input.mode;
            if (!restart) activeMode = input.mode;
            opacity = input.opacity ?? opacity;
            return { success: true, ...getSelection() };
        } catch (error) {
            if (!restart) try { apply(target, previous); } catch { /* Preserve the last confirmed preference; report the native failure. */ }
            try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* Only this transaction's temporary file. */ }
            return { success: false, ...getSelection(), error: error.message };
        }
    }
    function updateTheme(tokens) {
        solidColor = opaqueThemeColor(tokens?.background);
        const target = window();
        if (target && !target.isDestroyed?.()) target.setBackgroundColor(activeMode === 'solid' ? solidColor : TRANSPARENT);
    }
    return { getCapabilities, getSelection, windowOptions, attach, constructorFallback, setSelection, updateTheme };
}

module.exports = { createWindowBackdropRuntime, opaqueThemeColor, TRANSPARENT, DEFAULT_OPACITY };
