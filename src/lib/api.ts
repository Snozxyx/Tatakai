const API_URL = "https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime";

// Use Supabase edge function as proxy for CORS
function getProxyUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/rapid-service`;
  }
  // Fallback proxy
  return "https://api.allorigins.win/raw?url=";
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

async function apiGet<T>(path: string, retries = 3): Promise<T> {
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
          // Some deployments require Authorization bearer even for public functions
          const bearer = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
        }
        const response = await fetch(proxy.url, {
          headers,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const json = await response.json();
        return unwrapApiData<T>(json);
      } catch (error) {
        lastError = error as Error;
        console.warn(`API request via ${proxy.type} attempt ${attempt + 1} failed:`, error);
        
        // Wait before retry with exponential backoff
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 300));
        }
      }
    }
    console.log(`Switching to next proxy after ${proxy.type} failed`);
  }
  
  throw lastError || new Error('Failed to fetch data');
}

// Proxy helper for video streaming with referer header
export function getProxiedVideoUrl(videoUrl: string, referer?: string): string {
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
  const params = new URLSearchParams({ url: subtitleUrl });
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
  server: string = "hd-1",
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

// Get proxied embed URL to bypass AdBlock/Sandbox restrictions
export function getProxiedEmbedUrl(embedUrl: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn('Supabase URL not configured, returning direct embed URL');
    return embedUrl;
  }
  
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const params = new URLSearchParams({ embedUrl });
  if (apikey) params.set('apikey', apikey);
  
  return `${supabaseUrl}/functions/v1/watchanimeworld-scraper?${params.toString()}`;
}
