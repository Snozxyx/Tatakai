import { recordSourceReport } from './diagnostics';
import { listRemoteExtensions, invokeRemote } from './installed';
import { matchRemoteTitle } from './resolve';
import { extensionDeadline } from './deadline';
import { proxyRemoteUrl } from './media';
import type { MangaReadResponse } from '@/types/manga';
import { fetchMangaBakaSeries } from '@/lib/mapping/mangabaka';

export async function remoteMangaChapters(params: { anilistId?: number; title?: string; titles?: string[] }) {
  const rows = (await listRemoteExtensions()).filter(r => r.enabled && r.ecosystem === 'seanime' && r.manifest.type === 'manga-provider');
  const mapping = rows.length && params.anilistId ? await extensionDeadline(() => fetchMangaBakaSeries(params.anilistId!), 1500).catch(() => null) : null;
  const chapters: any[] = []; const failedProviders: string[] = [];
  await Promise.all(rows.map(async row => {
    const started = performance.now(); let count = 0;
    try {
      await extensionDeadline(async signal => {
      const titleId = await matchRemoteTitle(row, { query: params.title || mapping?.title || '', media: {
        id: params.anilistId, idMal: mapping?.malId ?? undefined, englishTitle: mapping?.title,
        romajiTitle: mapping?.romanizedTitle ?? undefined, nativeTitle: mapping?.nativeTitle ?? undefined, synonyms: [...(params.titles || []), ...(mapping?.aliases || [])],
      } }, signal);
      const upstream = await invokeRemote(row, 'remoteChapters', { titleId });
      signal.throwIfAborted();
      if (!Array.isArray(upstream)) throw new Error('Invalid chapter response');
      for (const chapter of upstream) {
        const number = Number(chapter.chapter ?? chapter.number);
        if (!Number.isFinite(number) || !chapter.id) continue;
        chapters.push({ number, title: chapter.title, sources: [{ provider: row.id, providerName: row.manifest.name,
          chapterKey: `${row.id}:${chapter.id}`, providerChapterId: String(chapter.id),
          language: chapter.language || row.manifest.lang || null, scanlator: chapter.scanlator || null, releaseDate: chapter.updatedAt || null }] });
        count++;
      }
      }, 8000);
      recordSourceReport({ provider: row.id, name: row.manifest.name, ecosystem: row.ecosystem, kind: 'manga', count, durationMs: Math.round(performance.now() - started), status: count ? 'ok' : 'empty' });
    } catch (error) { failedProviders.push(row.id); recordSourceReport({ provider: row.id, name: row.manifest.name, ecosystem: row.ecosystem, kind: 'manga', count: 0, durationMs: Math.round(performance.now() - started), status: 'error', error: error instanceof Error ? error.message : 'Chapter lookup failed' }); }
  }));
  return { chapters, failedProviders, providersAvailable: rows.map(r => r.id) };
}

export async function remoteMangaPages(params: { extensionId: string; chapterKey: string; providerChapterId?: string; anilistId?: number }): Promise<MangaReadResponse> {
  const row = (await listRemoteExtensions()).find(r => r.id === params.extensionId && r.enabled);
  if (!row) return { success: false, message: 'Manga extension is disabled or removed' };
  const chapterId = params.providerChapterId || params.chapterKey.slice(row.id.length + 1);
  const started = performance.now();
  const result = await invokeRemote(row, 'remotePages', { chapterId }).catch(error => { recordSourceReport({ provider: row.id, name: row.manifest.name, ecosystem: row.ecosystem, kind: 'pages', count: 0, durationMs: Math.round(performance.now() - started), status: 'error', error: String(error) }); throw error; });
  if (!Array.isArray(result)) throw new Error('Invalid manga page response');
  const pages = await Promise.all([...result].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)).map(async (page: any, index: number) => {
    const imageUrl = typeof page === 'string' ? page : page.url;
    if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) throw new Error('Invalid manga image URL');
    return { pageNumber: index + 1, imageUrl, proxiedImageUrl: await proxyRemoteUrl(imageUrl, page.headers), width: page.width || null, height: page.height || null, headers: page.headers };
  }));
  recordSourceReport({ provider: row.id, name: row.manifest.name, ecosystem: row.ecosystem, kind: 'pages', count: pages.length, durationMs: Math.round(performance.now() - started), status: pages.length ? 'ok' : 'empty' });
  return { success: pages.length > 0, data: { pages, chapter: { chapterKey: params.chapterKey,
    anilistId: params.anilistId || 0, provider: row.id, providerChapterId: chapterId, number: null, title: null, language: null } } };
}
