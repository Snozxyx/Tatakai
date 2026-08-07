/**
 * src/core/content/types.ts
 * Canonical types for the Tatakai Content Graph.
 *
 * All data flows through TatakaiAPI — never directly from AniList/Jikan.
 * TatakaiMedia is the normalized shape the API returns.
 * Adapter functions at the bottom map TatakaiMedia → existing UI types
 * (AnimeCard, SpotlightAnime, TopAnime, HomeData) so zero component changes are needed.
 */

import type {
  AnimeCard,
  SpotlightAnime,
  TopAnime,
  HomeData,
  TrendingAnime,
} from '@/types/anime';

// ─── Re-export UI types so consumers can import from @/core ──────────────────
export type { AnimeCard, SpotlightAnime, TopAnime, HomeData, TrendingAnime };

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MediaFormat =
  | 'TV'
  | 'TV_SHORT'
  | 'MOVIE'
  | 'OVA'
  | 'ONA'
  | 'SPECIAL'
  | 'MUSIC';

export type MediaStatus =
  | 'FINISHED'
  | 'RELEASING'
  | 'NOT_YET_RELEASED'
  | 'CANCELLED'
  | 'HIATUS';

export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export type MediaSource =
  | 'ORIGINAL'
  | 'MANGA'
  | 'LIGHT_NOVEL'
  | 'VISUAL_NOVEL'
  | 'VIDEO_GAME'
  | 'OTHER';

export type FeedType =
  | 'trending'
  | 'popular'
  | 'seasonal'
  | 'upcoming'
  | 'top_rated'
  | 'recently_updated';

// ─── TatakaiAPI response envelope ────────────────────────────────────────────

export interface TatakaiAPIResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page?: number;
    perPage?: number;
    total?: number;
    hasNextPage?: boolean;
    lastPage?: number;
  };
  error?: string;
}

// ─── Core normalized media type (returned by TatakaiAPI) ─────────────────────

export interface TatakaiMedia {
  // IDs
  anilistId: number;
  malId?: number;
  tatakaiId?: string;
  mapping?: unknown;

  // Titles
  titleRomaji: string;
  titleEnglish?: string;
  titleNative?: string;
  synonyms: string[];

  // Cover assets
  coverImageLarge?: string;
  coverImageMedium?: string;
  bannerImage?: string;
  color?: string;

  // Classification
  format?: MediaFormat;
  status?: MediaStatus;
  season?: MediaSeason;
  seasonYear?: number;

  // Episode metadata
  episodes?: number;
  chapters?: number;
  volumes?: number;
  duration?: number; // minutes per episode
  episodeSubCount?: number;
  episodeDubCount?: number;

  // Dates
  startDate?: Partial<{ year: number; month: number; day: number }>;
  endDate?: Partial<{ year: number; month: number; day: number }>;

  // Content
  description?: string;

  // Scores & popularity
  averageScore?: number; // 0–100
  meanScore?: number;
  popularity?: number;
  favourites?: number;
  rating?: string; // e.g. "PG-13", "R", "R+"

  // Classification
  genres: string[];
  tags: MediaTag[];
  source?: MediaSource;
  isAdult: boolean;
  countryOfOrigin?: string;

  // Relations & people
  studios: Studio[];
  characters?: Character[];
  staff?: StaffMember[];
  relations?: MediaRelation[];

  // Airing
  nextAiringEpisode?: NextAiringEpisode;

  // External
  trailerUrl?: string;
  externalLinks?: ExternalLink[];
  streamingEpisodes?: StreamingEpisode[];
  rankings?: MediaRanking[];

  // Tatakai meta
  source_api: 'anilist' | 'jikan' | 'tatakai';
  fetchedAt: number;
}

export interface MediaTag {
  id: number;
  name: string;
  category?: string;
  rank?: number;
  isGeneralSpoiler?: boolean;
  isMediaSpoiler?: boolean;
  isAdult?: boolean;
}

export interface Studio {
  id: number;
  name: string;
  isMain: boolean;
  siteUrl?: string;
}

export interface Character {
  id: number;
  name: string;
  imageUrl?: string;
  role: 'MAIN' | 'SUPPORTING' | 'BACKGROUND';
}

export interface StaffMember {
  id: number;
  name: string;
  role: string;
  imageUrl?: string;
}

export interface MediaRelation {
  id: number;
  relationType: string;
  titleRomaji: string;
  titleEnglish?: string;
  coverImage?: string;
  format?: MediaFormat;
  status?: MediaStatus;
}

export interface NextAiringEpisode {
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
}

export interface ExternalLink {
  id?: number;
  url: string;
  site: string;
  type?: string;
  color?: string;
  icon?: string;
}

export interface StreamingEpisode {
  title?: string;
  thumbnail?: string;
  url?: string;
  site?: string;
}

export interface MediaRanking {
  id: number;
  rank: number;
  type: 'RATED' | 'POPULAR';
  format: MediaFormat;
  year?: number;
  season?: MediaSeason;
  allTime?: boolean;
  context: string;
}

// ─── Search & feed types ──────────────────────────────────────────────────────

export interface SearchFilters {
  query?: string;
  genres?: string[];
  year?: { min?: number; max?: number };
  season?: MediaSeason[];
  format?: MediaFormat[];
  status?: MediaStatus[];
  rating?: { min?: number; max?: number };
  episodes?: { min?: number; max?: number };
  studio?: string[];
  source?: MediaSource[];
  isAdult?: boolean;
  sortBy?: 'TRENDING_DESC' | 'POPULARITY_DESC' | 'SCORE_DESC' | 'START_DATE_DESC' | 'TITLE_ROMAJI';
  page?: number;
  perPage?: number;
}

export interface ContentSearchResult {
  media: TatakaiMedia[];
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
}

export interface ContentFeed {
  type: FeedType;
  media: TatakaiMedia[];
  season?: MediaSeason;
  seasonYear?: number;
  fetchedAt: number;
}

// ─── Home page bundle (single API call) ──────────────────────────────────────

export interface HomePageBundle {
  spotlight: TatakaiMedia[];       // Top 5-10 hero carousel items
  trending: TatakaiMedia[];        // Trending now
  topAiring: TatakaiMedia[];       // Currently airing, sorted by popularity
  popular: TatakaiMedia[];         // All-time most popular
  topUpcoming: TatakaiMedia[];     // Upcoming releases
  latestCompleted: TatakaiMedia[]; // Recently finished
  top10: {
    today: TatakaiMedia[];
    week: TatakaiMedia[];
    month: TatakaiMedia[];
  };
  genres: string[];
  fetchedAt: number;
}

// ─── Adapter functions: TatakaiMedia → existing UI types ─────────────────────
// These allow pages to use contentGraph without changing any component props.

export function toAnimeCard(m: TatakaiMedia): AnimeCard {
  const primaryId =
    m.anilistId && m.anilistId > 0
      ? String(m.anilistId)
      : m.malId
        ? `mal:${m.malId}`
        : m.tatakaiId || '';
  return {
    id: primaryId,
    name: m.titleEnglish ?? m.titleRomaji,
    jname: m.titleNative ?? m.titleRomaji,
    poster: m.coverImageLarge ?? m.coverImageMedium ?? '',
    type: formatToDisplayType(m.format),
    duration: m.duration ? `${m.duration}m` : undefined,
    rating: m.averageScore ? `${(m.averageScore / 10).toFixed(1)}` : undefined,
    episodes: {
      sub: m.episodeSubCount ?? m.episodes ?? 0,
      dub: m.episodeDubCount ?? 0,
    },
    malId: m.malId,
    anilistId: m.anilistId,
  };
}

/** Explicit adapter name used during v6 migration tasks. */
export function mediaToAnimeCard(m: TatakaiMedia): AnimeCard {
  return toAnimeCard(m);
}

export function toSpotlightAnime(m: TatakaiMedia, rank: number): SpotlightAnime {
  const primaryId =
    m.anilistId && m.anilistId > 0
      ? String(m.anilistId)
      : m.malId
        ? `mal:${m.malId}`
        : m.tatakaiId || '';
  const otherInfo: string[] = [];
  if (m.format) otherInfo.push(formatToDisplayType(m.format));
  if (m.duration) otherInfo.push(`${m.duration}m`);
  if (m.episodes) otherInfo.push(`${m.episodes} Episodes`);
  if (m.status) otherInfo.push(statusToDisplay(m.status));

  return {
    id: primaryId,
    name: m.titleEnglish ?? m.titleRomaji,
    jname: m.titleNative ?? m.titleRomaji,
    poster: m.coverImageLarge ?? m.coverImageMedium ?? m.bannerImage ?? '',
    banner: m.bannerImage,
    description: m.description ?? '',
    rank,
    otherInfo,
    episodes: {
      sub: m.episodeSubCount ?? m.episodes ?? 0,
      dub: m.episodeDubCount ?? 0,
    },
  };
}

export function toTopAnime(m: TatakaiMedia, rank: number): TopAnime {
  const primaryId =
    m.anilistId && m.anilistId > 0
      ? String(m.anilistId)
      : m.malId
        ? `mal:${m.malId}`
        : m.tatakaiId || '';
  return {
    id: primaryId,
    name: m.titleEnglish ?? m.titleRomaji,
    poster: m.coverImageLarge ?? m.coverImageMedium ?? '',
    rank,
    episodes: {
      sub: m.episodeSubCount ?? m.episodes ?? 0,
      dub: m.episodeDubCount ?? 0,
    },
    malId: m.malId,
    anilistId: m.anilistId,
  };
}

export function toTrendingAnime(m: TatakaiMedia, rank: number): TrendingAnime {
  const primaryId =
    m.anilistId && m.anilistId > 0
      ? String(m.anilistId)
      : m.malId
        ? `mal:${m.malId}`
        : m.tatakaiId || '';
  return {
    id: primaryId,
    name: m.titleEnglish ?? m.titleRomaji,
    poster: m.coverImageLarge ?? m.coverImageMedium ?? '',
    rank,
  };
}

/** Convert a HomePageBundle into the legacy HomeData shape used by existing components */
export function toHomeData(bundle: HomePageBundle): HomeData {
  return {
    genres: bundle.genres,
    spotlightAnimes: bundle.spotlight.map((m, i) => toSpotlightAnime(m, i + 1)),
    trendingAnimes: bundle.trending.map((m, i) => toTrendingAnime(m, i + 1)),
    topAiringAnimes: bundle.topAiring.map(toAnimeCard),
    topUpcomingAnimes: bundle.topUpcoming.map(toAnimeCard),
    mostPopularAnimes: bundle.popular.map(toAnimeCard),
    mostFavoriteAnimes: bundle.popular.map(toAnimeCard), // fallback: same as popular
    latestCompletedAnimes: bundle.latestCompleted.map(toAnimeCard),
    latestEpisodeAnimes: bundle.topAiring.slice(0, 15).map(toAnimeCard),
    top10Animes: {
      today: bundle.top10.today.map((m, i) => toTopAnime(m, i + 1)),
      week: bundle.top10.week.map((m, i) => toTopAnime(m, i + 1)),
      month: bundle.top10.month.map((m, i) => toTopAnime(m, i + 1)),
    },
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function formatToDisplayType(format?: MediaFormat): string {
  const map: Partial<Record<MediaFormat, string>> = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    OVA: 'OVA',
    ONA: 'ONA',
    SPECIAL: 'Special',
    MUSIC: 'Music',
  };
  return format ? (map[format] ?? format) : 'TV';
}

function statusToDisplay(status: MediaStatus): string {
  const map: Record<MediaStatus, string> = {
    FINISHED: 'Finished',
    RELEASING: 'Airing',
    NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Cancelled',
    HIATUS: 'On Hiatus',
  };
  return map[status] ?? status;
}
