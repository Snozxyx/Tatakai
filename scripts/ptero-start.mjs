import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const port = Number(process.env.PORT || process.env.SERVER_PORT || 8088);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const viteBin = join(scriptDir, '..', 'node_modules', 'vite', 'bin', 'vite.js');

const build = spawnSync(process.execPath, [viteBin, 'build'], {
  stdio: 'inherit',
  env: process.env,
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
  stdio: 'inherit',
  env: process.env,
});

preview.on('exit', (code) => {
  process.exit(code ?? 0);
});