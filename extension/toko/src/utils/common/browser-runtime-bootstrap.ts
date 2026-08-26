import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs';
import nodePath from 'node:path';

type BootstrapResult = {
  hasXvfb: boolean;
  chromePath: string | null;
};

const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const AUTO_INSTALL_ENABLED = String(process.env.CF_BYPASS_AUTO_INSTALL || 'true').toLowerCase() !== 'false';
const LOCAL_BROWSER_CACHE_DIR =
  process.env.CF_BYPASS_BROWSER_CACHE_DIR || nodePath.join(process.cwd(), '.cache', 'browser-runtime');

const CHROME_CANDIDATES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
  'chrome',
  'chrome.exe',
  'msedge.exe',
];

const WINDOWS_CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Chromium/Application/chrome.exe',
  'C:/Program Files (x86)/Chromium/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const PORTABLE_BROWSER_EXECUTABLE_NAMES = isWindows
  ? ['chrome.exe', 'msedge.exe']
  : isMac
    ? ['Google Chrome for Testing', 'Google Chrome']
    : ['chrome', 'chromium', 'google-chrome', 'google-chrome-stable'];

const commandExists = (command: string): boolean => {
  const isPathLike = command.includes('/') || command.includes('\\') || nodePath.isAbsolute(command);
  if (isPathLike) {
    try {
      accessSync(command, isWindows ? constants.F_OK : constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const locator = isWindows ? 'where' : 'which';
  const probe = spawnSync(locator, [command], { encoding: 'utf8' });
  return probe.status === 0 && probe.stdout.trim().length > 0;
};

const resolveCommandPath = (command: string): string | null => {
  const locator = isWindows ? 'where' : 'which';
  const probe = spawnSync(locator, [command], { encoding: 'utf8' });
  if (probe.status !== 0) return null;
  const lines = probe.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[0] : null;
};

const resolveKnownWindowsChrome = (): string | null => {
  if (!isWindows) return null;
  for (const candidate of WINDOWS_CHROME_PATHS) {
    if (commandExists(candidate)) return candidate;
  }
  return null;
};

const findExecutableRecursively = (root: string, executableNames: string[], maxDepth = 8): string | null => {
  if (!existsSync(root)) return null;

  const visited = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (visited.has(current.dir)) continue;
    visited.add(current.dir);

    let entries: string[] = [];
    try {
      entries = readdirSync(current.dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = nodePath.join(current.dir, entry);
      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isFile()) {
        if (!executableNames.some((name) => entry.toLowerCase() === name.toLowerCase())) {
          continue;
        }
        if (commandExists(fullPath)) {
          return fullPath;
        }
      }

      if (stats.isDirectory() && current.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return null;
};

const resolvePortableInstalledChrome = (): string | null => {
  return findExecutableRecursively(LOCAL_BROWSER_CACHE_DIR, PORTABLE_BROWSER_EXECUTABLE_NAMES, 10);
};

const runPortableBrowserInstall = (): boolean => {
  if (!AUTO_INSTALL_ENABLED) return false;
  const npxCommand = isWindows ? 'npx.cmd' : 'npx';
  const install = spawnSync(
    npxCommand,
    [
      '-y',
      '@puppeteer/browsers',
      'install',
      'chrome@stable',
      '--path',
      LOCAL_BROWSER_CACHE_DIR,
    ],
    { stdio: 'ignore' }
  );
  return install.status === 0;
};

let bootstrapped: BootstrapResult | null = null;

export const ensureBrowserRuntime = (): BootstrapResult => {
  if (bootstrapped) return bootstrapped;

  let hasXvfb = commandExists('Xvfb');
  let chromePath = (process.env.CHROME_PATH || '').trim();
  if (chromePath.length === 0 || !commandExists(chromePath)) {
    chromePath = '';
    for (const candidate of CHROME_CANDIDATES) {
      const resolved = resolveCommandPath(candidate);
      if (resolved) {
        chromePath = resolved;
        break;
      }
    }
    if (!chromePath) chromePath = resolveKnownWindowsChrome() || '';
    if (!chromePath) chromePath = resolvePortableInstalledChrome() || '';
  }

  if (!chromePath && AUTO_INSTALL_ENABLED) {
    if (runPortableBrowserInstall()) {
      chromePath = resolvePortableInstalledChrome() || '';
    }
  }

  if (chromePath) {
    process.env.CHROME_PATH = chromePath;
  }

  bootstrapped = {
    hasXvfb,
    chromePath: chromePath || null,
  };

  return bootstrapped;
};
