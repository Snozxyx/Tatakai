// Reproduce the reported source using a copy of its original APK in isolated storage.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createDecipheriv } from 'node:crypto';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { AniyomiHost, pins } from '../desktop/runtime/compatibility/aniyomi.cjs';
import { SuwayomiHost } from '../desktop/runtime/compatibility/suwayomi.cjs';
const input = path.join(process.env.APPDATA, 'Tatakai/compatibility/aniyomi');
const state = JSON.parse(await fs.readFile(path.join(input, 'state.json'), 'utf8'));
const pkg = Object.values(state.packages).find(row => row.pkgName === 'eu.kanade.tachiyomi.animeextension.all.anizone');
if (!pkg) throw Error('The reported original AniZone fixture is not installed');
const root = await fs.mkdtemp(path.resolve('.cache/extension-feasibility/anizone-'));
await fs.mkdir(path.join(root, 'artifacts'));
const name = pkg.id + '.' + pkg.digest + '.apk';
await fs.copyFile(path.join(input, 'artifacts', name), path.join(root, 'artifacts', name));
const packages = process.env.ANIYOMI_FULL_INVENTORY_PROBE === '1' ? state.packages : { [pkg.id]: pkg };
await fs.writeFile(path.join(root, 'state.json'), JSON.stringify({ version: 1, repositories: [], packages, enabled: {} }));
const second = process.env.ANIYOMI_MERGE_PROBE === '1' ? Object.values(packages).find(row => row.pkgName === 'eu.kanade.tachiyomi.animeextension.all.jellyfin') : null;
if (second) { const artifact = second.id + '.' + second.digest + '.apk'; await fs.copyFile(path.join(input, 'artifacts', artifact), path.join(root, 'artifacts', artifact)); }
const javaHost = new SuwayomiHost(path.resolve('.cache/extension-feasibility/installation-progress-Kz1aSl/mihon'));
// Session-dependent sources must use real cookie semantics, not a no-op fixture.
const main = path.join(root, 'cookie-session.cjs');
await fs.writeFile(main, `const {app,session}=require('electron');app.setPath('userData',${JSON.stringify(path.join(root, 'browser-data'))});app.whenReady().then(()=>{global.sourceSession=session.fromPartition('persist:anizone-probe')});app.on('window-all-closed',()=>{});`);
const app = await electron.launch({ args: [main] });
await app.evaluate(async ({ app }) => { await app.whenReady(); });
const userAgent = await app.evaluate(() => global.sourceSession.getUserAgent());
const cookieActivity = { reads: 0, writes: 0, readsWithCookies: 0 };
const host = new AniyomiHost({ root, javaHost, bundledRoot: path.resolve('.cache/compatibility-runtime-assets/desktop'), bundledRequired: true, browser: { initialize() {}, session: { getUserAgent: () => userAgent, cookies: {
  get: async filter => { const rows = await app.evaluate((_electron, value) => global.sourceSession.cookies.get(value), filter); cookieActivity.reads++; if (rows.length) cookieActivity.readsWithCookies++; return rows; },
  set: async cookie => { await app.evaluate((_electron, value) => global.sourceSession.cookies.set(value), cookie); cookieActivity.writes++; },
} } } });
const call = body => host.request({ requestId: randomUUID(), ecosystem: 'aniyomi', ...body });
async function mediaSample(url, headers = {}) {
  const response = await fetch(url, { headers: { ...headers, Range: 'bytes=0-32767' }, signal: AbortSignal.timeout(30000) });
  assert(response.ok, `Media request failed with HTTP ${response.status}`);
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  try { while (bytes < 32768) { const part = await reader.read(); if (part.done) break; chunks.push(part.value); bytes += part.value.length; } }
  finally { await reader.cancel(); }
  const sample = Buffer.concat(chunks).subarray(0, 32768);
  assert(sample.length, 'Empty media response');
  assert(!/^\s*(?:<!doctype|<html)/i.test(sample.toString('utf8', 0, 100)), 'Media request returned an HTML page');
  return { sample, status: response.status, contentType: response.headers.get('content-type'), bytes: sample.length };
}
const evidence = { recordedAt: new Date().toISOString(), environment: 'Original installed APK copied to isolated host storage with a fresh real Chromium cookie store; user preferences/cookies/library are not copied', runtime: pins.version, runtimeSha256: pins.desktop.sha256, parserStack: '32 MiB', package: pkg.pkgName, version: pkg.version, sha256: pkg.digest, installedPackageReceipts: Object.keys(packages).length, copiedApks: second ? 2 : 1, cookieActivity, checks: [] };
try {
  const cookies = new AniyomiHost({ root, javaHost, browser: host.browser });
  const callbackChild = { stdin: { destroyed: false, write() {} } }; cookies.child = callbackChild;
  try {
    const set = headers => cookies.callback({ event: 'setCookies', callbackId: 1, arguments: ['https://api.source.test/session/login', headers] }, callbackChild);
    await set(['parent=present; Domain=.source.test; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300', 'scoped=present; HttpOnly']);
    const siblings = await host.browser.session.cookies.get({ url: 'https://other.source.test/' });
    assert(siblings.some(cookie => cookie.name === 'parent' && cookie.httpOnly && cookie.expirationDate));
    assert(!siblings.some(cookie => cookie.name === 'scoped'));
    assert(!(await host.browser.session.cookies.get({ url: 'https://api.source.test/other' })).some(cookie => cookie.name === 'scoped'));
    assert((await host.browser.session.cookies.get({ url: 'https://api.source.test/session/next' })).some(cookie => cookie.name === 'scoped'));
    await set(['parent=; Domain=.source.test; Path=/; Max-Age=0']);
    assert(!(await host.browser.session.cookies.get({ url: 'https://other.source.test/' })).some(cookie => cookie.name === 'parent'));
    evidence.checks.push({ op: 'real-cookie-scope-expiry-deletion', success: true });
  } finally { cookies.child = null; cookies.stop(); }
  await host.prepare();
  const inventory = await call({ op: 'sources' }); const source = inventory.find(row => row.packageId === pkg.id); assert(source); await call({ op: 'setEnabled', sourceId: source.id, enabled: true });
  let found;
  for (const op of ['preferences', 'browse', 'search']) {
    try { const result = await call({ op, sourceId: source.id, query: 'Naruto', page: 1 }); if (op === 'search') found = result.results[0]; const check = { op, success: true, results: result.results?.length ?? result.length }; evidence.checks.push(check); console.log(JSON.stringify(check)); }
    catch (error) { const check = { op, success: false, error: error.message }; evidence.checks.push(check); console.log(JSON.stringify(check)); }
  }
  if (second) {
    const other = inventory.find(row => row.packageId === second.id); assert(other);
    const preferences = await call({ op: 'preferences', sourceId: other.id }); assert(preferences.length > 0);
    const restored = await call({ op: 'search', sourceId: source.id, query: 'Naruto', page: 1 }); assert(restored.results.length > 0);
    evidence.checks.push({ op: 'lazy-package-registry-merge', success: true, secondPackagePreferences: preferences.length, firstPackageSearch: restored.results.length });
  }
  if (found && process.env.ANIYOMI_RESOLVE_PROBE === '1') {
    try {
      const detail = await call({ op: 'info', sourceId: source.id, id: found.id }); assert(detail.title); assert(detail.entries.length > 0); evidence.checks.push({ op: 'info', success: true, episodes: detail.entries.length }); console.log('Original title/episodes: ' + detail.entries.length);
      const video = await call({ op: 'resolve', sourceId: source.id, id: found.id, episodeId: detail.entries[0].id }); assert(video.sources.length > 0); const check = { op: 'resolve', success: true, streams: video.sources.length, subtitles: video.sources.reduce((count, row) => count + (row.subtitles?.length || 0), 0) }; evidence.checks.push(check); console.log(JSON.stringify(check));
      if (process.env.ANIYOMI_MEDIA_PROBE === '1') {
        const stream = video.sources[0], media = await mediaSample(stream.url, stream.headers);
        assert(stream.sourceType !== 'mp4' || media.sample.subarray(4, 8).toString() === 'ftyp', 'Expected original MP4 bytes');
        assert(stream.sourceType !== 'hls' || media.sample.toString().startsWith('#EXTM3U'), 'Expected an HLS playlist');
        evidence.checks.push({ op: 'media-bytes', success: true, type: stream.sourceType, status: media.status, contentType: media.contentType, bytes: media.bytes });
        if (stream.sourceType === 'hls') {
          let playlist = media.sample.toString(), address = stream.url, playlistAddress = address, segment;
          for (let depth = 0; depth < 3; depth++) {
            const entry = playlist.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')); assert(entry, 'Empty HLS playlist');
            playlistAddress = address; address = new URL(entry, address).href; segment = await mediaSample(address, stream.headers);
            if (!segment.sample.toString('utf8', 0, 7).startsWith('#EXTM3U')) break;
            playlist = segment.sample.toString(); segment = undefined;
          }
          assert(segment, 'HLS nesting exceeds the probe limit');
          let sample = segment.sample, encryption;
          const key = playlist.split(/\r?\n/).find(line => line.startsWith('#EXT-X-KEY:'));
          if (key?.includes('METHOD=AES-128')) {
            const uri = /URI="([^"]+)"/.exec(key)?.[1]; assert(uri, 'Missing HLS key address');
            const secret = await mediaSample(new URL(uri, playlistAddress).href, stream.headers); assert.equal(secret.sample.length, 16, 'Expected a standard AES-128 HLS key');
            const sequence = /#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(playlist)?.[1] || '0';
            const ivHex = /IV=0x([a-fA-F0-9]+)/.exec(key)?.[1] || BigInt(sequence).toString(16);
            const iv = Buffer.from(ivHex.padStart(32, '0'), 'hex'); assert.equal(iv.length, 16);
            const decipher = createDecipheriv('aes-128-cbc', secret.sample, iv); decipher.setAutoPadding(false);
            sample = decipher.update(sample.subarray(0, sample.length - sample.length % 16)); encryption = 'AES-128';
          }
          assert(sample[0] === 0x47 && sample[188] === 0x47 || /^(ftyp|styp|moof)$/.test(sample.subarray(4, 8).toString()), 'Expected video segment bytes');
          evidence.checks.push({ op: 'hls-segment-bytes', success: true, status: segment.status, bytes: segment.bytes, encryption });
        }
        const track = stream.subtitles?.[0]; assert(track, 'No subtitle track to validate'); const subtitle = await mediaSample(track.url, track.headers);
        assert(/WEBVTT|\[Script Info\]|\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(subtitle.sample.toString()), 'Expected subtitle text');
        evidence.checks.push({ op: 'subtitle-bytes', success: true, status: subtitle.status, contentType: subtitle.contentType, bytes: subtitle.bytes });
      }
    } catch (error) { evidence.checks.push({ op: 'title/stream', success: false, error: error.message }); console.log('Original title/stream: ' + error.message); }
  }
} finally { host.stop(); await app.close(); await fs.writeFile('.cache/extension-feasibility/anizone-evidence.json', JSON.stringify(evidence, null, 2)); }
assert(evidence.checks.every(check => check.success), 'Original AniZone probe failed; see anizone-evidence.json');
if (process.env.ANIYOMI_RESOLVE_PROBE === '1') assert(evidence.checks.some(check => check.op === 'resolve'), 'No original stream was resolved');
