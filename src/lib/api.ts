import { getClientIdSync } from '@/hooks/useClientId';

const API_URL = "http://de-fsn01.na1.host:4270/api/v2/hianime";
const CHAR_API_URL = "https://anime-api.canelacho.com/api/v1";

// TatakaiAPI URL - configurable for development
const TATAKAI_API_URL = import.meta.env.VITE_TATAKAI_API_URL || "https://api.tatakai.me/api/v1";

// Detect mobile for performance optimizations
const isMobileNative = typeof window !== 'undefined' &&
  (window as any).Capacitor?.isNativePlatform?.() || false;

// Shorter timeout for mobile for faster feedback
const API_TIMEOUT = isMobileNative ? 15000 : 30000;

// Use Supabase edge function as proxy for CORS
function getProxyUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/rapid-service`;
  }
  return '';
}

// All requests go through rapid-service — no third-party proxies
const FALLBACK_PROXIES: string[] = [];

/**
 * Enhanced network error class for better production monitoring
 */
export class ApiError extends Error {
  constructor(
    public message: string,
    public status?: number,
    public proxyType?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiEnvelope<T> = { success: true; data: T };
type ProxyEnvelope<T> = { status: number; data: T };
type AnyEnvelope<T> = ApiEnvelope<T> | ProxyEnvelope<T>;

function unwrapApiData<T>(payload: AnyEnvelope<T> | T): T {
  // Direct data (no envelope)
  if (payload && typeof payload === 'object' && !('success' in payload) && !('status' in payload)) {
    return payload as T;
  }

  // HiAnime API: { success: true, data: ... }
  if ((payload as ApiEnvelope<T>).success === true) {
    return (payload as ApiEnvelope<T>).data;
  }

  // Some proxies/wrappers return: { status: 200, data: ... }
  if (typeof (payload as ProxyEnvelope<T>).status === "number") {
    const { status, data } = payload as ProxyEnvelope<T>;
    if (status >= 200 && status < 300) return data;
  }

  // Return as-is if no envelope detected
  return payload as T;
}

export async function apiGet<T>(path: string, retries?: number): Promise<T> {
  // Fewer retries on mobile for faster feedback
  const maxRetries = retries ?? (isMobileNative ? 2 : 3);
  const url = `${API_URL}${path}`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  let lastError: Error | null = null;

  // On mobile, try direct API first (faster), then rapid-service as fallback
  // On web, always use rapid-service proxy
  const proxies = supabaseUrl
    ? (() => {
      const apiOrigin = new URL(API_URL).origin;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const rapidUrl = `${supabaseUrl}/functions/v1/rapid-service?url=${encodeURIComponent(url)}&type=api&referer=${encodeURIComponent(apiOrigin)}` + (apikey ? `&apikey=${encodeURIComponent(apikey)}` : '');

      // Mobile can try direct API first (no CORS in native webview)
      if (isMobileNative) {
        return [
          { url, type: 'direct' },
          { url: rapidUrl, type: 'supabase' },
        ];
      }

      return [
        { url: rapidUrl, type: 'supabase' },
      ];
    })()
    : [];

  for (const proxy of proxies) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
        };
        // Add apikey header for Supabase rapid-service endpoint
        if (proxy.url.includes('/rapid-service')) {
          headers['apikey'] = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const bearer = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        const response = await fetch(proxy.url, {
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, response.status, proxy.type);
        }

        const json = await response.json();
        return unwrapApiData<T>(json);
      } catch (error) {
        lastError = error as Error;
        console.warn(`API request via ${proxy.type} attempt ${attempt + 1} failed:`, error);

        // Wait before retry with exponential backoff (shorter on mobile)
        if (attempt < maxRetries - 1) {
          const baseDelay = isMobileNative ? 300 : 500;
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * baseDelay));
        }
      }
    }
  }

  throw lastError || new ApiError('Failed to fetch data after all attempts');
}

/**
 * Build headers with optional CID for rate-limiting
 */
function withClientHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const cid = getClientIdSync();
  if (cid) headers['X-Client-Id'] = cid;
  return headers;
}

/**
 * Generic fetcher for external APIs with retry logic
 */
export async function externalApiGet<T>(baseUrl: string, path: string, retries = 2, timeoutMs: number = 25000): Promise<T> {
  const url = `${baseUrl}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        headers: withClientHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError || new Error(`Failed to fetch from ${url}`);
}

/**
 * Enhanced Analytics tracking for production
 */
export function trackEvent(category: string, action: string, label?: string, value?: number) {
  console.log(`[Analytics] ${category} > ${action}${label ? ` (${label})` : ''}${value !== undefined ? `: ${value}` : ''}`);

  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value
    });
  }
}

// Proxy helper for video streaming with referer header
export function getProxiedVideoUrl(videoUrl: string, referer?: string, userAgent?: string): string {
  // Avoid double-proxying if the URL is already pointing at our edge function or TatakaiAPI proxy
  if (videoUrl.includes('/functions/v1/rapid-service')) return videoUrl;
  if (videoUrl.includes('/hindiapi/proxy')) return videoUrl;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn('Supabase URL not configured, returning direct URL');
    return videoUrl;
  }

  const params = new URLSearchParams({ url: videoUrl, type: 'video' });
  if (referer) {
    params.set('referer', referer);
  }
  if (userAgent) {
    params.set('userAgent', userAgent);
  }
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (apikey) params.set('apikey', apikey);
  return `${supabaseUrl}/functions/v1/rapid-service?${params.toString()}`;
}

export function getProxiedImageUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;

  // Avoid proxying local assets or URLs already using our proxy
  let trimmed = imageUrl.trim();
  if (!trimmed.startsWith('http')) return trimmed;
  if (trimmed.includes('/functions/v1/rapid-service')) return trimmed;

  // Upgrade AniList CDN images from medium → large quality
  if (trimmed.includes('s4.anilist.co') || trimmed.includes('anilist.co/file/anilistcdn')) {
    trimmed = trimmed.replace('/cover/medium/', '/cover/large/').replace(/\/banner\/(small|medium)\//, '/banner/large/');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn('Supabase URL not configured, returning direct URL');
    return trimmed;
  }

  const params = new URLSearchParams({ url: trimmed, type: 'image' });
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (apikey) params.set('apikey', apikey);
  return `${supabaseUrl}/functions/v1/rapid-service?${params.toString()}`;
}

/**
 * Returns the best available poster URL for an anime synchronously.
 * Upgrades AniList CDN medium → large via getProxiedImageUrl.
 * The anilistId parameter is kept for backwards compatibility but is unused here —
 * use fetchAniListExtraLargeCover() for the full async high-quality fetch.
 */
export function getHighQualityPoster(poster: string, _anilistId?: number | null): string {
  return getProxiedImageUrl(poster);
}

/**
 * Fetches the highest quality cover image from the Jikan (MAL) API.
 * Uses images.jpg.large_image_url which is the full-size MAL cover.
 * Falls back to proxied source poster if fetch fails or no malId.
 */
export async function fetchJikanCover(
  malId: number | null | undefined,
  fallbackPoster: string
): Promise<string> {
  if (!malId) return getProxiedImageUrl(fallbackPoster);
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    const json = await res.json();
    const url: string | undefined =
      json?.data?.images?.webp?.large_image_url ||
      json?.data?.images?.jpg?.large_image_url;
    if (url) return getProxiedImageUrl(url);
  } catch {
    // fall through to fallback
  }
  return getProxiedImageUrl(fallbackPoster);
}

// Proxy helper for subtitle files
export function getProxiedSubtitleUrl(subtitleUrl: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return subtitleUrl;
  }
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const params = new URLSearchParams({ url: subtitleUrl, type: 'api' });
  if (apikey) params.set('apikey', apikey);
  return `${supabaseUrl}/functions/v1/rapid-service?${params.toString()}`;
}

export interface Episode {
  sub: number;
  dub: number;
}

export interface SpotlightAnime {
  id: string;
  name: string;
  jname: string;
  poster: string;
  description: string;
  rank: number;
  otherInfo: string[];
  episodes: Episode;
}

export interface TrendingAnime {
  id: string;
  name: string;
  poster: string;
  rank: number;
}

export interface TopAnime {
  id: string;
  name: string;
  poster: string;
  rank: number;
  episodes: Episode;
}

export interface AnimeCard {
  id: string;
  name: string;
  jname?: string;
  poster: string;
  type?: string;
  duration?: string;
  rating?: string;
  episodes: Episode;
  malId?: number;
  anilistId?: number;
}

export interface HomeData {
  genres: string[];
  latestEpisodeAnimes: AnimeCard[];
  spotlightAnimes: SpotlightAnime[];
  top10Animes: {
    today: TopAnime[];
    week: TopAnime[];
    month: TopAnime[];
  };
  topAiringAnimes: AnimeCard[];
  topUpcomingAnimes: AnimeCard[];
  trendingAnimes: TrendingAnime[];
  mostPopularAnimes: AnimeCard[];
  mostFavoriteAnimes: AnimeCard[];
  latestCompletedAnimes: AnimeCard[];
}

export interface AnimeInfo {
  info: {
    id: string;
    name: string;
    poster: string;
    description: string;
    stats: {
      rating: string;
      quality: string;
      episodes: Episode;
      type: string;
      duration: string;
    };
    promotionalVideos: Array<{
      title?: string;
      source?: string;
      thumbnail?: string;
    }>;
    characterVoiceActor: Array<{
      character: {
        id: string;
        poster: string;
        name: string;
        cast: string;
      };
      voiceActor: {
        id: string;
        poster: string;
        name: string;
        cast: string;
      };
    }>;
  };
  moreInfo: {
    aired: string;
    genres: string[];
    status: string;
    studios: string;
    duration: string;
    malId?: number | null;
    anilistId?: number | null;
    [key: string]: any;
  };
}

export interface EpisodeData {
  number: number;
  title: string;
  episodeId: string;
  isFiller: boolean;
}

export interface EpisodeServer {
  serverId: number;
  serverName: string;
}

export interface StreamingSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
  language?: string;
  langCode?: string;
  isDub?: boolean;
  providerName?: string;
  needsHeadless?: boolean;
  isEmbed?: boolean;
  server?: string;
  contributorDisplay?: string;
  contributorUsername?: string;
}

export interface Subtitle {
  lang: string;
  url: string;
  label?: string;
  kind?: string;
  file?: string;
}

export interface NextEpisodeEstimate {
  lang?: string;
  server?: string;
  label: string;
  iso?: string;
}

export interface StreamingData {
  headers: {
    Referer: string;
    "User-Agent": string;
  };
  sources: StreamingSource[];
  subtitles: Subtitle[];
  tracks?: Subtitle[]; // API sometimes returns tracks instead of subtitles
  anilistID: number | null;
  malID: number | null;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  nextEpisodeEstimates?: NextEpisodeEstimate[];
}
export interface SearchResult {
  animes: AnimeCard[];
  mostPopularAnimes: AnimeCard[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  searchQuery: string;
}

// --- Character API Interfaces ---

export interface CharacterBase {
  _id: string;
  name: string;
  anime: string;
  image: string;
  gender?: string;
  status?: string;
}

export interface CharacterDetail extends CharacterBase {
  description: string;
  age?: string;
  birthday?: string;
  occupation?: string[];
  powers?: string[];
  abilities?: string[];
  weapons?: string[];
  country?: string;
  clan?: string;
  elements?: string[];
  affiliations?: string[];
  family?: Array<{ name: string; relation: string }>;
  voiceActors?: Array<{ name: string; language: string }>;
}

export interface CharacterApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalCharacters: number;
    pageSize: number;
  };
}

export async function fetchHome(): Promise<HomeData> {
  return apiGet<HomeData>("/home");
}

export async function fetchAnimeInfo(
  animeId: string
): Promise<{ anime: AnimeInfo; recommendedAnimes: AnimeCard[]; relatedAnimes: AnimeCard[] }> {
  // Routing numeric IDs to Animelok via TatakaiAPI
  if (/^\d+$/.test(animeId)) {
    const res = await externalApiGet<any>(TATAKAI_API_URL, `/animelok/anime/${animeId}`);
    if (res.status === 200 && res.data) {
      return mapAnimelokToAnimePage(res.data);
    }
  }
  return apiGet(`/anime/${animeId}`);
}

export async function fetchEpisodes(
  animeId: string
): Promise<{ totalEpisodes: number; episodes: EpisodeData[] }> {
  if (/^\d+$/.test(animeId)) {
    // For numeric anime IDs, fetch all episodes by making multiple requests
    let allEpisodes: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const res = await externalApiGet<any>(TATAKAI_API_URL, `/animelok/watch/${animeId}?ep=${page}`);
        if (res.status === 200 && res.data && res.data.episodes) {
          const pageEpisodes = res.data.episodes;
          allEpisodes = [...allEpisodes, ...pageEpisodes];

          // If we got fewer episodes than expected, we're done
          if (pageEpisodes.length === 0) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Failed to fetch episodes page ${page}:`, error);
        hasMore = false;
      }
    }

    return {
      totalEpisodes: allEpisodes.length,
      episodes: allEpisodes.map((ep: any) => ({
        number: parseInt(ep.number),
        title: ep.title || `Episode ${ep.number}`,
        episodeId: `${animeId}?ep=${ep.number}`,
        isFiller: false
      }))
    };
  }
  return apiGet(`/anime/${animeId}/episodes`);
}

// Helper to map Animelok data to the format expected by AnimePage (HiAnime compatible)
function mapAnimelokToAnimePage(data: any) {
  return {
    anime: {
      info: {
        id: data.id,
        name: data.title,
        poster: data.poster,
        description: data.description || "No description available.",
        stats: {
          rating: data.rating?.toString() || "?",
          quality: "HD",
          episodes: data.stats?.episodes || { sub: 0, dub: 0 },
          type: data.stats?.type || "TV",
          duration: data.stats?.duration || "?"
        },
        promotionalVideos: [],
        characterVoiceActor: []
      },
      moreInfo: {
        aired: data.stats?.aired || "?",
        genres: data.genres || [],
        status: data.stats?.status || "?",
        studios: data.stats?.studios || "?",
        duration: data.stats?.duration || "?",
        malId: data.malID || data.mal_id,
        anilistId: data.anilistID || data.anilist_id
      }
    },
    recommendedAnimes: [],
    relatedAnimes: []
  };
}

export async function fetchEpisodeServers(
  episodeId: string
): Promise<{
  episodeId: string;
  episodeNo: number;
  sub: EpisodeServer[];
  dub: EpisodeServer[];
  raw: EpisodeServer[];
}> {
  return apiGet(`/episode/servers?animeEpisodeId=${episodeId}`);
}

export async function fetchStreamingSources(
  episodeId: string,
  server: string = "hd-1",
  category: string = "sub"
): Promise<StreamingData> {
  // Use the refined query parameter structure from docs
  return apiGet(
    `/episode/sources?animeEpisodeId=${episodeId}&server=${server}&category=${category}`
  );
}

export async function searchAnime(
  query: string,
  page: number = 1
): Promise<SearchResult> {
  return apiGet(`/search?q=${encodeURIComponent(query)}&page=${page}`);
}

export async function fetchGenreAnimes(
  genre: string,
  page: number = 1
): Promise<{
  genreName: string;
  animes: AnimeCard[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
}> {
  return apiGet(`/genre/${genre}?page=${page}`);
}

// Fetch next episode schedule for an anime
export interface NextEpisodeSchedule {
  airingISOTimestamp: string | null;
  airingTimestamp: number | null;
  secondsUntilAiring: number | null;
}

export async function fetchNextEpisodeSchedule(
  animeId: string
): Promise<NextEpisodeSchedule> {
  return apiGet(`/anime/${animeId}/next-episode-schedule`);
}

// Fetch sources from WatchAnimeWorld via local TatakaiAPI
export async function fetchWatchanimeworldSources(
  episodeUrl: string
): Promise<StreamingData> {
  try {
    const json = await externalApiGet<any>(TATAKAI_API_URL, `/watchaw/episode?id=${encodeURIComponent(episodeUrl)}`);

    if (json.status === 200 && json.data) {
      return json.data;
    }

    return {
      headers: { Referer: "", "User-Agent": "" },
      sources: [],
      subtitles: [],
      anilistID: null,
      malID: null
    };
  } catch (error) {
    console.warn(`Failed to fetch WatchAnimeWorld sources: ${error}`);
    return {
      headers: { Referer: "", "User-Agent": "" },
      sources: [],
      subtitles: [],
      anilistID: null,
      malID: null
    };
  }
}

// Fetch anime data from AnimeHindiDubbed
// Tries TatakaiAPI first (has S5E episode parsing fix), falls back to Supabase edge function
export async function fetchAnimeHindiDubbedData(
  slug: string,
  episode?: number
): Promise<{
  title: string;
  slug: string;
  thumbnail?: string;
  description?: string;
  rating?: string;
  episodes: Array<{
    number: number;
    title: string;
    servers: Array<{
      name: string;
      url: string;
      language: string;
    }>;
  }>;
}> {
  // --- Strategy 1: TatakaiAPI (has correct S5E parsing) ---
  try {
    const tatakaiUrl = `${TATAKAI_API_URL}/hindidubbed/anime/${encodeURIComponent(slug)}`;
    const tRes = await fetch(tatakaiUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (tRes.ok) {
      const json = await tRes.json();
      if (json.status === 200 && json.data) {
        return json.data; // Already episode-centric with correct parsing
      }
    }
  } catch (e) {
    console.warn('[AnimeHindiDubbed] TatakaiAPI failed, trying Supabase edge function:', e);
  }

  // --- Strategy 2: Supabase edge function fallback ---
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const params = new URLSearchParams({ action: 'anime', slug });
  // Send BOTH param names so edge function works with either
  if (episode !== undefined) {
    params.set('episode', episode.toString());
    params.set('ep', episode.toString()); // Edge function reads 'ep'
  }
  if (apikey) params.set('apikey', apikey);

  const url = `${supabaseUrl}/functions/v1/animehindidubbed-scraper?${params.toString()}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (apikey) {
    headers['apikey'] = apikey;
    headers['Authorization'] = `Bearer ${apikey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch AnimeHindiDubbed data: ${response.status}`);
  }

  return response.json();
}

// Fetch from TatakaiAPI using Supabase proxy to avoid CORS
export async function fetchTatakaiEpisodeSources(
  episodeId: string,
  server: string = "hd-2",
  category: string = "sub"
): Promise<StreamingData & { malID?: number; anilistID?: number }> {
  const apiUrl = `${TATAKAI_API_URL}/hianime/episode/sources`;
  // Map frontend server names to backend-compatible scraper names
  const serverMap: Record<string, string> = {
    'hd-1': 'vidstreaming',
    'hd-2': 'megacloud',
    'stream-sb': 'streamsb',
    'vidcloud': 'vidcloud'
  };

  const params = new URLSearchParams({
    animeEpisodeId: episodeId,
    server: serverMap[server] || server,
    category
  });

  const targetUrl = `${apiUrl}?${params}`;

  // Determine if we should use proxy
  const isLocal = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // Increased timeout

    let response: Response;

    if (isLocal) {
      // Direct fetch for localhost
      response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
    } else {
      // Use Supabase proxy to avoid CORS issues
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const proxyParams = new URLSearchParams({
        url: targetUrl,
        type: 'api',
        referer: TATAKAI_API_URL.replace('/api/v1', '')
      });
      if (apikey) proxyParams.set('apikey', apikey);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (apikey) {
        headers['apikey'] = apikey;
        headers['Authorization'] = `Bearer ${apikey}`;
      }

      response = await fetch(`${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`, {
        signal: controller.signal,
        headers
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle 403 specifically (likely CORS/auth issue)
      if (response.status === 403) {
        throw new Error(`TatakaiAPI proxy returned status 403 (Forbidden). This may be a configuration issue.`);
      }
      throw new Error(`TatakaiAPI proxy returned status ${response.status}`);
    }

    const json = await response.json();

    if (json.status === 200 && json.data) {
      // Map tracks to subtitles format if needed
      const subtitles = (json.data.tracks || json.data.subtitles || []).map((track: any) => ({
        lang: track.lang || track.label || 'Unknown',
        url: track.url || track.src,
        label: track.lang || track.label
      }));

      return {
        headers: json.data.headers || { Referer: 'https://megacloud.blog/', 'User-Agent': 'Mozilla/5.0' },
        sources: (json.data.sources || []).map((source: any) => ({
          ...source,
          providerName: 'TatakaiAPI'
        })),
        subtitles,
        tracks: json.data.tracks,
        anilistID: json.data.anilistID || null,
        malID: json.data.malID || null,
        intro: json.data.intro,
        outro: json.data.outro
      };
    }

    throw new Error('TatakaiAPI returned invalid response');
  } catch (error) {
    console.error('Failed to fetch from TatakaiAPI:', error);
    throw error;
  }
}

// Helper for Animelok fetch with proxy/local support
async function animelokApiFetch(targetUrl: string): Promise<any> {
  const isLocal = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    let response: Response;
    if (isLocal) {
      response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
    } else {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl) throw new Error('Supabase URL not configured');

      const proxyParams = new URLSearchParams({
        url: targetUrl,
        type: 'api',
        referer: TATAKAI_API_URL.replace('/api/v1', '')
      });
      if (apikey) proxyParams.set('apikey', apikey);

      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (apikey) {
        headers['apikey'] = apikey;
        headers['Authorization'] = `Bearer ${apikey}`;
      }

      response = await fetch(`${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`, {
        signal: controller.signal,
        headers
      });
    }
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

// Fetch from Animelok (TatakaiAPI) with anime slug using Supabase proxy
export async function fetchAnimelokSources(
  animeSlug: string,
  episodeNumber: number
): Promise<{ sources: StreamingSource[]; malID?: number; anilistID?: number }> {
  const getSourcesFromData = (json: any) => {
    if (json?.status === 200 && json.data?.servers) {
      const sources = json.data.servers.map((server: any, index: number) => {
        let isM3U8 = server.url?.includes('.m3u8') || server.url?.includes('m3u8');
        const serverNameLower = server.name?.toLowerCase() || '';
        const tipLower = server.tip?.toLowerCase() || '';
        const language = server.language || 'Unknown';

        // Handle JSON array URLs
        let finalUrl = server.url;
        if (typeof server.url === 'string' && server.url.startsWith('[') && server.url.endsWith(']')) {
          try {
            const parsed = JSON.parse(server.url);
            if (Array.isArray(parsed) && parsed.length > 0) {
              isM3U8 = true;
            }
          } catch (e) { }
        }

        // Detect language code
        let displayLang = 'Unknown';
        const isCloudServer = serverNameLower.includes('cloud') || tipLower.includes('cloud');
        if (isCloudServer || language.toUpperCase().includes('HINDI') || language.toUpperCase().includes('HIN')) displayLang = 'HIN';
        else if (language.toUpperCase().includes('JAPAN') || language.toUpperCase().includes('JAP')) displayLang = 'JAP';
        else if (language.toUpperCase().includes('ENGLISH') || language.toUpperCase().includes('ENG') || language.toUpperCase() === 'EN') displayLang = 'ENG';
        else if (language.toUpperCase().includes('TAMIL') || language.toUpperCase().includes('TAM')) displayLang = 'TAM';
        else if (language.toUpperCase().includes('MALAYALAM') || language.toUpperCase().includes('MAL')) displayLang = 'MAL';
        else if (language.toUpperCase().includes('TELUGU') || language.toUpperCase().includes('TEL')) displayLang = 'TEL';
        else if (language.toUpperCase().includes('SPANISH') || language.toUpperCase().includes('ESP')) displayLang = 'ESP';
        else displayLang = language.substring(0, 3).toUpperCase();

        let providerName = `${displayLang}`;
        if (tipLower.includes('multi') || serverNameLower.includes('multi')) providerName = `Multi (${displayLang}) `;
        else if (serverNameLower.includes('bato')) providerName = `Totoro (${displayLang}) `;
        else if (serverNameLower.includes('kuro')) providerName = `Kuro (${displayLang}) `;
        else if (serverNameLower.includes('pahe')) providerName = `Pahe (${displayLang}) `;
        else if (serverNameLower.includes('gogo')) providerName = `Gogo (${displayLang}) `;
        else if (serverNameLower.includes('stream')) providerName = `Stream (${displayLang}) `;
        else if (serverNameLower.includes('all')) providerName = `AllMight (${displayLang}) `;
        else if (serverNameLower.includes('pain')) providerName = `Pain (${displayLang}) `;
        else if (serverNameLower.includes('kaido')) providerName = `Kaido (${displayLang}) `;
        else if (serverNameLower.includes('gara')) providerName = `Gaara (${displayLang}) `;
        else if (serverNameLower.includes('itachi')) providerName = `Itachi (${displayLang}) `;
        else if (serverNameLower.includes('madara')) providerName = `Madara (${displayLang}) `;
        else if (serverNameLower.includes('cloud')) providerName = `Hindi (Cloud) `;

        return {
          url: server.url,
          isM3U8,
          quality: server.quality || 'HD',
          language: displayLang === 'HIN' ? 'Hindi' : (displayLang === 'JAP' ? 'Japanese' : (displayLang === 'TAM' ? 'Tamil' : (displayLang === 'MAL' ? 'Malayalam' : 'English'))),
          langCode: `animelok-${index}-${displayLang}`,
          isDub: displayLang !== 'JAP' && !language.toLowerCase().includes('sub'),
          providerName: providerName.trim(),
          isEmbed: !isM3U8,
          needsHeadless: !isM3U8
        };
      });

      return {
        sources,
        malID: json.data.malId || json.data.malID,
        anilistID: json.data.anilistId || json.data.anilistID
      };
    }
    return { sources: [] };
  };

  const constructUrl = (slug: string) => `${TATAKAI_API_URL}/animelok/watch/${slug}?ep=${episodeNumber}`;

  try {
    // 1. Direct fetch
    let json = await animelokApiFetch(constructUrl(animeSlug));
    let result = getSourcesFromData(json);
    if (result.sources.length > 0) return result;

    // 2. Search fallback
    const searchUrl = `${TATAKAI_API_URL}/animelok/search?q=${encodeURIComponent(animeSlug.replace(/-/g, ' '))}`;
    const searchJson = await animelokApiFetch(searchUrl);

    if (searchJson?.status === 200 && searchJson.data?.animes?.length > 0) {
      const results = searchJson.data.animes;
      // Search for best match or just use the first one if it seems related
      const bestMatch = results.find((a: any) =>
        a.id?.includes(animeSlug) || animeSlug.includes(a.id)
      ) || results[0];

      if (bestMatch?.id && bestMatch.id !== animeSlug) {
        json = await animelokApiFetch(constructUrl(bestMatch.id));
        return getSourcesFromData(json);
      }
    }

    return { sources: [] };
  } catch (error) {
    console.error('Animelok fetch failed:', error);
    return { sources: [] };
  }
}


// Fetch from Desidubanime (TatakaiAPI)
export async function fetchDesidubanimeSources(
  watchSlug: string
): Promise<StreamingSource[] | { sources: StreamingSource[]; nextEpisodeEstimates?: Array<{ lang?: string; server?: string; label: string; iso?: string }> }> {
  const apiUrl = `${TATAKAI_API_URL}/desidubanime/watch/${watchSlug}`;

  // Determine if we should use proxy
  const isLocal = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;

    if (isLocal) {
      // Direct fetch for localhost
      response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
    } else {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const proxyParams = new URLSearchParams({
        url: apiUrl,
        type: 'api',
        referer: TATAKAI_API_URL.replace('/api/v1', '')
      });
      if (apikey) proxyParams.set('apikey', apikey);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (apikey) {
        headers['apikey'] = apikey;
        headers['Authorization'] = `Bearer ${apikey}`;
      }

      const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

      response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Desidubanime API returned status ${response.status}`);
    }

    const json = await response.json();

    if (json.status === 200 && json.data && json.data.sources) {
      const sources: StreamingSource[] = json.data.sources.map((source: any, index: number) => ({
        url: source.url,
        isM3U8: source.isM3U8 || false,
        quality: source.quality || 'default',
        language: source.language || 'Unknown',
        langCode: `desidubanime-${index}-${(source.language || 'unknown').toLowerCase()}`,
        isDub: source.category === 'dub' || source.language?.toLowerCase().includes('hindi'),
        providerName: source.name || `DesiDub ${index + 1}`,
        isEmbed: source.isEmbed || !source.isM3U8,
        needsHeadless: source.needsHeadless || false
      }));

      // Return object with sources and nextEpisodeEstimates if available
      if (json.data.nextEpisodeEstimates && json.data.nextEpisodeEstimates.length > 0) {
        return {
          sources,
          nextEpisodeEstimates: json.data.nextEpisodeEstimates
        };
      }

      return sources;
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch from Desidubanime:', error);
    return [];
  }
}

// Fetch from Aniworld (TatakaiAPI)
export async function fetchAniworldSources(
  slug: string, // e.g., "fire-force/staffel-1"
  episodeNumber: number
): Promise<StreamingSource[]> {
  const apiUrl = `${TATAKAI_API_URL}/aniworld/watch/${slug}/episode/${episodeNumber}`;

  // Determine if we should use proxy
  const isLocal = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;

    if (isLocal) {
      response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
    } else {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const proxyParams = new URLSearchParams({
        url: apiUrl,
        type: 'api',
        referer: TATAKAI_API_URL.replace('/api/v1', '')
      });
      if (apikey) proxyParams.set('apikey', apikey);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (apikey) {
        headers['apikey'] = apikey;
        headers['Authorization'] = `Bearer ${apikey}`;
      }

      const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

      response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Aniworld API returned status ${response.status}`);
    }

    const json = await response.json();

    if (json.status === 200 && json.data && json.data.sources) {
      return json.data.sources.map((source: any, index: number) => ({
        url: source.url,
        isM3U8: source.isM3U8 || false,
        quality: 'HD',
        language: source.language || 'German',
        langCode: `aniworld-${index}-${(source.langCode || 'de').toLowerCase()}`,
        isDub: source.isDub !== false, // German is typically dub
        providerName: source.name || `Aniworld ${index + 1}`,
        isEmbed: source.isEmbed || true,
        needsHeadless: source.needsHeadless || false
      }));
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch from Aniworld:', error);
    return [];
  }
}

// Fetch from ToonStream API (Hindi/Multi-language embed servers)
// Tries TatakaiAPI proxy first, then calls external ToonStream API directly via Supabase proxy
export async function fetchToonStreamSources(
  animeName: string,
  season: number,
  episodeNumber: number
): Promise<StreamingSource[]> {
  const slug = animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const episodeSlug = `${slug}-${season}x${episodeNumber}`;

  const parseToonStreamResponse = (json: any): StreamingSource[] => {
    // Handle both TatakaiAPI wrapper format and raw ToonStream format
    const data = json.data || json;
    const sources = data.sources;
    if (!sources || !Array.isArray(sources)) return [];

    const languages = data.languages || ['Hindi'];
    const primaryLang = languages[0] || 'Hindi';
    const langAbbr = primaryLang.toLowerCase().startsWith('hin') ? 'HIN'
      : primaryLang.toLowerCase().startsWith('tam') ? 'TAM'
        : primaryLang.toLowerCase().startsWith('tel') ? 'TEL'
          : primaryLang.toLowerCase().startsWith('eng') ? 'ENG'
            : primaryLang.toLowerCase().startsWith('jap') ? 'JAP'
              : primaryLang.toUpperCase().slice(0, 3);

    // For raw ToonStream API, pair sources with servers array
    const servers = data.servers || [];

    return sources.map((source: any, index: number) => {
      // Determine server name from servers array or source itself
      const serverInfo = servers[index] || {};
      const serverName = source.serverName // TatakaiAPI format
        || serverInfo.name               // Raw ToonStream format
        || `Server ${index + 1}`;
      const serverId = source.serverId || serverInfo.id || `server-${index}`;

      return {
        url: source.url,
        isM3U8: source.url.includes('.m3u8'),
        quality: source.quality || 'HD',
        language: primaryLang,
        langCode: `toonstream-${index}-${serverId}`,
        isDub: true,
        providerName: `${serverName} (${langAbbr})`,
        isEmbed: source.type === 'iframe',
        needsHeadless: false
      };
    });
  };

  // --- Strategy 1: TatakaiAPI proxy ---
  try {
    const apiUrl = `${TATAKAI_API_URL}/toonstream/episode/${episodeSlug}`;
    const res = await fetch(apiUrl, {
      headers: withClientHeaders({ 'Accept': 'application/json' }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json();
      const parsed = parseToonStreamResponse(json);
      if (parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('[ToonStream] TatakaiAPI proxy failed, trying direct:', e);
  }

  // --- Strategy 2: Call ToonStream external API directly via Supabase proxy ---
  try {
    const externalUrl = `https://toonstream-api.ry4n.qzz.io/api/episode/${episodeSlug}`;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    let response: Response;
    if (supabaseUrl) {
      // Use Supabase rapid-service proxy to avoid CORS
      const proxyParams = new URLSearchParams({
        url: externalUrl,
        type: 'api',
      });
      if (apikey) proxyParams.set('apikey', apikey);

      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (apikey) {
        headers['apikey'] = apikey;
        headers['Authorization'] = `Bearer ${apikey}`;
      }

      response = await fetch(
        `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`,
        { headers, signal: AbortSignal.timeout(12000) }
      );
    } else {
      // Direct call (works in non-browser environments or if CORS allows)
      response = await fetch(externalUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
    }

    if (response.ok) {
      const json = await response.json();
      return parseToonStreamResponse(json);
    }
  } catch (e) {
    console.warn('[ToonStream] Direct/proxy fetch also failed:', e);
  }

  return [];
}

// Fetch HindiAPI sources (TechInMind) using TMDB-based lookup
// Accepts MAL or AniList IDs, which the TatakaiAPI route auto-converts to TMDB
export async function fetchHindiApiSources(
  episodeNumber: number,
  malId?: number | string,
  anilistId?: number | string,
  season: number = 1
): Promise<StreamingSource[]> {
  const params = new URLSearchParams({
    season: String(season),
    episode: String(episodeNumber),
    type: 'series',
  });

  if (malId) params.set('malId', String(malId));
  else if (anilistId) params.set('anilistId', String(anilistId));
  else return []; // Need at least one ID

  console.debug(`[HindiAPI] Fetching: malId=${malId}, anilistId=${anilistId}, ep=${episodeNumber}, season=${season}`);

  try {
    const apiUrl = `${TATAKAI_API_URL}/hindiapi/episode?${params.toString()}`;
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000), // Longer timeout: upstream TMDB resolve + embed extraction
    });

    if (!res.ok) {
      if (res.status !== 404) console.warn(`[HindiAPI] API returned ${res.status}`);
      return [];
    }

    const json: any = await res.json();
    const data = json.data;
    if (!data?.streams || !Array.isArray(data.streams)) {
      console.warn('[HindiAPI] No streams in response:', json);
      return [];
    }

    const mapped = data.streams
      .filter((s: any) => s.url || s.dhls)
      .map((stream: any, index: number) => {
        const hasDirect = Boolean(stream.dhls);
        const providerKey = stream.provider?.toLowerCase().replace(/\s+/g, '') || `server${index}`;

        // Route direct HLS through proxy to handle CORS + required headers
        let streamUrl: string;
        let isM3U8 = false;
        if (hasDirect) {
          const referer = stream.headers?.Referer || stream.headers?.referer || '';
          streamUrl = `${TATAKAI_API_URL}/hindiapi/proxy?url=${encodeURIComponent(stream.dhls)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
          isM3U8 = true;
        } else {
          streamUrl = stream.url;
        }

        return {
          url: streamUrl,
          isM3U8,
          quality: 'HD',
          language: 'Hindi',
          langCode: `hindiapi-${index}-${providerKey}`,
          isDub: true,
          providerName: `${stream.provider || `Server ${index + 1}`} (HIN)`,
          isEmbed: !hasDirect,
          needsHeadless: !hasDirect,
        } satisfies StreamingSource;
      });

    console.debug(`[HindiAPI] Got ${mapped.length} sources:`, mapped.map(s => `${s.providerName} [${s.isM3U8 ? 'HLS' : s.isEmbed ? 'embed' : 'direct'}]`));
    return mapped;
  } catch (e) {
    console.warn('[HindiAPI] Fetch failed:', e);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// AnilistHindi Sources (AniList ID → TMDB → TechInMind HLS/Embeds)
// ──────────────────────────────────────────────────────────────────────────
export async function fetchAnilistHindiSources(
  episodeNumber: number,
  anilistId?: number | string,
  season: number = 1
): Promise<StreamingSource[]> {
  if (!anilistId) return [];

  const params = new URLSearchParams({
    anilistId: String(anilistId),
    episode: String(episodeNumber),
    season: String(season),
    type: 'series',
  });

  console.debug(`[AnilistHindi] Fetching: anilistId=${anilistId}, ep=${episodeNumber}, season=${season}`);

  try {
    const apiUrl = `${TATAKAI_API_URL}/anilisthindi/episode?${params}`;
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      if (res.status !== 404) console.warn(`[AnilistHindi] API returned ${res.status}`);
      return [];
    }

    const json: any = await res.json();
    const data = json.data;
    if (!data?.streams || !Array.isArray(data.streams)) {
      console.warn('[AnilistHindi] No streams in response');
      return [];
    }

    const mapped: StreamingSource[] = data.streams
      .filter((s: any) => s.url || s.dhls)
      .map((stream: any, index: number) => {
        const hasDirect = Boolean(stream.dhls);
        const providerKey = stream.provider?.toLowerCase().replace(/\s+/g, '') || `server${index}`;
        let streamUrl: string;
        let isM3U8 = false;

        if (hasDirect) {
          const referer = stream.headers?.Referer || stream.headers?.referer || '';
          streamUrl = `${TATAKAI_API_URL}/anilisthindi/proxy?url=${encodeURIComponent(stream.dhls)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
          isM3U8 = true;
        } else {
          streamUrl = stream.url;
        }

        return {
          url: streamUrl,
          isM3U8,
          quality: 'HD',
          language: 'Hindi',
          langCode: `anilisthindi-${index}-${providerKey}`,
          isDub: true,
          providerName: `${stream.provider || `Server ${index + 1}`} (AH)`,
          isEmbed: !hasDirect,
          needsHeadless: !hasDirect,
        } satisfies StreamingSource;
      });

    console.debug(`[AnilistHindi] Got ${mapped.length} sources`);
    return mapped;
  } catch (e) {
    console.warn('[AnilistHindi] Fetch failed:', e);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// ToonWorld4ALL Sources (Madara WordPress scraper)
// ──────────────────────────────────────────────────────────────────────────
export async function fetchToonWorldSources(
  animeName: string,
  season: number = 1,
  episodeNumber: number = 1
): Promise<StreamingSource[]> {
  const animeSlug = animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const params = new URLSearchParams({
    slug: animeSlug,
    season: String(season),
    episode: String(episodeNumber),
  });

  console.debug(`[ToonWorld] Fetching: ${animeSlug} S${season}E${episodeNumber}`);

  try {
    const apiUrl = `${TATAKAI_API_URL}/toonworld/episode?${params}`;
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      if (res.status !== 404) console.warn(`[ToonWorld] API returned ${res.status}`);
      return [];
    }

    const json: any = await res.json();
    const data = json.data;
    if (!data?.sources || !Array.isArray(data.sources)) return [];

    return data.sources.map((s: any, idx: number): StreamingSource => ({
      url: s.url,
      isM3U8: s.isM3U8 || s.type === 'hls',
      quality: s.quality || 'HD',
      language: 'English',
      langCode: s.langCode || `toonworld-${idx}`,
      isDub: false,
      providerName: s.provider || 'ToonWorld4ALL',
      isEmbed: s.type === 'iframe',
      needsHeadless: false,
    }));
  } catch (e) {
    console.warn('[ToonWorld] Fetch failed:', e);
    return [];
  }
}

// Fetch from Animeya using Supabase proxy
export async function fetchAnimeyaSources(
  id: string | number,
  episodeNumber?: number,
  animeName?: string // New parameter for search
): Promise<StreamingSource[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error('Supabase URL not configured');

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apikey) {
    headers['apikey'] = apikey;
    headers['Authorization'] = `Bearer ${apikey}`;
  }

  // Helper to fetch via proxy
  const fetchProxy = async (targetUrl: string) => {
    // If localhost, bypass proxy
    if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
      const res = await fetch(targetUrl, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return res.json();
    }

    const proxyParams = new URLSearchParams({
      url: targetUrl,
      type: 'api',
      referer: TATAKAI_API_URL.replace('/api/v1', '')
    });
    if (apikey) proxyParams.set('apikey', apikey);

    const res = await fetch(`${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`, { headers });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return res.json();
  };

  let episodeId = id;

  // If we have animeName and episodeNumber, attempt to resolve the real Animeya Episode ID
  if (animeName && episodeNumber && typeof id === 'number') {
    try {
      console.log(`[Animeya] Resolving episode ID for ${animeName} (MAL: ${id}) Ep ${episodeNumber}`);

      // 1. Search for the anime
      const searchRes = await fetchProxy(`${TATAKAI_API_URL}/animeya/search?q=${encodeURIComponent(animeName)}`);

      if (searchRes.status === 200 && Array.isArray(searchRes.data)) {
        // Find best match - look for slug ending with MAL ID
        const match = searchRes.data.find((a: any) => a.slug && a.slug.endsWith(`-${id}`))
          || searchRes.data[0]; // Fallback to first result

        if (match && match.slug) {
          console.log(`[Animeya] Found anime slug: ${match.slug}`);

          // 2. Get Info (Episodes)
          const infoRes = await fetchProxy(`${TATAKAI_API_URL}/animeya/info/${match.slug}`);

          if (infoRes.status === 200 && infoRes.data && Array.isArray(infoRes.data.episodes) && infoRes.data.episodes.length > 0) {
            const episodes = infoRes.data.episodes;
            const exactEp = episodes.find((ep: any) => ep.number === episodeNumber);

            if (exactEp && exactEp.id) {
              console.log(`[Animeya] Resolved Exact Episode ID: ${exactEp.id}`);
              episodeId = exactEp.id;
            } else {
              // Interpolate ID if exact match not found (assuming sequential IDs)
              // This handles cases where API only returns a slice (e.g. 401-500)
              // Find nearest episode
              const anchor = episodes[0]; // Use first available as anchor
              if (anchor && typeof anchor.id === 'number' && typeof anchor.number === 'number') {
                const diff = episodeNumber - anchor.number;
                const estimatedId = anchor.id + diff;
                console.log(`[Animeya] Interpolated ID: ${estimatedId} (Anchor: Ep ${anchor.number} ID ${anchor.id})`);
                episodeId = estimatedId;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Animeya] Failed to resolve episode ID via search, falling back to direct ID', e);
    }
  }

  // 3. Watch (Get Sources)
  let apiUrl = `${TATAKAI_API_URL}/animeya/watch/${episodeId}`;

  // Keep legacy ?ep support just in case, though using resolved ID is safer
  if (episodeNumber !== undefined && episodeId === id) {
    apiUrl += `?ep=${episodeNumber}`;
  }

  const proxyParams = new URLSearchParams({
    url: apiUrl,
    type: 'api',
    referer: TATAKAI_API_URL.replace('/api/v1', '')
  });
  if (apikey) proxyParams.set('apikey', apikey);

  const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    const isLocal = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');

    if (isLocal) {
      response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
    } else {
      const proxyParams = new URLSearchParams({
        url: apiUrl,
        type: 'api',
        referer: TATAKAI_API_URL.replace('/api/v1', '')
      });
      if (apikey) proxyParams.set('apikey', apikey);

      const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

      response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Animeya API returned status ${response.status}`);
    }

    const json = await response.json();


    if (json.status === 200 && json.data && json.data.sources) {
      // Map Animeya sources to StreamingSource format with proper categorization
      return json.data.sources.map((source: any, index: number) => {
        const isEmbed = source.type === 'EMBED';
        const language = source.langue || source.language || 'ENG';
        const subType = source.subType || 'NONE';
        const sourceName = source.name || `Source ${index + 1}`;

        // Create descriptive provider name
        let providerName = sourceName;

        // Map to anime-themed names with language
        if (sourceName.includes('Vidnest')) {
          providerName = subType === 'NONE' ? `Bebop Dub (${language})` : `Bebop Sub (${language})`;
        } else if (sourceName.includes('Pahe')) {
          providerName = `Pahe (${language})`;
        } else if (sourceName.includes('Player')) {
          const playerNum = sourceName.match(/\d+/)?.[0] || index + 1;
          providerName = `Player ${playerNum} (${language})`;
        } else if (sourceName.includes('Mp4')) {
          providerName = `Mp4 (${language})`;
        } else {
          providerName = `${sourceName} (${language})`;
        }

        return {
          url: source.url,
          isM3U8: source.type === 'HLS',
          quality: source.quality || '720p',
          language: language,
          langCode: `animeya-${source.id || index}`,
          isDub: subType === 'NONE' || language !== 'JAP',
          providerName: providerName,
          isEmbed: isEmbed,
          needsHeadless: isEmbed,
        };
      });
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch from Animeya:', error);
    return [];
  }
}

// Fetch custom sources from Supabase targeting this anime/episode
export async function fetchCustomSupabaseSources(
  animeId?: string,
  episodeId?: string,
  episodeNumber?: number,
  currentUserId?: string // Support visibility of pending items for the uploader
): Promise<StreamingSource[]> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');

    // 1. Fetch staff-added custom sources
    const { data: customData } = await supabase
      .from('custom_sources')
      .select('*')
      .eq('is_active', true)
      .or(animeId ? `anime_id.is.null,anime_id.eq.${animeId}` : 'anime_id.is.null')
      .order('created_at', { ascending: false });

    // 2. Fetch approved user marketplace items OR the user's own pending items
    // Using profiles!user_id to resolve ambiguity between multiple FKs to profiles table
    let marketplaceQuery = supabase
      .from('marketplace_items')
      .select('*, profiles!user_id(display_name, username)');

    // Status filter: approved for everyone, OR pending if it's the current user's item
    if (currentUserId) {
      marketplaceQuery = marketplaceQuery.or(`status.eq.approved,and(status.eq.pending,user_id.eq.${currentUserId})`);
    } else {
      marketplaceQuery = marketplaceQuery.eq('status', 'approved');
    }

    if (animeId) {
      marketplaceQuery = marketplaceQuery.eq('anime_id', animeId);
    }
    if (episodeNumber !== undefined) {
      marketplaceQuery = marketplaceQuery.eq('episode_number', episodeNumber);
    }

    let { data: marketplaceData, error: marketplaceError } = await marketplaceQuery;

    // Fallback if join fails (e.g. schema cache lag or PostgREST ambiguity)
    if (marketplaceError || !marketplaceData) {
      console.warn('Marketplace join query failed, falling back to simple query:', marketplaceError);

      let simpleQuery = supabase
        .from('marketplace_items')
        .select('*');

      if (currentUserId) {
        simpleQuery = simpleQuery.or(`status.eq.approved,and(status.eq.pending,user_id.eq.${currentUserId})`);
      } else {
        simpleQuery = simpleQuery.eq('status', 'approved');
      }

      if (animeId) {
        simpleQuery = simpleQuery.eq('anime_id', animeId);
      }
      if (episodeNumber !== undefined) {
        simpleQuery = simpleQuery.eq('episode_number', episodeNumber);
      }

      const { data: simpleData } = await simpleQuery;
      marketplaceData = simpleData;
    }

    const sources: StreamingSource[] = [];

    // Map staff sources
    if (customData) {
      customData.forEach(source => {
        sources.push({
          url: source.url,
          isM3U8: source.type === 'direct' && source.url.includes('.m3u8'),
          quality: 'HD',
          language: 'Custom',
          langCode: `custom-${source.id}`,
          providerName: source.name,
          isEmbed: source.type === 'embed',
          needsHeadless: source.type === 'embed'
        });
      });
    }

    // Map approved user sources
    if (marketplaceData) {
      marketplaceData.forEach((item: any) => {
        if (item.type === 'server') {
          const isEmbed = item.data?.isEmbed ?? !item.data?.url?.includes('.m3u8');
          // If profiles join worked, use those fields. 
          // If not, and it's our own item, use 'You' or fallback to user_id
          const isOwn = currentUserId && item.user_id === currentUserId;
          const display = item.profiles?.display_name || item.profiles?.username || (isOwn ? 'You' : 'Community');
          const username = item.profiles?.username || (isOwn ? 'me' : 'user');
          const isPending = item.status === 'pending';

          sources.push({
            url: item.data?.url,
            isM3U8: item.data?.url?.includes('.m3u8'),
            quality: 'HD',
            language: item.data?.lang || 'Custom',
            langCode: `marketplace-${item.id}`,
            providerName: isPending ? `${item.data?.label || 'User Source'} (Pending)` : (item.data?.label || 'User Source'),
            isEmbed: isEmbed,
            needsHeadless: isEmbed,
            server: `Shared by ${display}`,
            contributorDisplay: display,
            contributorUsername: username
          });
        }
      });
    }

    return sources;
  } catch (error) {
    console.warn('Failed to fetch custom supabase sources:', error);
    return [];
  }
}

// Global combined source fetcher
export async function fetchCombinedSources(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string // New parameter for pending item visibility
): Promise<StreamingData & { hasTatakaiAPI: boolean }> {
  if (!episodeId) throw new Error("Episode ID required");

  // Step 1: Fetch Primary HiAnime sources (Priority 1: Direct Vercel API)
  let primaryData: StreamingData = {
    headers: { Referer: "", "User-Agent": "" },
    sources: [],
    subtitles: [],
    anilistID: null,
    malID: null
  };
  let directHiAnimeSuccess = false;

  try {
    primaryData = await fetchStreamingSources(episodeId, server, category);
    directHiAnimeSuccess = true;
  } catch (error) {
    console.warn('Direct HiAnime API failed, trying TatakaiAPI fallback');
    try {
      const fallback = await fetchTatakaiEpisodeSources(episodeId, server, category);
      primaryData = fallback;
    } catch (f) {
      console.warn('All HiAnime source attempts failed');
    }
  }

  // Step 2: Use resolved IDs from primary data for other scrapers
  let malID = primaryData.malID || undefined;
  let anilistID = primaryData.anilistID || undefined;
  const hasTatakaiAPI = directHiAnimeSuccess;

  // Fetch all other sources in parallel with the best available metadata
  const otherResults = await Promise.allSettled([
    // [0] WatchAnimeWorld Sources
    (async () => {
      try {
        if (episodeNumber !== undefined && animeName) {
          const waSimpleName = animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const directSlug = `${waSimpleName}-1x${episodeNumber}`;
          let data = await fetchWatchanimeworldSources(directSlug);
          if (data.sources && data.sources.length > 0) return data;

          const cleanSearchName = animeName.replace(/:/g, '');
          const searchRes = await externalApiGet<any>(TATAKAI_API_URL, `/watchaw/search?q=${encodeURIComponent(cleanSearchName)}`);
          if (searchRes.status === 200 && (searchRes.data as any)?.results?.length > 0) {
            const match = (searchRes.data as any).results[0];
            if (match && match.slug) {
              const resolvedSlug = match.slug.includes('x') ? match.slug : `${match.slug}-1x${episodeNumber}`;
              return await fetchWatchanimeworldSources(resolvedSlug);
            }
          }
        }
      } catch (e) {
        console.warn('WatchAnimeWorld fetch failed:', e);
      }
      return { sources: [] };
    })(),

    // [1] Animeya Sources (Use MAL ID if available)
    (async () => {
      try {
        if (episodeNumber !== undefined) {
          return await fetchAnimeyaSources(malID || animeName || "", episodeNumber, animeName);
        }
      } catch (e) {
        console.warn('Animeya fetch failed:', e);
      }
      return [];
    })(),

    // [2] Animelok Sources
    (async () => {
      try {
        if (episodeNumber !== undefined) {
          const simpleName = animeName?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || "";
          const animelokId = malID ? `${simpleName}-${malID}` : (animeName || "");
          if (animelokId) {
            const result = await fetchAnimelokSources(animelokId, episodeNumber);
            return result;
          }
        }
      } catch (e) {
        console.warn('[CombinedSources] Animelok fetch failed:', e);
      }
      return { sources: [] };
    })(),

    // [3] Desidubanime Sources
    (async () => {
      try {
        if (episodeNumber !== undefined && animeName) {
          const ddSimpleName = animeName.toLowerCase()
            .replace(/'s/g, 's')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

          const watchSlug = `${ddSimpleName}-episode-${episodeNumber}`;
          let sources = await fetchDesidubanimeSources(watchSlug);
          if (Array.isArray(sources) && sources.length > 0) return sources;
          if (!Array.isArray(sources) && (sources as any).sources?.length > 0) return sources;

          const cleanSearchName = animeName.replace(/:/g, '');
          const searchRes = await externalApiGet<any>(TATAKAI_API_URL, `/desidubanime/search?q=${encodeURIComponent(cleanSearchName)}`);
          if (searchRes.status === 200 && (searchRes.data as any)?.results?.length > 0) {
            const results = (searchRes.data as any).results;
            const match = results.find((r: any) =>
              r.slug && (r.slug.includes(ddSimpleName) || ddSimpleName.includes(r.slug))
            ) || results[0];

            if (match && match.slug) {
              const resolvedSlug = `${match.slug}-episode-${episodeNumber}`;
              return await fetchDesidubanimeSources(resolvedSlug);
            }
          }
        }
      } catch (e) {
        console.warn('Desidubanime fetch failed:', e);
      }
      return [];
    })(),

    // [4] Aniworld Sources
    (async () => {
      try {
        if (episodeNumber !== undefined && animeName) {
          const awSimpleName = animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const cleanSearchName = animeName.replace(/:/g, '');
          let sources = await fetchAniworldSources(awSimpleName, episodeNumber);
          if (sources.length > 0) return sources;

          const searchRes = await externalApiGet<any>(TATAKAI_API_URL, `/aniworld/search?q=${encodeURIComponent(cleanSearchName)}`);
          if (searchRes.status === 200 && (searchRes.data as any)?.results?.length > 0) {
            const results = (searchRes.data as any).results;
            const match = results.find((r: any) =>
              r.slug && (r.slug.includes(awSimpleName) || awSimpleName.includes(r.slug))
            ) || results[0];

            if (match && match.slug) {
              return await fetchAniworldSources(match.slug, episodeNumber);
            }
          }
        }
      } catch (e) {
        console.warn('Aniworld fetch failed:', e);
      }
      return [];
    })(),

    // [5] AnimeHindiDubbed
    (async () => {
      try {
        if (episodeNumber !== undefined && animeName) {
          const ahdSimpleName = animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const data = await fetchAnimeHindiDubbedData(ahdSimpleName, episodeNumber);

          if (data && data.episodes) {
            const targetEp = data.episodes.find(e => e.number === episodeNumber);

            if (targetEp && targetEp.servers) {
              // Deduplicate: keep only ONE source per server name (Filemoon, Servabyss, Vidgroud)
              // This prevents flooding if the backend returns broken episode data
              const seenServers = new Set<string>();
              const dedupedServers = targetEp.servers.filter(s => {
                const key = s.name.toLowerCase();
                if (seenServers.has(key)) return false;
                seenServers.add(key);
                return true;
              });

              return dedupedServers.map((s, i) => {
                const lang = (s.language || 'Hindi').trim();
                const langCode = lang.toLowerCase().startsWith('hin') ? 'HIN'
                  : lang.toLowerCase().startsWith('tam') ? 'TAM'
                    : lang.toLowerCase().startsWith('tel') ? 'TEL'
                      : lang.toLowerCase().startsWith('eng') ? 'ENG'
                        : lang.toLowerCase().startsWith('jap') ? 'JAP'
                          : lang.toUpperCase().slice(0, 3);
                return {
                  url: s.url,
                  isM3U8: s.url.includes('.m3u8'),
                  quality: 'HD',
                  language: lang,
                  langCode: `animehindidubbed-${i}-${langCode.toLowerCase()}`,
                  isDub: true,
                  providerName: `${s.name} (${langCode})`,
                  isEmbed: !s.url.includes('.m3u8'),
                  needsHeadless: false
                };
              });
            }
          }
        }
      } catch (e) {
        console.warn('AnimeHindiDubbed fetch failed:', e);
      }
      return [];
    })(),

    // [6] Custom Supabase Sources
    (async () => {
      try {
        const idBase = episodeId.split('?')[0];
        return await fetchCustomSupabaseSources(idBase, episodeId, episodeNumber, currentUserId);
      } catch (error) {
        console.warn('Supabase sources fetch failed:', error);
        return [];
      }
    })(),

    // [7] ToonStream Sources (Hindi/Multi-language embeds)
    (async () => {
      try {
        if (episodeNumber !== undefined && animeName) {
          return await fetchToonStreamSources(animeName, 1, episodeNumber);
        }
      } catch (e) {
        console.warn('ToonStream fetch failed:', e);
      }
      return [];
    })(),

    // [8] HindiAPI Sources (TechInMind - TMDB-based Hindi embeds + direct HLS)
    (async () => {
      try {
        if (episodeNumber !== undefined && (malID || anilistID)) {
          console.debug(`[CombinedSources] HindiAPI slot starting: malID=${malID}, anilistID=${anilistID}, ep=${episodeNumber}`);
          const result = await fetchHindiApiSources(episodeNumber, malID, anilistID);
          console.debug(`[CombinedSources] HindiAPI slot returned ${result.length} sources`);
          return result;
        } else {
          console.debug(`[CombinedSources] HindiAPI slot skipped: ep=${episodeNumber}, malID=${malID}, anilistID=${anilistID}`);
        }
      } catch (e) {
        console.warn('HindiAPI fetch failed:', e);
      }
      return [];
    })(),

    // [9] AnilistHindi Sources (AniList ID → TMDB → TechInMind HLS/Embeds — Hindi dub)
    (async () => {
      try {
        if (episodeNumber !== undefined && anilistID) {
          return await fetchAnilistHindiSources(episodeNumber, anilistID);
        }
      } catch (e) {
        console.warn('AnilistHindi fetch failed:', e);
      }
      return [];
    })(),

    // [10] ToonWorld4ALL Sources (Madara scraper — English, hard subs)
    (async () => {
      try {
        if (episodeNumber !== undefined && animeName) {
          return await fetchToonWorldSources(animeName, 1, episodeNumber);
        }
      } catch (e) {
        console.warn('ToonWorld fetch failed:', e);
      }
      return [];
    })()
  ]);

  // Extract results
  const watchAwVal = otherResults[0].status === 'fulfilled' ? otherResults[0].value : { sources: [] };
  const animeyaVal = otherResults[1].status === 'fulfilled' ? otherResults[1].value : [];
  const animelokResult = otherResults[2].status === 'fulfilled' ? otherResults[2].value : { sources: [] };
  const desidubVal = otherResults[3].status === 'fulfilled' ? otherResults[3].value : [];
  const aniworldVal = otherResults[4].status === 'fulfilled' ? otherResults[4].value : [];
  const hindiVal = otherResults[5].status === 'fulfilled' ? otherResults[5].value : [];
  const customVal = otherResults[6].status === 'fulfilled' ? otherResults[6].value : [];
  const toonStreamVal = otherResults[7].status === 'fulfilled' ? otherResults[7].value : [];
  const hindiApiVal = otherResults[8].status === 'fulfilled' ? otherResults[8].value : [];
  const anilistHindiVal = otherResults[9].status === 'fulfilled' ? otherResults[9].value : [];
  const toonWorldVal = otherResults[10].status === 'fulfilled' ? otherResults[10].value : [];

  const animelokVal = 'sources' in animelokResult ? animelokResult.sources : animelokResult;

  // ID Harvesting: Update malID and anilistID if missing from main source
  if (!malID) {
    malID = (animelokResult as any).malID || (animelokResult as any).malId ||
      (watchAwVal as any).malID || (watchAwVal as any).malId;
    if (typeof malID === 'string') malID = parseInt(malID);
  }
  if (!anilistID) {
    anilistID = (animelokResult as any).anilistID || (animelokResult as any).anilistId ||
      (watchAwVal as any).anilistID || (watchAwVal as any).anilistId;
    if (typeof anilistID === 'string') anilistID = parseInt(anilistID);
  }

  // Handle marketplace subtitles separately
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    let { data: marketplaceSubtitles, error: subError } = await supabase
      .from('marketplace_items')
      .select('*, profiles!user_id(display_name, username)')
      .eq('status', 'approved')
      .eq('type', 'subtitle')
      .eq('anime_id', episodeId.split('?')[0])
      .eq('episode_number', episodeNumber || 1);

    if (subError || !marketplaceSubtitles) {
      const { data: simpleSubData } = await supabase
        .from('marketplace_items')
        .select('*')
        .eq('status', 'approved')
        .eq('type', 'subtitle')
        .eq('anime_id', episodeId.split('?')[0])
        .eq('episode_number', episodeNumber || 1);
      marketplaceSubtitles = simpleSubData;
    }

    if (marketplaceSubtitles) {
      const extraSubs = marketplaceSubtitles.map((item: any) => {
        const display = item.profiles?.display_name || item.profiles?.username || 'Community';
        const username = item.profiles?.username || 'user';
        return {
          lang: item.data.lang || 'Custom',
          url: item.data.url,
          label: `${item.data.label || 'Sub'} (by ${display})`,
          contributorDisplay: display,
          contributorUsername: username
        };
      });
      primaryData.subtitles = [...(primaryData.subtitles || []), ...extraSubs];
    }
  } catch (e) {
    console.warn('Marketplace subtitles fetch failed:', e);
  }

  // Next episode estimates
  let nextEpisodeEstimates: any[] = [];
  if (desidubVal && !Array.isArray(desidubVal) && 'nextEpisodeEstimates' in desidubVal) {
    nextEpisodeEstimates = (desidubVal as any).nextEpisodeEstimates || [];
  }

  const desidubArray = Array.isArray(desidubVal)
    ? desidubVal
    : (desidubVal && 'sources' in desidubVal ? (desidubVal as any).sources : []);

  const allSources = [
    ...(primaryData.sources || []),
    ...(watchAwVal?.sources || []).map((s: any) => ({ ...s, isEmbed: !s.isM3U8 && s.needsHeadless })),
    ...(Array.isArray(animeyaVal) ? animeyaVal : []),
    ...(Array.isArray(animelokVal) ? animelokVal : []),
    ...(Array.isArray(desidubArray) ? desidubArray : []),
    ...(Array.isArray(aniworldVal) ? aniworldVal : []),
    ...(Array.isArray(hindiVal) ? hindiVal : []),
    ...(Array.isArray(toonStreamVal) ? toonStreamVal : []),
    ...(Array.isArray(hindiApiVal) ? hindiApiVal : []),
    ...(Array.isArray(anilistHindiVal) ? anilistHindiVal : []),
    ...(Array.isArray(toonWorldVal) ? toonWorldVal : []),
    ...(Array.isArray(customVal) ? customVal : [])
  ];

  return {
    sources: allSources,
    subtitles: primaryData.subtitles || [],
    tracks: primaryData.tracks || [],
    anilistID: anilistID || null,
    malID: malID || null,
    intro: primaryData.intro,
    outro: primaryData.outro,
    nextEpisodeEstimates: nextEpisodeEstimates.length > 0 ? nextEpisodeEstimates : undefined,
    headers: primaryData.headers,
    hasTatakaiAPI
  };
}

// Extract video URL from embed page using Puppeteer service
export async function extractEmbedVideo(
  embedUrl: string,
  timeout: number = 30000
): Promise<{
  success: boolean;
  sources?: Array<{
    url: string;
    type: 'hls' | 'mp4' | 'unknown';
    quality?: string;
  }>;
  error?: string;
}> {
  const extractorUrl = import.meta.env.VITE_EXTRACTOR_SERVICE_URL || 'http://localhost:3001';

  try {
    const response = await fetch(`${extractorUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: embedUrl, timeout })
    });

    if (!response.ok) {
      throw new Error(`Extractor service error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Extract embed video failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// --- Character API Functions ---

export async function searchCharacters(query: string, page = 1): Promise<CharacterApiResponse<CharacterBase[]>> {
  return externalApiGet(CHAR_API_URL, `/characters/search?name=${encodeURIComponent(query)}&page=${page}`);
}

export async function getCharacterById(id: string): Promise<CharacterApiResponse<CharacterDetail>> {
  return externalApiGet(CHAR_API_URL, `/characters/${id}`);
}

export async function getRandomCharacters(limit = 10): Promise<CharacterApiResponse<CharacterBase[]>> {
  return externalApiGet(CHAR_API_URL, `/characters/random?limit=${limit}`);
}

export async function getCharactersByAnime(animeName: string): Promise<CharacterApiResponse<CharacterBase[]>> {
  return externalApiGet(CHAR_API_URL, `/characters/anime/${encodeURIComponent(animeName)}`);
}

// --- Jikan API (MyAnimeList) ---

const JIKAN_API_URL = "https://api.jikan.moe/v4";

export interface JikanAnime {
  mal_id: number;
  url: string;
  images: {
    jpg: { image_url: string; small_image_url: string; large_image_url: string };
    webp: { image_url: string; small_image_url: string; large_image_url: string };
  };
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  type: string | null;
  episodes: number | null;
  status: string;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number;
  favorites: number;
  synopsis: string | null;
  rating: string | null;
  season: string | null;
  year: number | null;
}

export interface JikanSeasonResponse {
  data: JikanAnime[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items: { count: number; total: number; per_page: number };
  };
}

export interface JikanCharacter {
  mal_id: number;
  url: string;
  images: {
    jpg: { image_url: string; small_image_url?: string };
    webp: { image_url: string; small_image_url?: string };
  };
  name: string;
  name_kanji: string | null;
  nicknames: string[];
  favorites: number;
  about: string | null;
}

export interface JikanCharacterFullResponse {
  data: JikanCharacter & {
    anime?: Array<{
      role: string;
      anime: { mal_id: number; title: string; images: { jpg: { image_url: string } } };
    }>;
    voices?: Array<{
      language: string;
      person: { mal_id: number; name: string; images: { jpg: { image_url: string } } };
    }>;
  };
}

// Helper to convert Jikan anime to internal AnimeCard format
export function jikanToAnimeCard(jikanAnime: JikanAnime): AnimeCard {
  return {
    id: `mal-${jikanAnime.mal_id}`,
    name: jikanAnime.title_english || jikanAnime.title,
    jname: jikanAnime.title_japanese || undefined,
    poster: jikanAnime.images.jpg.large_image_url || jikanAnime.images.jpg.image_url,
    type: jikanAnime.type || 'TV',
    rating: jikanAnime.rating || undefined,
    episodes: {
      sub: jikanAnime.episodes || 0,
      dub: 0,
    },
  };
}

// Fetch current season anime
export async function fetchJikanSeasonNow(page = 1): Promise<JikanSeasonResponse> {
  return externalApiGet(JIKAN_API_URL, `/seasons/now?page=${page}&limit=24`);
}

// Fetch specific season anime
export async function fetchJikanSeason(year: number, season: 'winter' | 'spring' | 'summer' | 'fall', page = 1): Promise<JikanSeasonResponse> {
  return externalApiGet(JIKAN_API_URL, `/seasons/${year}/${season}?page=${page}&limit=24`);
}

// Fetch upcoming season anime
export async function fetchJikanSeasonUpcoming(page = 1): Promise<JikanSeasonResponse> {
  return externalApiGet(JIKAN_API_URL, `/seasons/upcoming?page=${page}&limit=24`);
}

// Fetch character by MAL ID
export async function fetchJikanCharacter(malCharId: number): Promise<JikanCharacterFullResponse> {
  return externalApiGet(JIKAN_API_URL, `/characters/${malCharId}/full`);
}

// Search characters on Jikan
export async function searchJikanCharacters(query: string, page = 1): Promise<{ data: JikanCharacter[]; pagination: { has_next_page: boolean } }> {
  return externalApiGet(JIKAN_API_URL, `/characters?q=${encodeURIComponent(query)}&page=${page}&limit=10`);
}

// Search anime on Jikan (for VideoServerManager)
export async function searchJikanAnime(query: string, page = 1): Promise<{ data: JikanAnime[]; pagination: { has_next_page: boolean } }> {
  return externalApiGet(JIKAN_API_URL, `/anime?q=${encodeURIComponent(query)}&page=${page}&limit=10`);
}
