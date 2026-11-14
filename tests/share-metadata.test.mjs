import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { get } from 'node:http';
import { createMetaResolver, renderTags, injectIntoHtml } from '../scripts/seo/inject.mjs';
import { createSeoServer } from '../scripts/seo/server.mjs';
import { matchEntityRoute } from '../scripts/seo/routes.mjs';

const base = '<html><head><!-- SEO:START --><title>Tatakai default</title><meta property="og:image" content="site-banner.png"><!-- SEO:END --></head><body><div id="root"></div></body></html>';
const meta = id => ({ title: `Anime ${id} — Anime on Tatakai`, description: 'A synopsis.', kind: 'anime', canonicalPath: `/anime/${id}`, image: `https://images.example/${id}-cover.jpg`, imageWide: `https://images.example/${id}-banner.jpg` });
const envelope = data => Response.json({ success: true, data });
const withHost = (url, host) => new Promise((resolve, reject) => {
  get(url, { headers: { Host: host } }, response => {
    let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; }); response.on('end', () => resolve(text));
  }).on('error', reject);
});

async function fixture(t, lookup, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tatakai-share-'));
  const indexPath = join(directory, 'index.html');
  await writeFile(indexPath, base);
  const server = createSeoServer({ indexPath, lookup, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true }); });
  return { url: `http://127.0.0.1:${server.address().port}`, indexPath };
}

test('Discord wildcard requests get distinct anime titles, banners and canonical URLs without JavaScript', async t => {
  const { url } = await fixture(t, async match => meta(match.id));
  for (const id of ['210031', '21']) {
    const response = await fetch(`${url}/anime/${id}?share=1`, { headers: { 'User-Agent': 'Discordbot/2.0', Accept: '*/*' } });
    const html = await response.text();
    assert.match(html, new RegExp(`Anime ${id} — Anime on Tatakai`));
    assert.match(html, new RegExp(`https://images.example/${id}-banner.jpg`));
    assert.match(html, new RegExp(`https://tatakai.app/anime/${id}`));
    assert.equal((html.match(/property="og:title"/g) || []).length, 1);
    assert.equal((html.match(/property="og:image"/g) || []).length, 1);
    assert.doesNotMatch(html, /site-banner.png|Tatakai default/);
    assert.match(html, /data-rh="true"/);
    assert.match(html, /<div id="root">/);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  }
});

test('HEAD matches GET headers and sends no body', async t => {
  const { url } = await fixture(t, async () => meta('210031'));
  const get = await fetch(`${url}/anime/210031`);
  const head = await fetch(`${url}/anime/210031`, { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
  assert.equal(await head.text(), '');
});

test('unavailable or private entities fall back to uncacheable HTML, while the homepage is untouched', async t => {
  const { url } = await fixture(t, async () => { throw new Error('API unavailable'); });
  for (const path of ['/anime/missing', '/', '/manga/discover']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), base);
  }
});

test('atomic website promotions are read without restarting the renderer', async t => {
  const { url, indexPath } = await fixture(t, async () => meta('21'));
  await writeFile(indexPath, base.replace('id="root"', 'id="root" data-release="new"'));
  assert.match(await (await fetch(url + '/anime/21')).text(), /data-release="new"/);
});

test('failed lookups retry promptly; successful data is isolated by entity kind and id', async () => {
  let time = 0, calls = 0;
  const lookup = createMetaResolver({ now: () => time, fetchImpl: async url => {
    calls++;
    if (calls === 1) throw new Error('Temporary outage');
    return envelope(meta(url.split('/').pop()));
  } });
  const anime = { type: 'anime', id: '210031' };
  assert.equal(await lookup(anime), null);
  assert.equal(await lookup(anime), null);
  assert.equal(calls, 1);
  time = 5001;
  assert.equal((await lookup(anime)).title, meta('210031').title);
  await lookup(anime);
  assert.equal(calls, 2);
  await lookup({ type: 'manga', id: '210031' });
  await lookup({ type: 'anime', id: '21' });
  assert.equal(calls, 4);
});

test('simultaneous crawler requests share one lookup and malformed/private responses reveal nothing', async () => {
  let calls = 0;
  const lookup = createMetaResolver({ fetchImpl: async () => { calls++; await new Promise(r => setTimeout(r, 5)); return envelope(meta('21')); } });
  await Promise.all(Array.from({ length: 10 }, () => lookup({ type: 'anime', id: '21' })));
  assert.equal(calls, 1);
  for (const response of [new Response('Not found', { status: 404 }), envelope({ image: 'https://private.example' }), Response.json({ success: false, data: meta('21') })]) {
    const failed = createMetaResolver({ fetchImpl: async () => response });
    assert.equal(await failed({ type: 'profile', id: 'private-user' }), null);
  }
});

test('metadata is escaped in attributes and JSON-LD, unsafe images fall back', () => {
  const tags = renderTags({ ...meta('21'), title: 'A "title" </script><script>alert(1)</script>', imageWide: 'javascript:alert(1)', image: 'data:text/html,unsafe' }, 'https://tatakai.app/banner.png');
  const html = injectIntoHtml(base, tags);
  assert.doesNotMatch(html, /<script>alert|javascript:|data:text/);
  assert.match(html, /&quot;title&quot;/);
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /https:\/\/tatakai.app\/banner.png/);
});

test('public sharing routes remain supported and reserved manga pages are not entities', () => {
  for (const [path, type] of [['/anime/anilist-21/', 'anime'], ['/manga/30013', 'manga'], ['/@public.user', 'profile'], ['/user/name', 'profile'], ['/community/forum/post-id', 'post'], ['/p/code', 'playlist'], ['/tierlist/code', 'tierlist']]) {
    assert.equal(matchEntityRoute(path)?.type, type);
  }
  assert.equal(matchEntityRoute('/manga/discover'), null);
  assert.equal(matchEntityRoute('/novel/9000')?.type, 'novel');
  assert.equal(matchEntityRoute('/novel/discover'), null);
});

test('sitemaps stay XML, use the requested approved domain, and never fall through to HTML on failure', async t => {
  const xml = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://tatakai.app/anime/210031</loc></url></urlset>';
  const { url, indexPath } = await fixture(t, async () => meta('21'), { fetchImpl: async () => new Response(xml) });
  // Default app origin is used even for unrecognized Host headers.
  const response = await fetch(url + '/sitemap-anime-1.xml');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/xml/);
  assert.equal(await response.text(), xml);
  const head = await fetch(url + '/sitemap.xml', { method: 'HEAD' }); assert.equal(await head.text(), '');
  const redirect = await fetch(url + '/sitemap.xml/', { redirect: 'manual' }); assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), '/sitemap.xml');
  const server = createSeoServer({ indexPath, sites: { 'tatakai.me': { origin: 'https://tatakai.me', indexPath } }, lookup: async () => meta('21'), fetchImpl: async () => new Response(xml) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const other = `http://127.0.0.1:${server.address().port}`;
  const localized = await withHost(other + '/sitemap.xml', 'tatakai.me');
  assert.match(localized, /https:\/\/tatakai.me\/anime\/210031/); assert.doesNotMatch(localized, /tatakai.app/);
  const html = await withHost(other + '/anime/21', 'tatakai.me'); assert.match(html, /https:\/\/tatakai.me\/anime\/21/);
  const broken = await fixture(t, async () => null, { fetchImpl: async () => new Response('<html>CDN error</html>') });
  const failed = await fetch(broken.url + '/sitemap.xml'); assert.equal(failed.status, 503); assert.match(failed.headers.get('content-type'), /application\/xml/); assert.doesNotMatch(await failed.text(), /<html>/);
});
