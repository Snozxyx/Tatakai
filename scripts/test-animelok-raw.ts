#!/usr/bin/env tsx
/**
 * AnimeLok Raw Response Inspector
 * 
 * Hits AnimeLok API directly and dumps the FULL response for every fixture.
 * Run with: npx tsx scripts/test-animelok-raw.ts
 */

const BASE_URL = 'https://animelok.live';

const HEADERS = {
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.6',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Referer': `${BASE_URL}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Brave";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-GPC': '1',
};

const FIXTURES = [
  { slug: 'naruto-shippuden-1735', episode: 1,  label: 'Naruto Shippuden ep1' },
  { slug: 'naruto-shippuden-1735', episode: 10, label: 'Naruto Shippuden ep10' },
  { slug: 'one-piece-21',          episode: 1,  label: 'One Piece ep1' },
  { slug: 'attack-on-titan-16498', episode: 1,  label: 'Attack on Titan ep1' },
  { slug: 'sword-art-online-11757',episode: 1,  label: 'SAO ep1' },
  { slug: 'demon-slayer-kimetsu-no-yaiba-101922', episode: 1, label: 'Demon Slayer ep1' },
  { slug: 'fullmetal-alchemist-brotherhood-5114', episode: 1, label: 'FMA Brotherhood ep1' },
];

function separator(label: string) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(line);
}

async function fetchEpisode(slug: string, episode: number): Promise<{
  status: number;
  ok: boolean;
  latencyMs: number;
  body: any;
  rawText?: string;
}> {
  const url = `${BASE_URL}/api/anime/${encodeURIComponent(slug)}/episodes/${episode}`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text();

    let body: any;
    try { body = JSON.parse(rawText); } catch { body = rawText; }

    return { status: res.status, ok: res.ok, latencyMs, body, rawText };
  } catch (err: any) {
    return {
      status: 0,
      ok: false,
      latencyMs: Date.now() - start,
      body: null,
      rawText: err?.message ?? String(err),
    };
  }
}

function printServers(servers: any[]) {
  if (!servers || servers.length === 0) {
    console.log('  servers: (none)');
    return;
  }
  console.log(`  servers (${servers.length}):`);
  for (const s of servers) {
    const urlPreview = typeof s.url === 'string'
      ? (s.url.startsWith('[') ? '[JSON array]' : s.url.slice(0, 90))
      : String(s.url);
    console.log(`    • [${String(s.id).padEnd(7)}] name=${String(s.name).padEnd(10)} tip=${String(s.tip).padEnd(12)} langs=${(s.languages ?? []).join(',')} url=${urlPreview}`);
  }
}

function printSubtitles(subs: any[]) {
  if (!subs || subs.length === 0) {
    console.log('  subtitles: (none)');
    return;
  }
  console.log(`  subtitles (${subs.length}):`);
  for (const s of subs) {
    console.log(`    • ${s.name.padEnd(12)} ${s.url}`);
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              ANIMELOK RAW RESPONSE INSPECTOR                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}/api/anime/{slug}/episodes/{ep}\n`);

  const summary: Array<{ label: string; ok: boolean; serverCount: number; hasHls: boolean; latencyMs: number }> = [];

  for (const f of FIXTURES) {
    separator(`${f.label}  →  /api/anime/${f.slug}/episodes/${f.episode}`);

    const result = await fetchEpisode(f.slug, f.episode);

    console.log(`  HTTP ${result.status} | ${result.latencyMs}ms | ok=${result.ok}`);

    if (!result.ok || !result.body || typeof result.body !== 'object') {
      console.log(`  ❌ Failed or non-JSON response:`);
      console.log(`  ${String(result.rawText ?? '').slice(0, 300)}`);
      summary.push({ label: f.label, ok: false, serverCount: 0, hasHls: false, latencyMs: result.latencyMs });
      continue;
    }

    const data = result.body;

    // ── Anime metadata ──────────────────────────────────────────────────────
    if (data.anime) {
      console.log('\n  anime:');
      console.log(`    id        : ${data.anime.id}`);
      console.log(`    anilistId : ${data.anime.anilistId}`);
      console.log(`    slug      : ${data.anime.slug}`);
      console.log(`    title     : ${data.anime.title}`);
      console.log(`    hianimeId : ${data.anime.hianimeId}`);
    }

    // ── Episode metadata ────────────────────────────────────────────────────
    if (data.episode) {
      const ep = data.episode;
      console.log('\n  episode:');
      console.log(`    id            : ${ep.id}`);
      console.log(`    number        : ${ep.number}`);
      console.log(`    name          : ${ep.name}`);
      console.log(`    isFiller      : ${ep.isFiller}`);
      console.log(`    duration      : ${ep.duration ?? 'null'}`);
      console.log(`    introStart    : ${ep.introStart ?? 'null'}`);
      console.log(`    introEnd      : ${ep.introEnd ?? 'null'}`);
      console.log(`    outroStart    : ${ep.outroStart ?? 'null'}`);
      console.log(`    outroEnd      : ${ep.outroEnd ?? 'null'}`);
      console.log(`    languages     : ${(ep.languages ?? []).join(', ')}`);
      console.log(`    animepaheId   : ${ep.animepaheId ?? 'null'}`);
      console.log(`    hianimeId     : ${ep.hianimeId ?? 'null'}`);
      console.log(`    img           : ${ep.img ?? 'null'}`);

      console.log('');
      printServers(ep.servers ?? []);
      console.log('');
      printSubtitles(ep.subtitles ?? []);

      const servers: any[] = ep.servers ?? [];
      const hasHls = servers.some((s: any) => typeof s.url === 'string' && s.url.includes('.m3u8'));
      const bato = servers.find((s: any) => s.name === 'bato');

      console.log(`\n  ── Quick analysis ──`);
      console.log(`  Total servers   : ${servers.length}`);
      console.log(`  Has HLS (m3u8)  : ${hasHls}`);
      console.log(`  "bato" server   : ${bato ? `YES → ${bato.url.slice(0, 80)}` : 'NO'}`);
      console.log(`  Picked for prev : ${bato?.url ?? servers.find((s: any) => s.url?.includes('.m3u8'))?.url ?? 'none'}`);

      summary.push({ label: f.label, ok: true, serverCount: servers.length, hasHls, latencyMs: result.latencyMs });
    } else {
      console.log('\n  ⚠️  No episode object in response. Full body:');
      console.log('  ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n  ').slice(0, 800));
      summary.push({ label: f.label, ok: false, serverCount: 0, hasHls: false, latencyMs: result.latencyMs });
    }
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                                         ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  Fixture                          ok   servers  HLS   latency   ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  for (const s of summary) {
    const ok = s.ok ? '✅' : '❌';
    const label = s.label.padEnd(34);
    const servers = String(s.serverCount).padEnd(7);
    const hls = (s.hasHls ? 'YES' : 'NO ').padEnd(5);
    const lat = `${s.latencyMs}ms`.padEnd(8);
    console.log(`║  ${label} ${ok}   ${servers}  ${hls}   ${lat}  ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
}

main().catch(err => { console.error(err); process.exit(1); });
