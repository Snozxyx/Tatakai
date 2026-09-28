#!/usr/bin/env node
/*
 * Repairs a broken Electron install without re-downloading.
 *
 * Root cause this guards against: on some Node versions (observed on Node 26)
 * Electron's own postinstall extractor (extract-zip / yauzl) silently aborts
 * after the first zip entry and exits 0, leaving node_modules/electron/dist
 * with only `locales/` and no `path.txt`. The download itself is fine — the
 * verified archive sits in @electron/get's cache — only extraction fails.
 *
 * This runs as the repo's own `postinstall` (after Electron's), and:
 *   1. no-ops when the install is already healthy (path.txt + binary present),
 *   2. otherwise finds the cached, checksum-verified zip and extracts it with a
 *      working extractor (unzip -> bsdtar -> PowerShell Expand-Archive),
 *   3. writes the platform-correct path.txt.
 *
 * Safe to run every install: it only acts when Electron is actually broken.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function log(msg) { console.log(`[fix-electron-install] ${msg}`); }

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
if (!fs.existsSync(electronDir)) {
  // Electron isn't a dependency here (e.g. web-only install) — nothing to do.
  process.exit(0);
}

const { version } = require(path.join(electronDir, 'package.json'));
const platform = process.env.npm_config_platform || process.platform;
const arch = process.env.npm_config_arch || process.arch;
const distDir = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');

// Relative path to the Electron binary inside dist/, per platform.
function binaryRelPath() {
  if (platform === 'darwin') return 'Electron.app/Contents/MacOS/Electron';
  if (platform === 'win32') return 'electron.exe';
  return 'electron';
}

function isHealthy() {
  if (!fs.existsSync(pathTxt)) return false;
  const rel = fs.readFileSync(pathTxt, 'utf8').trim();
  return !!rel && fs.existsSync(path.join(distDir, rel));
}

if (isHealthy()) process.exit(0);

log(`Electron ${version} install looks broken (missing dist binary / path.txt). Repairing from cache…`);

// --- Locate the cached archive that @electron/get already downloaded --------
function cacheRoots() {
  const roots = [];
  const envCache = process.env.ELECTRON_CACHE || process.env.electron_config_cache;
  if (envCache) roots.push(envCache);
  const home = os.homedir();
  if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    roots.push(path.join(local, 'electron', 'Cache'));
  } else if (platform === 'darwin') {
    roots.push(path.join(home, 'Library', 'Caches', 'electron'));
  } else {
    const xdg = process.env.XDG_CACHE_HOME || path.join(home, '.cache');
    roots.push(path.join(xdg, 'electron'));
  }
  return roots.filter(Boolean);
}

const zipName = `electron-v${version}-${platform}-${arch}.zip`;

// The zip lives one level down, under a sha-named subdir: <root>/<hash>/<zip>.
function findCachedZip() {
  for (const root of cacheRoots()) {
    if (!fs.existsSync(root)) continue;
    const direct = path.join(root, zipName);
    if (fs.existsSync(direct)) return direct;
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const candidate = path.join(root, e.name, zipName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const zip = findCachedZip();
if (!zip) {
  log(`Could not find ${zipName} in the Electron cache.`);
  log(`Re-run "npm install" (or set ELECTRON_CACHE) so @electron/get downloads it, then this script will extract it.`);
  process.exit(0); // non-fatal: don't break the whole install
}
log(`Using cached archive: ${zip}`);

// --- Extract with whatever working unzip tool is on this machine ------------
function has(cmd) {
  const probe = platform === 'win32'
    ? spawnSync('where', [cmd], { stdio: 'ignore' })
    : spawnSync('command', ['-v', cmd], { stdio: 'ignore', shell: true });
  return probe.status === 0;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status === 0;
}

function extract() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  // 1. `unzip` — present on macOS, Linux and Git-Bash for Windows.
  if (has('unzip') && run('unzip', ['-q', '-o', zip, '-d', distDir])) return true;

  // 2. Windows ships bsdtar as `tar`, which handles .zip (GNU tar on Linux does not).
  if (platform === 'win32' && has('tar') && run('tar', ['-xf', zip, '-C', distDir])) return true;

  // 3. PowerShell Expand-Archive — always available on Windows.
  if (platform === 'win32') {
    const ps = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${zip}' -DestinationPath '${distDir}' -Force`;
    if (run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps])) return true;
  }
  return false;
}

if (!extract()) {
  log('Extraction failed with every available tool (unzip / tar / PowerShell).');
  process.exit(1);
}

const rel = binaryRelPath();
if (!fs.existsSync(path.join(distDir, rel))) {
  log(`Extraction finished but ${rel} is missing from dist — archive may be for a different platform.`);
  process.exit(1);
}
fs.writeFileSync(pathTxt, rel);
log(`Repaired: wrote path.txt -> ${rel}`);
