/**
 * Test a single provider in isolation to debug empty results
 */

// Mock the Tatakai runtime fetch
const PROXY_URL = process.env.TATAKAI_PROXY_URL || 'http://localhost:9001';

const ALLOWED_DOMAINS = [
  'anikoto.com', 'anikoto.me', 'anikoto.net', 'anikoto.to',
  'anizone.to', 'anizone.net', 'anizone.pw',
  'animeheaven.me', 'animeheaven.ru',
  'aniworld.to',
  'animepahe.com', 'animepahe.ru', 'animepahe.org',
  'animeya.cc',
  'kwik.si',
  'megacloud.blog', 'megaplay.buzz', 'vidwish.live', 'megacloud.bloggy.click', 'vidtube.site',
  'kwik.cx2.mewcdn.online',
  'mapper.nekostream.site', 'mapper.mewcdn.online',
  'raw.githubusercontent.com',
  'megacloud-api-nine.vercel.app',
];

const __tatakai_fetch__ = async (url: string, init?: RequestInit): Promise<Response> => {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch (err) {
    throw new Error(`PermissionDeniedError: invalid URL "${url}"`);
  }

  if (!ALLOWED_DOMAINS.includes(hostname)) {
    throw new Error(`PermissionDeniedError: hostname "${hostname}" not allowed`);
  }

  const proxyUrl = new URL('/proxy', PROXY_URL);
  proxyUrl.searchParams.set('url', url);

  console.log(`[Fetch] ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(proxyUrl.toString(), {
      method: init?.method || 'GET',
      headers: init?.headers,
      body: init?.body,
      signal: controller.signal,
    });
    const contentLength = response.headers.get('content-length') || 'unknown';
    console.log(`[Response] ${response.status} ${response.statusText} (${contentLength} bytes)`);
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`FetchTimeoutError: request timed out after 30s`);
    }
    const code = err?.cause?.code || err?.code || '';
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      throw new Error(`ProxyUnavailableError: proxy at "${PROXY_URL}" unreachable (${code})`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

(globalThis as any).__tatakai_fetch__ = __tatakai_fetch__;
(globalThis as any).TATAKAI_API_BASE_URL = 'https://api.tatakai.me/api/v3';
(globalThis as any).TATAKAI_PROXY_URL = PROXY_URL;

// Test configuration
const TEST_PROVIDERS = ['animepahe', 'animeya', 'anikoto2', 'anizone', 'animeheaven', 'aniworldv2'];
const TEST_ANIME = {
  anilistId: 21,
  titles: ['One Piece', 'ワンピース'],
  episode: 1,
};

async function testProvider(providerName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${providerName}`);
  console.log('='.repeat(60));

  try {
    // Import the provider dynamically
    const providerModule = await import(`../extension/toko/src/providers/stream/${providerName}.js`);
    const provider = providerModule.default;

    console.log(`Provider loaded: ${provider.name}`);
    console.log(`Testing with: ${TEST_ANIME.titles[0]}, Episode ${TEST_ANIME.episode}`);

    const startTime = Date.now();
    const results = await provider.single({
      anilistId: TEST_ANIME.anilistId,
      titles: TEST_ANIME.titles,
      episode: TEST_ANIME.episode,
      resolution: '1080p',
    });
    const duration = Date.now() - startTime;

    console.log(`\n✓ Completed in ${duration}ms`);
    console.log(`Results: ${results.length}`);

    if (results.length > 0) {
      console.log('\nSources:');
      results.forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. ${r.source || 'unknown'}`);
        console.log(`     URL: ${r.url?.substring(0, 80)}...`);
        console.log(`     Type: ${r.sourceType}, Quality: ${r.quality}`);
        console.log(`     Audio: ${r.audioLanguage}, Subtitles: ${r.subtitles?.length || 0}`);
      });
    } else {
      console.log('\n✗ No results returned (check logs above for errors)');
    }

    return { provider: providerName, success: true, resultCount: results.length, duration };
  } catch (error: any) {
    console.error(`\n✗ Provider failed:`, error.message);
    console.error(error.stack);
    return { provider: providerName, success: false, error: error.message, duration: 0 };
  }
}

async function main() {
  console.log('Toko Provider Debug Test');
  console.log(`Proxy: ${PROXY_URL}`);
  console.log(`Test Anime: ${TEST_ANIME.titles[0]} (AniList ID: ${TEST_ANIME.anilistId})`);

  const results = [];
  for (const providerName of TEST_PROVIDERS) {
    const result = await testProvider(providerName);
    results.push(result);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary');
  console.log('='.repeat(60));
  results.forEach(r => {
    if (r.success) {
      console.log(`✓ ${r.provider}: ${r.resultCount} results (${r.duration}ms)`);
    } else {
      console.log(`✗ ${r.provider}: ${r.error}`);
    }
  });
}

main().catch(console.error);
