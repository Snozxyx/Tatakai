import { Capacitor } from '@capacitor/core';
import { db } from '@/core/db/tatakai-db';
import type { ExtensionTitle } from './library';

const sha = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const extensionChapterKey = async (sourceId: string, chapterId: string) => `${sourceId}:${(await sha(chapterId)).slice(0, 32)}`;
export const extensionVideoKey = async (namespace: string, sourceId: string, titleId: string, entryId: string) => `custom.${await sha(JSON.stringify([namespace, sourceId, titleId, entryId]))}`;
/** Negative IDs reserve a separate local download identity; they are never sent to AniList. */
export async function extensionDownloadIdentity(title: ExtensionTitle) {
  const identity = JSON.stringify([title.namespace, title.sourceId, title.id]);
  const id = -parseInt((await sha(identity)).slice(0, 12), 16) - 1;
  const key = `extension-download:${id}`;
  await db.transaction('rw', db.kv, async () => {
    const existing = await db.kv.get(key);
    if (existing) {
      const previous = JSON.parse(existing.value) as ExtensionTitle;
      if (JSON.stringify([previous.namespace, previous.sourceId, previous.id]) !== identity) throw Error('Local extension download identity collision');
    }
    await db.kv.put({ key, value: JSON.stringify(title), createdAt: new Date().toISOString() });
  });
  return id;
}
export async function extensionOfflinePages(sourceId: string, chapterId: string) {
  const chapterKey = await extensionChapterKey(sourceId, chapterId);
  const row = await db.offlineChapters.filter(row => row.chapterKey === chapterKey).first();
  if (!row || row.anilistId >= 0) return null;
  if (Capacitor.isNativePlatform()) {
    const { getOfflineMangaPagesMobile } = await import('@/core/download/mobile/mobileMangaDownloader');
    const pages = await getOfflineMangaPagesMobile(row.anilistId, chapterKey);
    return pages.length === row.pageCount ? { pages } : null;
  }
  const bridge = (window as any).electron;
  if (!bridge?.manga?.getOfflinePages) return null;
  const result = await bridge.manga.getOfflinePages({ anilistId: row.anilistId, chapterKey });
  if (!result?.success || !result.pages?.length) return null;
  return { pages: await Promise.all(result.pages.map(async (page: any) => {
    if (String(page.imageUrl).startsWith('tatakai-media://') && bridge.streamLocalFile) {
      const stream = await bridge.streamLocalFile(page.imageUrl);
      if (!stream?.success || !stream.url) throw Error('Offline extension image is unavailable');
      return { ...page, imageUrl: stream.url };
    }
    return page;
  })) };
}
