import { contentGraph, toAnimeCard, toHomeData } from "@/core";
import type { EpisodeData, EpisodeServer, HomeData, StreamingData } from "@/types/anime";
import { getHighQualityImage } from "@/lib/api/proxy-utils";
import { fetchJikanEpisodes } from "@/core/content/jikan-client";
import { fetchAniZipMapping } from "@/lib/mapping/anizip";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";

// Canonical backend `/api/v3` base. Resolves VITE_BACKEND_ORIGIN → origin of
// VITE_TATAKAI_API_URL → http page origin (see backendOrigin.ts).
export const TATAKAI_API_URL = resolveApiV3Base();

const GENRE_ALIASES: Record<string, string> = {
  "slice-of-life": "Slice of Life",
  "sci-fi": "Sci-Fi",
};

function normalizeGenre(genre: string): string {
  const key = String(genre || "").trim().toLowerCase();
  if (!key) return "";
  if (GENRE_ALIASES[key]) return GENRE_ALIASES[key];
  return key.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function withClientHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    "X-Tatakai-Client": "web",
    "X-Tatakai-Version": "6.0.1",
  };
}

function shouldAttachClientHeaders(targetUrl: string): boolean {
  if (typeof window === "undefined") return true;

  try {
    const targetOrigin = new URL(targetUrl, window.location.origin).origin;
    if (targetOrigin === window.location.origin) return true;

    try {
      const apiOrigin = new URL(TATAKAI_API_URL).origin;
      if (apiOrigin === targetOrigin) return true;
    } catch {
      // ignore invalid API URL
    }
  } catch {
    return true;
  }

  return false;
}

function resolveExternalApiUrl(baseUrl: string, path: string): string {
  const rawPath = String(path || "").trim();
  if (!rawPath) return String(baseUrl || "").trim();

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawPath)) {
    return rawPath;
  }

  const base = new URL(
    baseUrl,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  const basePath = base.pathname.replace(/\/$/, "");
  const pathPart = rawPath.replace(/^\/+/, "");
  const joinedPath = basePath ? `${basePath}/${pathPart}` : `/${pathPart}`;

  return `${base.origin}${joinedPath}`;
}

/**
 * Make a request to an external API (Jikan, etc.) with proper error handling
 * @param baseUrl - The base URL of the external API (e.g., 'https://api.jikan.moe/v4')
 * @param path - The path to append (e.g., '/anime/1')
 * @returns Promise<T> The parsed JSON response
 */
export async function externalApiGet<T>(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<T> {
  const url = resolveExternalApiUrl(baseUrl, path);
  const requestHeaders = shouldAttachClientHeaders(url) ? withClientHeaders(headers) : headers;
  
  try {
    const response = await fetch(url, {
      headers: requestHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as T;
    return data;
  } catch (error) {
    console.error(`[externalApiGet] Error fetching ${url}:`, error);
    throw error;
  }
}

/** Legacy adapter for fetchHome */
export async function fetchHome(): Promise<HomeData> {
  const bundle = await contentGraph.getHomePage();
  return toHomeData(bundle);
}

/** Legacy adapter for fetchAnimeInfo */
export async function fetchAnimeInfo(id: string) {
  return contentGraph.getMedia(id);
}

/** Legacy adapter for searchAnime */
export async function searchAnime(query: string, page: number = 1, filters: any = {}) {
  return contentGraph.search({
    query,
    page,
    ...filters,
  });
}

/** Legacy adapter for fetchGenreAnimes */
export async function fetchGenreAnimes(genre: string, page: number = 1) {
  const normalizedGenre = normalizeGenre(genre);
  const result = await contentGraph.search({
    genres: normalizedGenre ? [normalizedGenre] : undefined,
    page,
    perPage: 24,
    sortBy: "TRENDING_DESC",
  });

  return {
    genreName: normalizedGenre || genre,
    animes: result.media.map(toAnimeCard),
    pageInfo: result.pageInfo,
  };
}

/** Legacy adapter for producer studio pages */
export async function fetchProducerAnimes(producer: string, page: number = 1) {
  const result = await contentGraph.search({
    studio: [String(producer || "").trim()],
    page,
    perPage: 24,
    sortBy: "POPULARITY_DESC",
  });

  return {
    producerName: producer,
    animes: result.media.map(toAnimeCard),
    top10Animes: { today: [], week: [], month: [] },
    topAiringAnimes: [],
    currentPage: result.pageInfo.currentPage,
    totalPages: result.pageInfo.lastPage,
    hasNextPage: result.pageInfo.hasNextPage,
  };
}

/** Legacy helper for obtaining a larger poster image when MAL ID is known */
export async function fetchJikanCover(malId?: number | null, fallbackPoster = ""): Promise<string> {
  if (!malId) return fallbackPoster;

  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    if (!res.ok) return fallbackPoster;
    const json = await res.json();
    const imageUrl =
      json?.data?.images?.webp?.large_image_url ||
      json?.data?.images?.jpg?.large_image_url ||
      json?.data?.images?.jpg?.image_url;
    return String(imageUrl || fallbackPoster || "");
  } catch {
    return fallbackPoster;
  }
}

/** Legacy adapter for fetchEpisodes */
export async function fetchEpisodes(animeId: string) {
  // In v6, episodes are usually part of the media object or fetched via content graph
  const media = await contentGraph.getMedia(animeId);
  const baseId = media.tatakaiId || animeId;
  let episodes: EpisodeData[] = [];

  // ani.zip leads for the same reason it does in `useEpisodes`: AniList's
  // `streamingEpisodes` is regularly a neighbouring season's Crunchyroll listing
  // stored newest-first, so its array order is not this season's episode order.
  const mapping = await fetchAniZipMapping(media.anilistId).catch(() => null);
  if (mapping) {
    episodes = mapping.episodes.map((entry) => ({
      episodeId: `${baseId}?ep=${entry.number}`,
      number: entry.number,
      title: entry.title || `Episode ${entry.number}`,
      isFiller: false,
      overview: entry.overview ?? undefined,
      image: entry.image ?? undefined,
      airDate: entry.airDate ?? undefined,
      runtime: entry.runtime ?? undefined,
      hasAired: entry.hasAired,
    }));
  }

  if (episodes.length === 0 && media.malId) {
    let page = 1;
    let hasNext = true;
    const maxPages = 25;

    while (hasNext && page <= maxPages) {
      const res = await fetchJikanEpisodes(media.malId, page);
      const rows = Array.isArray(res?.data) ? res.data : [];
      for (const row of rows) {
        const number = Number(row?.mal_id);
        if (!Number.isFinite(number) || number <= 0) continue;
        episodes.push({
          episodeId: `${baseId}?ep=${number}`,
          number,
          title: row?.title || `Episode ${number}`,
          isFiller: Boolean(row?.filler),
        });
      }

      hasNext = Boolean(res?.pagination?.has_next_page);
      page += 1;
    }
  }

  if (episodes.length === 0) {
    const count = Math.min(media.episodes ?? 0, 2000);
    episodes = Array.from({ length: count }, (_, i) => ({
      episodeId: `${baseId}?ep=${i + 1}`,
      number: i + 1,
      title: `Episode ${i + 1}`,
      isFiller: false,
    }));
  }

  return {
    episodes,
    totalEpisodes: mapping?.episodeCount ?? media.episodeSubCount ?? media.episodes ?? episodes.length,
  };
}

type PlaybackSourceOptions = {
  animeName?: string;
  anilistId?: number | string | null;
  currentUserId?: string;
  knownAnilistId?: number | string | null;
  knownMalId?: number | string | null;
};

function groupEpisodeServers(providerServers: EpisodeServer[] | undefined | null) {
  const grouped = {
    sub: [] as EpisodeServer[],
    dub: [] as EpisodeServer[],
  };

  for (const server of providerServers || []) {
    const serverLabel = [server.language, server.displayName, server.serverName, server.providerName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const isDub = Boolean(server.isDub) || serverLabel.includes("dub");
    grouped[isDub ? "dub" : "sub"].push(server);
  }

  return grouped;
}

/** Legacy adapter for fetchEpisodeServers */
export async function fetchEpisodeServers(episodeId: string) {
  const combined = await fetchCombinedSources(episodeId, undefined, undefined, "hd-1", "sub");
  return groupEpisodeServers(combined.providerServers);
}

/** Legacy adapter for fetchStreamingSources */
export async function fetchStreamingSources(
  episodeId: string,
  server: string = "hd-2",
  category: string = "sub",
  options: PlaybackSourceOptions = {}
) {
  return fetchCombinedSources(
    episodeId,
    options.animeName,
    undefined,
    server,
    category,
    options.currentUserId,
    options.knownAnilistId ?? options.anilistId,
    options.knownMalId
  );
}

/** Legacy adapter for fetchTatakaiEpisodeSources */
export async function fetchTatakaiEpisodeSources(
  episodeId: string,
  server: string = "hd-2",
  category: string = "sub",
  options: PlaybackSourceOptions = {}
) {
  return fetchCombinedSources(
    episodeId,
    options.animeName,
    undefined,
    server,
    category,
    options.currentUserId,
    options.knownAnilistId ?? options.anilistId,
    options.knownMalId
  );
}

/** Legacy adapter for fetchNextEpisodeSchedule */
export async function fetchNextEpisodeSchedule(animeId: string) {
  return null;
}

/** Central dispatch removed: source resolution is extension-local now (desktop
 *  runtime, mobile in-WebView runtime). This stays as the shared shape so all
 *  callers keep compiling; it resolves nothing over the network. */
export async function fetchCombinedSources(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string,
  knownAnilistId?: number | string | null,
  knownMalId?: number | string | null
): Promise<StreamingData> {
  void episodeId;
  void animeName;
  void episodeNumber;
  void server;
  void category;
  void currentUserId;

  const anilistID =
    typeof knownAnilistId === "string" ? Number(knownAnilistId) || null :
    typeof knownAnilistId === "number" ? knownAnilistId : null;
  const malID =
    typeof knownMalId === "string" ? Number(knownMalId) || null :
    typeof knownMalId === "number" ? knownMalId : null;

  return {
    headers: { Referer: "", "User-Agent": "" },
    sources: [],
    subtitles: [],
    tracks: [],
    providerServers: [],
    anilistID,
    malID,
  };
}

/**
 * Unwrap a TatakaiAPI envelope.
 *
 * The envelope is `{ success, data, meta?, error? }` (see `TatakaiAPI/src/lib/envelope.ts`).
 * This used to test `res.status === "ok"`, a field the API has never sent, so it
 * threw "API Error" on every response — successful ones included.
 */
export function unwrapApiData<T>(res: any): T {
  if (res && typeof res === "object") {
    if (res.success === true) return res.data as T;
    if (res.success === false) throw new Error(res.error || res.message || "API Error");
    // Bare payload (some legacy endpoints return data with no envelope).
    if (!("success" in res)) return res as T;
  }
  throw new Error("API Error");
}

// Re-export image quality helpers for convenience
export { getHighQualityImage, getHighQualityPoster, getProxiedImageUrl } from "@/lib/api/proxy-utils";
