/**
 * MangaFire — local scraper adapter (https://mangafire.to)
 * Requirements: 5.1, 5.3, 5.4
 * All scraping runs locally inside the Toko worker — no server dependency.
 */
import type { MangaProvider, MangaChapterEntry, MangaChapterParams, MangaPageEntry } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const BASE = 'https://mangafire.to';
const PROVIDER_NAME = 'mangafire';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: `${BASE}/` };

async function search(title: string): Promise<{ id: string } | null> {
  try {
    const res = await fetchResponse(
      `${BASE}/ajax/search?keyword=${encodeURIComponent(title)}`,
      { headers: { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json() as any;

    // MangaFire returns {status: true, result: {manga: [{id, title, poster...}]}}
    const items: any[] = data?.result?.manga ?? data?.result ?? [];
    if (Array.isArray(items) && items.length > 0) {
      const id = items[0]?.id ?? items[0]?.link ?? items[0]?.slug ?? null;
      return id ? { id: String(id) } : null;
    }
    return null;
  } catch { return null; }
}

async function fetchChapterList(mangaId: string): Promise<MangaChapterEntry[]> {
  const res = await fetchResponse(
    `${BASE}/ajax/manga/${encodeURIComponent(mangaId)}/chapter/en`,
    { headers: { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const data = await res.json() as any;
  const html: string = data?.result ?? '';
  if (!html) return [];

  const $ = loadHtml(html);
  const chapters: MangaChapterEntry[] = [];

  $.find('li[data-id], a[href*="/read/"]').each((i: number, el: any) => {
    const chapterId = el.attr?.('data-id') ?? '';
    const href: string = el.attr?.('href') ?? '';
    const text: string = el.text?.().trim() ?? '';
    const numMatch = text.match(/Chapter\s+(\d+(?:\.\d+)?)/i) || href.match(/chapter-(\d+(?:\.\d+)?)/i);
    const num = numMatch ? parseFloat(numMatch[1]) : i + 1;

    chapters.push({
      number: num,
      title: text || `Chapter ${num}`,
      volume: null,
      sources: [{
        provider: PROVIDER_NAME,
        chapterKey: `${PROVIDER_NAME}:${chapterId || encodeURIComponent(href)}`,
        providerChapterId: chapterId || encodeURIComponent(href),
        language: 'en',
        scanlator: null,
        releaseDate: null,
      }],
    });
  });

  return chapters.sort((a, b) => a.number - b.number);
}

const provider: MangaProvider = {
  name: PROVIDER_NAME,

  async getChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]> {
    try {
      const title = params.title ?? '';
      if (!title) return [];
      const found = await search(title);
      if (!found) return [];
      return fetchChapterList(found.id);
    } catch { return []; }
  },

  async getPages(chapterKey: string): Promise<MangaPageEntry[]> {
    try {
      const colonIdx = chapterKey.indexOf(':');
      const providerChapterId = decodeURIComponent(colonIdx >= 0 ? chapterKey.slice(colonIdx + 1) : chapterKey);

      // MangaFire chapter pages API
      const res = await fetchResponse(
        `${BASE}/ajax/read/${encodeURIComponent(providerChapterId)}/image/list/1/en`,
        { headers: { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } },
      );

      if (res.ok) {
        const data = await res.json() as any;
        const images: any[] = data?.result?.images ?? data?.result ?? [];
        if (Array.isArray(images) && images.length > 0) {
          return images.map((img: any, i: number) => ({
            pageNumber: img.page ?? i + 1,
            imageUrl: Array.isArray(img) ? img[0] : (img.url ?? img.src ?? img.img ?? ''),
          })).filter((p: any) => p.imageUrl);
        }
      }

      // Fallback: fetch chapter HTML and extract images
      const href = providerChapterId.startsWith('http') ? providerChapterId : `${BASE}/read/${providerChapterId}`;
      const pageRes = await fetchResponse(href, { headers: HEADERS });
      if (!pageRes.ok) return [];
      const html = await pageRes.text();
      const $ = loadHtml(html);
      const pages: MangaPageEntry[] = [];

      $.find('.page-image img, .chapter-pages img, img[src*="cdn"]').each((i: number, el: any) => {
        const src = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
        if (src) pages.push({ pageNumber: i + 1, imageUrl: src });
      });

      return pages;
    } catch { return []; }
  },
};

export default provider;
