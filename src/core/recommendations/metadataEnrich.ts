// Turns content-graph media into the normalized AnimeMeta the scorer needs,
// and batch-enriches a set of anime ids (the user's own list) with concurrency
// limiting so we don't hammer the API. getMedia already caches per id.

import { contentGraph } from '@/core/content/content-graph';
import type { TatakaiMedia } from '@/core/content/types';
import type { AnimeMeta } from './types';

/** Keep only meaningful, non-spoiler tags to reduce noise in the tag vector. */
function pickTags(media: TatakaiMedia): string[] {
  return (media.tags ?? [])
    .filter((t) => !t.isGeneralSpoiler && !t.isMediaSpoiler && (t.rank ?? 0) >= 60)
    .map((t) => t.name);
}

/** Map a full content-graph media object to the scorer's normalized shape. */
export function toAnimeMeta(media: TatakaiMedia): AnimeMeta {
  return {
    id: media.tatakaiId ?? String(media.anilistId),
    anilistId: media.anilistId ?? null,
    malId: media.malId ?? null,
    title: media.titleEnglish || media.titleRomaji,
    poster: media.coverImageLarge ?? media.coverImageMedium ?? null,
    genres: media.genres ?? [],
    tags: pickTags(media),
    studios: (media.studios ?? []).map((s) => s.name),
    format: media.format ?? null,
    year: media.startDate?.year ?? media.seasonYear ?? null,
    averageScore: media.averageScore ?? null,
    popularity: media.popularity ?? null,
  };
}

/** Resolve N async tasks with a bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Fetch and normalize metadata for a set of anime ids. Failures resolve to null
 * so one bad id never sinks the whole profile build.
 */
export async function enrichAnimeMeta(
  ids: string[],
  opts: { concurrency?: number } = {},
): Promise<Map<string, AnimeMeta>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  const metas = await mapLimit(unique, opts.concurrency ?? 6, async (id) => {
    try {
      const media = await contentGraph.getMedia(id);
      return toAnimeMeta(media);
    } catch {
      return null;
    }
  });

  const map = new Map<string, AnimeMeta>();
  metas.forEach((meta) => {
    if (meta) map.set(meta.id, meta);
  });
  return map;
}
