/**
 * AnimeSama — A2-port manga provider adapter (anime-sama.fr)
 * Requirements: 5.2, 5.3, 5.4
 */

import type { MangaProvider, MangaChapterEntry, MangaChapterParams, MangaPageEntry } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const PROVIDER_NAME = 'animesama';
const BASE_URL = 'https://anime-sama.fr';

const provider: MangaProvider = {
  name: PROVIDER_NAME,

  async getChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]> {
    const q = encodeURIComponent(params.title ?? '');

    let res: Response;
    try { res = await __tatakai_fetch__(`${BASE_URL}/catalogue/?search=${q}&type=manga`); } catch { return []; }
    if (!res.ok) return [];

    let html: string;
    try { html = await res.text(); } catch { return []; }

    const $ = __tatakai_parse_html__(html);
    const results: MangaChapterEntry[] = [];
    let idx = 0;

    $.find('a[href*="/catalogue/"]').each((_: number, el: any) => {
      const href = el.attr('href') ?? '';
      const title = el.text().trim();
      if (!href || !title) return;
      idx++;
      results.push({
        number: idx,
        title,
        volume: null,
        sources: [{
          provider: PROVIDER_NAME,
          chapterKey: `${PROVIDER_NAME}:${encodeURIComponent(href)}`,
          providerChapterId: encodeURIComponent(href),
          language: 'fr',
          scanlator: null,
          releaseDate: null,
        }],
      });
    });

    return results;
  },

  async getPages(chapterKey: string): Promise<MangaPageEntry[]> {
    const colonIdx = chapterKey.indexOf(':');
    const encoded = colonIdx >= 0 ? chapterKey.slice(colonIdx + 1) : chapterKey;
    const href = decodeURIComponent(encoded);
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    let res: Response;
    try { res = await __tatakai_fetch__(url); } catch { return []; }
    if (!res.ok) return [];

    let html: string;
    try { html = await res.text(); } catch { return []; }

    const $ = __tatakai_parse_html__(html);
    const pages: MangaPageEntry[] = [];

    $.find('img[src*="cdn"], img[src*="manga"], .reader-img img, #reader img').each((i: number, el: any) => {
      const src = el.attr('src') ?? el.attr('data-src') ?? '';
      if (src) pages.push({ pageNumber: i + 1, imageUrl: src });
    });

    return pages;
  },
};

export default provider;
