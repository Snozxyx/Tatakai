#!/usr/bin/env tsx
const url = 'https://af03.anvod.pro/media/a9tv/afc/678d318a72de5728127c0cfa/anixl-master.m3u8';

async function test() {
  console.log('Testing HLS URL from AnimeLok...\n');
  console.log(`URL: ${url}\n`);
  
  // Test 1: No headers
  console.log('═══ Test 1: No headers ═══');
  try {
    const r1 = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await r1.text();
    console.log(`Status: ${r1.status} ${r1.statusText}`);
    console.log(`Content-Type: ${r1.headers.get('content-type')}`);
    console.log(`Content-Length: ${r1.headers.get('content-length') ?? 'not set'}`);
    console.log(`Body length: ${body.length} bytes`);
    console.log(`Body preview:\n${body.slice(0, 400)}\n`);
  } catch(e: any) { 
    console.log(`❌ ERROR: ${e.message}\n`); 
  }

  // Test 2: With Referer + Origin
  console.log('═══ Test 2: With Referer + Origin ═══');
  try {
    const r2 = await fetch(url, { 
      signal: AbortSignal.timeout(8000),
      headers: { 
        'Referer': 'https://animelok.live/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Origin': 'https://animelok.live',
        'Accept': '*/*',
      }
    });
    const body = await r2.text();
    console.log(`Status: ${r2.status} ${r2.statusText}`);
    console.log(`Content-Type: ${r2.headers.get('content-type')}`);
    console.log(`Content-Length: ${r2.headers.get('content-length') ?? 'not set'}`);
    console.log(`Body length: ${body.length} bytes`);
    console.log(`Body preview:\n${body.slice(0, 400)}\n`);
    
    // Parse HLS manifest
    if (body.includes('#EXTM3U')) {
      console.log('✅ Valid HLS manifest detected');
      const lines = body.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      console.log(`Found ${lines.length} variant streams/segments`);
      if (lines.length > 0) {
        console.log(`First segment/variant: ${lines[0]}`);
      }
    }
  } catch(e: any) { 
    console.log(`❌ ERROR: ${e.message}\n`); 
  }
}

test().catch(console.error);
