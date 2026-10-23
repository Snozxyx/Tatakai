// Stage original, checksum-pinned runtime files in each Tatakai installation.
// Upstream replaces its latest release; end users must not depend on that URL.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const workspace = fileURLToPath(new URL('../', import.meta.url));
const pins = JSON.parse(await fs.readFile(path.join(workspace, 'desktop/runtime/compatibility/aniyomi-artifacts.json'), 'utf8'));
const platform = process.argv[2];
if (!['desktop', 'android'].includes(platform)) throw Error('Expected desktop or android');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cache = path.join(workspace, '.cache/extension-feasibility/aniyomi-runtime');
async function artifact(pin) {
  const cached = await fs.readFile(path.join(cache, pin.name)).catch(() => null);
  if (cached?.length === pin.bytes && hash(cached) === pin.sha256) return cached;
  const response = await fetch(pin.url, { headers: { Accept: 'application/octet-stream' }, signal: AbortSignal.timeout(180000) });
  if (!response.ok || new URL(response.url).protocol !== 'https:') throw Error('Pinned runtime asset is unavailable. Update and validate the runtime lock before building; never substitute an unverified latest file.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > pin.bytes) throw Error('Runtime exceeded its pinned size'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (size !== pin.bytes || hash(bytes) !== pin.sha256) throw Error('Runtime artifact checksum mismatch');
  await fs.mkdir(cache, { recursive: true }); await fs.writeFile(path.join(cache, pin.name), bytes); return bytes;
}
let license = await fs.readFile(path.join(cache, 'LICENSE')).catch(() => null);
if (!license || hash(license) !== pins.licenseSha256) {
  const response = await fetch(`https://raw.githubusercontent.com/aayush2622/DartotsuExtensionBridge/${pins.commit}/LICENSE`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Could not retain runtime license'); license = Buffer.from(await response.arrayBuffer());
}
if (hash(license) !== pins.licenseSha256) throw Error('Runtime license checksum mismatch');
const source = `${pins.repository}/tree/${pins.commit}\nUnabandon Public License incorporating GPLv3; public source required\n${pins.verifier.source}\nAPK verifier: Apache-2.0\n`;
const output = platform === 'desktop'
  ? path.join(workspace, '.cache/compatibility-runtime-assets/desktop/aniyomi', pins.desktop.sha256)
  : path.join(workspace, 'android/app/src/main/assets/compatibility/aniyomi');
await fs.mkdir(output, { recursive: true });
for (const pin of platform === 'desktop' ? [pins.desktop, pins.verifier] : [pins.android]) {
  if (!/^[a-f0-9]{64}$/.test(pin.sha256)) throw Error('Invalid runtime lock');
  const name = platform === 'android' ? pin.sha256 + '.apk' : pin.name;
  await fs.writeFile(path.join(output, name), await artifact(pin));
}
await fs.writeFile(path.join(output, 'LICENSE'), license); await fs.writeFile(path.join(output, 'SOURCE.txt'), source);
if (platform === 'android') await fs.copyFile(path.join(workspace, 'desktop/runtime/compatibility/aniyomi-artifacts.json'), path.join(workspace, 'android/app/src/main/assets/aniyomi-runtime.json'));
console.log(`Staged verified original Aniyomi ${platform} runtime, license and source reference`);
