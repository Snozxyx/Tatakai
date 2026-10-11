// Turns content-graph media into the normalized AnimeMeta the scorer needs,
// and batch-enriches a set of anime ids (the user's own list) with concurrency
// limiting so we don't hammer the API. getMedia already caches per id.

import { contentGraph } from '@/core/content/content-graph';
import type { TatakaiMedia } from '@/core/content/types';
import type { AnimeMeta, TagWeight } from './types';

/** Relation types that mark two titles as the same underlying taste signal. */
const FRANCHISE_RELATIONS = new Set([
  'SEQUEL', 'PREQUEL', 'SPIN_OFF', 'SIDE_STORY', 'ALTERNATIVE',
  'ADAPTATION', 'SOURCE', 'PARENT', 'CHARACTER',
]);

/** Keep only meaningful, non-spoiler tags to reduce noise in the tag vector. */
function pickTags(media: TatakaiMedia): string[] {
  return (media.tags ?? [])
    .filter((t) => !t.isGeneralSpoiler && !t.isMediaSpoiler && (t.rank ?? 0) >= 60)
    .map((t) => t.name);
}

/** Weighted tags: per-title relevance (rank/100) plus the tag grouping. */
function pickWeightedTags(media: TatakaiMedia): TagWeight[] {
  return (media.tags ?? [])
    .filter((t) => t.name && !t.isGeneralSpoiler && !t.isMediaSpoiler && (t.rank ?? 0) >= 60)
    .map((t) => ({
      name: t.name,
      relevance: Math.max(0.01, Math.min(1, (t.rank ?? 60) / 100)),
      group: t.category ?? null,
    }));
}

function bestTrendingRank(media: TatakaiMedia): number | null {
  if (!media.rankings?.length) return null;
  let best: number | null = null;
  for (const r of media.rankings) {
    if (r.rank == null || r.rank <= 0) continue;
    if (best == null || r.rank < best) best = r.rank;
  }
  return best;
}

/** Map a full content-graph media object to the scorer's normalized shape. */
export function toAnimeMeta(media: TatakaiMedia): AnimeMeta {
  const studios = media.studios ?? [];
  const relationIds = (media.relations ?? [])
    .filter((r) => FRANCHISE_RELATIONS.has(String(r.relationType ?? '').toUpperCase()))
    .map((r) => String(r.id))
    .filter(Boolean);
  return {
    id: media.tatakaiId ?? String(media.anilistId),
    anilistId: media.anilistId ?? null,
    malId: media.malId ?? null,
    title: media.titleEnglish || media.titleRomaji,
    poster: media.coverImageLarge ?? media.coverImageMedium ?? null,
    genres: media.genres ?? [],
    tags: pickTags(media),
    tagsDetailed: pickWeightedTags(media),
    tagGroups: Array.from(new Set(
      (media.tags ?? []).map((t) => t.category).filter((c): c is string => !!c),
    )),
    studios: studios.map((s) => s.name),
    studioWeights: studios.map((s) => (s.isMain ? 1 : 0.5)),
    format: media.format ?? null,
    year: media.startDate?.year ?? media.seasonYear ?? null,
    season: media.season ?? null,
    status: media.status ?? null,
    country: media.countryOfOrigin ?? null,
    averageScore: media.averageScore ?? null,
    popularity: media.popularity ?? null,
    favourites: media.favourites ?? null,
    trendingRank: bestTrendingRank(media),
    episodes: media.episodes ?? media.chapters ?? null,
    totalChapters: media.chapters ?? null,
    nextAiringAt: media.nextAiringEpisode?.airingAt ?? null,
    relationIds: relationIds.length ? relationIds : undefined,
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
