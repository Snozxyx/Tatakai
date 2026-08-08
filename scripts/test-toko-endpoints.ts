#!/usr/bin/env tsx
/**
 * Toko Preview Test Script
 *
 * Tests the /api/v3/toko/preview endpoint which uses AnimeLok for web users.
 * Desktop users use the local Toko extension — not tested here.
 *
 * Usage:
 *   npx tsx scripts/test-toko-endpoints.ts
 *   TATAKAI_API_URL=http://localhost:4001 npx tsx scripts/test-toko-endpoints.ts
 */

const API_BASE = process.env.TATAKAI_API_URL ?? 'http://localhost:4001/api/v3';

// Test fixtures
const FIXTURES = [
  { anilistId: 1735,  titles: ['Naruto: Shippuden', 'Naruto Shippuden'], episode: 1,  label: 'Naruto Shippuden' },
  { anilistId: 21,    titles: ['One Piece'],                              episode: 1,  label: 'One Piece' },
  { anilistId: 16498, titles: ['Attack on Titan', 'Shingeki no Kyojin'], episode: 1,  label: 'Attack on Titan' },
  { anilistId: 11757, titles: ['Sword Art Online'],                       episode: 1,  label: 'SAO' },
];

interface TestResult {
  label: string;
  url: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  provider?: string | null;
  streamUrl?: string | null;
  isHls?: boolean;
  previewTimestampSec?: number;
  error?: string;
}

async function testPreview(
  anilistId: number,
  titles: string[],
  episode: number,
  label: string,
): Promise<TestResult> {
  const params = new URLSearchParams({ anilistId: String(anilistId), episode: String(episode) });
  for (const t of titles) params.append('titles[]', t);
  const url = `${API_BASE}/toko/preview?${params}`;

  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const latencyMs = Date.now() - start;
    const data = await res.json() as any;

    return {
      label,
      url,
      ok: res.ok,
      status: res.status,
      latencyMs,
      provider: data.provider,
      streamUrl: data.streamUrl,
      isHls: data.isHls,
      previewTimestampSec: data.previewTimestampSec,
    };
  } catch (err: any) {
    return {
      label,
      url,
      ok: false,
      latencyMs: Date.now() - start,
      error: err?.message ?? String(err),
    };
  }
}

function printResult(r: TestResult) {
  const resolved = r.provider !== null && r.streamUrl;
  const icon = !r.ok ? '❌' : resolved ? '✅' : '⚠️ ';
  const status = r.status ? `[${r.status}]` : '[ERR]';

  console.log(`${icon} ${status} ${r.label} (${r.latencyMs}ms)`);
  if (r.error) {
    console.log(`   Error: ${r.error}`);
  } else {
    console.log(`   provider   : ${r.provider ?? 'null'}`);
    console.log(`   streamUrl  : ${r.streamUrl ? r.streamUrl.slice(0, 80) + '...' : 'null'}`);
    console.log(`   isHls      : ${r.isHls}`);
    console.log(`   timestamp  : ${r.previewTimestampSec}s`);
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║         TOKO PREVIEW ENDPOINT TEST SUITE              ║');
  console.log('║     AnimeLok → web preview / desktop → extension      ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  console.log(`API Base: ${API_BASE}\n`);

  const results: TestResult[] = [];

  // ── Preview tests ─────────────────────────────────────────────────────────
  console.log('── GET /api/v3/toko/preview ──\n');
  for (const f of FIXTURES) {
    const r = await testPreview(f.anilistId, f.titles, f.episode, f.label);
    results.push(r);
    printResult(r);
    console.log('');
  }

  // ── Stub endpoints (should always return 200 with null provider) ──────────
  console.log('── Stub endpoints (desktop-only, expect provider: null) ──\n');

  for (const path of ['/toko/index/episodes?anilistId=21', '/toko/index/chapters?anilistId=21&malId=21']) {
    const url = `${API_BASE}${path}`;
    const start = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const data = await res.json() as any;
      const ok = res.ok && data.provider === null;
      const icon = ok ? '✅' : '❌';
      console.log(`${icon} [${res.status}] ${path} (${Date.now() - start}ms) → provider: ${data.provider}`);
      results.push({ label: path, url, ok, status: res.status, latencyMs: Date.now() - start });
    } catch (err: any) {
      console.log(`❌ [ERR] ${path} → ${err?.message}`);
      results.push({ label: path, url, ok: false, latencyMs: Date.now() - start, error: err?.message });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalRequests = results.length;
  const httpOk = results.filter(r => r.ok).length;
  const resolved = results.filter(r => r.provider !== null && r.provider !== undefined && r.streamUrl).length;
  const avgLatency = Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / totalRequests);

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log(`║  HTTP OK  : ${httpOk}/${totalRequests} endpoints responded 2xx      ║`);
  console.log(`║  Resolved : ${resolved}/${FIXTURES.length} fixtures got a stream URL       ║`);
  console.log(`║  Avg lat  : ${String(avgLatency).padEnd(4)}ms                           ║`);
  console.log('╚═══════════════════════════════════════════╝\n');

  if (httpOk < totalRequests) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
