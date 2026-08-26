/**
 * Animeblkom (Arabic) — أنمي بالكوم
 *
 * Free Arabic subbed anime at https://animeblkom.net.
 *   - Search:        /search?q=<title>        → links to /anime/{slug}
 *   - Episode list:  /anime/{slug}            → links to /watch/{slug}/{ep}
 *   - Watch page:    /watch/{slug}/{ep}       → server buttons with embed URLs
 *
 * The watch page lists multiple servers (Blkom, Google, Mp4upload, Cloudy,
 * Tune, …). We pull every server's embed/iframe, flag direct m3u8 when present,
 * and tag each source with `audioLanguage: 'ar'`. The provider also advertises
 * Arabic via getLanguages() so the Tatakai language engine can select it.
 */
// Worker sandbox globals.

import { BaseI18nProvider, type RawDubSource } from '../base/base-i18n-provider.js';

import { fetchTextWithBypass } from '../../utils/common/fetch-bypass.js';
import { loadHtml } from '../../utils/http/fetch.js';
const BASE = 'https://animeblkom.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

async function fetchHtml(url: string, referer: string = BASE): Promise<string | null> {
  return fetchTextWithBypass(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ar,en;q=0.6',
      Referer: referer,
    },
    timeoutMs: 12000,
  });
}

function absolute(href: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  return `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

function scoreTitle(query: string, candidate: string): number {
  const q = query.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const c = candidate.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.includes(q) || q.includes(c)) return 80;
  let shared = 0;
  for (const ch of q) if (c.includes(ch)) shared++;
  return Math.round((shared / Math.max(q.length, c.length)) * 60);
}

function extractSlug(html: string, query: string): string | null {
  const $ = loadHtml(html);
  const candidates: { slug: string; title: string; score: number }[] = [];

  $.find("a[href*='/anime/']").each((_: number, el: any) => {
    const href: string = el.attr?.('href') ?? '';
    const m = href.match(/\/anime\/([^/?#]+)\/?(?:[?#].*)?$/);
    if (!m) return;
    const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
    if (!title) return;
    candidates.push({ slug: m[1], title, score: scoreTitle(query, title) });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].slug;
}

function extractServerSources(html: string, pageUrl: string): RawDubSource[] {
  const $ = loadHtml(html);
  const out: RawDubSource[] = [];
  const seen = new Set<string>();

  const addUrl = (url: string, server: string, priority = 50) => {
    const u = url.trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    const isDirect = /\.m3u8($|[?#])/i.test(u) || /\.mp4($|[?#])/i.test(u);
    out.push({
      url: u,
      server: server || 'server',
      language: 'ar',
      quality: isDirect ? 'auto' : '',
      priority: isDirect ? 0 : priority,
      headers: { Referer: pageUrl },
    });
  };

  // 1. Direct m3u8/mp4 inside inline <script> (Blkom player sometimes exposes the manifest).
  const scriptM3u8 = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
  if (scriptM3u8) addUrl(scriptM3u8[0], 'blkom', 0);

  // 2. Server containers: links / iframes with names like "Blkom", "Google", "Mp4upload".
  const serverSelectors = [
    '.watch-servers a',
    '.servers-list a',
    'a[data-server]',
    'a[data-url]',
    'a[data-embed]',
    'li[data-server] a',
    'ul.servers li a',
    'iframe[data-src]',
    'iframe[src]',
  ];

  for (const sel of serverSelectors) {
    $.find(sel).each((_: number, el: any) => {
      const href =
        el.attr?.('data-url') ||
        el.attr?.('data-embed') ||
        el.attr?.('data-src') ||
        el.attr?.('src') ||
        el.attr?.('href') ||
        '';
      if (!href) return;
      const name = (el.attr?.('data-server') || el.text?.() || 'server').trim().slice(0, 40);
      addUrl(absolute(href), name);
    });
  }

  // 3. Any iframe in the document we missed.
  if (out.length === 0) {
    $.find('iframe').each((_: number, el: any) => {
      const src = el.attr?.('src') || el.attr?.('data-src');
      if (src) addUrl(absolute(src), 'embed');
    });
  }

  return out;
}

export class AnimeblkomProvider extends BaseI18nProvider {
  readonly name = 'animeblkom';
  readonly sites = [BASE];
  readonly meta = {
    name: 'Animeblkom',
    languages: ['ar'],
    flag: '🇸🇦',
  };

  protected async resolveEpisode(opts: { titles: string[]; episode?: number }): Promise<RawDubSource[]> {
    const queries = opts.titles.filter(Boolean);
    if (queries.length === 0) return [];
    const ep = opts.episode ?? 1;

    for (const query of queries) {
      // 1. Search → slug
      let searchHtml: string | null = null;
      for (const path of [`/search?query=${encodeURIComponent(query)}`, `/search?q=${encodeURIComponent(query)}`, `/anime-list?search=${encodeURIComponent(query)}`]) {
        searchHtml = await fetchHtml(`${BASE}${path}`);
        if (searchHtml && searchHtml.includes('/anime/')) break;
      }
      if (!searchHtml) continue;
      const slug = extractSlug(searchHtml, query);
      if (!slug) continue;

      // 2. Verify the anime page exists and discover the episode URL format.
      const animeHtml = await fetchHtml(`${BASE}/anime/${slug}`);
      let watchUrl = `${BASE}/watch/${slug}/${ep}`;
      if (animeHtml) {
        const m = animeHtml.match(new RegExp(`/watch/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d+)`, 'i'));
        if (m) watchUrl = `${BASE}/watch/${slug}/${ep}`;
      }

      // 3. Fetch the watch page and extract server sources.
      const watchHtml = await fetchHtml(watchUrl, `${BASE}/anime/${slug}`);
      if (!watchHtml) continue;

      const sources = extractServerSources(watchHtml, watchUrl);
      if (sources.length > 0) return sources;
    }

    return [];
  }
}

export default new AnimeblkomProvider();
