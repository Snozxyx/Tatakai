import toonstream from '../extension/toko/src/providers/stream/toonstream.js';
import animepahe from '../extension/toko/src/providers/stream/animepahe.js';
import watchanimeworld from '../extension/toko/src/providers/stream/watchanimeworld.js';
import fouranime from '../extension/toko/src/providers/stream/fouranime.js';
import anizone from '../extension/toko/src/providers/stream/anizone.js';
import aniworld from '../extension/toko/src/providers/stream/aniworld.js';
import anikoto from '../extension/toko/src/providers/stream/anikoto.js';
import animesalt from '../extension/toko/src/providers/stream/animesalt.js';
import acgrip from '../extension/toko/src/providers/torrent/acgrip.js';
import aniliberty from '../extension/toko/src/providers/torrent/aniliberty.js';
import desidub from '../extension/toko/src/providers/stream/desidub.js';
import mkissa from '../extension/toko/src/providers/stream/mkissa.js';

const titles = ['Solo Leveling', 'Ore dake Level Up na Ken', '俺だけレベルアップな件'];
const opts = { anilistId: 151807, titles, episode: 1, resolution: '1080p' };

const providers = [
  ['toonstream', toonstream],
  ['animepahe', animepahe],
  ['watchanimeworld', watchanimeworld],
  ['4anime', fouranime],
  ['anizone', anizone],
  ['aniworld', aniworld],
  ['anikoto', anikoto],
  ['animesalt', animesalt],
  ['acgrip', acgrip],
  ['aniliberty', aniliberty],
  ['desidub', desidub],
  ['mkissa', mkissa],
];

for (const [name, provider] of providers) {
  const fn = provider.single || provider.batch;
  const start = Date.now();
  try {
    const results = await Promise.race([
      fn.call(provider, opts),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout 25s')), 25000)),
    ]);
    console.log(JSON.stringify({
      provider: name,
      status: results.length ? 'ok' : 'empty',
      durationMs: Date.now() - start,
      resultCount: results.length,
      sample: results[0] ? {
        url: results[0].url?.slice(0, 120),
        sourceType: results[0].sourceType,
        isM3U8: results[0].url?.includes('.m3u8'),
      } : null,
    }));
  } catch (err) {
    console.log(JSON.stringify({
      provider: name,
      status: 'error',
      durationMs: Date.now() - start,
      error: err.message,
    }));
  }
}
