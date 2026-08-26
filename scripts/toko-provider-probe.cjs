'use strict';

/**
 * Ground-truth provider probe for the Toko bundle.
 *
 * Loads `extension/toko/dist/bundle.js` in-process (same way the desktop
 * Extension-API host does) and runs every stream/torrent provider one at a time,
 * printing a per-provider status line. Sequential by default so a slow provider
 * cannot be blamed on contention with 22 others.
 *
 * Usage:
 *   node scripts/toko-provider-probe.cjs [--anilist 20] [--episode 1]
 *                                        [--only nyaa,animeya] [--concurrency 4]
 *                                        [--timeout 20000] [--json out.json]
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ANILIST = Number(arg('anilist', '20'));
const EPISODE = Number(arg('episode', '1'));
const TIMEOUT = Number(arg('timeout', '20000'));
const CONCURRENCY = Number(arg('concurrency', '1'));
const ONLY = String(arg('only', '')).split(',').map((s) => s.trim()).filter(Boolean);
const JSON_OUT = arg('json', '');

const BUNDLE_SRC = path.resolve(__dirname, '../extension/toko/dist/bundle.js');

function loadBundle() {
  if (!fs.existsSync(BUNDLE_SRC)) {
    throw new Error(`bundle missing at ${BUNDLE_SRC} — run: npm run build:toko`);
  }
  const dir = path.join(os.tmpdir(), 'toko-probe');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `bundle-${Date.now()}.cjs`);
  fs.copyFileSync(BUNDLE_SRC, tmp);
  const mod = require(tmp);
  const Bundle = mod.default || mod;
  return typeof Bundle === 'function' ? new Bundle() : Bundle;
}

async function fetchTitles(anilistId) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: 'query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } } }',
        variables: { id: anilistId },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const t = (await res.json())?.data?.Media?.title;
    return [t?.english, t?.romaji, t?.userPreferred, t?.native]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
  } catch {
    return [];
  }
}

(async () => {
  const toko = loadBundle();
  const titles = await fetchTitles(ANILIST);
  console.log(`anilistId=${ANILIST} episode=${EPISODE} titles=${JSON.stringify(titles)}`);

  const all = toko.listProviders().filter((p) => p.kind !== 'manga');
  const targets = ONLY.length
    ? all.filter((p) => ONLY.some((o) => p.name.toLowerCase() === o.toLowerCase()))
    : all;

  const opts = {
    anilistId: ANILIST,
    titles,
    episode: EPISODE,
    resolution: '1080p',
    providerOptions: { timeoutMs: TIMEOUT, maxRetries: 1 },
  };

  const rows = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, targets.length)) }, async () => {
      while (cursor < targets.length) {
        const p = targets[cursor++];
        const t0 = Date.now();
        let row;
        try {
          const chunk = await toko.runProvider(p.name, opts);
          const results = chunk.results || [];
          row = {
            provider: p.name,
            kind: p.kind,
            count: results.length,
            status: chunk.diagnostic?.status || (results.length ? 'ok' : 'empty'),
            ms: chunk.diagnostic?.durationMs ?? Date.now() - t0,
            error: chunk.diagnostic?.error || '',
            sample: results.slice(0, 2).map((r) => ({
              source: r.source,
              type: r.sourceType,
              url: String(r.url || '').slice(0, 110),
              seeders: r.seeders,
            })),
          };
        } catch (err) {
          row = { provider: p.name, kind: p.kind, count: 0, status: 'throw', ms: Date.now() - t0, error: err.message, sample: [] };
        }
        rows.push(row);
        const flag = row.count > 0 ? 'OK  ' : row.status === 'timeout' ? 'TIME' : 'FAIL';
        console.log(
          `${flag} ${row.provider.padEnd(18)} ${String(row.count).padStart(3)} results  ${String(row.ms).padStart(6)}ms  ${row.status}${row.error ? '  ' + row.error : ''}`,
        );
        for (const s of row.sample) {
          console.log(`       ↳ ${s.source} [${s.type}${s.seeders != null ? ' s=' + s.seeders : ''}] ${s.url}`);
        }
      }
    }),
  );

  rows.sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider));
  const alive = rows.filter((r) => r.count > 0);
  console.log(`\n=== ${alive.length}/${rows.length} providers returned sources ===`);
  console.log(rows.map((r) => `${r.count > 0 ? '+' : '-'} ${r.provider} (${r.count}, ${r.status})`).join('\n'));

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ anilistId: ANILIST, episode: EPISODE, titles, rows }, null, 2));
    console.log(`\nwrote ${JSON_OUT}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
