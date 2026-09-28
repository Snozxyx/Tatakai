import { useCallback, useEffect, useRef, useState } from "react";
import { getMangaReadByKey } from "@/core/content/manga-client";
import type { MangaPage, MappedMangaChapter } from "@/types/manga";

/**
 * Cross-chapter continuous scroll (vertical/webtoon mode).
 *
 * Seeds off the entry chapter that MangaReaderPage already loaded via its own
 * query, then loads chapters ADJACENT to it on demand: `after` grows downward as
 * the reader nears the end of the current stream, `before` grows upward when the
 * reader scrolls back past the top. The entry chapter itself is NOT owned here —
 * the page renders `[...before, ENTRY, ...after]` — so there is one fetch per
 * chapter and the entry keeps driving the toolbar/comments.
 *
 * Loads are deduped per chapter index and never re-run for an index already
 * loaded, so a sentinel that keeps firing during a fetch can't stack requests.
 */
export interface ReaderSegment {
  index: number; // index within the sorted `chapters` array
  key: string; // chapterKey — stable React key
  number: number | null;
  title: string;
  provider: string;
  language: string | null;
  pages: MangaPage[];
  // Resume-fidelity coordinates for this segment's active source.
  scanlator: string | null; // scanlation group of the source that served the pages
  providerChapterId: string | null; // provider-native chapter id
  extensionId: string | null; // runtime extension namespace that served the pages
}

function pickSource(chapter: MappedMangaChapter, preferProvider?: string) {
  const src = chapter.sources || [];
  return src.find((s) => s.provider === preferProvider) || src[0] || null;
}

export function useContinuousReader(params: {
  enabled: boolean;
  mangaId: string;
  chapters: MappedMangaChapter[];
  entryIndex: number;
  preferProvider?: string;
}) {
  const { enabled, mangaId, chapters, entryIndex, preferProvider } = params;

  const [after, setAfter] = useState<ReaderSegment[]>([]);
  const [before, setBefore] = useState<ReaderSegment[]>([]);
  const [loadingNext, setLoadingNext] = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);

  // Indices currently in-flight or already resolved — dedupe across sentinel spam.
  const busyRef = useRef<Set<number>>(new Set());
  const doneRef = useRef<Set<number>>(new Set());

  // New navigation (or toggling the feature) starts a fresh stream from the entry.
  useEffect(() => {
    setAfter([]);
    setBefore([]);
    busyRef.current = new Set();
    doneRef.current = new Set(entryIndex >= 0 ? [entryIndex] : []);
  }, [entryIndex, mangaId, enabled]);

  const loadChapter = useCallback(
    async (index: number): Promise<ReaderSegment | null> => {
      const chapter = chapters[index];
      if (!chapter) return null;
      const source = pickSource(chapter, preferProvider);
      if (!source) return null;
      const resp = await getMangaReadByKey(mangaId, source.chapterKey, {
        provider: source.provider,
        providerChapterId: source.providerChapterId,
        alternatives: chapter.sources,
      });
      const pages = resp?.data?.pages ?? [];
      if (!pages.length) return null;
      return {
        index,
        key: source.chapterKey,
        number: chapter.chapterNumber,
        title:
          chapter.chapterTitle ||
          (chapter.chapterNumber != null ? `Chapter ${chapter.chapterNumber}` : "Chapter"),
        provider: resp?.data?.chapter?.provider || source.provider,
        language: resp?.data?.chapter?.language ?? source.language,
        pages,
        scanlator: source.scanlator ?? null,
        providerChapterId: resp?.data?.chapter?.providerChapterId || source.providerChapterId || null,
        extensionId: resp?.data?.readMeta?.provider ?? resp?.data?.chapter?.provider ?? null,
      };
    },
    [chapters, mangaId, preferProvider],
  );

  const appendNext = useCallback(async () => {
    if (!enabled) return;
    const lastIdx = after.length ? after[after.length - 1].index : entryIndex;
    const nextIdx = lastIdx + 1;
    if (nextIdx <= 0 && entryIndex < 0) return;
    if (nextIdx >= chapters.length) return;
    if (busyRef.current.has(nextIdx) || doneRef.current.has(nextIdx)) return;
    busyRef.current.add(nextIdx);
    setLoadingNext(true);
    try {
      const seg = await loadChapter(nextIdx);
      if (seg) {
        doneRef.current.add(nextIdx);
        setAfter((prev) => (prev.some((s) => s.index === nextIdx) ? prev : [...prev, seg]));
      }
    } catch {
      /* leave the sentinel able to retry on the next scroll */
    } finally {
      busyRef.current.delete(nextIdx);
      setLoadingNext(false);
    }
  }, [enabled, after, entryIndex, chapters.length, loadChapter]);

  const prependPrev = useCallback(async () => {
    if (!enabled) return;
    const firstIdx = before.length ? before[0].index : entryIndex;
    const prevIdx = firstIdx - 1;
    if (prevIdx < 0) return;
    if (busyRef.current.has(prevIdx) || doneRef.current.has(prevIdx)) return;
    busyRef.current.add(prevIdx);
    setLoadingPrev(true);
    try {
      const seg = await loadChapter(prevIdx);
      if (seg) {
        doneRef.current.add(prevIdx);
        setBefore((prev) => (prev.some((s) => s.index === prevIdx) ? prev : [seg, ...prev]));
      }
    } catch {
      /* retry on next upward scroll */
    } finally {
      busyRef.current.delete(prevIdx);
      setLoadingPrev(false);
    }
  }, [enabled, before, entryIndex, loadChapter]);

  const lastLoadedIdx = after.length ? after[after.length - 1].index : entryIndex;
  const firstLoadedIdx = before.length ? before[0].index : entryIndex;
  const hasNext = entryIndex >= 0 && lastLoadedIdx + 1 < chapters.length;
  const hasPrev = entryIndex >= 0 && firstLoadedIdx - 1 >= 0;

  return { before, after, appendNext, prependPrev, loadingNext, loadingPrev, hasNext, hasPrev };
}
