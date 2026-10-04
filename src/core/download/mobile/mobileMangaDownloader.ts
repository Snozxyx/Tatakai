/**
 * mobileMangaDownloader.ts — Capacitor-native manga chapter downloader.
 *
 * Desktop downloads chapters in the Electron main process and serves offline
 * pages over `tatakai-media://`. Mobile resolves pages through the in-WebView
 * extension runtime, writes each page image into app storage with
 * `@capacitor/filesystem`, records an `OfflineChapter` row, and drives the
 * shared `manga-download-monitor` store. Offline reading is served via
 * `Capacitor.convertFileSrc()` (see manga-client `getMangaReadByKey`).
 *
 * Network uses the explicit CapacitorHttp-backed mobile proxy (native and
 * CORS-free) so page images from third-party CDNs download reliably.
 */

import { Capacitor } from '@capacitor/core';
import { isCapacitor } from '@/lib/platform/platform';
import {
  fetchViaMobileProxy,
  isMobileProxyUrl,
  normalizeMobileHeaders,
} from '@/core/extensions/mobile/mobileProxy';
import type { MangaDownloadChapter, MangaDownloadSeries } from '@/types/electron-bridge';
import {
  mangaJobId,
  markMangaProgress,
  markMangaCompleted,
  markMangaError,
} from '@/core/download/manga-download-monitor';
import {
  downloadServiceFinish,
  downloadServiceProgress,
  downloadServiceStart,
} from './mobileDownloadService';

function chapterLabelFor(chapter: MangaDownloadChapter): string {
  const numLabel = chapter.chapterNumber != null ? `Ch. ${chapter.chapterNumber}` : 'Chapter';
  return `${chapter.volume != null ? `Vol ${chapter.volume} · ` : ''}${numLabel}`;
}

/** Folder layout: Documents/tatakai/manga/<anilistId>/<safeChapterKey>/ */
const ROOT = 'tatakai/manga';
const cancelled = new Set<string>();

function safeSeg(s: string): string {
  return String(s).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120);
}

function chapterDir(anilistId: number, chapterKey: string): string {
  return `${ROOT}/${anilistId}/${safeSeg(chapterKey)}`;
}

function extFromUrl(url: string): string {
  return (url.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1] || 'jpg').toLowerCase();
}

type DownloadablePage = {
  imageUrl?: string;
  proxiedImageUrl?: string | null;
  originalUrl?: string;
  headers?: unknown;
};

function pageCandidates(page: DownloadablePage): string[] {
  const proxied = String(page.proxiedImageUrl || '').trim();
  const original = String(page.originalUrl || page.imageUrl || '').trim();
  const out: string[] = [];
  const push = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };

  if (isMobileProxyUrl(proxied)) push(proxied);
  else if (proxied && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(proxied)) push(proxied);
  push(original);
  return out;
}

/** ArrayBuffer → base64 (chunked to avoid call-stack limits on large images). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/**
 * Download one chapter's pages to app storage. Returns the offline-chapter
 * result on success. Progress + terminal state flow through the monitor, so the
 * shared UI/Dynamic-Island rows update exactly like desktop.
 */
export async function downloadMangaChapterMobile(
  series: MangaDownloadSeries,
  chapter: MangaDownloadChapter,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isCapacitor()) return { ok: false, reason: 'not_mobile' };
  const jobId = mangaJobId(series.anilistId, chapter.chapterKey);
  cancelled.delete(jobId);
  const svcLabel = `${series.title} · ${chapterLabelFor(chapter)}`;
  // Foreground service + status-bar progress so the chapter survives
  // backgrounding and stays visible outside the app.
  downloadServiceStart(jobId, svcLabel);

  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    // Resolve pages through the extension runtime (routes to the mobile dispatch).
    const { fetchExtensionMangaPages } = await import('@/core/content/manga-extension-runtime');
    const read = await fetchExtensionMangaPages({
      extensionId: chapter.provider || '',
      chapterKey: chapter.chapterKey,
      providerChapterId: chapter.providerChapterId,
      anilistId: series.anilistId,
      alternatives: chapter.alternatives?.map((a) => ({
        provider: a.provider || '',
        chapterKey: a.chapterKey || '',
        providerChapterId: a.providerChapterId,
      })),
    });

    const pages = read.success ? read.data?.pages ?? [] : [];
    if (!pages.length) {
      markMangaError(jobId, 'No pages available for this chapter.');
      downloadServiceFinish(jobId, { ok: false, label: svcLabel });
      return { ok: false, reason: 'no_pages' };
    }

    const dir = chapterDir(series.anilistId, chapter.chapterKey);
    try {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true });
    } catch {
      /* exists */
    }

    let sizeBytes = 0;
    const total = pages.length;
    for (let i = 0; i < total; i++) {
      if (cancelled.has(jobId)) {
        markMangaError(jobId, 'cancelled');
        downloadServiceFinish(jobId, { ok: false, cancelled: true, label: svcLabel });
        return { ok: false, reason: 'cancelled' };
      }
      const page = pages[i] as DownloadablePage;
      const candidates = pageCandidates(page);
      if (!candidates.length) continue;

      // In-app proxy pages resolve natively with header replay (the WebView
      // fetch cannot send the CDN Referer); plain URLs keep the direct path.
      // Each page retries transient blips so one 429/radio drop doesn't fail
      // the whole chapter.
      let buf: ArrayBuffer | null = null;
      let lastErr = '';
      for (const src of candidates) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const fetched = await fetchViaMobileProxy(src, {
              originalUrl: page.originalUrl || page.imageUrl,
              headers: normalizeMobileHeaders(page.headers),
              responseType: 'arraybuffer',
              timeoutMs: 30000,
            });
            if (!fetched.ok || !fetched.data || fetched.data.byteLength === 0) {
              throw new Error(`page ${i + 1}: HTTP ${fetched.status || 'fetch failed'}`);
            }
            buf = fetched.data;
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
            if (attempt + 1 < 3) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          }
        }
        if (buf) break;
      }
      if (!buf) throw new Error(lastErr || `page ${i + 1}: download failed`);
      sizeBytes += buf.byteLength;

      const filePath = `${dir}/${String(i + 1).padStart(4, '0')}.${extFromUrl(String(page.imageUrl || candidates[0]))}`;
      await Filesystem.writeFile({
        path: filePath,
        directory: Directory.Documents,
        data: toBase64(buf),
        recursive: true,
      });

      const pagePct = Math.round(((i + 1) / total) * 100);
      markMangaProgress(jobId, {
        anilistId: series.anilistId,
        chapterKey: chapter.chapterKey,
        page: i + 1,
        totalPages: total,
        percent: pagePct,
      });
      downloadServiceProgress(jobId, svcLabel, pagePct);
    }

    markMangaCompleted({
      anilistId: series.anilistId,
      chapterKey: chapter.chapterKey,
      chapterNumber: chapter.chapterNumber ?? null,
      volume: chapter.volume ?? null,
      provider: chapter.provider ?? null,
      title: series.title,
      localDir: dir,
      pageCount: total,
      sizeBytes,
    });
    downloadServiceFinish(jobId, { ok: true, label: svcLabel });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markMangaError(jobId, msg);
    downloadServiceFinish(jobId, { ok: false, label: svcLabel });
    return { ok: false, reason: msg };
  }
}

export function cancelMangaChapterMobile(anilistId: number, chapterKey: string): void {
  cancelled.add(mangaJobId(anilistId, chapterKey));
}

/** Download many chapters sequentially (bounded — mobile bandwidth/battery). */
export async function downloadMangaChaptersMobile(
  series: MangaDownloadSeries,
  chapters: MangaDownloadChapter[],
): Promise<{ ok: true; completed: number } | { ok: false; reason: string }> {
  if (!isCapacitor()) return { ok: false, reason: 'not_mobile' };
  let completed = 0;
  for (const chapter of chapters) {
    const res = await downloadMangaChapterMobile(series, chapter);
    if (res.ok) completed++;
  }
  return { ok: true, completed };
}

/**
 * Delete a downloaded chapter: files + Dexie row. The offline reader's
 * offline-first lookup then falls through to the extension runtime again.
 */
export async function deleteOfflineMangaChapter(anilistId: number, chapterKey: string): Promise<void> {
  if (!isCapacitor()) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    try {
      await Filesystem.rmdir({ path: chapterDir(anilistId, chapterKey), directory: Directory.Documents, recursive: true });
    } catch {
      /* already gone */
    }
  } catch {
    /* ignore */
  }
  try {
    const { db } = await import('@/core/db/tatakai-db');
    await db.offlineChapters.delete(`${anilistId}:${chapterKey}`);
  } catch {
    /* ignore */
  }
}

/**
 * List a downloaded chapter's pages as playable URLs for the offline reader.
 * Returns `convertFileSrc`-wrapped file URIs the WebView can load in <img>.
 */
export async function getOfflineMangaPagesMobile(
  anilistId: number,
  chapterKey: string,
): Promise<Array<{ pageNumber: number; imageUrl: string }>> {
  if (!isCapacitor()) return [];
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const dir = chapterDir(anilistId, chapterKey);
    const { files } = await Filesystem.readdir({ path: dir, directory: Directory.Documents });
    const names = (files || [])
      .map((f: any) => (typeof f === 'string' ? f : f.name))
      .filter((n: string) => /\.(jpe?g|png|webp|gif|avif)$/i.test(n))
      .sort();
    const out: Array<{ pageNumber: number; imageUrl: string }> = [];
    for (let i = 0; i < names.length; i++) {
      const { uri } = await Filesystem.getUri({
        path: `${dir}/${names[i]}`,
        directory: Directory.Documents,
      });
      out.push({ pageNumber: i + 1, imageUrl: Capacitor.convertFileSrc(uri) });
    }
    return out;
  } catch {
    return [];
  }
}
