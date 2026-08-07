import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { contentGraph, toAnimeCard, toHomeData } from "@/core";
import { trackEvent } from "@/core/analytics/AnalyticsService";
import type { MediaFormat, MediaStatus, SearchFilters, TatakaiMedia } from "@/core";
import { fetchEpisodeServers } from "@/lib/api";
import type {
  AnimeInfo,
  EpisodeData,
  EpisodeServer,
  NextEpisodeSchedule,
  SearchResult,
  StreamingData,
} from "@/types/anime";

export type AnimeSearchFilters = {
  type?: string;
  status?: string;
  rated?: string;
  score?: string;
  season?: string;
  language?: string;
  sort?: string;
  genres?: string[];
  startDate?: string;
  endDate?: string;
  minRating?: number;
  minReleaseYear?: number;
  isAdult?: boolean;
};

const FORMAT_MAP: Record<string, MediaFormat> = {
  tv: 'TV',
  movie: 'MOVIE',
  ova: 'OVA',
  ona: 'ONA',
  special: 'SPECIAL',
  music: 'MUSIC',
};

const STATUS_MAP: Record<string, MediaStatus> = {
  'currently-airing': 'RELEASING',
  'finished-airing': 'FINISHED',
  'not-yet-aired': 'NOT_YET_RELEASED',
  cancelled: 'CANCELLED',
  hiatus: 'HIATUS',
};

const SORT_MAP: Record<string, SearchFilters['sortBy']> = {
  score: 'SCORE_DESC',
  'name-a-z': 'TITLE_ROMAJI',
  'released-date': 'START_DATE_DESC',
  'recently-added': 'START_DATE_DESC',
  'recently-updated': 'TRENDING_DESC',
};

function normalizeGenres(genres?: string[] | string): string[] | undefined {
  if (!genres) return undefined;
  if (Array.isArray(genres)) return genres.filter(Boolean);
  const single = String(genres).trim();
  return single ? [single] : undefined;
}

function buildSearchFilters(query: string, page: number, filters: AnimeSearchFilters = {}): SearchFilters {
  const formatKey = String(filters.type || '').toLowerCase();
  const statusKey = String(filters.status || '').toLowerCase();
  const sortKey = String(filters.sort || '').toLowerCase();
  const format = FORMAT_MAP[formatKey];
  const status = STATUS_MAP[statusKey];
  const sortBy = SORT_MAP[sortKey];
  const minRating = typeof filters.minRating === 'number' && filters.minRating > 0
    ? Math.round(filters.minRating * 10)
    : undefined;
  const minYear = typeof filters.minReleaseYear === 'number' && filters.minReleaseYear > 0
    ? Math.round(filters.minReleaseYear)
    : undefined;

  return {
    query,
    page,
    perPage: 24,
    genres: normalizeGenres(filters.genres),
    format: format ? [format] : undefined,
    status: status ? [status] : undefined,
    sortBy,
    isAdult: filters.isAdult,
    rating: minRating != null ? { min: minRating } : undefined,
    year: minYear != null ? { min: minYear } : undefined,
  };
}

const MAX_API_EPISODE_PAGES = 25;

function buildEpisodeId(baseId: string, episodeNumber: number): string {
  return `${baseId}?ep=${episodeNumber}`;
}

function normalizeEpisodeTitle(rawTitle?: string | null, number?: number): string {
  const cleaned = String(rawTitle || '').trim();
  if (cleaned) return cleaned;
  if (number) return `Episode ${number}`;
  return "Episode";
}

function normalizeTitle(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function formatToJikanType(format?: MediaFormat): string | undefined {
  const map: Partial<Record<MediaFormat, string>> = {
    TV: 'TV',
    TV_SHORT: 'TV',
    MOVIE: 'Movie',
    OVA: 'OVA',
    ONA: 'ONA',
    SPECIAL: 'Special',
    MUSIC: 'Music',
  };
  return format ? map[format] : undefined;
}

/** Resolve MAL id via TatakaiAPI search (no direct browser→Jikan calls). */
async function resolveMalIdFromSearch(media: TatakaiMedia): Promise<number | null> {
  if (media.malId && media.malId > 0) return media.malId;

  const titleCandidates = [media.titleEnglish, media.titleRomaji, media.titleNative]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const queryTitle = titleCandidates[0];
  if (!queryTitle) return null;

  const search = await contentGraph.search({
    query: queryTitle,
    page: 1,
    perPage: 10,
  }).catch(() => null);
  const rows = search?.media ?? [];
  if (rows.length === 0) return null;

  const normalizedTitles = titleCandidates.map(normalizeTitle).filter(Boolean);
  const targetYear = media.startDate?.year;
  const targetType = formatToJikanType(media.format);

  let bestScore = -1;
  let bestId: number | null = null;

  for (const row of rows) {
    const rowTitles = [row.titleEnglish, row.titleRomaji, row.titleNative]
      .map(normalizeTitle)
      .filter(Boolean);
    let score = 0;

    for (const title of normalizedTitles) {
      for (const candidate of rowTitles) {
        if (candidate === title) score += 5;
        else if (candidate.includes(title) || title.includes(candidate)) score += 3;
      }
    }

    if (targetYear && row.startDate?.year === targetYear) score += 2;
    if (targetType && row.format && formatToJikanType(row.format)?.toLowerCase() === targetType.toLowerCase()) {
      score += 1;
    }

    const malId = row.malId ?? null;
    if (score > bestScore && malId) {
      bestScore = score;
      bestId = malId;
    }
  }

  if (bestScore <= 0) {
    return rows.length === 1 ? rows[0]?.malId ?? null : null;
  }

  return bestId;
}

// Detect mobile for longer cache times
const isMobileNative = typeof window !== 'undefined' &&
  (window as any).Capacitor?.isNativePlatform?.() || false;

// Mobile uses longer stale times to reduce API calls and improve perceived speed
const STALE_TIME = {
  home: isMobileNative ? 15 * 60 * 1000 : 5 * 60 * 1000, // 15 min mobile, 5 min web
  anime: isMobileNative ? 30 * 60 * 1000 : 10 * 60 * 1000, // 30 min mobile
  episodes: isMobileNative ? 15 * 60 * 1000 : 5 * 60 * 1000,
  search: isMobileNative ? 5 * 60 * 1000 : 2 * 60 * 1000,
};

function mediaToAnimeInfo(m: TatakaiMedia): AnimeInfo {
  const statusLabel = m.status === 'RELEASING'
    ? 'Currently Airing'
    : m.status === 'FINISHED'
      ? 'Finished'
      : m.status === 'NOT_YET_RELEASED'
        ? 'Upcoming'
        : m.status === 'CANCELLED'
          ? 'Cancelled'
          : m.status === 'HIATUS'
            ? 'On Hiatus'
            : 'Unknown';

  return {
    info: {
      id: m.anilistId && m.anilistId > 0
        ? String(m.anilistId)
        : m.malId
          ? `mal:${m.malId}`
          : m.tatakaiId || "",
      name: m.titleEnglish ?? m.titleRomaji,
      poster: m.coverImageLarge ?? m.coverImageMedium ?? "",
      description: m.description ?? "",
      stats: {
        rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : "N/A",
        quality: "HD",
        episodes: {
          sub: m.episodeSubCount ?? m.episodes ?? 0,
          dub: m.episodeDubCount ?? 0,
        },
        type: m.format ?? "TV",
        duration: m.duration ? `${m.duration}m` : "Unknown",
      },
      promotionalVideos: m.trailerUrl ? [{ title: "Trailer", source: m.trailerUrl, thumbnail: "" }] : [],
      characterVoiceActor: m.characters?.map(c => ({
        character: {
          id: String(c.id),
          poster: c.imageUrl ?? "",
          name: c.name,
          cast: c.role ?? "",
        },
        voiceActor: {
          id: "unknown",
          poster: "",
          name: "Unknown",
          cast: "",
        }
      })) || [],
    },
    moreInfo: {
      aired: m.startDate ? `${m.startDate.year}-${m.startDate.month}-${m.startDate.day}` : "Unknown",
      genres: m.genres,
      status: statusLabel,
      studios: m.studios.map(s => s.name).join(", "),
      duration: m.duration ? `${m.duration}m` : "Unknown",
      malId: m.malId || null,
      anilistId: m.anilistId,
      relations: m.relations ?? [],
      staff: m.staff ?? [],
      externalLinks: m.externalLinks ?? [],
      nextAiringEpisode: m.nextAiringEpisode ?? null,
      mapping: (m as { mapping?: unknown }).mapping ?? null,
    },
  };
}

async function buildEpisodeList(media: TatakaiMedia, baseId: string): Promise<EpisodeData[]> {
  const rows = media.streamingEpisodes ?? [];
  if (rows.length > 0) {
    return rows.map((ep, idx) => ({
      episodeId: ep.url || buildEpisodeId(baseId, idx + 1),
      number: idx + 1,
      title: normalizeEpisodeTitle(ep.title, idx + 1),
      isFiller: false,
    }));
  }
  return [];
}

async function fetchDbEpisodes(media: TatakaiMedia, baseId: string): Promise<EpisodeData[]> {
  const id = media.tatakaiId || (media.anilistId ? String(media.anilistId) : baseId);
  const rows = await contentGraph.getDbEpisodes(id);
  if (rows.length === 0) return [];
  return rows
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map((row) => ({
      episodeId: buildEpisodeId(baseId, row.episodeNumber),
      number: row.episodeNumber,
      title: normalizeEpisodeTitle(row.title, row.episodeNumber),
      isFiller: Boolean(row.isFiller),
    }));
}

/** Server-mediated Jikan episodes via TatakaiAPI (never call api.jikan.moe from the browser). */
async function fetchMalEpisodesViaApi(malId: number, baseId: string): Promise<EpisodeData[]> {
  const episodes: EpisodeData[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= MAX_API_EPISODE_PAGES) {
    const res = await contentGraph.getMalEpisodesPage(malId, page);
    for (const row of res.episodes) {
      const number = Number(row?.mal_id);
      if (!Number.isFinite(number) || number <= 0) continue;
      episodes.push({
        episodeId: buildEpisodeId(baseId, number),
        number,
        title: normalizeEpisodeTitle(row?.title, number),
        isFiller: Boolean(row?.filler),
      });
    }
    hasNext = res.hasNextPage;
    page += 1;
  }

  return episodes;
}

function computeNextAiringFromBroadcast(broadcast?: {
  day?: string | null;
  time?: string | null;
  timezone?: string | null;
}): { airingTime?: string; dayOfWeek?: string } | null {
  if (!broadcast?.day || !broadcast?.time) return null;

  const dayToken = String(broadcast.day || '').toLowerCase();
  const dayKey = dayToken.replace(/s$/i, '');
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const targetDay = dayMap[dayKey];
  if (targetDay === undefined) return null;

  const timeParts = String(broadcast.time || '').split(':');
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const now = new Date();

  // Calculate the next target date in JST (UTC+9)
  // 1. Get current time in JST
  const jstNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 3600000));

  const targetJst = new Date(jstNow);
  targetJst.setHours(hour, minute, 0, 0);

  const delta = (targetDay - targetJst.getDay() + 7) % 7;
  if (delta === 0 && targetJst.getTime() <= jstNow.getTime()) {
    targetJst.setDate(targetJst.getDate() + 7);
  } else {
    targetJst.setDate(targetJst.getDate() + delta);
  }

  // 2. Convert targetJst back to UTC
  const utcTime = targetJst.getTime() - (9 * 3600000);
  const targetDate = new Date(utcTime);

  return {
    airingTime: targetDate.toISOString(),
    dayOfWeek: broadcast.day || undefined,
  };
}

export function useHomeData() {
  return useQuery({
    queryKey: ["home"],
    queryFn: async () => {
      const bundle = await contentGraph.getHomePage();
      return toHomeData(bundle);
    },
    retry: false,
    staleTime: STALE_TIME.home,
    gcTime: isMobileNative ? 60 * 60 * 1000 : 30 * 60 * 1000, // 1 hour cache on mobile
  });
}

export function useAnimeInfo(animeId: string | undefined) {
  return useQuery({
    queryKey: ["anime", animeId],
    queryFn: async (): Promise<AnimeInfo> => {
      if (!animeId) throw new Error("Anime ID is required");
      const media = await contentGraph.getMedia(animeId);

      if (import.meta.env.DEV) {
        const tmdbLink = media.externalLinks?.find(l => l.site.toLowerCase() === 'tmdb' || l.url.includes('themoviedb.org'));
        const tmdbId = tmdbLink?.url.split('/').pop() || null;

        console.debug("[useAnimeInfo] Media Mapping Debug", {
          tatakaiId: media.tatakaiId,
          anilistId: media.anilistId,
          malId: media.malId,
          tmdbId,
          externalLinks: media.externalLinks,
          title: media.titleEnglish || media.titleRomaji,
        });
      }

      return mediaToAnimeInfo(media);
    },
    enabled: !!animeId,
    staleTime: STALE_TIME.anime,
    gcTime: isMobileNative ? 60 * 60 * 1000 : 30 * 60 * 1000,
  });
}

export function useEpisodes(animeId: string | undefined) {
  return useQuery({
    queryKey: ["episodes", animeId],
    queryFn: async (): Promise<{ totalEpisodes: number; episodes: EpisodeData[] }> => {
      if (!animeId) throw new Error("Anime ID is required");
      const media = await contentGraph.getMedia(animeId);
      const baseId = media.tatakaiId || animeId;
      let episodes: EpisodeData[] = [];

      // 1. AniList streamingEpisodes (primary)
      episodes = await buildEpisodeList(media, baseId);

      // 2. TatakaiAPI DB episode rows
      if (episodes.length === 0) {
        episodes = await fetchDbEpisodes(media, baseId);
      }

      // 3. Server-mediated MAL/Jikan episodes (via TatakaiAPI only)
      if (episodes.length === 0) {
        let resolvedMalId = media.malId ?? null;
        if (!resolvedMalId) {
          resolvedMalId = await resolveMalIdFromSearch(media);
        }
        if (resolvedMalId) {
          episodes = await fetchMalEpisodesViaApi(resolvedMalId, baseId);
        }
      }

      // 4. Count-based placeholders from AniList episode total
      if (episodes.length === 0) {
        const count = Math.min(media.episodes ?? 0, 2000);
        episodes = Array.from({ length: count }, (_, i) => ({
          episodeId: buildEpisodeId(baseId, i + 1),
          number: i + 1,
          title: `Episode ${i + 1}`,
          isFiller: false,
        }));
      }

      if (import.meta.env.DEV) {
        console.debug("[useEpisodes] Episodes loaded", {
          animeId,
          tatakaiId: media.tatakaiId,
          count: episodes.length,
        });
      }

      return {
        totalEpisodes: media.episodeSubCount ?? media.episodes ?? episodes.length,
        episodes: episodes,
      };
    },
    enabled: !!animeId,
    staleTime: STALE_TIME.episodes,
    gcTime: isMobileNative ? 60 * 60 * 1000 : 30 * 60 * 1000,
  });
}

export function useEpisodeServers(episodeId: string | undefined) {
  return useQuery({
    queryKey: ["servers", episodeId],
    queryFn: async (): Promise<{ sub: EpisodeServer[]; dub: EpisodeServer[] }> => {
      if (!episodeId) return { sub: [], dub: [] };
      return fetchEpisodeServers(episodeId);
    },
    enabled: !!episodeId,
  });
}

export function useStreamingSources(
  episodeId: string | undefined,
  server: string = "hd-2",
  category: string = "sub"
) {
  return useQuery({
    queryKey: ["sources", episodeId, server, category],
    queryFn: async (): Promise<StreamingData> => {
      // Direct streaming source resolution would happen here
      return {
        headers: { Referer: "", "User-Agent": "" },
        sources: [],
        subtitles: [],
        tracks: [],
        providerServers: [],
        anilistID: null,
        malID: null,
      };
    },
    enabled: !!episodeId,
  });
}

export function useSearch(query: string, page: number = 1, filters: AnimeSearchFilters = {}) {
  return useQuery({
    queryKey: ["search", query, page, filters],
    queryFn: async (): Promise<SearchResult> => {
      const result = await contentGraph.search(buildSearchFilters(query, page, filters));
      return {
        animes: result.media.map(toAnimeCard),
        mostPopularAnimes: result.media.map(toAnimeCard),
        currentPage: result.pageInfo.currentPage,
        totalPages: result.pageInfo.lastPage,
        hasNextPage: result.pageInfo.hasNextPage,
        searchQuery: query,
      };
    },
    enabled: query.length > 0,
    staleTime: STALE_TIME.search,
  });
}

export function useInfiniteSearch(
  query: string,
  filters: AnimeSearchFilters = {},
  enabled: boolean = true,
  allowEmptyQuery: boolean = false
) {
  return useInfiniteQuery({
    queryKey: ["search-infinite", query, filters],
    queryFn: ({ pageParam = 1 }) =>
      contentGraph.search(buildSearchFilters(query, Number(pageParam), filters)).then((result): SearchResult => ({
        animes: result.media.map(toAnimeCard),
        mostPopularAnimes: result.media.map(toAnimeCard),
        currentPage: result.pageInfo.currentPage,
        totalPages: result.pageInfo.lastPage,
        hasNextPage: result.pageInfo.hasNextPage,
        searchQuery: query,
      })),
    getNextPageParam: (lastPage: SearchResult) => {
      if (!lastPage || !lastPage.hasNextPage) return undefined;
      return lastPage.currentPage + 1;
    },
    initialPageParam: 1,
    enabled: enabled && (query.length > 0 || allowEmptyQuery),
    staleTime: STALE_TIME.search,
  });
}

export function useGenreAnimes(genre: string | undefined, page: number = 1) {
  return useQuery({
    queryKey: ["genre", genre, page],
    queryFn: async (): Promise<SearchResult> => {
      const result = await contentGraph.search({
        page,
        perPage: 24,
        genres: genre ? [genre.replace(/-/g, " ")] : undefined,
      });
      return {
        animes: result.media.map(toAnimeCard),
        mostPopularAnimes: result.media.map(toAnimeCard),
        currentPage: result.pageInfo.currentPage,
        totalPages: result.pageInfo.lastPage,
        hasNextPage: result.pageInfo.hasNextPage,
        searchQuery: genre ?? "",
      };
    },
    enabled: !!genre,
    staleTime: STALE_TIME.search,
  });
}

export function useInfiniteGenreAnimes(genre: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["genre-infinite", genre],
    queryFn: ({ pageParam = 1 }) =>
      contentGraph.search({
        page: Number(pageParam),
        perPage: 24,
        genres: genre ? [genre.replace(/-/g, " ")] : undefined,
      }).then((result): SearchResult => ({
        animes: result.media.map(toAnimeCard),
        mostPopularAnimes: result.media.map(toAnimeCard),
        currentPage: result.pageInfo.currentPage,
        totalPages: result.pageInfo.lastPage,
        hasNextPage: result.pageInfo.hasNextPage,
        searchQuery: genre ?? "",
      })),
    getNextPageParam: (lastPage: SearchResult) => {
      if (!lastPage || !lastPage.hasNextPage) return undefined;
      return lastPage.currentPage + 1;
    },
    initialPageParam: 1,
    enabled: !!genre,
    staleTime: STALE_TIME.search,
  });
}

export function useNextEpisodeSchedule(animeId: string | undefined) {
  return useQuery({
    queryKey: ["next-episode-schedule", animeId],
    queryFn: async (): Promise<NextEpisodeSchedule | null> => {
      if (!animeId) return null;
      const media = await contentGraph.getMedia(animeId);

      // Only show next episode schedule for currently airing anime
      if (media.status !== 'RELEASING') {
        return null;
      }

      if (media.nextAiringEpisode?.airingAt && media.nextAiringEpisode?.episode) {
        return {
          airingAt: media.nextAiringEpisode.airingAt,
          timeUntilAiring: media.nextAiringEpisode.timeUntilAiring ?? 0,
          episode: media.nextAiringEpisode.episode,
          airingISOTimestamp: new Date(media.nextAiringEpisode.airingAt * 1000).toISOString(),
        };
      }

      let resolvedMalId = media.malId ?? null;

      if (!resolvedMalId) {
        resolvedMalId = await resolveMalIdFromSearch(media);
      }

      if (resolvedMalId) {
        const jikan = await contentGraph.getMalAnimeFull(resolvedMalId);
        const broadcast = jikan?.broadcast ?? undefined;
        const schedule = computeNextAiringFromBroadcast(broadcast ?? undefined);

        if (import.meta.env.DEV) {
          console.debug("[useNextEpisodeSchedule] Jikan broadcast (via TatakaiAPI)", {
            animeId,
            malId: resolvedMalId,
            broadcast,
            schedule,
          });
        }

        if (schedule?.airingTime) {
          const baseEpisode = media.episodeSubCount ?? media.episodes ?? 0;
          if (!baseEpisode) return null;
          return {
            airingAt: Math.floor(new Date(schedule.airingTime).getTime() / 1000),
            timeUntilAiring: Math.max(0, Math.floor((new Date(schedule.airingTime).getTime() - Date.now()) / 1000)),
            episode: baseEpisode + 1,
            airingISOTimestamp: schedule.airingTime,
            dayOfWeek: schedule.dayOfWeek,
          };
        }
      }

      return null;
    },
    enabled: !!animeId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
