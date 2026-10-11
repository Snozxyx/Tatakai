import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8091';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage();
const requests = [];
await page.route('**/__tag-check', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Tag regression check</body></html>' }));
if (!process.env.LIVE_TAG_CHECK) {
  await page.route('**/anilist/graphql', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    assert.equal(body.forceUpstream, true);
    const data = body.query.includes('MediaTagCollection') ? { MediaTagCollection: [{ id: 648, name: 'Crime' }] }
      : { Page: { pageInfo: { total: 320, hasNextPage: body.variables.page === 1 }, media: [{ id: body.variables.page, title: { english: 'Crime story' }, countryOfOrigin: 'JP' }] } };
    await route.fulfill({ json: { data } });
  });
  await page.route('**/mapping/mangabaka/**', async route => {
    const url = new URL(route.request().url()); requests.push(url.toString());
    const payload = url.pathname.endsWith('/tags') ? { data: [{ id: 250, name: 'Murder', name_path: 'Activities > Crimes > Murder', content_rating: 'safe' }] }
      : { pagination: { count: 3229, next: url.searchParams.get('page') === '1' ? 'page2' : null }, data: [
        { id: 11, title: 'Mapped title', source: { anilist: { id: 30021 } }, type: 'manga' },
        { id: 12, title: 'MAL title', source: { my_anime_list: { id: 21 } } },
        { id: 13, title: 'Unmapped title', source: {} },
      ] };
    if (!url.pathname.endsWith('/tags')) {
      assert.deepEqual(url.searchParams.getAll('tag'), ['250']);
      assert.deepEqual(url.searchParams.getAll('content_rating'), ['safe', 'suggestive']);
    }
    await route.fulfill({ json: payload });
  });
}
try {
  await page.goto(`${base}/__tag-check`);
  const result = await page.evaluate(async () => {
    const { searchMangaTags } = await import('/src/core/content/manga-tag-search.ts');
    const legacy = await searchMangaTags('', 1, 20, { tags: ['Murder'], adult: false });
    const next = await searchMangaTags('', 2, 20, { tags: ['Murder'], tagSource: 'mangabaka', adult: false });
    const anilist = await searchMangaTags('', 1, 20, { tags: ['Crime'], tagSource: 'anilist' });
    let error;
    try { await searchMangaTags('', 1, 20, { tags: ['Not a real tag'], tagSource: 'mangabaka' }); }
    catch (caught) { error = caught.message; }
    return { legacy, next, anilist, error };
  });
  assert.equal(result.legacy.source, 'mangabaka');
  assert.ok(result.legacy.total > 0); assert.ok(result.legacy.results.length > 0);
  assert.equal(result.legacy.hasNextPage, true); assert.equal(result.legacy.totalIsApproximate, false);
  assert.equal(result.anilist.source, 'anilist'); assert.ok(result.anilist.results.length > 0);
  assert.equal(result.anilist.totalIsApproximate, true);
  assert.match(result.error, /not a MangaBaka tag/);
  if (!process.env.LIVE_TAG_CHECK) {
    assert.equal(result.next.hasNextPage, false);
    assert.equal(result.legacy.results[0].id, '30021');
    assert.equal(result.legacy.results[1].id, 'mal:21');
    assert.equal(result.legacy.results[2].href, 'https://mangabaka.org/13');
    assert.equal(requests.filter(r => typeof r !== 'string' && r.query.includes('MediaTagCollection')).length, 1);
  }
  console.log(`PASS ${process.env.LIVE_TAG_CHECK ? 'live catalogs' : 'fixtures'}: exact legacy Murder lookup (${result.legacy.total} matches), source preservation, counts, pagination, unknown tag errors, and complete upstream AniList search.`);
} finally { await browser.close(); }
