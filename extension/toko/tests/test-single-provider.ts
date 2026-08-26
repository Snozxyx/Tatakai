import type { SourceOptions } from '../src/types.js';

async function main() {
  const providerPath = process.argv[2];
  const customTitle = process.argv[3] || 'One Piece';
  const customEp = parseInt(process.argv[4] || '1', 10);

  if (!providerPath) {
    console.log('Usage: npx tsx tests/test-single-provider.ts <providerPath> [title] [episode]');
    process.exit(1);
  }

  const modPath = `../src/providers/${providerPath}`;
  console.log(`Loading provider from ${modPath}...`);

  let provider: any;
  try {
    const mod = await import(modPath);
    provider = mod.default || mod;
  } catch (err: any) {
    console.error(`Failed to import provider: ${err.message}`);
    process.exit(1);
  }

  const fn = provider.single || provider.batch;
  if (!fn) {
    console.error(`Provider [${provider.name}] does not export single or batch function.`);
    process.exit(1);
  }

  console.log(`Testing provider [${provider.name}] for "${customTitle}" episode ${customEp}...`);
  const opts: SourceOptions = {
    anilistId: 21,
    titles: [customTitle],
    episode: customEp,
    resolution: '1080p',
  };

  const start = Date.now();
  try {
    const results = await fn.call(provider, opts);
    const duration = Date.now() - start;
    console.log(`[${provider.name}] Duration: ${duration}ms | Results count: ${results.length}`);
    if (results.length > 0) {
      console.log(JSON.stringify(results.slice(0, 3), null, 2));
    } else {
      console.log('[] (No results)');
    }
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`[${provider.name}] Error after ${duration}ms:`, err.message);
  }
}

main();
