/**
 * Extension debugging utilities - use in browser console
 * 
 * Usage in DevTools Console:
 * 
 * 1. Check extension status:
 *    await window.debugExtension.checkStatus()
 * 
 * 2. Test source resolution:
 *    await window.debugExtension.testResolve()
 * 
 * 3. Test specific provider:
 *    await window.debugExtension.testProvider('senshi')
 * 
 * 4. Full diagnostics:
 *    await window.debugExtension.runFullDiagnostics()
 */

interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  type: string;
  capabilities: string[];
}

interface SourceResult {
  url: string;
  quality: string;
  providerName: string;
  providerKey: string;
  isM3U8: boolean;
  headers: Record<string, string>;
}

interface RuntimeHealth {
  status: string;
  version: string;
  loadedExtensions: string[];
}

class ExtensionDebugger {
  private async invoke(channel: string, ...args: any[]): Promise<any> {
    if (typeof window === 'undefined' || !(window as any).electron) {
      throw new Error('Must run in Electron renderer process');
    }
    return (window as any).electron.invoke(channel, ...args);
  }

  async checkStatus(): Promise<void> {
    console.log('=== Extension Status Check ===\n');

    try {
      // Check runtime health
      const health = await this.invoke('runtime:health') as RuntimeHealth;
      console.log('✅ Runtime Status:', health.status);
      console.log('   App Version:', health.version);
      console.log('   Loaded Extensions:', health.loadedExtensions.length);

      // List all extensions
      const extensions = await (window as any).electron.listInstalledExtensions() as ExtensionInfo[];
      console.log('\n📦 Installed Extensions:');
      extensions.forEach((ext, i) => {
        console.log(`\n${i + 1}. ${ext.name} (${ext.id})`);
        console.log(`   Version: ${ext.version}`);
        console.log(`   Type: ${ext.type}`);
        console.log(`   Capabilities: ${ext.capabilities?.join(', ') || 'none'}`);
      });

      // Check Toko specifically
      const toko = extensions.find(e => e.id === 'tatakai.extension.toko');
      if (!toko) {
        console.error('\n❌ TOKO NOT LOADED - Extension is missing!');
        console.log('\nTroubleshooting:');
        console.log('1. Check if bundle exists: extension/toko/dist/bundle.js');
        console.log('2. Rebuild extension: cd extension/toko && npm run build');
        console.log('3. Restart the app');
      } else {
        console.log('\n✅ Toko is loaded and ready');
        console.log(`   Capabilities: ${toko.capabilities?.join(', ')}`);
      }
    } catch (err: any) {
      console.error('\n❌ Status check failed:', err.message);
      console.error(err);
    }

    console.log('\n=== Status Check Complete ===\n');
  }

  async testResolve(anime = 'One Piece', episode = 1): Promise<void> {
    console.log(`=== Testing Source Resolution ===`);
    console.log(`Anime: ${anime}, Episode: ${episode}\n`);

    const testQuery = {
      anilistId: 21, // One Piece
      titles: [anime],
      episode,
      resolution: '1080p',
      method: 'single',
      extensionIds: ['tatakai.extension.toko'],
    };

    console.log('Query:', JSON.stringify(testQuery, null, 2));

    try {
      const startTime = Date.now();
      const result = await this.invoke('runtime:resolve-sources', testQuery);
      const elapsed = Date.now() - startTime;

      console.log(`\n⏱️  Elapsed: ${elapsed}ms`);

      if (result.success) {
        if (result.sources && result.sources.length > 0) {
          console.log(`\n✅ Got ${result.sources.length} sources:\n`);
          result.sources.forEach((s: SourceResult, i: number) => {
            console.log(`${i + 1}. Provider: ${s.providerName}`);
            console.log(`   Quality: ${s.quality}`);
            console.log(`   Type: ${s.isM3U8 ? 'HLS' : 'Direct'}`);
            console.log(`   URL: ${s.url.substring(0, 80)}...`);
            console.log('');
          });
        } else {
          console.warn('\n⚠️  No sources returned (empty array)');
          console.log('\nPossible causes:');
          console.log('- Providers timed out (check console for timeout errors)');
          console.log('- Proxy connection failed (look for ECONNREFUSED)');
          console.log('- Anime not found on any provider');
          console.log('- Cloudflare bypass failed (look for bypass errors)');
        }
      } else {
        console.error('\n❌ Request failed:', result.error);
      }
    } catch (err: any) {
      console.error('\n❌ Exception:', err.message);
      console.error(err.stack);
    }

    console.log('\n=== Test Complete ===\n');
  }

  async testProvider(providerType: 'senshi' | 'animepahe' | 'all' = 'senshi'): Promise<void> {
    console.log(`=== Testing Provider: ${providerType} ===\n`);

    try {
      // Direct invoke to extension
      const invokeResult = await this.invoke('extension:invoke', {
        extensionId: 'tatakai.extension.toko',
        method: 'single',
        args: [{
          anilistId: 21,
          titles: ['One Piece'],
          episode: 1,
          resolution: '1080p',
        }],
      });

      console.log('Direct invoke result:', invokeResult);

      if (invokeResult.success && invokeResult.result) {
        console.log(`\n✅ Got ${invokeResult.result.length} results`);

        const grouped = new Map<string, any[]>();
        invokeResult.result.forEach((r: any) => {
          const provider = r.source || r.providerName || 'unknown';
          if (!grouped.has(provider)) grouped.set(provider, []);
          grouped.get(provider)!.push(r);
        });

        console.log('\nResults by provider:');
        for (const [provider, results] of grouped.entries()) {
          console.log(`\n  ${provider}: ${results.length} sources`);
        }
      } else {
        console.warn('\n⚠️  Direct invoke failed or returned empty');
        if (invokeResult.error) {
          console.error('Error:', invokeResult.error);
        }
      }
    } catch (err: any) {
      console.error('\n❌ Test failed:', err.message);
      console.error(err);
    }

    console.log('\n=== Provider Test Complete ===\n');
  }

  async runFullDiagnostics(): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║       TOKO EXTENSION FULL DIAGNOSTICS               ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Step 1: Check status
    await this.checkStatus();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Test Senshi (no Cloudflare)
    console.log('\n--- Testing Senshi (No Cloudflare) ---');
    await this.testProvider('senshi');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Test full resolution
    console.log('\n--- Testing Full Source Resolution ---');
    await this.testResolve();

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║              DIAGNOSTICS COMPLETE                    ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log('Next steps based on results:');
    console.log('1. If Toko not loaded → Rebuild extension and restart app');
    console.log('2. If 0 sources → Check console for fetch errors (ECONNREFUSED, timeout)');
    console.log('3. If some providers work → Issue with specific provider or Cloudflare');
    console.log('4. If proxy errors → Check that proxy started (look for [LocalProxy] logs)');
  }

  // Quick test - just checks if things are working
  async quickTest(): Promise<boolean> {
    console.log('🔍 Quick Test...');

    try {
      const extensions = await (window as any).electron.listInstalledExtensions();
      const toko = extensions.find((e: ExtensionInfo) => e.id === 'tatakai.extension.toko');

      if (!toko) {
        console.error('❌ Toko not loaded');
        return false;
      }

      console.log('✅ Toko loaded');

      const result = await this.invoke('runtime:resolve-sources', {
        anilistId: 21,
        titles: ['One Piece'],
        episode: 1,
        method: 'single',
        extensionIds: ['tatakai.extension.toko'],
      });

      if (result.success && result.sources?.length > 0) {
        console.log(`✅ Got ${result.sources.length} sources`);
        return true;
      } else {
        console.warn('⚠️  No sources returned');
        return false;
      }
    } catch (err: any) {
      console.error('❌ Test failed:', err.message);
      return false;
    }
  }
}

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).debugExtension = new ExtensionDebugger();
  console.log('🔧 Extension debugger loaded!');
  console.log('');
  console.log('Available commands:');
  console.log('  await window.debugExtension.quickTest()           - Quick status check');
  console.log('  await window.debugExtension.checkStatus()         - Full status report');
  console.log('  await window.debugExtension.testResolve()         - Test source resolution');
  console.log('  await window.debugExtension.testProvider()        - Test specific provider');
  console.log('  await window.debugExtension.runFullDiagnostics()  - Complete diagnostic run');
  console.log('');
}

export default ExtensionDebugger;
