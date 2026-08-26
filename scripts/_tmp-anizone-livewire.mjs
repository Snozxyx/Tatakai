const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146 Safari/537.36';

function decodeSnapshot(raw) {
  return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'"));
}

const jar = {};
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';');
    const eq = kv.indexOf('=');
    if (eq > 0) jar[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
}
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const xsrfToken = () => jar['XSRF-TOKEN'] ? decodeURIComponent(jar['XSRF-TOKEN']) : null;

const query = 'Solo Leveling';
const base = 'https://anizone.to';
const searchUrl = `${base}/anime?search=${encodeURIComponent(query)}`;
const r = await fetch(searchUrl, { headers: { 'User-Agent': UA } });
storeCookies(r);
const html = await r.text();
const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
let rawSnapshot = null;
const re = /wire:snapshot="([^"]+)"[^>]*wire:id="([^"]+)"/g;
let m;
while ((m = re.exec(html))) {
  const snap = decodeSnapshot(m[1]);
  if (snap.memo?.name === 'pages.anime-index') {
    rawSnapshot = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'");
    break;
  }
}

const upd = await fetch(`${base}/livewire/update`, {
  method: 'POST',
  headers: {
    'User-Agent': UA,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-CSRF-TOKEN': xsrfToken() ?? csrf,
    'X-Livewire': 'true',
    Referer: searchUrl,
    Origin: base,
    Cookie: cookieHeader(),
  },
  body: JSON.stringify({ _token: csrf, components: [{ snapshot: rawSnapshot, updates: {}, calls: [] }] }),
});
const json = JSON.parse(await upd.text());
const comp = json.components?.[0];
console.log('effects keys', Object.keys(comp?.effects ?? {}));
console.log('snapshot data keys', Object.keys(decodeSnapshot(JSON.stringify(comp?.snapshot ? comp.snapshot : {}))));

const blob = JSON.stringify(json);
console.log('blob len', blob.length);
for (const pat of ['animes', 'main_title', 'short_id', 'slug', 'solo', 'level']) {
  console.log(pat, blob.toLowerCase().includes(pat.toLowerCase()));
}

// find all 8-char ids in response
const ids = [...blob.matchAll(/"id":"([a-z0-9]{4,12})"/gi)].map(x => x[1]);
console.log('json ids', [...new Set(ids)].slice(0, 20));

// title fields
const titles = [...blob.matchAll(/"main_title":"([^"]+)"/g)].map(x => x[1]);
console.log('titles', titles.slice(0, 15));

console.log(blob.slice(0, 2500));
