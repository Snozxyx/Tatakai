/**
 * Novel offline downloads — same-device persistence for light-novel chapters.
 *
 * Unlike manga (image pages on disk via the desktop download manager),
 * prose is kilobytes: chapters persist as text rows in Dexie (`offlineNovels`),
 * which works identically on desktop, mobile and web. No main-process or
 * filesystem code is needed on any platform.
 */
import { liveQuery } from 'dexie';
import { db, type OfflineNovel } from '@/core/db/tatakai-db';
import { fetchExtensionNovelContent } from '@/core/content/novel-extension-runtime';
import {
  novelJobId,
  markNovelQueued,
  markNovelProgress,
  markNovelCompleted,
  markNovelFailed,
  isNovelJobCancelled,
} from './novel-download-monitor';
import type { MappedNovelChapter, NovelChapterSource } from '@/types/novel';

export interface NovelDownloadTarget {
  novelId: string;
  anilistId: number;
  novelTitle: string;
  novelPoster?: string | null;
  chapter: MappedNovelChapter;
  source?: NovelChapterSource | null;
}

function rowId(anilistId: number, chapterKey: string): string {
  return `${anilistId}:${chapterKey}`;
}

function pickSource(chapter: MappedNovelChapter, preferredProvider?: string): NovelChapterSource | null {
  const sources = chapter.sources || [];
  if (preferredProvider && preferredProvider !== 'auto') {
    const match = sources.find((s) => s.provider === preferredProvider);
    if (match) return match;
  }
  return sources[0] || null;
}

/** Download one chapter's text into the offline store. Returns false when no source yields text. */
export async function downloadNovelChapter(target: NovelDownloadTarget): Promise<boolean> {
  const { novelId, anilistId, novelTitle, novelPoster, chapter } = target;
  const source = target.source ?? pickSource(chapter);
  if (!source?.chapterKey) return false;
  const jobId = novelJobId(anilistId, source.chapterKey);

  markNovelQueued(jobId, {
    anilistId,
    chapterKey: source.chapterKey,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.chapterTitle,
    title: novelTitle,
    posterUrl: novelPoster ?? null,
    provider: source.provider,
    chapterLabel:
      chapter.chapterNumber != null
        ? `Ch. ${chapter.chapterNumber}`
        : chapter.chapterTitle || 'Chapter',
  });
  markNovelProgress(jobId, 10);

  const res = await fetchExtensionNovelContent({
    chapterKey: source.chapterKey,
    provider: source.provider,
    providerChapterId: source.providerChapterId,
    anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
    alternatives: (chapter.sources || []).map((s) => ({
      provider: s.provider,
      chapterKey: s.chapterKey,
      providerChapterId: s.providerChapterId,
    })),
  }).catch(() => null);

  const paragraphs = (res?.data?.paragraphs ?? [])
    .map((p, idx) => ({ index: typeof p.index === 'number' ? p.index : idx, text: String(p.text || '').trim() }))
    .filter((p) => p.text);
  if (paragraphs.length === 0) {
    markNovelFailed(jobId, 'No text available');
    return false;
  }
  markNovelProgress(jobId, 80);

  const row: OfflineNovel = {
    id: rowId(anilistId, source.chapterKey),
    anilistId,
    novelId: String(novelId),
    title: res?.data?.chapter?.title || chapter.chapterTitle || novelTitle,
    posterUrl: novelPoster ?? null,
    chapterKey: source.chapterKey,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.chapterTitle,
    provider: res?.data?.chapter?.provider || source.provider,
    translator: (chapter.sources || []).find((s) => s.chapterKey === source.chapterKey)?.translator ?? null,
    paragraphs,
    paragraphCount: paragraphs.length,
    sizeBytes: paragraphs.reduce((n, p) => n + p.text.length, 0),
    downloadedAt: new Date().toISOString(),
  };
  await db.offlineNovels.put(row);
  markNovelCompleted(jobId, {
    paragraphCount: paragraphs.length,
    sizeBytes: row.sizeBytes,
    provider: row.provider ?? undefined,
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tatakai:offline-novels-updated'));
  }
  return true;
}

/** Download every readable chapter of a novel, reporting progress. Best-effort per chapter. */
export async function downloadAllNovelChapters(
  novelId: string,
  anilistId: number,
  novelTitle: string,
  novelPoster: string | null | undefined,
  chapters: MappedNovelChapter[],
  preferredProvider: string | undefined,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<{ downloaded: number; failed: number; cancelled: number; total: number }> {
  const readable = chapters.filter((c) => (c.sources || []).length > 0);
  let downloaded = 0;
  let failed = 0;
  let cancelled = 0;
  let done = 0;
  for (const chapter of readable) {
    if (shouldCancel?.()) {
      cancelled = readable.length - done;
      break;
    }
    const ok = await downloadNovelChapter({
      novelId,
      anilistId,
      novelTitle,
      novelPoster,
      chapter,
      source: pickSource(chapter, preferredProvider),
    }).catch(() => false);
    if (ok) downloaded += 1;
    else failed += 1;
    done += 1;
    onProgress?.(done, readable.length);
  }
  return { downloaded, failed, cancelled, total: readable.length };
}

export async function isNovelChapterDownloaded(anilistId: number, chapterKey: string): Promise<boolean> {
  try {
    const row = await db.offlineNovels.get(rowId(anilistId, chapterKey));
    return Boolean(row && row.paragraphCount > 0);
  } catch {
    return false;
  }
}

export async function getOfflineNovelParagraphs(
  anilistId: number,
  chapterKey: string,
): Promise<Array<{ index: number; text: string }> | null> {
  try {
    const row = await db.offlineNovels.get(rowId(anilistId, chapterKey));
    if (row && row.paragraphs.length > 0) return row.paragraphs;
    return null;
  } catch {
    return null;
  }
}

/** Chapter navigation must remain available after restarting without a network. */
export async function getOfflineNovelChapters(novelId: string): Promise<MappedNovelChapter[]> {
  const anilistId = Number(novelId.replace(/^anilist:/i, ''));
  const rows = await db.offlineNovels.filter(row => row.novelId === novelId || row.anilistId === anilistId).toArray();
  return rows.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0)).map((row, index) => ({
    chapterNumber: row.chapterNumber ?? null,
    chapterTitle: row.chapterTitle ?? row.title,
    volume: null,
    canonicalOrder: index,
    sources: [{ provider: row.provider || 'tatakai_offline', chapterKey: row.chapterKey,
      providerChapterId: row.chapterKey, language: null, translator: row.translator ?? null, releaseDate: null }],
  }));
}

export async function removeOfflineNovel(anilistId: number, chapterKey: string): Promise<void> {
  try {
    await db.offlineNovels.delete(rowId(anilistId, chapterKey));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tatakai:offline-novels-updated'));
    }
  } catch { /* ignore */ }
}

export async function removeOfflineNovelSeries(anilistId: number): Promise<number> {
  try {
    const rows = await db.offlineNovels.where('anilistId').equals(anilistId).toArray();
    await db.offlineNovels.where('anilistId').equals(anilistId).delete();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tatakai:offline-novels-updated'));
    }
    return rows.length;
  } catch {
    return 0;
  }
}

export function observeOfflineNovels(
  onChange: (rows: OfflineNovel[]) => void,
): () => void {
  try {
    const observable = liveQuery(() => db.offlineNovels.orderBy('downloadedAt').reverse().toArray());
    const subscription = observable.subscribe({
      next: (rows) => onChange(rows || []),
      error: () => onChange([]),
    });
    return () => subscription.unsubscribe();
  } catch {
    onChange([]);
    return () => undefined;
  }
}
