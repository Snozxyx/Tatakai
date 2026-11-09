'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const VARIANTS = ['dark', 'light', 'monochrome', 'legacy'];
const MODES = ['auto', ...VARIANTS];
function quoteRelaunchArgument(value) {
  return '"' + String(value).replace(/(\\*)"/g, (_, slashes) => slashes + slashes + '\\"').replace(/(\\+)$/, slashes => slashes + slashes) + '"';
}
function windowsRelaunchDetails(app, icon) {
  const args = [app.getPath('exe')];
  if (!app.isPackaged && typeof app.getAppPath === 'function') args.push(app.getAppPath());
  return { appId: 'app.tatakai.me', appIconPath: icon, appIconIndex: 0, relaunchDisplayName: 'Tatakai', relaunchCommand: args.map(quoteRelaunchArgument).join(' ') };
}

function readSelection(app, fileSystem = fs) {
  try {
    const saved = JSON.parse(fileSystem.readFileSync(path.join(app.getPath('userData'), 'branding.json'), 'utf8'));
    if (MODES.includes(saved.mode) && VARIANTS.includes(saved.variant)) return { success: true, mode: saved.mode, variant: saved.variant };
  } catch { /* first launch */ }
  return { success: true, mode: 'auto', variant: 'dark' };
}

function canonical(file, fileSystem = fs, platform = process.platform) {
  let resolved = path.resolve(file);
  try { resolved = fileSystem.realpathSync(resolved); } catch { /* use resolved path */ }
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function updateWindowsShortcuts({ app, shell, icon, fileSystem = fs }) {
  if (!app.isPackaged || !shell?.readShortcutLink || !shell?.writeShortcutLink) return [];
  const candidates = [path.join(app.getPath('desktop'), 'Tatakai.lnk'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Tatakai.lnk')];
  const updated = [];
  for (const file of candidates) {
    try {
      if (!fileSystem.existsSync(file) || fileSystem.lstatSync(file).isSymbolicLink()) continue;
      const original = shell.readShortcutLink(file);
      if (!original.target || canonical(original.target, fileSystem, 'win32') !== canonical(app.getPath('exe'), fileSystem, 'win32')) continue;
      if (shell.writeShortcutLink(file, 'update', { ...original, icon, iconIndex: 0 })) updated.push(file);
    } catch { /* owned shortcuts are best effort; running icons still update */ }
  }
  return updated;
}

function quoteDesktopExec(file) { return '"' + file.replace(/[\\"`$]/g, character => '\\' + character) + '"'; }
function desktopExecTarget(contents) {
  const command = /^Exec=(.*)$/m.exec(contents)?.[1]?.trim();
  if (!command) return '';
  const quoted = /^"((?:\\.|[^"\\])*)"(?:\s|$)/.exec(command);
  return quoted ? quoted[1].replace(/\\([\\"`$])/g, '$1') : command.split(/\s/)[0];
}
function updateLinuxDesktopEntry({ app, icon, fileSystem = fs, environment = process.env, homedir = os.homedir() }) {
  if (!app.isPackaged) return false;
  const dataHome = environment.XDG_DATA_HOME && path.isAbsolute(environment.XDG_DATA_HOME) ? environment.XDG_DATA_HOME : path.join(homedir, '.local', 'share');
  const directory = path.join(dataHome, 'applications'), file = path.join(directory, 'tatakai.desktop');
  const executable = environment.APPIMAGE && path.isAbsolute(environment.APPIMAGE) && fileSystem.existsSync(environment.APPIMAGE) ? environment.APPIMAGE : app.getPath('exe');
  let contents;
  try {
    if (fileSystem.existsSync(file)) {
      if (fileSystem.lstatSync(file).isSymbolicLink()) return false;
      contents = fileSystem.readFileSync(file, 'utf8');
      const target = desktopExecTarget(contents);
      const legacyOwned = /^Name=Tatakai$/m.test(contents) && /^Comment=Tatakai Desktop$/m.test(contents) && /^MimeType=x-scheme-handler\/tatakai;$/m.test(contents);
      if (!/^X-Tatakai-Managed=true$/m.test(contents) && !legacyOwned && canonical(target, fileSystem, 'linux') !== canonical(executable, fileSystem, 'linux')) return false;
      contents = /^Icon=.*$/m.test(contents) ? contents.replace(/^Icon=.*$/m, `Icon=${icon}`) : contents.trimEnd() + `\nIcon=${icon}\n`;
      if (!/^X-Tatakai-Managed=true$/m.test(contents)) contents = contents.trimEnd() + '\nX-Tatakai-Managed=true\n';
    } else {
      contents = ['[Desktop Entry]', 'Name=Tatakai', 'Comment=Tatakai Desktop', `Exec=${quoteDesktopExec(executable)} %U`, `Icon=${icon}`, 'Terminal=false', 'Type=Application', 'Categories=AudioVideo;', 'MimeType=x-scheme-handler/tatakai;', 'StartupNotify=true', 'X-Tatakai-Managed=true', ''].join('\n');
    }
    fileSystem.mkdirSync(directory, { recursive: true });
    fileSystem.writeFileSync(file, contents, 'utf8');
    return true;
  } catch { return false; }
}

function createBrandingRuntime({ app, shell, getMainWindow, getTray, resources, platform = process.platform, fileSystem = fs, logger }) {
  let selection = readSelection(app, fileSystem);
  function getCapabilities() {
    const limitations = platform === 'win32' ? ['customization.launcherWindows'] : platform === 'darwin' ? ['customization.launcherMac'] : ['customization.launcherLinux'];
    return { success: true, supported: ['win32', 'darwin', 'linux'].includes(platform), platform, automatic: true, limitations };
  }
  function asset(variant, extension) {
    const source = path.join(resources, `${variant}.${extension}`), directory = path.join(app.getPath('userData'), 'branding');
    if (!fileSystem.existsSync(source)) throw new Error('The selected icon is unavailable in this installation');
    fileSystem.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, `${variant}.${extension}`);
    fileSystem.copyFileSync(source, destination);
    return destination;
  }
  function apply(variant, shortcuts = true) {
    const png = asset(variant, 'png'), window = getMainWindow?.(), tray = getTray?.();
    if (platform === 'darwin') app.dock?.setIcon?.(png);
    else if (window && !window.isDestroyed()) {
      const icon = platform === 'win32' ? asset(variant, 'ico') : png;
      window.setIcon?.(icon);
      if (platform === 'win32' && typeof window.setAppDetails === 'function') window.setAppDetails(windowsRelaunchDetails(app, icon));
    }
    tray?.setImage?.(png);
    if (shortcuts && platform === 'win32') updateWindowsShortcuts({ app, shell, icon: asset(variant, 'ico'), fileSystem });
    if (shortcuts && platform === 'linux') updateLinuxDesktopEntry({ app, icon: png, fileSystem });
    return png;
  }
  function setSelection(input = {}) {
    if (!MODES.includes(input.mode)) return { ...selection, success: false, error: 'Unknown launcher icon choice' };
    const variant = input.mode === 'auto' ? input.resolvedVariant : input.mode;
    if (!VARIANTS.includes(variant)) return { ...selection, success: false, error: 'Unknown resolved launcher icon' };
    const previous = selection;
    try {
      apply(variant);
      const next = { success: true, mode: input.mode, variant };
      fileSystem.writeFileSync(path.join(app.getPath('userData'), 'branding.json'), JSON.stringify(next), 'utf8');
      selection = next;
      return { ...selection, limitations: getCapabilities().limitations };
    } catch (error) {
      try { apply(previous.variant); } catch { /* retain previously saved selection */ }
      logger?.warn?.('Launcher icon could not be applied', { error: String(error) });
      return { ...previous, success: false, error: error.message };
    }
  }
  function restore() { try { return apply(selection.variant); } catch { return null; } }
  return { getCapabilities, getSelection: () => ({ ...selection }), setSelection, restore };
}
module.exports = { createBrandingRuntime, readSelection, updateWindowsShortcuts, updateLinuxDesktopEntry, quoteDesktopExec, desktopExecTarget, windowsRelaunchDetails };
