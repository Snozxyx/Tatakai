// Adapters that map the manga catalog's shapes into the generic AnimeMeta the
// scoring core consumes, plus the manga status -> affinity mapping. The scorer
// itself is media-agnostic (genres/tags/creators/year/score), so manga reuses it.

import type { MangaCard } from '@/core/content/manga-client';
import type { MangaDetailResponse } from '@/types/manga';
import type { MangaReadlistStatus } from '@/hooks/user/useMangaReadlist';
import type { AnimeMeta, WatchlistStatus } from './types';

/** Manga readlist statuses map onto the shared watchlist affinity buckets. */
export function mangaStatusToWatchlist(status: MangaReadlistStatus): WatchlistStatus {
  switch (status) {
    case 'reading': return 'watching';
    case 'plan_to_read': return 'plan_to_watch';
    case 'completed': return 'completed';
    case 'on_hold': return 'on_hold';
    case 'dropped': return 'dropped';
    default: return 'plan_to_watch';
  }
}

const FRANCHISE_RELATIONS = new Set([
  'SEQUEL', 'PREQUEL', 'SPIN_OFF', 'SIDE_STORY', 'ALTERNATIVE',
  'ADAPTATION', 'SOURCE', 'PARENT', 'CHARACTER',
]);

function mangaRelationIds(relations: Array<{ id: number; relationType: string }> | undefined): string[] | undefined {
  if (!relations?.length) return undefined;
  const ids = relations
    .filter((r) => FRANCHISE_RELATIONS.has(String(r.relationType ?? '').toUpperCase()))
    .map((r) => String(r.id))
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

/** MangaCard (has genres, score, popularity — used for candidates). */
export function mangaCardToMeta(card: MangaCard): AnimeMeta {
  return {
    id: card.id,
    anilistId: card.anilistId ?? null,
    malId: card.malId ?? null,
    title: card.title,
    poster: card.poster,
    genres: card.genres ?? [],
    tags: [],
    studios: [],
    format: card.format ?? 'manga',
    year: null, // MangaCard doesn't carry a start year
    status: card.status ?? null,
    averageScore: card.score ?? null,
    popularity: card.popularity ?? null,
    totalChapters: card.chapters ?? null,
  };
}

/** Full manga detail (has genres + creators + year — used for taste seeds). */
export function mangaDetailToMeta(id: string, res: MangaDetailResponse): AnimeMeta {
  const d = res.detail;
  const creators = Array.from(new Set([...(d.authors ?? []), ...(d.artists ?? []), ...(d.publishers ?? [])]));
  const format = d.originLanguage === 'KR' ? 'manhwa' : d.originLanguage === 'CN' || d.originLanguage === 'TW' ? 'manhua' : 'manga';
  const themes = d.themes ?? [];
  return {
    id,
    anilistId: d.anilistId ?? null,
    malId: d.malId ?? null,
    title: d.canonicalTitle,
    poster: d.coverImage,
    genres: d.genres ?? [],
    tags: themes,
    // AniList manga themes carry no per-title relevance — treat as fully relevant.
    tagsDetailed: themes.map((name) => ({ name, relevance: 1, group: null })),
    studios: creators, // treat creators as the "studio"/authorship affinity signal
    studioWeights: creators.map(() => 1),
    format: d.format ?? format,
    year: d.yearStart ?? null,
    status: d.status ?? null,
    country: d.originLanguage ?? null,
    averageScore: d.score ?? d.meanScore ?? null,
    popularity: d.popularity ?? null,
    favourites: d.favourites ?? null,
    episodes: d.totalChapters ?? null,
    totalChapters: d.totalChapters ?? null,
    relationIds: mangaRelationIds(d.relations),
  };
}
