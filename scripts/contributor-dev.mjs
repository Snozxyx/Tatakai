import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.join(root, 'tatakaiapi');
let server, api, closing = false;

async function requireFrontendPort() {
  const probe = net.createServer();
  try {
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(8090, '127.0.0.1', resolve); });
  } catch { throw Error('127.0.0.1:8090 is occupied. Stop your other development instance before npm run dev.'); }
  await new Promise(resolve => probe.close(resolve));
}

async function stop(code = 0) {
  if (closing) return;
  closing = true;
  await server?.close();
  if (api && api.exitCode === null) {
    const exited = once(api, 'exit').catch(() => []);
    if (api.connected) api.send({ type: 'tatakai-contributor-stop' });
    let timeout;
    const complete = await Promise.race([exited.then(() => true), new Promise(resolve => { timeout = setTimeout(() => resolve(false), 20000); })]);
    clearTimeout(timeout);
    if (!complete) {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/PID', String(api.pid), '/T', '/F'], { stdio: 'ignore' });
        await once(killer, 'exit');
      } else api.kill('SIGKILL');
      await exited;
    }
  }
  process.exitCode = code;
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
if (process.platform === 'win32') process.on('SIGBREAK', () => void stop());

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Contributor development requires Node.js 22 or later.');
  await requireFrontendPort();
  if (!fs.existsSync(path.join(apiRoot, 'scripts/contributor-dev.mjs'))) {
    throw Error('Clone the invited private TatakaiAPI repository into tatakaiapi. See docs/development.md.');
  }
  if (!fs.existsSync(path.join(apiRoot, 'node_modules/embedded-postgres'))) {
    throw Error('Install the private API dependencies first: npm --prefix tatakaiapi ci.');
  }
  server = await createServer({ root, mode: 'contributor', server: { host: '127.0.0.1', port: 8090, strictPort: true } });
  const proxy = server.config.server.proxy['/api/v3'];
  const target = new URL(typeof proxy === 'string' ? proxy : String(proxy.target));
  const expectedApiPort = Number(target.port || 80);
  // Vite uses only its separate contributor environment directory.
  const runtime = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|ALLUSERSPROFILE|USERNAME|USER|LOGNAME|SHELL|LANG|LC_[A-Z_]+|TZ|TERM|COLORTERM|CI|NO_COLOR|FORCE_COLOR|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|HTTP_PROXY|HTTPS_PROXY|NO_PROXY)$/i.test(key)));
  api = spawn(process.execPath, ['scripts/contributor-dev.mjs'], { cwd: apiRoot, env: runtime,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: process.platform === 'win32', windowsHide: true });
  api.stdout.pipe(process.stdout, { end: false });
  api.stderr.pipe(process.stderr, { end: false });
  api.on('exit', code => { if (!closing) { console.error(`Contributor API exited (${code}).`); void stop(code || 1); } });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Contributor API startup exceeded 90 seconds.')), 90000);
    api.once('error', error => { clearTimeout(timeout); reject(error); });
    api.once('exit', () => { clearTimeout(timeout); reject(Error('Contributor API startup failed.')); });
    api.on('message', message => {
      if (message?.type !== 'tatakai-contributor-ready') return;
      clearTimeout(timeout);
      if (message.port !== expectedApiPort) reject(Error('The API PORT and frontend VITE_API_V3_ORIGIN must use the same port.'));
      else resolve();
    });
  });
  if (closing) return;
  const health = await fetch(`http://127.0.0.1:${expectedApiPort}/health/ready`, { signal: AbortSignal.timeout(10000) });
  if (!health.ok) throw Error('The local API cannot reach development Supabase. Check the development keys and network before starting the frontend.');
  await server.listen();
  server.printUrls();
  console.log('Supabase: https://dev.tatakai.app; Studio: https://dev-studio.tatakai.app.');
}

main().catch(async error => { console.error(error.message); await stop(1); });
