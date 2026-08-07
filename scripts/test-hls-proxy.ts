#!/usr/bin/env tsx
/**
 * Tests HLS URLs through TatakaiAPI's existing proxy endpoint.
 * Tries both direct fetch (with correct headers) and via proxy.
 */

const API_BASE = process.env.TATAKAI_API_URL ?? 'http://localhost:4001/api/v3';
const PROXY_BASE = 'http://localhost:4001/api/proxy';

const URLS_TO_TEST = [
  {
    label: 'sub (megap.kotocdn.site)',
    url: 'https://megap.kotocdn.site/f899139df5e1059396431415e770c6dd/61b87186ab260d05003427e16ccf5657/master.m3u8',
    referer: 'https://megaplay.buzz/',
    isM3U8: true,
  },
  {
    label: 'dub (megap.kotocdn.site)',
    url: 'https://megap.kotocdn.site/f899139df5e1059396431415e770c6dd/b23b2bb864c4f8876052acde11c6529c/master.m3u8',
    referer: 'https://megaplay.buzz/',
    isM3U8: true,
  },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

async function testDirect(url: string, referer: string, label: string) {
  console.log(`\n  [DIRECT] ${label}`);
  try {
    const start = Date.now();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'Referer': referer,
        'User-Agent': UA,
        'Accept': '*/*',
        'Origin': new URL(referer).origin,
      },
    });
    const body = await res.text();
    const ms = Date.now() - start;

    console.log(`  Status : ${res.status} (${ms}ms)`);
    console.log(`  Type   : ${res.headers.get('content-type')}`);

    if (res.ok && body.includes('#EXTM3U')) {
      const variants = body.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const bandwidths = body.match(/BANDWIDTH=(\d+)/g) ?? [];
      const resolutions = body.match(/RESOLUTION=[\dx]+/g) ?? [];
      console.log(`  ✅ Valid HLS manifest`);
      console.log(`  Variants   : ${variants.length}`);
      console.log(`  Bandwidths : ${bandwidths.join(', ')}`);
      console.log(`  Resolutions: ${resolutions.join(', ')}`);
      console.log(`  First lines:`);
      body.split('\n').slice(0, 6).forEach(l => console.log(`    ${l}`));
      return true;
    } else if (!res.ok) {
      console.log(`  ❌ HTTP ${res.status}`);
      console.log(`  Body: ${body.slice(0, 200)}`);
      return false;
    } else {
      console.log(`  ⚠️  200 but not HLS — body: ${body.slice(0, 200)}`);
      return false;
    }
  } catch (e: any) {
    console.log(`  ❌ ERROR: ${e.message}`);
    return false;
  }
}

async function testViaProxy(url: string, referer: string, label: string) {
  const proxyUrl = `${PROXY_BASE}/m3u8-streaming-proxy?${new URLSearchParams({
    url,
    referer,
    userAgent: UA,
  })}`;

  console.log(`\n  [VIA PROXY] ${label}`);
  console.log(`  Proxy URL: ${proxyUrl.slice(0, 120)}...`);

  try {
    const start = Date.now();
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
    const body = await res.text();
    const ms = Date.now() - start;

    console.log(`  Status : ${res.status} (${ms}ms)`);
    console.log(`  Type   : ${res.headers.get('content-type')}`);

    if (res.ok && body.includes('#EXTM3U')) {
      const variants = body.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const bandwidths = body.match(/BANDWIDTH=(\d+)/g) ?? [];
      const resolutions = body.match(/RESOLUTION=[\dx]+/g) ?? [];
      console.log(`  ✅ Valid HLS manifest (proxied)`);
      console.log(`  Variants   : ${variants.length}`);
      console.log(`  Bandwidths : ${bandwidths.join(', ')}`);
      console.log(`  Resolutions: ${resolutions.join(', ')}`);
      console.log(`  First lines (rewritten for CORS):`);
      body.split('\n').slice(0, 8).forEach(l => console.log(`    ${l.slice(0, 120)}`));
      return true;
    } else if (!res.ok) {
      console.log(`  ❌ Proxy returned HTTP ${res.status}`);
      console.log(`  Body: ${body.slice(0, 300)}`);
      return false;
    } else {
      console.log(`  ⚠️  200 but not HLS — body: ${body.slice(0, 200)}`);
      return false;
    }
  } catch (e: any) {
    console.log(`  ❌ ERROR: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║           HLS STREAM PROXY TEST                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nAPI Base : ${API_BASE}`);
  console.log(`Proxy    : ${PROXY_BASE}/m3u8-streaming-proxy\n`);

  const results: Array<{ label: string; direct: boolean; proxied: boolean }> = [];

  for (const t of URLS_TO_TEST) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${t.label.toUpperCase()}`);
    console.log(`  ${t.url}`);
    console.log(`  Referer: ${t.referer}`);
    console.log('═'.repeat(60));

    const direct = await testDirect(t.url, t.referer, t.label);
    const proxied = await testViaProxy(t.url, t.referer, t.label);
    results.push({ label: t.label, direct, proxied });
  }

  // Summary
  console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                                  ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  for (const r of results) {
    const d = r.direct ? '✅' : '❌';
    const p = r.proxied ? '✅' : '❌';
    console.log(`║  ${r.label.padEnd(35)} direct=${d}  proxy=${p} ║`);
  }
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

main().catch(err => { console.error(err); process.exit(1); });
