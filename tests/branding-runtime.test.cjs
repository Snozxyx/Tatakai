const { describe, test, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createBrandingRuntime, updateWindowsShortcuts, updateLinuxDesktopEntry, windowsRelaunchDetails } = require('../desktop/services/branding-runtime.cjs');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-branding-test-'));
  const locations = { userData: path.join(directory, 'data'), desktop: path.join(directory, 'desktop'), appData: path.join(directory, 'appdata'), exe: path.join(directory, 'Tatakai.exe') };
  for (const value of Object.values(locations)) if (value !== locations.exe) fs.mkdirSync(value, { recursive: true });
  fs.writeFileSync(locations.exe, 'fixture');
  const resources = path.join(directory, 'assets'); fs.mkdirSync(resources);
  for (const variant of ['dark', 'light', 'monochrome', 'legacy']) for (const extension of ['png', 'ico']) fs.writeFileSync(path.join(resources, `${variant}.${extension}`), variant);
  return { directory, locations, resources, app: { isPackaged: true, getPath: key => locations[key] } };
}

describe('native launcher commitment', () => {
  test('a persistence failure restores the previous running icon and saved mode', () => {
    const { app, resources } = fixture(), icons = [];
    const fileSystem = Object.create(fs);
    fileSystem.writeFileSync = (file, ...args) => { if (file.endsWith('branding.json')) throw new Error('disk full'); return fs.writeFileSync(file, ...args); };
    const runtime = createBrandingRuntime({ app, resources, platform: 'win32', fileSystem, getMainWindow: () => ({ isDestroyed: () => false, setIcon: icon => icons.push(path.basename(icon)) }) });
    const result = runtime.setSelection({ mode: 'legacy' });
    expect(result.success).toBe(false);
    expect(runtime.getSelection().mode).toBe('auto');
    expect(icons).toEqual(['legacy.ico', 'dark.ico']);
    expect(runtime.setSelection({ mode: '../untrusted' }).success).toBe(false);
  });
  test('confirmed device-local icon survives a new runtime instance', () => {
    const { app, resources } = fixture();
    const runtime = createBrandingRuntime({ app, resources, platform: 'darwin' });
    expect(runtime.setSelection({ mode: 'monochrome' }).success).toBe(true);
    expect(createBrandingRuntime({ app, resources, platform: 'darwin' }).getSelection()).toMatchObject({ mode: 'monochrome', variant: 'monochrome' });
  });
  test('Windows metadata uses durable selected icon and rolls back with the window on failed Save', () => {
    const { app, resources, locations } = fixture(), details = [];
    const fileSystem = Object.create(fs);
    fileSystem.writeFileSync = (file, ...args) => { if (file.endsWith('branding.json')) throw new Error('disk full'); return fs.writeFileSync(file, ...args); };
    const runtime = createBrandingRuntime({ app, resources, platform: 'win32', fileSystem, getMainWindow: () => ({ isDestroyed: () => false, setIcon() {}, setAppDetails: value => details.push(value) }) });
    expect(runtime.setSelection({ mode: 'legacy' }).success).toBe(false);
    expect(details.map(value => path.basename(value.appIconPath))).toEqual(['legacy.ico', 'dark.ico']);
    expect(details[0]).toMatchObject({ appId: 'app.tatakai.me', appIconIndex: 0, relaunchDisplayName: 'Tatakai', relaunchCommand: '"' + locations.exe + '"' });
    expect(details[0].appIconPath).toBe(path.join(locations.userData, 'branding', 'legacy.ico'));
  });
  test('development relaunch includes the app path and other platforms never use Windows metadata', () => {
    const { app, resources, locations } = fixture();
    const developer = { ...app, isPackaged: false, getAppPath: () => 'E:\\Code with spaces\\Tatakai' };
    expect(windowsRelaunchDetails(developer, 'icon.ico').relaunchCommand).toBe('"' + locations.exe + '" "E:\\Code with spaces\\Tatakai"');
    const runtime = createBrandingRuntime({ app, resources, platform: 'linux', getMainWindow: () => ({ isDestroyed: () => false, setIcon() {}, setAppDetails: () => { throw new Error('Windows API called on Linux'); } }) });
    expect(runtime.setSelection({ mode: 'light' }).success).toBe(true);
  });
});
test('Windows updates only its existing verified shortcuts and preserves launch details', () => {
  const { app, locations } = fixture();
  const desktop = path.join(locations.desktop, 'Tatakai.lnk'); fs.writeFileSync(desktop, 'fixture');
  const start = path.join(locations.appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Tatakai.lnk'); fs.mkdirSync(path.dirname(start), { recursive: true }); fs.writeFileSync(start, 'fixture');
  const writes = [];
  const original = { target: locations.exe, args: '--deep-link value', cwd: path.dirname(locations.exe), appUserModelId: 'app.tatakai.me' };
  updateWindowsShortcuts({ app, icon: 'legacy.ico', shell: { readShortcutLink: file => file === desktop ? original : { target: 'some-other-app.exe' }, writeShortcutLink: (...input) => { writes.push(input); return true; } } });
  expect(writes).toHaveLength(1);
  expect(writes[0]).toEqual([desktop, 'update', { ...original, icon: 'legacy.ico', iconIndex: 0 }]);
});
test('Linux keeps menu identity and uses durable AppImage paths', () => {
  const { app, directory } = fixture();
  const appimage = path.join(directory, 'Tatakai portable.AppImage'); fs.writeFileSync(appimage, 'fixture');
  const dataHome = path.join(directory, 'xdg'), environment = { XDG_DATA_HOME: dataHome, APPIMAGE: appimage };
  expect(updateLinuxDesktopEntry({ app, icon: '/persistent/dark.png', environment })).toBe(true);
  const file = path.join(dataHome, 'applications', 'tatakai.desktop');
  const original = fs.readFileSync(file, 'utf8');
  expect(original).toContain(`Exec="${appimage.replace(/\\/g, '\\\\')}" %U`);
  fs.appendFileSync(file, 'CustomUserField=keep\n');
  expect(updateLinuxDesktopEntry({ app, icon: '/persistent/legacy.png', environment })).toBe(true);
  expect(fs.readFileSync(file, 'utf8')).toContain('CustomUserField=keep');
  expect(fs.readFileSync(file, 'utf8')).toContain('Icon=/persistent/legacy.png');
});
