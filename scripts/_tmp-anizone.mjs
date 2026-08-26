const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146 Safari/537.36';

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  return { status: r.status, text: await r.text() };
}

// Inspect /anime listing for embedded JSON / wire snapshots
const listing = await fetchText('https://anizone.to/anime');
console.log('listing len', listing.text.length);
console.log('wire:snapshot count', (listing.text.match(/wire:snapshot/g) || []).length);
console.log('getTitle count', (listing.text.match(/getTitle/g) || []).length);

const soloIdx = listing.text.toLowerCase().indexOf('solo');
console.log('solo idx', soloIdx);
if (soloIdx > 0) console.log(listing.text.slice(soloIdx - 50, soloIdx + 200));

// wire:snapshot payloads may embed anime JSON
for (const m of listing.text.matchAll(/wire:snapshot="([^"]+)"/g)) {
  const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  console.log('snapshot len', raw.length, 'solo', raw.toLowerCase().includes('solo'));
  const animePaths = [...raw.matchAll(/\\\/anime\\\/([a-z0-9]{4,12})/gi)].map(x => x[1]);
  console.log('paths in snapshot', [...new Set(animePaths)].slice(0, 10));
}

// probe API guesses
for (const url of [
  'https://anizone.to/api/anime/search?q=Solo%20Leveling',
  'https://anizone.to/api/search?query=Solo%20Leveling',
  'https://anizone.to/livewire/update',
]) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const ct = r.headers.get('content-type');
    const body = (await r.text()).slice(0, 200);
    console.log({ url, status: r.status, ct, body });
  } catch (e) {
    console.log(url, e.message);
  }
}
