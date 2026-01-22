const API_URL = "https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime";
const CHAR_API_URL = "https://anime-api.canelacho.com/api/v1";

// Use Supabase edge function as proxy for CORS
function getProxyUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/rapid-service`;
  }
  // Fallback proxy
  return "https://api.allorigins.win/raw?url=";
}

// Fallback proxies for production redundancy
const FALLBACK_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
  "https://proxy.cors.sh/",
];

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

export async function apiGet<T>(path: string, retries = 3): Promise<T> {
  const url = `${API_URL}${path}`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const fallbackProxy = "https://api.allorigins.win/raw?url=";

  let lastError: Error | null = null;

  // Try Supabase proxy first, then fallback
  const proxies = supabaseUrl
    ? (() => {
      const apiOrigin = new URL(API_URL).origin;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const rapidUrl = `${supabaseUrl}/functions/v1/rapid-service?url=${encodeURIComponent(url)}&type=api&referer=${encodeURIComponent(apiOrigin)}` + (apikey ? `&apikey=${encodeURIComponent(apikey)}` : '');
      return [
        { url: rapidUrl, type: 'supabase' },
        { url: `${fallbackProxy}${encodeURIComponent(url)}`, type: 'fallback' }
      ];
    })()
    : [
      { url: `${fallbackProxy}${encodeURIComponent(url)}`, type: 'fallback' }
    ];

  for (const proxy of proxies) {
    for (let attempt = 0; attempt < retries; attempt++) {
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
        const timeoutId = setTimeout(() => controller.abort(), 15000);

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

        // Wait before retry with exponential backoff
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
      }
    }
  }

  throw lastError || new ApiError('Failed to fetch data after all attempts');
}

/**
 * Generic fetcher for external APIs with retry logic
 */
export async function externalApiGet<T>(baseUrl: string, path: string, retries = 2): Promise<T> {
  const url = `${baseUrl}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
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
  // Avoid double-proxying if the URL is already pointing at our edge function
  if (videoUrl.includes('/functions/v1/rapid-service')) return videoUrl;

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
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith('http')) return trimmed;
  if (trimmed.includes('/functions/v1/rapid-service')) return trimmed;

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
    [key: string]: unknown;
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
}

export interface Subtitle {
  lang: string;
  url: string;
  label?: string;
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
  return apiGet(`/anime/${animeId}`);
}

export async function fetchEpisodes(
  animeId: string
): Promise<{ totalEpisodes: number; episodes: EpisodeData[] }> {
  return apiGet(`/anime/${animeId}/episodes`);
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
  server: string = "hd-2",
  category: string = "sub"
): Promise<StreamingData> {
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

// Fetch sources from WatchAnimeWorld
export async function fetchWatchanimeworldSources(
  episodeUrl: string
): Promise<StreamingData> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const params = new URLSearchParams({ episodeUrl });
  if (apikey) params.set('apikey', apikey);

  const url = `${supabaseUrl}/functions/v1/watchanimeworld-scraper?${params.toString()}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (apikey) {
    headers['apikey'] = apikey;
    headers['Authorization'] = `Bearer ${apikey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch WatchAnimeWorld sources: ${response.status}`);
  }

  return response.json();
}

// Fetch anime data from AnimeHindiDubbed
export async function fetchAnimeHindiDubbedData(
  slug: string
): Promise<{
  title: string;
  slug: string;
  thumbnail?: string;
  description?: string;
  rating?: string;
  servers: {
    filemoon: Array<{ name: string; url: string }>;
    servabyss: Array<{ name: string; url: string }>;
    vidgroud: Array<{ name: string; url: string }>;
  };
}> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const params = new URLSearchParams({ action: 'anime', slug });
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
  const apiUrl = 'https://tatakaiapi.vercel.app/api/v1/hianime/episode/sources';
  const params = new URLSearchParams({
    animeEpisodeId: episodeId,
    server,
    category
  });

  const targetUrl = `${apiUrl}?${params}`;

  // Use Supabase proxy to avoid CORS issues
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  const proxyParams = new URLSearchParams({
    url: targetUrl,
    type: 'api',
    referer: 'https://tatakaiapi.vercel.app'
  });
  if (apikey) proxyParams.set('apikey', apikey);

  const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apikey) {
      headers['apikey'] = apikey;
      headers['Authorization'] = `Bearer ${apikey}`;
    }

    const response = await fetch(proxyUrl, {
      signal: controller.signal,
      headers
    });

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

// Fetch from Animelok (TatakaiAPI) with anime slug using Supabase proxy
export async function fetchAnimelokSources(
  animeSlug: string,
  episodeNumber: number
): Promise<StreamingSource[]> {
  const apiUrl = `https://tatakaiapi.vercel.app/api/v1/animelok/watch/${animeSlug}`;
  const params = new URLSearchParams({
    ep: episodeNumber.toString()
  });

  const targetUrl = `${apiUrl}?${params}`;

  // Use Supabase proxy to avoid CORS issues
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  const proxyParams = new URLSearchParams({
    url: targetUrl,
    type: 'api',
    referer: 'https://tatakaiapi.vercel.app'
  });
  if (apikey) proxyParams.set('apikey', apikey);

  const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apikey) {
      headers['apikey'] = apikey;
      headers['Authorization'] = `Bearer ${apikey}`;
    }

    const response = await fetch(proxyUrl, {
      signal: controller.signal,
      headers
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Animelok API returned status ${response.status}`);
    }

    const json = await response.json();

    if (json.status === 200 && json.data && json.data.servers) {
      // Map Animelok servers to StreamingSource format with proper M3U8 detection
      return json.data.servers.map((server: any, index: number) => {
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
              isM3U8 = true; // Assume JSON array implies M3U8/Source list
            }
          } catch (e) {
            console.warn('Failed to parse JSON url:', e);
          }
        }

        // Detect language code
        let displayLang = 'Unknown';
        if (language.includes('JAPAN') || language.includes('JAP')) displayLang = 'JAP';
        else if (language.includes('ENG')) displayLang = 'ENG';
        else if (language.includes('HINDI') || language.includes('HIN')) displayLang = 'HIN';
        else if (language.includes('TAMIL')) displayLang = 'TAM';
        else if (language.includes('MALAYALAM')) displayLang = 'MAL';
        else if (language.includes('TELUGU')) displayLang = 'TEL';
        else if (language.includes('SPANISH') || language.includes('ESP')) displayLang = 'ESP';
        else displayLang = language.substring(0, 3).toUpperCase();

        let providerName = `${displayLang}`;

        // Robust naming logic to avoid "abysscdn" appearing
        if (tipLower.includes('multi') || serverNameLower.includes('multi')) {
          providerName = `Multi (${displayLang}) `;
        } else if (serverNameLower.includes('bato')) {
          providerName = `Totoro (${displayLang}) `;
        } else if (serverNameLower.includes('kuro')) {
          providerName = `Kuro (${displayLang}) `;
        } else if (serverNameLower.includes('pahe')) {
          providerName = `Pahe (${displayLang}) `;
        } else if (serverNameLower.includes('abyss') || serverNameLower.includes('abysscdn') || tipLower.includes('abyess') || tipLower.includes('abyss')) {
          // Assign different characters based on language for Abyss sources
          // Use index to distinguish multiple servers of same language (Pain I, Pain II)
          const variant = (index % 2 === 0) ? 'I' : 'II';

          if (displayLang === 'HIN') providerName = `Pain ${variant} (${displayLang})`;
          else if (displayLang === 'TAM') providerName = `Kaido ${variant} (${displayLang})`;
          else if (displayLang === 'TEL') providerName = `Broly ${variant} (${displayLang})`;
          else if (displayLang === 'MAL') providerName = `Yami ${variant} (${displayLang})`;
          else if (displayLang === 'ENG') providerName = `AllMight ${variant} (${displayLang})`;
          else if (displayLang === 'JAP') providerName = `Sukuna ${variant} (${displayLang})`;
          else providerName = `Akatsuki ${variant} (${displayLang})`;
        } else {
          // Fallback but NEVER use "abysscdn"
          if (server.name && !server.name.toLowerCase().includes('abyss')) {
            providerName = `${server.name} (${displayLang})`;
          } else {
            providerName = `Server ${index + 1} (${displayLang})`;
          }
        }

        return {
          url: finalUrl,
          isM3U8: isM3U8,
          quality: isM3U8 ? 'Auto' : '720p',
          language: language,
          langCode: `animelok-${index}-${displayLang.toLowerCase()}`, // Use index to ensure uniqueness
          isDub: language !== 'JAPANESE' && !language.includes('JAP'),
          providerName: providerName,
          isEmbed: !isM3U8,
          needsHeadless: !isM3U8,
        };
      });
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch from Animelok:', error);
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
    const proxyParams = new URLSearchParams({
      url: targetUrl,
      type: 'api',
      referer: 'https://tatakaiapi.vercel.app'
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
      const searchRes = await fetchProxy(`https://tatakaiapi.vercel.app/api/v1/animeya/search?q=${encodeURIComponent(animeName)}`);

      if (searchRes.status === 200 && Array.isArray(searchRes.data)) {
        // Find best match - look for slug ending with MAL ID
        const match = searchRes.data.find((a: any) => a.slug && a.slug.endsWith(`-${id}`))
          || searchRes.data[0]; // Fallback to first result

        if (match && match.slug) {
          console.log(`[Animeya] Found anime slug: ${match.slug}`);

          // 2. Get Info (Episodes)
          const infoRes = await fetchProxy(`https://tatakaiapi.vercel.app/api/v1/animeya/info/${match.slug}`);

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
  let apiUrl = `https://tatakaiapi.vercel.app/api/v1/animeya/watch/${episodeId}`;

  // Keep legacy ?ep support just in case, though using resolved ID is safer
  if (episodeNumber !== undefined && episodeId === id) {
    apiUrl += `?ep=${episodeNumber}`;
  }

  const proxyParams = new URLSearchParams({
    url: apiUrl,
    type: 'api',
    referer: 'https://tatakaiapi.vercel.app'
  });
  if (apikey) proxyParams.set('apikey', apikey);

  const proxyUrl = `${supabaseUrl}/functions/v1/rapid-service?${proxyParams}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(proxyUrl, {
      signal: controller.signal,
      headers
    });

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
  episodeId?: string
): Promise<StreamingSource[]> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');

    let query = supabase
      .from('custom_sources')
      .select('*')
      .eq('is_active', true);

    // Build filter: either global (no anime/episode ID) or targeting specific anime/episode
    const filters = ['anime_id.is.null', 'episode_id.is.null'];
    if (animeId) filters.push(`anime_id.eq.${animeId}`);
    if (episodeId) filters.push(`episode_id.eq.${episodeId}`);

    // Using or filter to get both global and specific ones
    const orFilter = `or(anime_id.is.null,anime_id.eq.${animeId || ''}${episodeId ? `,episode_id.eq.${episodeId}` : ''})`;

    const { data, error } = await supabase
      .from('custom_sources')
      .select('*')
      .eq('is_active', true)
      .or(animeId ? `anime_id.is.null,anime_id.eq.${animeId}` : 'anime_id.is.null')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(source => ({
      url: source.url,
      isM3U8: source.type === 'direct' && source.url.includes('.m3u8'),
      quality: 'HD',
      language: 'Custom',
      langCode: `custom-${source.id}`,
      providerName: source.name,
      isEmbed: source.type === 'embed',
      needsHeadless: source.type === 'embed'
    }));
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
  category: string = "sub"
) {
  if (!episodeId) throw new Error("Episode ID required");

  // Try TatakaiAPI first
  let primaryData: StreamingData & { malID?: number; anilistID?: number };
  let hasTatakaiAPI = false;
  let malID: number | undefined;

  try {
    primaryData = await fetchTatakaiEpisodeSources(episodeId, server, category);
    hasTatakaiAPI = true;
    malID = primaryData.malID;
  } catch (error: any) {
    // Silently fall back - 403 errors are expected if API is not configured
    if (error?.message?.includes('403')) {
      // Suppress 403 errors as they're handled by fallback
    } else {
      console.warn('TatakaiAPI failed, falling back to HiAnime:', error);
    }
    primaryData = await fetchStreamingSources(episodeId, server, category);
  }

  // Parallel fetches for extra sources
  const [watchAwData, animeyaSources, animelokSources, customSources] = await Promise.all([
    // WatchAnimeWorld
    (async () => {
      try {
        const baseSlug = episodeId.split('?')[0];
        const animeSlug = baseSlug.replace(/-\d+$/, '');
        if (episodeNumber !== undefined) {
          return await fetchWatchanimeworldSources(`${animeSlug}-1x${episodeNumber}`);
        }
      } catch (e) { return { sources: [] }; }
    })(),
    // Animeya
    (async () => {
      if (malID && episodeNumber !== undefined && animeName) {
        return await fetchAnimeyaSources(malID, episodeNumber, animeName);
      }
      return [];
    })(),
    // Animelok
    (async () => {
      if (episodeNumber !== undefined && malID) {
        const baseSlug = episodeId.split('?')[0];
        const animeSlug = baseSlug.replace(/-\d+$/, '');
        return await fetchAnimelokSources(`${animeSlug}-${malID}`, episodeNumber);
      }
      return [];
    })(),
    // Custom Supabase Sources
    fetchCustomSupabaseSources(episodeId.split('?')[0], episodeId)
  ]);

  // Merge everything
  const allSources = [
    ...primaryData.sources,
    ...(watchAwData?.sources || []).map(s => ({ ...s, isEmbed: !s.isM3U8 && s.needsHeadless })),
    ...animeyaSources,
    ...animelokSources,
    ...customSources
  ];

  return {
    ...primaryData,
    sources: allSources,
    hasTatakaiAPI,
    malID
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
