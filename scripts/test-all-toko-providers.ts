/**
 * Comprehensive Toko Provider Test Suite
 * Tests all stream, torrent, manga, and i18n providers
 * Outputs results in API JSON format
 */

// ── Mock Tatakai Runtime Environment ──────────────────────────────────────────
// The toko extension expects __tatakai_fetch__ to be globally available
// (normally injected by extension-worker-pool.cjs in a worker thread)

// Configure proxy and API base URLs
const TATAKAI_PROXY_URL = process.env.TATAKAI_PROXY_URL || 'http://localhost:9001';
const TATAKAI_API_BASE_URL = (process.env.VITE_BACKEND_ORIGIN || 'http://localhost:4001') + '/api/v3';

// Domain allowlist (permissive for testing)
const ALLOWED_DOMAINS = [
  'animepahe.com', 'animepahe.ru', 'animepahe.org',
  'vidnest.fun',
  'animeya.cc',
  'senshi.live',
  'toonstream.day', 'toonstream.co',
  '4anime.gg',
  'anikoto.com', 'anikoto.me', 'anikoto.net', 'anikoto.to',
  'anizone.to', 'anizone.net', 'anizone.pw',
  'animeheaven.me', 'animeheaven.ru',
  'aniworld.to',
  'mkissa.com',
  'animesalt.com',
  'reanime.org',
  'animelok.com',
  'watchanimeworld.com',
  'desidub.com',
  'hindidubbed.com',
  'animeblkom.net',
  'megacloud.blog', 'megaplay.buzz', 'vidwish.live', 'megacloud.bloggy.click', 'vidtube.site',
  'kwik.cx2.mewcdn.online',
  'mapper.nekostream.site', 'mapper.mewcdn.online',
  'raw.githubusercontent.com',
  'megacloud-api-nine.vercel.app',
  'nyaa.si',
  'acg.rip',
  'animetosho.org',
  'releases.moe',
  'seadex.org', 'releases.seadex.org',
  'share.acgnx.se',
  'tracker.mywaifu.best',
  'nekobt.com',
  'allmanga.to',
  'atsu.moe',
  'mangafire.to',
  'anime-sama.fr',
  'asura.gg', 'asuratoon.com', 'asuracomic.net',
];

// Mock __tatakai_fetch__ implementation
const __tatakai_fetch__ = async (url: string, init?: RequestInit): Promise<Response> => {
  // Domain check
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch (err) {
    throw new Error(`PermissionDeniedError: invalid URL "${url}"`);
  }

  if (!ALLOWED_DOMAINS.includes(hostname)) {
    throw new Error(
      `PermissionDeniedError: hostname "${hostname}" is not in the extension's allowed domain list`
    );
  }

  // Build proxy URL
  const proxyUrl = new URL('/proxy', TATAKAI_PROXY_URL);
  proxyUrl.searchParams.set('url', url);

  console.log(`[Mock Fetch] ${url} -> ${proxyUrl.toString()}`);

  // Execute proxied request with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(proxyUrl.toString(), {
      method: init?.method || 'GET',
      headers: init?.headers,
      body: init?.body,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`FetchTimeoutError: request to "${url}" timed out after 30000 ms`);
    }
    const code = err?.cause?.code || err?.code || '';
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      throw new Error(
        `ProxyUnavailableError: local proxy at "${TATAKAI_PROXY_URL}" is unreachable (${code})`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

// Inject into global scope
(globalThis as any).__tatakai_fetch__ = __tatakai_fetch__;
(globalThis as any).TATAKAI_API_BASE_URL = TATAKAI_API_BASE_URL;
(globalThis as any).TATAKAI_PROXY_URL = TATAKAI_PROXY_URL;

console.log('✓ Tatakai runtime environment initialized');
console.log(`  Proxy URL: ${TATAKAI_PROXY_URL}`);
console.log(`  API Base URL: ${TATAKAI_API_BASE_URL}`);
console.log(`  Allowed domains: ${ALLOWED_DOMAINS.length}\n`);

// ── Test Suite ────────────────────────────────────────────────────────────────

import TokoBundleClass from '../extension/toko/src/index.js';

// Test data
const TEST_ANIME = {
  anilistId: 21,
  titles: ['One Piece', 'ワンピース'],
  episode: 1,
};

const TEST_MANGA = {
  anilistId: 30013,
  titles: ['One Punch Man', 'ワンパンマン'],
};

type TestResult = {
  category: string;
  provider: string;
  method: string;
  status: 'success' | 'error' | 'timeout' | 'empty';
  duration_ms: number;
  result_count: number;
  sample_result?: any;
  error?: string;
};

type APIResponse = {
  test_run: {
    timestamp: string;
    total_tests: number;
    successful: number;
    failed: number;
    empty: number;
    timeout: number;
  };
  providers: {
    stream: TestResult[];
    torrent: TestResult[];
    manga: TestResult[];
    i18n: TestResult[];
  };
  summary: {
    by_category: Record<string, {
      total: number;
      successful: number;
      failed: number;
      empty: number;
      timeout: number;
    }>;
    by_provider: Record<string, {
      tests: number;
      successful: number;
      failed: number;
    }>;
  };
};

class TokoProviderTester {
  private bundle: TokoBundleClass;
  private results: TestResult[] = [];

  constructor() {
    this.bundle = new TokoBundleClass();
  }

  private async testProvider(
    category: string,
    provider: string,
    method: string,
    testFn: () => Promise<any>
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout after 20s')), 20000)
        )
      ]);

      const duration = Date.now() - startTime;
      const resultArray = Array.isArray(result) ? result : [result];
      const resultCount = resultArray.length;

      return {
        category,
        provider,
        method,
        status: resultCount > 0 ? 'success' : 'empty',
        duration_ms: duration,
        result_count: resultCount,
        sample_result: resultCount > 0 ? resultArray[0] : null,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const isTimeout = error instanceof Error && error.message.includes('Timeout');
      
      return {
        category,
        provider,
        method,
        status: isTimeout ? 'timeout' : 'error',
        duration_ms: duration,
        result_count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async testValidation(): Promise<void> {
    console.log('🔍 Testing bundle validation...');
    const validation = this.bundle.validate();
    console.log(`✓ Validation: ${JSON.stringify(validation)}\n`);
  }

  async testStreamProviders(): Promise<void> {
    console.log('🎬 Testing Stream Providers (single episode)...\n');

    const result = await this.testProvider(
      'stream',
      'all_stream_providers',
      'debugSingle',
      async () => {
        const opts = {
          anilistId: TEST_ANIME.anilistId,
          titles: TEST_ANIME.titles,
          episode: TEST_ANIME.episode,
          resolution: '1080p' as const,
        };
        return await this.bundle.debugSingle(opts);
      }
    );

    if (result.status === 'success' && result.sample_result?.diagnostics) {
      const diagnostics = result.sample_result.diagnostics;
      
      for (const diag of diagnostics) {
        const testResult: TestResult = {
          category: 'stream',
          provider: diag.provider,
          method: 'single',
          status: diag.status === 'ok' ? 'success' : diag.status,
          duration_ms: diag.durationMs,
          result_count: diag.resultCount,
          error: diag.error,
        };
        
        this.results.push(testResult);
        
        const icon = testResult.status === 'success' ? '✓' : 
                     testResult.status === 'empty' ? '○' :
                     testResult.status === 'timeout' ? '⏱' : '✗';
        console.log(`  ${icon} ${diag.provider}: ${diag.status} (${diag.durationMs}ms, ${diag.resultCount} results)`);
      }
    }
    console.log('');
  }

  async testTorrentProviders(): Promise<void> {
    console.log('📦 Testing Torrent Providers (batch)...\n');

    const result = await this.testProvider(
      'torrent',
      'all_torrent_providers',
      'debugBatch',
      async () => {
        const opts = {
          anilistId: TEST_ANIME.anilistId,
          titles: TEST_ANIME.titles,
          episode: TEST_ANIME.episode,
          resolution: '1080p' as const,
        };
        return await this.bundle.debugBatch(opts);
      }
    );

    if (result.status === 'success' && result.sample_result?.diagnostics) {
      const diagnostics = result.sample_result.diagnostics.filter(
        (d: any) => !this.results.find(r => r.provider === d.provider)
      );
      
      for (const diag of diagnostics) {
        const testResult: TestResult = {
          category: 'torrent',
          provider: diag.provider,
          method: 'batch',
          status: diag.status === 'ok' ? 'success' : diag.status,
          duration_ms: diag.durationMs,
          result_count: diag.resultCount,
          error: diag.error,
        };
        
        this.results.push(testResult);
        
        const icon = testResult.status === 'success' ? '✓' : 
                     testResult.status === 'empty' ? '○' :
                     testResult.status === 'timeout' ? '⏱' : '✗';
        console.log(`  ${icon} ${diag.provider}: ${diag.status} (${diag.durationMs}ms, ${diag.resultCount} results)`);
      }
    }
    console.log('');
  }

  async testMangaProviders(): Promise<void> {
    console.log('📚 Testing Manga Providers (chapters)...\n');

    const result = await this.testProvider(
      'manga',
      'all_manga_providers',
      'debugMangaChapters',
      async () => {
        return await this.bundle.debugMangaChapters({
          anilistId: TEST_MANGA.anilistId,
          titles: TEST_MANGA.titles,
        });
      }
    );

    if (result.status === 'success' && result.sample_result?.diagnostics) {
      const diagnostics = result.sample_result.diagnostics;
      
      for (const diag of diagnostics) {
        const testResult: TestResult = {
          category: 'manga',
          provider: diag.provider,
          method: 'getChapters',
          status: diag.status === 'ok' ? 'success' : diag.status,
          duration_ms: diag.durationMs,
          result_count: diag.resultCount,
          error: diag.error,
        };
        
        this.results.push(testResult);
        
        const icon = testResult.status === 'success' ? '✓' : 
                     testResult.status === 'empty' ? '○' :
                     testResult.status === 'timeout' ? '⏱' : '✗';
        console.log(`  ${icon} ${diag.provider}: ${diag.status} (${diag.durationMs}ms, ${diag.resultCount} results)`);
      }
    }
    console.log('');
  }

  async testLanguageCapabilities(): Promise<void> {
    console.log('🌐 Testing Language Capabilities...\n');

    const result = await this.testProvider(
      'i18n',
      'all_providers',
      'getLanguages',
      async () => {
        const opts = {
          anilistId: TEST_ANIME.anilistId,
          titles: TEST_ANIME.titles,
          episode: TEST_ANIME.episode,
          resolution: '1080p' as const,
        };
        return await this.bundle.getLanguages(opts);
      }
    );

    this.results.push(result);
    
    const icon = result.status === 'success' ? '✓' : 
                 result.status === 'empty' ? '○' :
                 result.status === 'timeout' ? '⏱' : '✗';
    console.log(`  ${icon} Language capabilities: ${result.status} (${result.duration_ms}ms, ${result.result_count} results)`);
    console.log('');
  }

  async testPreviewSource(): Promise<void> {
    console.log('🎥 Testing Preview Source...\n');

    const result = await this.testProvider(
      'stream',
      'preview',
      'getPreviewSource',
      async () => {
        return await this.bundle.getPreviewSource({
          anilistId: TEST_ANIME.anilistId,
          titles: TEST_ANIME.titles,
          episode: TEST_ANIME.episode,
        });
      }
    );

    this.results.push(result);
    
    const icon = result.status === 'success' ? '✓' : 
                 result.status === 'empty' ? '○' :
                 result.status === 'timeout' ? '⏱' : '✗';
    console.log(`  ${icon} Preview source: ${result.status} (${result.duration_ms}ms)`);
    if (result.sample_result) {
      console.log(`     Provider: ${result.sample_result.provider || 'null'}`);
      console.log(`     Is HLS: ${result.sample_result.isHls || false}`);
    }
    console.log('');
  }

  async testWebsiteEpisodeIndex(): Promise<void> {
    console.log('📋 Testing Website Episode Index...\n');

    const result = await this.testProvider(
      'stream',
      'episode_index',
      'getWebsiteEpisodeIndex',
      async () => {
        return await this.bundle.getWebsiteEpisodeIndex({
          anilistId: TEST_ANIME.anilistId,
          titles: TEST_ANIME.titles,
        });
      }
    );

    this.results.push(result);
    
    const icon = result.status === 'success' ? '✓' : 
                 result.status === 'empty' ? '○' :
                 result.status === 'timeout' ? '⏱' : '✗';
    console.log(`  ${icon} Episode index: ${result.status} (${result.duration_ms}ms)`);
    if (result.sample_result) {
      console.log(`     Provider: ${result.sample_result.provider || 'null'}`);
      console.log(`     Episode count: ${result.sample_result.episodeCount || 0}`);
    }
    console.log('');
  }

  generateAPIResponse(): APIResponse {
    const now = new Date().toISOString();
    
    const statusCounts = {
      successful: this.results.filter(r => r.status === 'success').length,
      failed: this.results.filter(r => r.status === 'error').length,
      empty: this.results.filter(r => r.status === 'empty').length,
      timeout: this.results.filter(r => r.status === 'timeout').length,
    };

    // Categorize results
    const byCategory: Record<string, TestResult[]> = {
      stream: [],
      torrent: [],
      manga: [],
      i18n: [],
    };

    for (const result of this.results) {
      if (byCategory[result.category]) {
        byCategory[result.category].push(result);
      }
    }

    // Calculate category summaries
    const categorySummary: Record<string, any> = {};
    for (const [category, results] of Object.entries(byCategory)) {
      categorySummary[category] = {
        total: results.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
        empty: results.filter(r => r.status === 'empty').length,
        timeout: results.filter(r => r.status === 'timeout').length,
      };
    }

    // Calculate provider summaries
    const providerSummary: Record<string, any> = {};
    for (const result of this.results) {
      if (!providerSummary[result.provider]) {
        providerSummary[result.provider] = {
          tests: 0,
          successful: 0,
          failed: 0,
        };
      }
      providerSummary[result.provider].tests++;
      if (result.status === 'success') providerSummary[result.provider].successful++;
      if (result.status === 'error' || result.status === 'timeout') providerSummary[result.provider].failed++;
    }

    return {
      test_run: {
        timestamp: now,
        total_tests: this.results.length,
        ...statusCounts,
      },
      providers: byCategory,
      summary: {
        by_category: categorySummary,
        by_provider: providerSummary,
      },
    };
  }

  async runAllTests(): Promise<APIResponse> {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Toko Extension Provider Test Suite   ║');
    console.log('╚════════════════════════════════════════╝\n');

    await this.testValidation();
    await this.testStreamProviders();
    await this.testTorrentProviders();
    await this.testMangaProviders();
    await this.testLanguageCapabilities();
    await this.testPreviewSource();
    await this.testWebsiteEpisodeIndex();

    const apiResponse = this.generateAPIResponse();

    console.log('═══════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════');
    console.log(`Total tests: ${apiResponse.test_run.total_tests}`);
    console.log(`✓ Successful: ${apiResponse.test_run.successful}`);
    console.log(`✗ Failed: ${apiResponse.test_run.failed}`);
    console.log(`○ Empty: ${apiResponse.test_run.empty}`);
    console.log(`⏱ Timeout: ${apiResponse.test_run.timeout}\n`);

    console.log('By Category:');
    for (const [category, stats] of Object.entries(apiResponse.summary.by_category)) {
      console.log(`  ${category}: ${stats.successful}/${stats.total} successful`);
    }
    console.log('');

    return apiResponse;
  }
}

// Run tests
async function main() {
  const tester = new TokoProviderTester();
  const apiResponse = await tester.runAllTests();

  // Output JSON to file
  const fs = await import('fs/promises');
  const outputPath = './toko-provider-test-results.json';
  await fs.writeFile(outputPath, JSON.stringify(apiResponse, null, 2));

  console.log(`\n📄 Full API response saved to: ${outputPath}`);
  console.log('\n═══════════════════════════════════════════════');
  console.log('API Response Preview:');
  console.log('═══════════════════════════════════════════════');
  console.log(JSON.stringify(apiResponse, null, 2).slice(0, 1000) + '...\n');
}

main().catch(console.error);
