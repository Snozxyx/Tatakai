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
    averageScore: card.score ?? null,
    popularity: card.popularity ?? null,
  };
}

/** Full manga detail (has genres + creators + year — used for taste seeds). */
export function mangaDetailToMeta(id: string, res: MangaDetailResponse): AnimeMeta {
  const d = res.detail;
  const creators = Array.from(new Set([...(d.authors ?? []), ...(d.artists ?? []), ...(d.publishers ?? [])]));
  const format = d.originLanguage === 'KR' ? 'manhwa' : d.originLanguage === 'CN' || d.originLanguage === 'TW' ? 'manhua' : 'manga';
  return {
    id,
    anilistId: d.anilistId ?? null,
    malId: d.malId ?? null,
    title: d.canonicalTitle,
    poster: d.coverImage,
    genres: d.genres ?? [],
    tags: d.themes ?? [],
    studios: creators, // treat creators as the "studio"/authorship affinity signal
    format,
    year: d.yearStart ?? null,
    averageScore: d.score ?? null,
    popularity: d.popularity ?? null,
  };
}
