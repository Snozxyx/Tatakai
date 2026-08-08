#!/usr/bin/env tsx
/**
 * Fetch a fresh AnimeLok URL and immediately test if the HLS stream works.
 */

const BASE_URL = 'https://animelok.live';
const HEADERS = {
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.6',
  'Cache-Control': 'no-cache',
  'Referer': `${BASE_URL}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

async function main() {
  // Step 1: Get a fresh URL from AnimeLok API
  console.log('Step 1: Fetching fresh episode data from AnimeLok API...');
  const apiUrl = `${BASE_URL}/api/anime/fullmetal-alchemist-brotherhood-5114/episodes/1`;
  
  const apiRes = await fetch(apiUrl, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!apiRes.ok) {
    console.log(`❌ API fetch failed: ${apiRes.status}`);
    process.exit(1);
  }
  
  const data = await apiRes.json() as any;
  const servers = data.episode?.servers ?? [];
  
  // Pick bato server
  const bato = servers.find((s: any) => s.name === 'bato' && s.tip === 'Soft Sub');
  if (!bato?.url) {
    console.log('❌ No bato server found');
    console.log('Available servers:', servers.map((s: any) => `${s.name}(${s.tip})`).join(', '));
    process.exit(1);
  }
  
  console.log(`✅ Got fresh URL: ${bato.url}\n`);
  
  // Step 2: Immediately test the fresh HLS URL
  console.log('Step 2: Testing the fresh HLS URL...\n');
  
  const testHeaders = [
    { label: 'No headers', headers: {} },
    { label: 'With Referer', headers: { 'Referer': `${BASE_URL}/`, 'User-Agent': 'Mozilla/5.0' } },
    { label: 'Full headers (same as AnimeLok fetch)', headers: HEADERS },
  ];
  
  for (const { label, headers } of testHeaders) {
    console.log(`─── ${label} ───`);
    try {
      const start = Date.now();
      const res = await fetch(bato.url, { 
        headers, 
        signal: AbortSignal.timeout(8000) 
      });
      const body = await res.text();
      const latency = Date.now() - start;
      
      console.log(`  Status : ${res.status} ${res.statusText}`);
      console.log(`  Latency: ${latency}ms`);
      console.log(`  Type   : ${res.headers.get('content-type')}`);
      console.log(`  Size   : ${body.length} bytes`);
      
      if (body.includes('#EXTM3U')) {
        const variantLines = body.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        const qualityLines = body.split('\n').filter(l => l.includes('RESOLUTION=') || l.includes('BANDWIDTH='));
        console.log(`  ✅ Valid HLS manifest!`);
        console.log(`  Variants: ${variantLines.length}`);
        if (qualityLines.length > 0) {
          console.log(`  Quality streams:`);
          qualityLines.forEach(q => console.log(`    ${q.trim()}`));
        }
        console.log(`  First lines:\n${body.split('\n').slice(0, 8).map(l => '    ' + l).join('\n')}`);
      } else if (res.status === 403) {
        console.log(`  ❌ 403 Forbidden — Hotlink protection / Referer check`);
        console.log(`  Body: ${body.slice(0, 200)}`);
      } else if (res.status === 200) {
        console.log(`  ⚠️  200 but not an HLS manifest`);
        console.log(`  Body: ${body.slice(0, 200)}`);
      } else {
        console.log(`  ❌ Non-200 response`);
        console.log(`  Body: ${body.slice(0, 200)}`);
      }
    } catch(e: any) {
      console.log(`  ❌ ERROR: ${e.message}`);
    }
    console.log('');
  }
  
  // Step 3: Check CORS headers
  console.log('─── CORS / Response headers ───');
  try {
    const res = await fetch(bato.url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    await res.body?.cancel();
    console.log('Response headers:');
    res.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
  } catch(e: any) {
    console.log(`❌ ${e.message}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
