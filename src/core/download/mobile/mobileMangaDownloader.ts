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
  isNativeProxyUrl,
  normalizeMobileHeaders,
  resolveMobileProxy,
} from '@/core/extensions/mobile/mobileProxy';
import type { MangaDownloadChapter, MangaDownloadSeries } from '@/types/electron-bridge';
import {
  mangaJobId,
  markMangaProgress,
  markMangaCompleted,
  markMangaError,
  markMangaQueued,
  rememberMangaJobMeta,
} from '@/core/download/manga-download-monitor';
import {
  downloadServiceFinish,
  downloadServiceProgress,
  downloadServiceStart,
} from './mobileDownloadService';
import { getInterruptedMangaJobs, saveInterruptedMangaJob, removeInterruptedMangaJob } from './mangaRecovery';
import { getDownloadAutoResume } from '@/lib/downloadPreferences';
const activeJobs = new Set<string>();

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

  // Native loopback (`http://127.0.0.1:<port>/stream/<token>`) is the BEST
  // candidate: headers are replayed natively and it avoids a JS-bridge fetch.
  // Previously these were filtered out, forcing a direct CDN fetch that 404'd
  // on Referer-locked hosts when headers were incomplete. Dead native tokens
  // still fall through to the direct URL below via resolve failure.
  if (isMobileProxyUrl(proxied)) push(proxied);
  else if (isNativeProxyUrl(proxied)) {
    // Only prefer a live token; an expired one would 410 and waste retries.
    if (resolveMobileProxy(proxied)) push(proxied);
    else if (proxied) push(proxied);
  } else if (proxied) push(proxied);
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
  if (activeJobs.has(jobId)) return { ok: false, reason: 'already_downloading' };
  saveInterruptedMangaJob(series, chapter);
  activeJobs.add(jobId);
  cancelled.delete(jobId);
  const svcLabel = `${series.title} · ${chapterLabelFor(chapter)}`;
  // Foreground service + status-bar progress so the chapter survives
  // backgrounding and stays visible outside the app.
  downloadServiceStart(jobId, svcLabel);

  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

    // Desktop parity: resolve AND download per source. The primary source may
    // resolve pages whose CDN URLs are all dead (rotated/signed links → every
    // image 404s) while an alternative scanlator serves fine. First source
    // with >0 downloaded pages wins.
    const { fetchExtensionMangaPages } = await import('@/core/content/manga-extension-runtime');
    type SourceAttempt = { provider: string; chapterKey: string; providerChapterId?: string };
    const attempts: SourceAttempt[] = [];
    const pushAttempt = (provider: string, chapterKey: string, providerChapterId?: string) => {
      if (!provider || !chapterKey) return;
      if (attempts.some((a) => a.provider === provider && a.chapterKey === chapterKey)) return;
      attempts.push({ provider, chapterKey, providerChapterId });
    };
    pushAttempt(chapter.provider || '', chapter.chapterKey, chapter.providerChapterId);
    for (const a of chapter.alternatives || []) {
      pushAttempt(a.provider || '', a.chapterKey || '', a.providerChapterId);
    }

    const dir = chapterDir(series.anilistId, chapter.chapterKey);
    try {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true });
    } catch {
      /* exists */
    }

    let usedProvider: string | null = null;
    let sizeBytes = 0;
    let okPages = 0;
    let totalPages = 0;
    let lastErrors: string[] = [];
    let attemptedProviders: string[] = [];

    for (const attempt of attempts) {
      if (cancelled.has(jobId)) {
        markMangaError(jobId, 'cancelled');
        downloadServiceFinish(jobId, { ok: false, cancelled: true, label: svcLabel });
        return { ok: false, reason: 'cancelled' };
      }
      // Resolve pages for this source only (no cross-source blending).
      const read = await fetchExtensionMangaPages({
        extensionId: attempt.provider,
        chapterKey: attempt.chapterKey,
        providerChapterId: attempt.providerChapterId,
        anilistId: series.anilistId,
        alternatives: [],
      });
      const pages = read.success ? read.data?.pages ?? [] : [];
      if (!pages.length) {
        lastErrors = [read.message || `No pages from ${attempt.provider}`];
        attemptedProviders.push(attempt.provider);
        continue;
      }
      attemptedProviders.push(attempt.provider);

      const signature = JSON.stringify([attempt.provider, attempt.chapterKey, pages.map((page: DownloadablePage) => {
        const raw = page.originalUrl || resolveMobileProxy(String(page.imageUrl || ''))?.url || page.imageUrl;
        try {
          const url = new URL(String(raw));
          for (const key of [...url.searchParams.keys()]) if (/^(token|expires|expiry|signature|sig|auth|authorization|policy|key-pair-id|hdnts|hdnea|x-amz-.+)$/i.test(key)) url.searchParams.delete(key);
          url.hash = ''; return url.toString();
        } catch { return raw; }
      })]);
      let checkpoint: { signature: string; completed: Record<string, { file: string; size: number }> } = { signature, completed: {} };
      try {
        const saved = await Filesystem.readFile({ path: `${dir}/checkpoint.json`, directory: Directory.Documents, encoding: Encoding.UTF8 });
        const parsed = JSON.parse(String(saved.data));
        if (parsed.signature === signature) checkpoint = parsed;
      } catch { /* First attempt or interrupted checkpoint write. */ }

      // Clean partials from a previous dead source so files never mix across
      // scanlators (same 0001.* names).
      if (usedProvider !== null || okPages > 0 || lastErrors.length > 0) {
        try {
          const { files } = await Filesystem.readdir({ path: dir, directory: Directory.Documents });
          const names = (files || []).map((f: unknown) => (typeof f === 'string' ? f : String((f as { name?: string }).name || '')));
          for (const name of names) {
            if (!/^\d{4}\./.test(name)) continue;
            try {
              await Filesystem.deleteFile({ path: `${dir}/${name}`, directory: Directory.Documents });
            } catch { /* already gone */ }
          }
        } catch { /* best-effort */ }
      }

      const total = pages.length;
      let attemptOk = 0;
      let attemptBytes = 0;
      const pageErrors: string[] = [];
      let attemptCancelled = false;
      for (let i = 0; i < total; i++) {
        if (cancelled.has(jobId)) {
          attemptCancelled = true;
          break;
        }
        const page = pages[i] as DownloadablePage;
        const previous = checkpoint.completed[String(i)];
        if (previous) {
          try {
            const saved = await Filesystem.stat({ path: previous.file, directory: Directory.Documents });
            if (saved.size === previous.size && saved.size > 0) {
              attemptOk++; attemptBytes += saved.size;
              markMangaProgress(jobId, { anilistId: series.anilistId, chapterKey: chapter.chapterKey, page: i + 1, totalPages: total, percent: Math.round((attemptOk / total) * 100) });
              continue;
            }
          } catch { /* Missing partial resource must be downloaded again. */ }
        }
        const candidates = pageCandidates(page);
        if (!candidates.length) {
          pageErrors.push(`page ${i + 1}: no URL`);
          continue;
        }

        // In-app proxy pages resolve natively with header replay (the WebView
        // fetch cannot send the CDN Referer); plain URLs keep the direct path.
        // A single dead image (HTTP 404 from a rotated CDN URL) skips that
        // page instead of aborting the whole chapter.
        let buf: ArrayBuffer | null = null;
        let lastErr = '';
        for (const src of candidates) {
          for (let retry = 0; retry < 3; retry++) {
            try {
              const fetched = await fetchViaMobileProxy(src, {
                originalUrl: page.originalUrl || page.imageUrl,
                headers: normalizeMobileHeaders(page.headers),
                responseType: 'arraybuffer',
                timeoutMs: 30000,
              });
              if (!fetched.ok || !fetched.data || fetched.data.byteLength === 0) {
                const status = Number(fetched.status) || 0;
                // A 404 is authoritative (dead CDN URL) — don't waste 2 more
                // retries on the same candidate, move to the next candidate.
                if (status === 404) {
                  lastErr = `page ${i + 1}: HTTP 404`;
                  break;
                }
                throw new Error(`page ${i + 1}: HTTP ${status || 'fetch failed'}`);
              }
              // Guard against HTML error pages saved as images (e.g. a CDN
              // 404 page returned with 200): must look like an image.
              const ct = String(fetched.contentType || '').split(';')[0].trim().toLowerCase();
              if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) {
                lastErr = `page ${i + 1}: unexpected content-type ${ct || 'unknown'}`;
                break;
              }
              buf = fetched.data;
              break;
            } catch (e) {
              lastErr = e instanceof Error ? e.message : String(e);
              // Don't retry authoritative 404s — try the next candidate instead.
              if (/HTTP 404/.test(lastErr)) break;
              if (retry + 1 < 3) await new Promise((r) => setTimeout(r, 600 * (retry + 1)));
            }
          }
          if (buf) break;
        }
        if (!buf) {
          // Skip dead pages like desktop does; fail only when nothing survived.
          pageErrors.push(lastErr || `page ${i + 1}: download failed`);
          continue;
        }
        attemptOk++;
        attemptBytes += buf.byteLength;

        const filePath = `${dir}/${String(i + 1).padStart(4, '0')}.${extFromUrl(String(page.imageUrl || candidates[0]))}`;
        await Filesystem.writeFile({
          path: `${filePath}.part`,
          directory: Directory.Documents,
          data: toBase64(buf),
          recursive: true,
        });
        await Filesystem.rename({ from: `${filePath}.part`, to: filePath, directory: Directory.Documents });
        checkpoint.completed[String(i)] = { file: filePath, size: buf.byteLength };
        await Filesystem.writeFile({ path: `${dir}/checkpoint.json.tmp`, directory: Directory.Documents, encoding: Encoding.UTF8, data: JSON.stringify(checkpoint) });
        await Filesystem.rename({ from: `${dir}/checkpoint.json.tmp`, to: `${dir}/checkpoint.json`, directory: Directory.Documents });

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

      if (attemptCancelled) {
        markMangaError(jobId, 'cancelled');
        downloadServiceFinish(jobId, { ok: false, cancelled: true, label: svcLabel });
        return { ok: false, reason: 'cancelled' };
      }
      if (attemptOk > 0) {
        if (attemptOk !== total) throw new Error(`Downloaded ${attemptOk}/${total} pages. Resume to retry missing pages.`);
        usedProvider = attempt.provider;
        okPages = attemptOk;
        sizeBytes = attemptBytes;
        totalPages = total;
        lastErrors = pageErrors;
        break;
      }
      lastErrors = pageErrors.length ? pageErrors : [`No images from ${attempt.provider}`];
    }

    if (okPages === 0) {
      const tried = attemptedProviders.length ? ` (tried: ${attemptedProviders.join(', ')})` : '';
      const hint = lastErrors.some((e) => /404/.test(e))
        ? `All page images returned 404${tried} — the sources removed or moved this chapter. Try another chapter or check for extension updates.`
        : (lastErrors[0] || 'No pages downloaded.') + tried;
      markMangaError(jobId, hint);
      downloadServiceFinish(jobId, { ok: false, label: svcLabel });
      return { ok: false, reason: hint };
    }

    markMangaCompleted({
      anilistId: series.anilistId,
      chapterKey: chapter.chapterKey,
      chapterNumber: chapter.chapterNumber ?? null,
      volume: chapter.volume ?? null,
      provider: usedProvider ?? chapter.provider ?? null,
      title: series.title,
      localDir: dir,
      pageCount: okPages,
      sizeBytes,
    });
    downloadServiceFinish(jobId, { ok: true, label: svcLabel });
    removeInterruptedMangaJob(jobId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markMangaError(jobId, msg);
    downloadServiceFinish(jobId, { ok: false, label: svcLabel });
    return { ok: false, reason: msg };
  } finally {
    activeJobs.delete(jobId);
    if (cancelled.has(jobId)) removeInterruptedMangaJob(jobId);
  }
}

export async function resumeInterruptedMangaDownloads(): Promise<void> {
  if (!isCapacitor() || !getDownloadAutoResume()) return;
  const { initMobileExtensions } = await import('@/core/extensions/mobile/mobileExtensionInstaller');
  await initMobileExtensions();
  for (const [jobId, { series, chapter }] of Object.entries(getInterruptedMangaJobs())) {
    if (activeJobs.has(jobId)) continue;
    rememberMangaJobMeta(jobId, { title: series.title, posterUrl: series.posterUrl, chapterNumber: chapter.chapterNumber, volume: chapter.volume, provider: chapter.provider });
    markMangaQueued(jobId, { anilistId: series.anilistId, chapterKey: chapter.chapterKey, title: series.title, posterUrl: series.posterUrl, kind: series.kind, chapterLabel: chapterLabelFor(chapter) });
    await downloadMangaChapterMobile(series, chapter);
  }
}

export function cancelMangaChapterMobile(anilistId: number, chapterKey: string): void {
  cancelled.add(mangaJobId(anilistId, chapterKey));
  removeInterruptedMangaJob(mangaJobId(anilistId, chapterKey));
}

/** Download many chapters sequentially (bounded — mobile bandwidth/battery). */
export async function downloadMangaChaptersMobile(
  series: MangaDownloadSeries,
  chapters: MangaDownloadChapter[],
): Promise<{ ok: true; completed: number } | { ok: false; reason: string }> {
  if (!isCapacitor()) return { ok: false, reason: 'not_mobile' };
  for (const chapter of chapters) saveInterruptedMangaJob(series, chapter);
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
