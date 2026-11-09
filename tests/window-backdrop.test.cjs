const { test, expect } = require('bun:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWindowBackdropRuntime, opaqueThemeColor, TRANSPARENT } = require('../desktop/services/window-backdrop.cjs');
const registerBackdrop = require('../desktop/ipc/ipc-backdrop.cjs');
const registerTheme = require('../desktop/ipc/ipc-theme.cjs');

class NativeWindow {
  constructor(options) { this.options = options; this.calls = []; this.bounds = { width: options.width || 1280, height: options.height || 720 }; this.maximized = true; this.resizable = true; this.maximizable = true; this.webContents = {}; }
  isDestroyed() { return false; }
  setBackgroundColor(value) { this.color = value; this.calls.push(['color', value]); }
  setBackgroundMaterial(value) { if (this.failMaterial === value) { this.failMaterial = undefined; throw new Error('Native material failed'); } this.material = value; this.calls.push(['material', value]); }
  setVibrancy(value) { this.vibrancy = value; this.calls.push(['vibrancy', value]); }
  setBounds() { throw new Error('Backdrop must not resize the window'); }
  setResizable() { throw new Error('Backdrop must not change resize support'); }
  maximize() { throw new Error('Backdrop must not change maximize state'); }
  setOpacity() { throw new Error('Surface opacity must not fade the whole window'); }
}
function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-backdrop-test-'));
  const app = { getPath: () => directory };
  let window;
  const runtime = createWindowBackdropRuntime({ app, BrowserWindow: NativeWindow, getMainWindow: () => window, platform: 'win32', release: '10.0.26100', ...options });
  const construct = () => { window = new NativeWindow({ width: 1280, height: 720, minWidth: 1000, minHeight: 600, ...runtime.windowOptions() }); runtime.attach(window); return window; };
  const close = () => { if (!path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'tatakai-backdrop-test-'))) throw Error('Unexpected temporary path'); fs.rmSync(directory, { recursive: true, force: true }); };
  return { runtime, construct, app, directory, close, get window() { return window; } };
}

test('Windows starts solid and explicit blur uses acrylic/alpha without changing sizing or window opacity', () => {
  const f = fixture();
  try {
    expect(f.runtime.getCapabilities()).toMatchObject({ supported: true, material: 'acrylic' });
    expect(f.runtime.windowOptions()).toEqual({ transparent: false, backgroundColor: '#0f0b0c', backgroundMaterial: 'none' });
    const window = f.construct();
    expect(f.runtime.getSelection()).toMatchObject({ mode: 'solid', opacity: 0.82 });
    expect(f.runtime.setSelection({ mode: 'solid' })).toMatchObject({ success: true, mode: 'solid' });
    expect(window.material).toBe('none'); expect(window.color).toBe('#0f0b0c');
    expect(f.runtime.setSelection({ mode: 'system-blur', opacity: 0.25 })).toMatchObject({ success: true, mode: 'system-blur', opacity: 0.25, material: 'acrylic' });
    expect(f.runtime.windowOptions()).toEqual({ transparent: false, backgroundColor: TRANSPARENT, backgroundMaterial: 'acrylic' });
    f.runtime.updateTheme({ background: '0 0% 100%' }); expect(window.color).toBe(TRANSPARENT);
    expect(window.bounds).toEqual({ width: 1280, height: 720 }); expect(window.maximized).toBe(true); expect(window.resizable).toBe(true); expect(window.maximizable).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(f.directory, 'backdrop.json'), 'utf8')); expect(saved.mode).toBe('system-blur'); expect(saved.opacity).toBe(0.25);
    const reloaded = createWindowBackdropRuntime({ app: f.app, BrowserWindow: NativeWindow, getMainWindow: () => window, platform: 'win32', release: '10.0.26100' }); expect(reloaded.getSelection()).toMatchObject({ mode: 'system-blur', opacity: 0.25 });
  } finally { f.close(); }
});
test('unsupported Windows/Linux stay solid while macOS uses under-window vibrancy', () => {
  for (const config of [{ platform: 'win32', release: '10.0.19045' }, { platform: 'linux' }]) {
    const f = fixture(config); try { expect(f.runtime.getCapabilities().supported).toBe(false); expect(f.runtime.windowOptions().backgroundMaterial).toBeUndefined(); f.construct(); expect(f.runtime.setSelection({ mode: 'system-blur' }).success).toBe(false); expect(f.runtime.getSelection().mode).toBe('solid'); } finally { f.close(); }
  }
  const f = fixture({ platform: 'darwin' }); try { expect(f.runtime.windowOptions()).toMatchObject({ backgroundColor: '#0f0b0c' }); const window = f.construct(); expect(f.runtime.setSelection({ mode: 'system-blur' }).success).toBe(true); expect(f.runtime.windowOptions()).toMatchObject({ vibrancy: 'under-window', visualEffectState: 'active', transparent: true, backgroundColor: TRANSPARENT }); expect(window.vibrancy).toBe('under-window'); expect(f.runtime.setSelection({ mode: 'solid' }).success).toBe(true); expect(window.vibrancy).toBeNull(); expect(window.resizable).toBe(true); expect(window.maximized).toBe(true); } finally { f.close(); }
});
test('native and persistence failures restore confirmed mode/material without changing bounds', () => {
  const f = fixture(); try {
    const window = f.construct(); f.runtime.setSelection({ mode: 'solid' });
    const previous = fs.readFileSync(path.join(f.directory, 'backdrop.json'), 'utf8');
    window.failMaterial = 'acrylic'; expect(f.runtime.setSelection({ mode: 'system-blur' }).success).toBe(false); expect(f.runtime.getSelection().mode).toBe('solid'); expect(window.material).toBe('none'); expect(fs.readFileSync(path.join(f.directory, 'backdrop.json'), 'utf8')).toBe(previous);
    const brokenFs = Object.create(fs); brokenFs.renameSync = () => { throw new Error('Settings are locked'); };
    const failed = createWindowBackdropRuntime({ app: f.app, BrowserWindow: NativeWindow, getMainWindow: () => window, platform: 'win32', release: '10.0.26100', fs: brokenFs }); failed.attach(window);
    expect(failed.setSelection({ mode: 'system-blur' })).toMatchObject({ success: false, mode: 'solid' }); expect(window.material).toBe('none'); expect(window.color).toBe('#0f0b0c'); expect(fs.readFileSync(path.join(f.directory, 'backdrop.json'), 'utf8')).toBe(previous); expect(window.bounds).toEqual({ width: 1280, height: 720 });
    expect(failed.setSelection({ mode: 'invalid' }).success).toBe(false);
    expect(failed.setSelection({ mode: 'solid', opacity: 2 }).success).toBe(false);
  } finally { f.close(); }
});
test('IPC accepts only the main window and later theme persistence keeps native blur transparent', async () => {
  const f = fixture(); try {
    const window = f.construct(), handlers = new Map(), ipc = { handle: (name, handler) => handlers.set(name, handler) };
    registerBackdrop(ipc, f.runtime, () => window); registerTheme(ipc, f.app, fs, path, f.runtime);
    expect(handlers.get('backdrop:set-selection')({ sender: {} }, { mode: 'solid' }).success).toBe(false);
    expect(handlers.get('backdrop:set-selection')({ sender: window.webContents }, { mode: 'system-blur' }).success).toBe(true);
    const result = await handlers.get('theme:persist')({}, { theme: 'light-minimal', background: '0 0% 100%' });
    expect(result.success).toBe(true); expect(window.color).toBe(TRANSPARENT); expect(window.material).toBe('acrylic');
    handlers.get('backdrop:set-selection')({ sender: window.webContents }, { mode: 'solid' }); expect(window.color).toBe('#ffffff');
    expect(opaqueThemeColor('url(javascript:bad)')).toBe('#0f0b0c');
  } finally { f.close(); }
});
test('plain transparency is constructor-only and pending changes never fake alpha on an opaque window', () => {
  const f = fixture(); try {
    const window = f.construct(), before = window.calls.length;
    expect(f.runtime.getCapabilities().transparentSupported).toBe(true);
    expect(f.runtime.setSelection({ mode: 'transparent', opacity: 0.3 })).toMatchObject({ success: true, mode: 'transparent', activeMode: 'solid', restartRequired: true, opacity: 0.3 });
    expect(window.calls.length).toBe(before);
    f.runtime.updateTheme({ background: '0 0% 100%' }); expect(window.color).toBe('#ffffff');
    const restarted = createWindowBackdropRuntime({ app: f.app, BrowserWindow: NativeWindow, getMainWindow: () => fresh, platform: 'win32', release: '10.0.26100' });
    const options = restarted.windowOptions(); expect(options).toEqual({ transparent: true, backgroundColor: TRANSPARENT, backgroundMaterial: 'none' });
    const fresh = new NativeWindow(options); restarted.attach(fresh);
    expect(restarted.getSelection()).toMatchObject({ mode: 'transparent', activeMode: 'transparent', restartRequired: false });
    expect(fresh.calls.some(call => call[0] === 'material' && call[1] === 'acrylic')).toBe(false);
    expect(restarted.setSelection({ mode: 'transparent', opacity: 0.5 })).toMatchObject({ success: true, activeMode: 'transparent', restartRequired: false, opacity: 0.5 });
    const count = fresh.calls.length; expect(restarted.setSelection({ mode: 'solid' })).toMatchObject({ success: true, mode: 'solid', activeMode: 'transparent', restartRequired: true }); expect(fresh.calls.length).toBe(count);
    restarted.updateTheme({ background: '0 0% 100%' }); expect(fresh.color).toBe(TRANSPARENT);
    expect(restarted.setSelection({ mode: 'system-blur' })).toMatchObject({ activeMode: 'transparent', restartRequired: true });
  } finally { f.close(); }
});
test('pending transparency persistence failure preserves active/saved mode, while Linux requires a compositor', () => {
  const f = fixture(); try {
    const window = f.construct(); f.runtime.setSelection({ mode: 'solid' }); const before = window.calls.length;
    const brokenFs = Object.create(fs); brokenFs.renameSync = () => { throw new Error('Settings are locked'); };
    const runtime = createWindowBackdropRuntime({ app: f.app, BrowserWindow: NativeWindow, getMainWindow: () => window, platform: 'win32', release: '10.0.26100', fs: brokenFs });
    expect(runtime.setSelection({ mode: 'transparent', opacity: 0.2 })).toMatchObject({ success: false, mode: 'solid', activeMode: 'solid', restartRequired: false, opacity: 0.82 }); expect(window.calls.length).toBe(before);
    const unavailable = createWindowBackdropRuntime({ app: f.app, BrowserWindow: NativeWindow, getMainWindow: () => window, platform: 'linux', compositorAvailable: false }); expect(unavailable.getCapabilities().transparentSupported).toBe(false); expect(unavailable.setSelection({ mode: 'transparent' }).success).toBe(false);
    const available = createWindowBackdropRuntime({ app: f.app, BrowserWindow: NativeWindow, getMainWindow: () => window, platform: 'linux', compositorAvailable: true }); expect(available.getCapabilities()).toMatchObject({ supported: false, transparentSupported: true });
  } finally { f.close(); }
});
