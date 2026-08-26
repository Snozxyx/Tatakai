/**
 * Throwaway diagnostic: run every Toko provider through the *exact* option shape
 * `optionsFromQuery()` builds in the in-app host, so "empty in the app but works
 * standalone" can be attributed to either the options or the environment.
 *
 *   node desktop/runtime/extension-api-host/__probe-providers.cjs 196218 1
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BUNDLE = path.resolve(__dirname, '../../../extension/toko/dist/bundle.js');

// Must stay identical to host-server.cjs `usefulSynonyms`, or the probe stops
// measuring what the app actually sends to providers.
const LATIN_TITLE_RE = /^[\p{Script=Latin}\p{Nd}\p{P}\p{Zs}\p{S}]+$/u;

function usefulSynonyms(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && LATIN_TITLE_RE.test(s))
    .slice(0, 2);
}

async function fetchAniListTitles(anilistId) {
  if (!anilistId) return [];
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        // Must stay identical to host-server.cjs `fetchAniListTitles`, or the
        // probe stops measuring what the app actually sends to providers.
        query: `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } synonyms } }`,
        variables: { id: anilistId },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const media = payload?.data?.Media;
    const t = media?.title;
    return [t?.english, t?.romaji, t?.userPreferred, t?.native, ...usefulSynonyms(media?.synonyms)]
      .filter(Boolean)
      .map((v) => String(v).trim())
      .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
  } catch (err) {
    console.error('anilist title fetch failed:', err.message);
    return [];
  }
}

function loadBundle() {
  const tmpDir = path.join(os.tmpdir(), 'tatakai-probe');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, `bundle-${process.pid}.cjs`);
  fs.copyFileSync(BUNDLE, tmp);
  const mod = require(tmp);
  const Bundle = mod.default || mod;
  return typeof Bundle === 'function' ? new Bundle() : Bundle;
}

(async () => {
  const anilistId = Number(process.argv[2] || 196218);
  const episode = Number(process.argv[3] || 1);

  const bundle = loadBundle();
  const titles = await fetchAniListTitles(anilistId);

  const opts = {
    anilistId,
    titles,
    episode,
    resolution: '1080p',
    preferredLanguage: undefined,
    preferredLanguages: undefined,
    providerOptions: { timeoutMs: 20_000 },
  };

  console.log('node', process.version);
  console.log('anilistId', anilistId, 'episode', episode);
  console.log('titles', JSON.stringify(titles));
  console.log('');

  const providers = bundle.listProviders();
  const rows = [];

  // Sequential on purpose: parallel runs make timeouts and rate-limits lie.
  for (const p of providers) {
    const name = p.name || p;
    const t0 = Date.now();
    let chunk;
    try {
      chunk = await bundle.runProvider(name, opts);
    } catch (err) {
      rows.push({ provider: name, kind: p.kind, n: 0, status: 'throw', ms: Date.now() - t0, error: err.message });
      continue;
    }
    const n = Array.isArray(chunk?.results) ? chunk.results.length : 0;
    rows.push({
      provider: name,
      kind: p.kind || chunk?.kind || '',
      n,
      status: chunk?.diagnostic?.status || (n ? 'ok' : 'empty'),
      ms: chunk?.diagnostic?.durationMs ?? (Date.now() - t0),
      error: chunk?.diagnostic?.error || '',
    });
    const last = rows[rows.length - 1];
    console.log(
      `${last.status.padEnd(8)} ${String(last.provider).padEnd(18)} ${String(last.n).padStart(3)} ${String(last.ms).padStart(6)}ms ${last.error}`,
    );
    if (n > 0) {
      const s = chunk.results[0];
      console.log(
        `         └─ ${s.sourceType || '?'} ${String(s.url || '').slice(0, 110)}`,
      );
    }
  }

  console.log('\n--- summary ---');
  const ok = rows.filter((r) => r.n > 0);
  console.log(`with results: ${ok.length}/${rows.length} → ${ok.map((r) => `${r.provider}(${r.n})`).join(', ')}`);
  const bad = rows.filter((r) => r.n === 0);
  console.log(`empty/failed: ${bad.map((r) => `${r.provider}[${r.status}]`).join(', ')}`);
})();
