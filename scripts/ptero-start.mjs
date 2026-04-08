import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const port = Number(process.env.PORT || process.env.SERVER_PORT || 8088);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const viteBin = join(scriptDir, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const distIndex = join(scriptDir, '..', 'dist', 'index.html');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runOrExit(command, args, stepName) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[ptero-start] Failed to run ${stepName}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[ptero-start] ${stepName} exited with code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(viteBin)) {
  console.warn('[ptero-start] Vite binary not found. Installing dev dependencies...');
  runOrExit(npmCmd, ['install', '--include=dev'], 'npm install --include=dev');
}

if (!existsSync(viteBin)) {
  console.error('[ptero-start] Vite is still missing after install. Check package install logs.');
  process.exit(1);
}

const skipBuild = process.env.PTERO_SKIP_BUILD === '1' && existsSync(distIndex);
if (skipBuild) {
  console.log('[ptero-start] Skipping build (PTERO_SKIP_BUILD=1 and dist/index.html exists).');
} else {
  runOrExit(process.execPath, [viteBin, 'build'], 'vite build');
}

console.log(`[ptero-start] Starting preview on 0.0.0.0:${port}`);

const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
  stdio: 'inherit',
  env: process.env,
});

preview.on('error', (err) => {
  console.error('[ptero-start] Failed to start preview process:', err.message);
  process.exit(1);
});

preview.on('exit', (code) => {
  process.exit(code ?? 0);
});