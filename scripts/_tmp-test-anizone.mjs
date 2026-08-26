import anizone from '../extension/toko/src/providers/stream/anizone.ts';

const r = await anizone.single({
  anilistId: 151807,
  titles: ['Solo Leveling', 'Ore dake Level Up na Ken'],
  episode: 1,
  resolution: '1080p',
});
console.log('count', r.length);
if (r[0]) console.log('url', r[0].url.slice(0, 100));
