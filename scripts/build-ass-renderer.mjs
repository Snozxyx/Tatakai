import { build } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildFingerprint, isBuildCurrent, saveBuildStamp } from './native-build-cache.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildAssRenderer() {
  const cache = path.join(root, '.cache/ass-renderer-build');
  await mkdir(cache, { recursive: true });
  const lock = path.join(cache, 'build.lock');
  const deadline = Date.now() + 60000;
  let handle;
  // Two Vite sessions can start together; serialize writes to the shared assets.
  while (handle === undefined) {
    try { handle = openSync(lock, 'wx'); writeFileSync(handle, String(process.pid)); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = Number(readFileSync(lock, 'utf8'));
        if (owner > 0) process.kill(owner, 0);
      } catch (ownerError) {
        if (ownerError.code === 'ESRCH') { try { unlinkSync(lock); } catch {} continue; }
      }
      if (Date.now() > deadline) throw new Error('Timed out waiting for the subtitle asset build');
      await delay(100);
    }
  }
  try { await buildAssRendererLocked(cache); }
  finally { closeSync(handle); unlinkSync(lock); }
}

async function buildAssRendererLocked(cache) {
  const output = path.join(root, 'public/assets/libass');
  const stamp = path.join(cache, 'current.json');
  const fingerprint = buildFingerprint([
    fileURLToPath(import.meta.url), path.join(root, 'scripts/native-build-cache.mjs'),
    path.join(root, 'src/core/player'), path.join(root, 'node_modules/jassub/dist'),
    path.join(root, 'node_modules/jassub/LICENSE'), path.join(root, 'node_modules/jassub-legacy/dist'),
    path.join(root, 'node_modules/esbuild/package.json'),
  ]);
  if (isBuildCurrent(stamp, fingerprint)) return;
  await mkdir(output, { recursive: true });
  await build({ entryPoints: [path.join(root, 'node_modules/jassub/dist/worker/worker.js')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true,
    outfile: path.join(output, 'worker.js') });
  for (const file of ['jassub-worker.wasm', 'jassub-worker-modern.wasm', 'jassub-worker.js', 'jassub-worker-modern.js'])
    await copyFile(path.join(root, 'node_modules/jassub/dist/wasm', file), path.join(output, file));
  for (const [source, dest] of [['jassub-worker.js','legacy-worker.js'], ['jassub-worker.wasm','legacy-worker.wasm'],
    ['jassub-worker-modern.wasm','legacy-worker-modern.wasm'], ['jassub-worker.wasm.js','legacy-worker.wasm.js']])
    await copyFile(path.join(root, 'node_modules/jassub-legacy/dist', source), path.join(output, dest));
  await copyFile(path.join(root, 'node_modules/jassub/dist/default.woff2'), path.join(output, 'default.woff2'));
  await copyFile(path.join(root, 'node_modules/jassub/LICENSE'), path.join(output, 'LICENSE'));
  await copyFile(path.join(root, 'node_modules/jassub-legacy/dist/COPYRIGHT'), path.join(output, 'COPYRIGHT'));
  await build({ entryPoints: [path.join(root, 'src/core/player/ass-native.ts')], bundle: true, format: 'iife',
    platform: 'browser', target: 'es2018', minify: true, outfile: path.join(output, 'native.js') });
  await writeFile(path.join(output, 'native.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#ass{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}#ass{position:relative}</style><div id="ass"></div><script src="native.js"></script>');
  saveBuildStamp(stamp, fingerprint, ['worker.js', 'native.js', 'native.html', 'jassub-worker.wasm', 'jassub-worker-modern.wasm', 'jassub-worker.js', 'jassub-worker-modern.js', 'legacy-worker.js', 'legacy-worker.wasm', 'legacy-worker-modern.wasm', 'legacy-worker.wasm.js', 'default.woff2', 'LICENSE', 'COPYRIGHT'].map(file => path.join(output, file)));
}
export function assRendererAssetsPlugin() { return { name: 'tatakai-ass-assets', async buildStart() { await buildAssRenderer(); } }; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildAssRenderer();
