// Compare repository transports through the unmodified original local Mihon host.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SuwayomiHost } = require('../desktop/runtime/compatibility/suwayomi.cjs');
const root = await fs.mkdtemp(path.resolve('.cache/extension-feasibility/repository-'));
const host = new SuwayomiHost(root);
Object.defineProperty(host, 'distribution', { value: path.resolve('.cache/extension-feasibility/suwayomi/Suwayomi-Server-v2.4.2366-windows-x64') });
host.ready = async () => host.filesPresent();
const evidence = [];
try {
  await host.start();
  if (process.env.COMPATIBILITY_BROWSER_PROFILE) {
    const { userAgent } = JSON.parse(await fs.readFile(process.env.COMPATIBILITY_BROWSER_PROFILE));
    await host.command('cookies', { url: 'https://github.com/', cookies: [], userAgent });
  }
  for (const url of ['https://github.com/keiyoushi/extensions/raw/repo/index.pb', 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.pb', 'https://raw.githubusercontent.com/keiyoushi/extensions/c886cdfc0c1d1bbb997f652396347c64f044729a/index.pb']) {
    try {
      const response = await fetch(url); const bytes = Buffer.from(await response.arrayBuffer());
      const value = await host.graphql('mutation($u: String!) { addExtensionStore(input: { indexUrl: $u }) { extensionStore { name indexUrl } } }', { u: url });
      evidence.push({ url, status: 'demonstrated', firstBytes: bytes.subarray(0, 4).toString('hex'), bytes: bytes.length, value });
    } catch (error) { evidence.push({ url, status: 'blocked', error: error.message }); }
    console.log(JSON.stringify(evidence.at(-1)));
  }
} finally { host.stop(); await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({ recordedAt: new Date().toISOString(), evidence }, null, 2)); }
