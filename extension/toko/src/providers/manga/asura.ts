/**
 * Asura — A2-port manga provider adapter (asuracomic.net)
 * Requirements: 5.2, 5.3, 5.4
 */

import type { MangaProvider, MangaChapterEntry, MangaChapterParams, MangaPageEntry } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const PROVIDER_NAME = 'asura';
const BASE_URL = 'https://asuracomic.net';

const provider: MangaProvider = {
  name: PROVIDER_NAME,

  async getChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]> {
    const q = encodeURIComponent(params.title ?? '');

    let res: Response;
    try { res = await fetchResponse(`${BASE_URL}/series?search=${q}`); } catch { return []; }
    if (!res.ok) return [];

    let html: string;
    try { html = await res.text(); } catch { return []; }

    const $ = loadHtml(html);
    const results: MangaChapterEntry[] = [];
    let idx = 0;

    // Series search results — each result links to a series page
    $.find('a[href*="/series/"]').each((_: number, el: any) => {
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
          language: 'en',
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
    try { res = await fetchResponse(url); } catch { return []; }
    if (!res.ok) return [];

    let html: string;
    try { html = await res.text(); } catch { return []; }

    const $ = loadHtml(html);
    const pages: MangaPageEntry[] = [];

    $.find('img.wp-manga-chapter-img, .chapter-images img, .reading-content img').each((i: number, el: any) => {
      const src = el.attr('src') ?? el.attr('data-src') ?? '';
      if (src) pages.push({ pageNumber: i + 1, imageUrl: src });
    });

    return pages;
  },
};

export default provider;
