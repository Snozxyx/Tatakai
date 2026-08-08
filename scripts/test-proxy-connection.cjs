/**
 * Node script to test the local proxy server directly
 * Run with: node scripts/test-proxy-connection.cjs
 */

const http = require('http');

async function testProxy() {
  console.log('=== Testing Local Proxy Connection ===\n');

  // Assume proxy is on random port, try to detect it
  // In production it would be set via setFetchProxyBaseUrl
  const testPort = 9001; // Fallback default
  const proxyUrl = `http://127.0.0.1:${testPort}/proxy?url=${encodeURIComponent('https://animepahe.com/api?m=search&q=one%20piece')}`;

  console.log('Testing URL:', proxyUrl);
  console.log('Target:', 'https://animepahe.com/api?m=search&q=one%20piece');

  return new Promise((resolve) => {
    const req = http.get(proxyUrl, {
      headers: {
        'Referer': 'https://animepahe.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    }, (res) => {
      console.log('\n✅ Proxy responded:');
      console.log('   Status:', res.statusCode);
      console.log('   Headers:', res.headers);

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log('\nResponse body (first 500 chars):');
        console.log(data.substring(0, 500));
        
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            console.log('\n✅ Parsed JSON successfully');
            console.log('   Data items:', json.data?.length || 0);
          } catch {
            console.log('\n⚠️  Response was not JSON');
          }
        }
        
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error('\n❌ Proxy connection failed:', err.message);
      if (err.code === 'ECONNREFUSED') {
        console.error('\n💡 Proxy server is not running or not on port', testPort);
        console.error('   The proxy starts dynamically when extensions are invoked');
        console.error('   Try making a request through the app first');
      }
      resolve();
    });

    req.on('timeout', () => {
      console.error('\n❌ Request timed out after 10 seconds');
      req.destroy();
      resolve();
    });
  });
}

testProxy().then(() => {
  console.log('\n=== Test Complete ===');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
