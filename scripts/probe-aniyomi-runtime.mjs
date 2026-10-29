import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { AniyomiHost, pins } from '../desktop/runtime/compatibility/aniyomi.cjs';
import { SuwayomiHost } from '../desktop/runtime/compatibility/suwayomi.cjs';
import { jellyfinFixture } from './fixtures/jellyfin-local.mjs';
const root = await fs.mkdtemp(path.resolve('.cache/extension-feasibility/aniyomi-test-'));
const javaHost = new SuwayomiHost(path.resolve('.cache/extension-feasibility/installation-progress-Kz1aSl/mihon'));
const browser = { initialize() {}, session: { getUserAgent: () => 'Tatakai local compatibility fixture', cookies: { get: async () => [], set: async () => {} } } };
const hostOptions = { root, javaHost, browser, bundledRoot: path.resolve('.cache/compatibility-runtime-assets/desktop'), bundledRequired: true };
let host = new AniyomiHost(hostOptions);
const evidence = { recordedAt: new Date().toISOString(), platform: `${process.platform}/${process.arch}`, environment: 'Production native host via CLI; installed app/device validation is separate', root, runtime: pins, checks: [], packages: [] };
async function step(name, run) {
  const began = performance.now();
  try { const result = await run(); evidence.checks.push({ name, status: 'demonstrated', milliseconds: Math.round(performance.now() - began) }); console.log(name); return result; }
  catch (error) { evidence.checks.push({ name, status: 'blocked', error: error.message }); throw error; }
}
const request = payload => host.request({ ecosystem: 'aniyomi', requestId: randomUUID(), ...payload });
try {
  await step('Verified bundled runtime preparation without upstream downloads', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () => { throw Error('Bundled runtime attempted a network download'); };
    try { await host.prepare(); } finally { globalThis.fetch = fetchOriginal; }
  });
  await step('Original runtime and Tatakai bootstrap start', () => host.start());
  for (const fixture of [{ owner: 'yuzono', repo: 'anime-repo', commit: '8c497bde62b8b3b2f3b99dcde5cf4e1c971336da', name: 'Jellyfin', kind: 'watch' }, { owner: 'keiyoushi', repo: 'extensions', commit: 'b00de1d361ab08eb38567ecacfd267c154130592', name: 'MangaDex', kind: 'read' }]) {
    const { commit } = fixture;
    assert.match(commit, /^[a-f0-9]{40}$/);
    const url = `https://raw.githubusercontent.com/${fixture.owner}/${fixture.repo}/${commit}/${fixture.kind === 'read' ? 'index.pb' : 'index.min.json'}`;
    await step(`${fixture.name}: original repository discovery`, () => request({ op: 'addRepository', url }));
    const packages = await request({ op: 'packages' }), pkg = packages.find(pkg => pkg.name === fixture.name && pkg.kind === fixture.kind);
    assert(pkg, 'Original fixture not in repository');
    await step(`${fixture.name}: signed original APK installation and source factory loading`, () => request({ op: 'install', packageId: pkg.id }));
    if (fixture.kind === 'watch' && process.env.BULK_NATIVE_PROBE === '1') {
      await step('Repeated original APK candidate validation releases coroutine pools', async () => {
        const workers = () => (execFileSync('jcmd', [String(host.child.pid), 'Thread.print'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).match(/"DefaultDispatcher-worker/g) || []).length;
        const before = workers();
        for (let count = 0; count < 5; count++) await request({ op: 'install', packageId: pkg.id });
        await new Promise(resolve => setTimeout(resolve, 150)); const after = workers();
        assert(after <= before + 2, `Candidate thread pools accumulated: ${before} -> ${after}`);
        evidence.candidateCleanup = { originalApkReinstallChecks: 5, dispatcherWorkersBefore: before, dispatcherWorkersAfter: after };
      });
    }
    const installed = (await request({ op: 'installedPackages' })).find(row => row.id === pkg.id);
    evidence.packages.push({ name: pkg.name, repository: url, commit, version: installed.version, digest: installed.digest, signer: installed.signer, sources: installed.sources.length, apkUrl: installed.url });
    const sources = (await request({ op: 'sources' })).filter(source => source.packageId === pkg.id);
    const nativeSources = (await host.call({ op: 'sources', requestId: randomUUID() })).filter(source => source.packageId === pkg.id);
    assert.deepEqual(sources.map(row => row.id), nativeSources.map(row => row.id), 'Native and renderer inventory identities differ');
    assert(sources.length); assert(sources.every(source => typeof source.upstreamId === 'string' && !source.enabled));
    const source = sources.find(source => source.lang === 'en') || sources[0];
    await request({ op: 'setEnabled', sourceId: source.id, enabled: true });
    const prefs = await step(`${fixture.name}: original preference setup`, () => request({ op: 'preferences', sourceId: source.id }));
    evidence.packages.at(-1).preferences = prefs.length;
    if (fixture.kind === 'watch') {
      const local = await jellyfinFixture();
      try {
        await step('Original Jellyfin preference-driven local authentication', async () => {
          for (const [title, value] of [['Address', local.url], ['Username', 'fixture'], ['Password', 'fixture-password']]) {
            const rows = await request({ op: 'preferences', sourceId: source.id }), pref = rows.find(row => row.title === title);
            assert(pref && pref.kind === 'text', `Missing original ${title} preference`);
            await request({ op: 'setPreference', sourceId: source.id, position: pref.position, value });
          }
          const deadline = Date.now() + 10000; let library;
          do { const rows = await request({ op: 'preferences', sourceId: source.id }); library = rows.find(row => row.title === 'Select media library'); if (library?.enabled && library.options.length) break; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
          assert(library?.enabled && library.options.length, 'Original login callback did not populate libraries');
          await request({ op: 'setPreference', sourceId: source.id, position: library.position, value: 'fixture-library' });
        });
        const media = await step('Original Jellyfin local search', () => request({ op: 'search', sourceId: source.id, query: 'Tatakai local fixture', page: 1 }));
        assert.equal(media.results[0].title, 'Tatakai local fixture');
        const detail = await step('Original Jellyfin local title and episode retrieval', () => request({ op: 'info', sourceId: source.id, id: media.results[0].id }));
        assert(detail.entries.length);
        const resolved = await step('Original Jellyfin local stream/subtitle/header resolution', async () => {
          const result = await request({ op: 'resolve', sourceId: source.id, id: media.results[0].id, episodeId: detail.entries[0].id });
          assert(result.sources.length); const video = result.sources[0];
          assert(Object.values(video.headers).some(value => value.includes(local.token)));
          assert(video.subtitles.length); const subtitle = video.subtitles[0];
          const response = await fetch(subtitle.url, { headers: subtitle.headers || video.headers, signal: AbortSignal.timeout(5000) });
          assert(response.ok && (await response.text()).includes('Local subtitle fixture'));
          const stream = await fetch(video.url, { headers: video.headers, signal: AbortSignal.timeout(5000) }); assert(stream.ok && (await stream.arrayBuffer()).byteLength === 24);
          return result;
        });
        evidence.packages.at(-1).animeFixture = { environment: 'Local Jellyfin protocol fixture; original APK, synthetic service/video bytes; player playback and public-server compatibility unverified', streams: resolved.sources.length, subtitles: resolved.sources[0].subtitles.length, requests: local.calls };
      } finally { await local.close(); }
    }
    await step(`${fixture.name}: repository removal retains installed source`, async () => { await request({ op: 'removeRepository', url }); assert((await request({ op: 'installedPackages' })).some(row => row.id === pkg.id)); });
    if (fixture.kind === 'read') {
      const setting = prefs.find(row => row.kind === 'boolean' && row.enabled && row.visible && typeof row.value === 'boolean');
      if (setting) await step('Original MangaDex preference callback', async () => { await request({ op: 'setPreference', sourceId: source.id, position: setting.position, value: !setting.value }); assert.equal((await request({ op: 'preferences', sourceId: source.id }))[setting.position].value, !setting.value); });
      const data = await step('Original MangaDex APK search', () => request({ op: 'search', sourceId: source.id, query: 'Give My Regards to Black Jack', page: 1 }));
      assert(data.results.length); const media = data.results[0];
      const detail = await step('Original MangaDex APK details/chapters', () => request({ op: 'info', sourceId: source.id, id: media.id })); assert(detail.entries.length);
      const pages = await step('Original MangaDex APK page retrieval', () => request({ op: 'pages', sourceId: source.id, chapterId: detail.entries[0].id })); assert(pages.pages.length);
      await step('Original MangaDex APK image HTTP bytes', async () => { const page = pages.pages[0], response = await fetch(page.imageUrl, { headers: page.headers, signal: AbortSignal.timeout(15000) }); assert(response.ok && response.headers.get('content-type')?.startsWith('image/')); const reader = response.body.getReader(); assert((await reader.read()).value.length); await reader.cancel(); });
      evidence.packages.at(-1).chapters = detail.entries.length; evidence.packages.at(-1).pages = pages.pages.length;
      await step('Original APK restart persistence and source identity', async () => {
        host.stop(); host = new AniyomiHost(hostOptions);
        const restored = (await request({ op: 'sources' })).find(row => row.id === source.id); assert(restored?.enabled); assert.equal(restored.upstreamId, source.upstreamId);
        const rows = await request({ op: 'preferences', sourceId: source.id }); if (setting) assert.equal(rows[setting.position].value, !setting.value);
      });
      await step('Native request cancellation and subsequent responsiveness', async () => {
        const controller = new AbortController(); const pending = host.call({ op: 'search', sourceId: source.id, query: 'cancelled fixture', page: 1, requestId: randomUUID() }, controller.signal);
        setTimeout(() => controller.abort(new Error('cancel fixture')), 20); await assert.rejects(pending, /cancel fixture/);
        const deadline = AbortSignal.timeout(10000); assert.equal(await host.call({ op: 'ping', requestId: randomUUID() }, deadline), 'pong');
      });
    }
    await request({ op: 'setEnabled', sourceId: source.id, enabled: false });
    await assert.rejects(request({ op: 'search', sourceId: source.id, query: 'disabled', page: 1 }), /disabled/i);
    await request({ op: 'remove', packageId: pkg.id });
    assert(!(await request({ op: 'installedPackages' })).some(row => row.id === pkg.id));
  }
} catch (error) { console.error(error); process.exitCode = 1; }
finally { host.stop(); await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2)); await fs.writeFile('.cache/extension-feasibility/aniyomi-runtime-evidence.json', JSON.stringify(evidence, null, 2)); }
