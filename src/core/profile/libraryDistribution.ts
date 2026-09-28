// Pure helpers that turn a user's watchlist + manga readlist into per-status
// counts. No Supabase/React imports — unit-testable in isolation.
//
// Anime and manga use different status vocabularies (see the migrations), so we
// keep them as separate ordered lists and never conflate the two. Written works
// are classified by the row's own status, never by chapter/volume counts.

export type AnimeStatus = 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped';
export type MangaStatus = 'reading' | 'completed' | 'plan_to_read' | 'on_hold' | 'dropped';

export const ANIME_STATUS_ORDER: AnimeStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
];

export const MANGA_STATUS_ORDER: MangaStatus[] = [
  'reading',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_read',
];

export const ANIME_STATUS_LABELS: Record<AnimeStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
  plan_to_watch: 'Plan to Watch',
};

export const MANGA_STATUS_LABELS: Record<MangaStatus, string> = {
  reading: 'Reading',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
  plan_to_read: 'Plan to Read',
};

// Shared status hues, reused by the distribution chart legend. Hardcoded hex is
// consistent with the other Recharts cards in this folder.
export const STATUS_COLORS: Record<string, string> = {
  watching: '#8b5cf6', // violet (primary-ish)
  reading: '#8b5cf6',
  completed: '#10b981', // emerald
  on_hold: '#f59e0b', // amber
  dropped: '#f43f5e', // rose
  plan_to_watch: '#38bdf8', // sky
  plan_to_read: '#38bdf8',
};

export interface StatusBucket<T extends string> {
  status: T;
  label: string;
  count: number;
  color: string;
}

export interface LibraryDistribution {
  anime: StatusBucket<AnimeStatus>[];
  manga: StatusBucket<MangaStatus>[];
  animeCounts: Record<AnimeStatus, number>;
  mangaCounts: Record<MangaStatus, number>;
  animeTotal: number;
  mangaTotal: number;
}

function normalizeAnimeStatus(value: unknown): AnimeStatus {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'watching') return 'watching';
  if (s === 'completed') return 'completed';
  if (s === 'on_hold') return 'on_hold';
  if (s === 'dropped') return 'dropped';
  return 'plan_to_watch';
}

function normalizeMangaStatus(value: unknown): MangaStatus {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'reading') return 'reading';
  if (s === 'completed') return 'completed';
  if (s === 'on_hold') return 'on_hold';
  if (s === 'dropped') return 'dropped';
  return 'plan_to_read';
}

export function computeLibraryDistribution(
  watchlist: Array<{ status?: string | null }> = [],
  mangaReadlist: Array<{ status?: string | null }> = [],
): LibraryDistribution {
  const animeCounts: Record<AnimeStatus, number> = {
    watching: 0,
    completed: 0,
    plan_to_watch: 0,
    on_hold: 0,
    dropped: 0,
  };
  const mangaCounts: Record<MangaStatus, number> = {
    reading: 0,
    completed: 0,
    plan_to_read: 0,
    on_hold: 0,
    dropped: 0,
  };

  for (const row of watchlist || []) {
    animeCounts[normalizeAnimeStatus(row?.status)] += 1;
  }
  for (const row of mangaReadlist || []) {
    mangaCounts[normalizeMangaStatus(row?.status)] += 1;
  }

  const anime = ANIME_STATUS_ORDER.map((status) => ({
    status,
    label: ANIME_STATUS_LABELS[status],
    count: animeCounts[status],
    color: STATUS_COLORS[status],
  }));
  const manga = MANGA_STATUS_ORDER.map((status) => ({
    status,
    label: MANGA_STATUS_LABELS[status],
    count: mangaCounts[status],
    color: STATUS_COLORS[status],
  }));

  return {
    anime,
    manga,
    animeCounts,
    mangaCounts,
    animeTotal: (watchlist || []).length,
    mangaTotal: (mangaReadlist || []).length,
  };
}
