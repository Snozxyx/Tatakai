/**
 * Debug script to test Toko provider scraping through the local proxy
 * 
 * This script will:
 * 1. Check if the extension is loaded
 * 2. Test the local proxy connection
 * 3. Try to scrape from a provider (AnimeP ahe)
 * 4. Show detailed error messages
 */

import { ipcRenderer } from 'electron';

async function debugTokoProxy() {
  console.log('=== Toko Proxy Debug ===\n');

  // 1. Check if Toko extension is loaded
  console.log('1. Checking extension status...');
  try {
    const extensions = await (window as any).electron.listInstalledExtensions();
    const toko = extensions.find((e: any) => e.id === 'tatakai.extension.toko');
    
    if (!toko) {
      console.error('❌ Toko extension NOT LOADED');
      console.log('Available extensions:', extensions.map((e: any) => e.id));
      return;
    }
    
    console.log(`✅ Toko loaded: v${toko.version}`);
    console.log(`   Capabilities: ${toko.capabilities?.join(', ') || 'none'}`);
  } catch (err: any) {
    console.error('❌ Failed to check extensions:', err.message);
    return;
  }

  // 2. Check proxy status
  console.log('\n2. Checking proxy status...');
  try {
    const health = await ipcRenderer.invoke('runtime:health');
    console.log('✅ Runtime health:', health);
  } catch (err: any) {
    console.error('❌ Runtime health check failed:', err.message);
  }

  // 3. Try to resolve sources using AnimeP ahe
  console.log('\n3. Testing source resolution...');
  const testQuery = {
    anilistId: 21, // One Piece
    titles: ['One Piece'],
    episode: 1,
    resolution: '1080p',
    method: 'single',
    extensionIds: ['tatakai.extension.toko'],
  };

  console.log('Query:', JSON.stringify(testQuery, null, 2));

  try {
    const startTime = Date.now();
    const result = await ipcRenderer.invoke('runtime:resolve-sources', testQuery);
    const elapsed = Date.now() - startTime;
    
    console.log(`\n⏱️  Elapsed: ${elapsed}ms`);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      if (result.sources && result.sources.length > 0) {
        console.log(`\n✅ Got ${result.sources.length} sources`);
        result.sources.forEach((s: any, i: number) => {
          console.log(`  ${i + 1}. ${s.providerName} - ${s.quality} - ${s.url.substring(0, 60)}...`);
        });
      } else {
        console.log('\n⚠️  No sources returned (empty array)');
        console.log('This likely means:');
        console.log('  - Providers timed out');
        console.log('  - Proxy connection failed');
        console.log('  - Website returned no results');
      }
    } else {
      console.error('\n❌ Request failed:', result.error);
    }
  } catch (err: any) {
    console.error('\n❌ Exception during source resolution:', err.message);
    console.error(err.stack);
  }

  // 4. Test direct extension invoke
  console.log('\n4. Testing direct extension invoke...');
  try {
    const invokeResult = await ipcRenderer.invoke('extension:invoke', {
      extensionId: 'tatakai.extension.toko',
      method: 'single',
      args: [{
        anilistId: 21,
        titles: ['One Piece'],
        episode: 1,
        resolution: '1080p',
      }],
    });
    
    console.log('Direct invoke result:', JSON.stringify(invokeResult, null, 2));
    
    if (invokeResult.success && invokeResult.result) {
      console.log(`✅ Got ${invokeResult.result.length} results from direct invoke`);
    } else {
      console.log('⚠️  Direct invoke failed or returned empty');
    }
  } catch (err: any) {
    console.error('❌ Direct invoke exception:', err.message);
  }

  console.log('\n=== Debug Complete ===');
}

// Run when script is imported
if (typeof window !== 'undefined' && (window as any).electron) {
  debugTokoProxy().catch(console.error);
} else {
  console.error('This script must run in the Electron renderer process');
}

export default debugTokoProxy;
