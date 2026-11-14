import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const started = performance.now();
const children = new Set();
let server;
let stopping = false;

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  await server?.close();
  process.exitCode = code;
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

function build(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args],
      { cwd: root, stdio: 'inherit', windowsHide: true });
    children.add(child);
    child.once('error', reject);
    child.once('close', code => {
      children.delete(child);
      code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`));
    });
  });
}

try {
  process.env.NODE_ENV = 'development';
  // Load Vite alongside the independent native helpers, without nested npm runs.
  const force = process.argv.includes('--force') ? ['--force'] : [];
  await Promise.all([
    build('./build-translate-engine.mjs', ['--dev', ...force]),
    build('./build-rtx-video.mjs', ['--dev', ...force]),
    (async () => {
      const { createServer } = await import('vite');
      server = await createServer({ root, configLoader: 'native',
        cacheDir: fileURLToPath(new URL('../.cache/vite-electron', import.meta.url)),
        server: { host: '127.0.0.1', strictPort: false } });
      if (stopping) await server.close();
      else await server.listen();
    })(),
  ]);
  if (stopping) { await server?.close(); } else {
    const address = server.httpServer.address();
    const url = `http://127.0.0.1:${address.port}`;
    console.log(`Electron dev ready in ${((performance.now() - started) / 1000).toFixed(2)}s at ${url}`);
    // Smoke checks exercise startup and cleanup without opening a desktop window.
    if (process.argv.includes('--check')) {
      for (const route of ['/@vite/client', '/', '/src/main.tsx']) {
        const response = await fetch(`${url}${route}`, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Vite readiness check failed for ${route} (${response.status})`);
        const content = await response.text();
        if (route === '/src/main.tsx' && !content.includes('/src/lib/media-jsx/jsx-dev-runtime')) {
          throw new Error('Renderer check failed: custom development JSX runtime missing');
        }
      }
      console.log('Vite client, app HTML and renderer JSX checks passed.');
      await shutdown(0);
    } else {
      const env = { ...process.env, ELECTRON_DEVTOOLS: '1', ELECTRON_DEV_SERVER_URL: url };
      delete env.ELECTRON_RUN_AS_NODE;
      const electron = spawn(require('electron'), [fileURLToPath(new URL('../desktop/main.cjs', import.meta.url))],
        { cwd: root, stdio: 'inherit', windowsHide: true, env });
      children.add(electron);
      electron.once('error', error => { console.error(error.message); void shutdown(1); });
      electron.once('close', code => { children.delete(electron); void shutdown(code ?? 1); });
    }
  }
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}
