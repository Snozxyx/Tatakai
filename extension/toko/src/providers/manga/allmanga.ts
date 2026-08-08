/**
 * AllManga — local scraper adapter (https://allmanga.to)
 * Requirements: 5.1, 5.3, 5.4
 * All scraping runs locally inside the Toko worker — no server dependency.
 */
import type { MangaProvider, MangaChapterEntry, MangaChapterParams, MangaPageEntry } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE = 'https://allmanga.to';
const PROVIDER_NAME = 'allmanga';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: `${BASE}/` };

async function searchManga(title: string): Promise<{ slug: string } | null> {
  try {
    const res = await __tatakai_fetch__(
      `${BASE}/search?query=${encodeURIComponent(title)}&type=manga`,
      { headers: HEADERS },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const $ = __tatakai_parse_html__(html);
    let slug: string | null = null;
    $.find('a[href*="/manga/"]').each((_: number, el: any) => {
      if (slug) return;
      const href: string = el.attr?.('href') ?? '';
      const m = href.match(/\/manga\/([^/?#]+)/);
      if (m) slug = m[1];
    });
    return slug ? { slug } : null;
  } catch { return null; }
}

const provider: MangaProvider = {
  name: PROVIDER_NAME,

  async getChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]> {
    try {
      const title = params.title ?? '';
      if (!title) return [];
      const found = await searchManga(title);
      if (!found) return [];

      const res = await __tatakai_fetch__(`${BASE}/manga/${found.slug}`, { headers: HEADERS });
      if (!res.ok) return [];
      const html = await res.text();
      const $ = __tatakai_parse_html__(html);
      const results: MangaChapterEntry[] = [];

      $.find('a[href*="/chapter/"], a[href*="/ch-"]').each((i: number, el: any) => {
        const href: string = el.attr?.('href') ?? '';
        const numMatch = href.match(/chapter[/-](\d+(?:\.\d+)?)/i) || el.text?.().match(/(\d+(?:\.\d+)?)/);
        const num = numMatch ? parseFloat(numMatch[1]) : i + 1;
        const chapterId = href.split('/').filter(Boolean).pop() ?? String(i + 1);
        results.push({
          number: num,
          title: el.text?.().trim() || `Chapter ${num}`,
          volume: null,
          sources: [{
            provider: PROVIDER_NAME,
            chapterKey: `${PROVIDER_NAME}:${encodeURIComponent(href || chapterId)}`,
            providerChapterId: encodeURIComponent(href || chapterId),
            language: 'en',
            scanlator: null,
            releaseDate: null,
          }],
        });
      });

      return results.sort((a, b) => a.number - b.number);
    } catch { return []; }
  },

  async getPages(chapterKey: string): Promise<MangaPageEntry[]> {
    try {
      const colonIdx = chapterKey.indexOf(':');
      const encoded = colonIdx >= 0 ? chapterKey.slice(colonIdx + 1) : chapterKey;
      const href = decodeURIComponent(encoded);
      const url = href.startsWith('http') ? href : `${BASE}${href}`;

      const res = await __tatakai_fetch__(url, { headers: HEADERS });
      if (!res.ok) return [];
      const html = await res.text();
      const $ = __tatakai_parse_html__(html);
      const pages: MangaPageEntry[] = [];

      $.find('img[src*="cdn"], img[src*="manga"], .reader-img img, #reader img, .page img').each((i: number, el: any) => {
        const src = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
        if (src) pages.push({ pageNumber: i + 1, imageUrl: src });
      });

      return pages;
    } catch { return []; }
  },
};

export default provider;
