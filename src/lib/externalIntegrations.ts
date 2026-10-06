import { supabase } from '@/integrations/supabase/client';
import { disconnectMal, exchangeMalCode, getMalAuthUrl } from '@/lib/mal';
import { ANILIST_GRAPHQL_ENDPOINT, resolveApiV3Base } from '@/lib/api/backendOrigin';

export const ALL_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo", 
  "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", 
  "Sports", "Supernatural", "Thriller"
];

// ===========================================
// MyAnimeList Integration
// ===========================================

const MAL_CLIENT_ID = import.meta.env.VITE_MAL_CLIENT_ID;
const MAL_API_URL = 'https://api.myanimelist.net/v2';

// Generate MAL OAuth URL
export function getMALAuthUrl(): string {
  if (!MAL_CLIENT_ID) {
    throw new Error('Missing VITE_MAL_CLIENT_ID');
  }
  return getMalAuthUrl();
}

// Exchange code for tokens
export async function exchangeMALCode(code: string, userId: string): Promise<boolean> {
  // userId is kept for backward compatibility with existing callers.
  void userId;
  await exchangeMalCode(code);
  return true;
}

// Fetch MAL user info
export async function fetchMALUser(accessToken: string): Promise<any> {
  const response = await fetch(`${MAL_API_URL}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to fetch MAL user');
  return response.json();
}

// Fetch MAL anime list
export async function fetchMALAnimeList(accessToken: string): Promise<any[]> {
  const response = await fetch(
    `${MAL_API_URL}/users/@me/animelist?fields=list_status&limit=1000`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) throw new Error('Failed to fetch MAL anime list');
  const data = await response.json();
  return data.data || [];
}

// Update MAL anime status
export async function updateMALAnimeStatus(
  accessToken: string,
  animeId: number,
  status: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch',
  episodesWatched?: number
): Promise<boolean> {
  const body = new URLSearchParams({ status });
  if (episodesWatched !== undefined) {
    body.append('num_watched_episodes', episodesWatched.toString());
  }

  const response = await fetch(`${MAL_API_URL}/anime/${animeId}/my_list_status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return response.ok;
}

// ===========================================
// AniList Integration
// ===========================================

const ANILIST_CLIENT_ID = import.meta.env.VITE_ANILIST_CLIENT_ID;
const ANILIST_REDIRECT_URI = import.meta.env.VITE_ANILIST_REDIRECT_URI || `${window.location.origin}/integration/anilist/redirect`;
const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
// AniList GraphQL is reached through the TatakaiAPI proxy (see anilistQuery).

// The redirect URI that AniList sends the code back to must be identical in the
// authorize request and the token exchange. Desktop uses the same https URI as
// web (AniList allows only ONE registered redirect URI) plus a `state` marker;
// the web redirect page forwards desktop-marked callbacks to the app via
// `tatakai://` (see desktopOAuth.ts). We persist whichever URI initiated the
// flow and read it back at exchange time.
const ANILIST_REDIRECT_STORAGE_KEY = 'anilist_redirect_uri';
const ANILIST_STATE_STORAGE_KEY = 'anilist_oauth_state';

// Generate AniList OAuth URL. Pass an explicit `redirectUri` to override the
// default web redirect, and `state` to tag the flow (desktop passes
// `buildDesktopOAuthState()` so the https bridge page can route back to the app).
export function getAniListAuthUrl(redirectUri?: string, state?: string): string {
  if (!ANILIST_CLIENT_ID) {
    throw new Error('Missing VITE_ANILIST_CLIENT_ID');
  }

  const effectiveRedirect = redirectUri || ANILIST_REDIRECT_URI;
  try {
    localStorage.setItem(ANILIST_REDIRECT_STORAGE_KEY, effectiveRedirect);
    if (state) localStorage.setItem(ANILIST_STATE_STORAGE_KEY, state);
    else localStorage.removeItem(ANILIST_STATE_STORAGE_KEY);
  } catch { /* localStorage unavailable — exchange falls back to default */ }

  const params = new URLSearchParams({
    client_id: ANILIST_CLIENT_ID,
    redirect_uri: effectiveRedirect,
    response_type: 'code',
  });
  if (state) params.set('state', state);

  return `${ANILIST_AUTH_URL}?${params.toString()}`;
}

// Exchange code for tokens via Hono API
export async function exchangeAniListCode(code: string, userId: string): Promise<boolean> {
  await supabase.auth.refreshSession().catch(() => { });
  const { data: { session } } = await supabase.auth.getSession();

  const bearer = session?.access_token;
  if (!bearer) throw new Error('Missing auth token for AniList exchange');

  let redirectUri = ANILIST_REDIRECT_URI;
  try {
    redirectUri = localStorage.getItem(ANILIST_REDIRECT_STORAGE_KEY) || ANILIST_REDIRECT_URI;
  } catch { /* ignore */ }

  const res = await fetch(`${resolveApiV3Base()}/sync/exchange`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearer}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      integration: 'anilist',
      code,
      redirectUri,
    })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Exchange failed' }));
    throw new Error(errorBody.error || 'Failed to exchange AniList code');
  }

  try { localStorage.removeItem(ANILIST_REDIRECT_STORAGE_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(ANILIST_STATE_STORAGE_KEY); } catch { /* ignore */ }
  return true;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GraphQL helper — routed through the TatakaiAPI proxy (/api/v3/anilist/graphql)
 * instead of calling https://graphql.anilist.co directly. Direct browser calls
 * fail CORS on 429 and leak the user's token; the proxy fixes both and holds the
 * OAuth token server-side.
 *
 * The `accessToken` arg is now a *signal* that this is an authenticated call
 * (mutations, viewer/list reads). We no longer send the AniList token from the
 * browser — the server attaches the caller's stored token. Any truthy value here
 * means "use my linked account".
 */
async function anilistQuery(query: string, variables: Record<string, any>, accessToken?: string, retries = 3): Promise<any> {
  const useUserToken = !!accessToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // For authed calls the proxy needs our Supabase session to resolve the token.
  if (useUserToken) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    } catch { /* fall through — proxy will 401 if truly needed */ }
  }

  try {
    const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables, useUserToken }),
    });

    if (response.status === 429 && retries > 0) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
      console.warn(`[AniList] Rate limited. Retrying in ${delay}ms...`);
      await sleep(delay);
      return anilistQuery(query, variables, accessToken, retries - 1);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `AniList query failed with status ${response.status}`);
    }
    const data = await response.json();
    if (data.errors) throw new Error(data.errors[0].message);
    return data.data;
  } catch (err: any) {
    if (retries > 0 && (err.name === 'TypeError' || err.message === 'Failed to fetch')) {
      console.warn(`[AniList] Network error/Fetch failed. Retrying in 2s...`, err);
      await sleep(2000);
      return anilistQuery(query, variables, accessToken, retries - 1);
    }
    throw err;
  }
}

// ===========================================
// External profile statistics (AniList / MAL)
// ===========================================

export interface ExternalAnimeStats {
  count: number;
  episodesWatched: number;
  daysWatched: number;
  meanScore: number;
  watching?: number;
  completed?: number;
  planning?: number;
  dropped?: number;
  paused?: number;
}

export interface ExternalMangaStats {
  count: number;
  chaptersRead: number;
  volumesRead?: number;
  meanScore: number;
}

export interface ExternalStats {
  provider: 'anilist' | 'mal';
  username?: string | null;
  profileUrl?: string | null;
  avatar?: string | null;
  anime: ExternalAnimeStats;
  manga?: ExternalMangaStats | null;
  topGenres?: { genre: string; count: number }[];
}

// Fetch normalized AniList statistics for the connected viewer.
export async function fetchAniListStatistics(accessToken: string): Promise<ExternalStats> {
  const query = `
    query {
      Viewer {
        id
        name
        siteUrl
        avatar { large medium }
        statistics {
          anime {
            count
            meanScore
            minutesWatched
            episodesWatched
            statuses { status count }
            genres { genre count }
          }
          manga {
            count
            meanScore
            chaptersRead
            volumesRead
          }
        }
      }
    }
  `;
  const data = await anilistQuery(query, {}, accessToken);
  const viewer = data?.Viewer;
  const a = viewer?.statistics?.anime || {};
  const m = viewer?.statistics?.manga || {};

  const statusMap: Record<string, number> = {};
  for (const s of a.statuses || []) {
    statusMap[String(s.status).toUpperCase()] = Number(s.count || 0);
  }

  const topGenres = (a.genres || [])
    .slice()
    .sort((x: any, y: any) => Number(y.count || 0) - Number(x.count || 0))
    .slice(0, 5)
    .map((g: any) => ({ genre: g.genre, count: Number(g.count || 0) }));

  return {
    provider: 'anilist',
    username: viewer?.name || null,
    profileUrl: viewer?.siteUrl || (viewer?.name ? `https://anilist.co/user/${viewer.name}` : null),
    avatar: viewer?.avatar?.large || viewer?.avatar?.medium || null,
    anime: {
      count: Number(a.count || 0),
      episodesWatched: Number(a.episodesWatched || 0),
      daysWatched: Number(((a.minutesWatched || 0) / 1440).toFixed(1)),
      meanScore: Number(a.meanScore || 0),
      watching: statusMap.CURRENT || 0,
      completed: statusMap.COMPLETED || 0,
      planning: statusMap.PLANNING || 0,
      dropped: statusMap.DROPPED || 0,
      paused: statusMap.PAUSED || 0,
    },
    manga: m.count
      ? {
          count: Number(m.count || 0),
          chaptersRead: Number(m.chaptersRead || 0),
          volumesRead: Number(m.volumesRead || 0),
          meanScore: Number(m.meanScore || 0),
        }
      : null,
    topGenres,
  };
}

// Fetch normalized MyAnimeList statistics for the connected user.
export async function fetchMALStatistics(accessToken: string): Promise<ExternalStats> {
  const res = await fetch(`${MAL_API_URL}/users/@me?fields=anime_statistics`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch MAL statistics');
  const data = await res.json();
  const s = data?.anime_statistics || {};
  const name = data?.name || null;

  return {
    provider: 'mal',
    username: name,
    profileUrl: name ? `https://myanimelist.net/profile/${name}` : null,
    avatar: data?.picture || null,
    anime: {
      count: Number(s.num_items || 0),
      episodesWatched: Number(s.num_episodes || 0),
      daysWatched: Number((s.num_days_watched ?? s.num_days ?? 0)),
      meanScore: Number(s.mean_score || 0),
      watching: Number(s.num_items_watching || 0),
      completed: Number(s.num_items_completed || 0),
      planning: Number(s.num_items_plan_to_watch || 0),
      dropped: Number(s.num_items_dropped || 0),
      paused: Number(s.num_items_on_hold || 0),
    },
    manga: null,
    topGenres: [],
  };
}

// Fetch AniList user info
export async function fetchAniListUser(accessToken: string): Promise<any> {
  const query = `
    query {
      Viewer {
        id
        name
        avatar { medium large }
        bannerImage
        statistics {
          anime {
            count
            minutesWatched
            episodesWatched
          }
        }
      }
    }
  `;
  const data = await anilistQuery(query, {}, accessToken);
  return data.Viewer;
}

// Fetch AniList anime list (chunked for safety)
export async function fetchAniListUserList(accessToken: string, userId: number): Promise<any[]> {
  const query = `
    query ($userId: Int) {
      MediaListCollection(userId: $userId, type: ANIME) {
        lists {
          name
          status
          entries {
            id
            mediaId
            status
            progress
            score
            media {
              id
              idMal
              title { romaji english native }
              coverImage { medium large }
              episodes
            }
          }
        }
      }
    }
  `;
  const data = await anilistQuery(query, { userId }, accessToken);
  // Flatten all lists into one array
  const allEntries = data.MediaListCollection?.lists?.flatMap((list: any) => list.entries) || [];
  return allEntries;
}

// Fetch AniList manga list
export async function fetchAniListMangaList(accessToken: string, userId: number): Promise<any[]> {
  const query = `
    query ($userId: Int) {
      MediaListCollection(userId: $userId, type: MANGA) {
        lists {
          name
          status
          entries {
            id
            mediaId
            status
            progress
            score
            media {
              id
              idMal
              title { romaji english native }
              coverImage { medium large }
              chapters
              volumes
            }
          }
        }
      }
    }
  `;
  const data = await anilistQuery(query, { userId }, accessToken);
  const allEntries = data.MediaListCollection?.lists?.flatMap((list: any) => list.entries) || [];
  return allEntries;
}

// Update AniList anime status
export async function updateAniListAnimeStatus(
  accessToken: string,
  mediaId: number,
  status: 'CURRENT' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'PLANNING' | string,
  progress?: number
): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const bearer = session?.access_token;
  if (!bearer) throw new Error('Not authenticated');

  const statusMap: Record<string, string> = {
    CURRENT: 'watching',
    COMPLETED: 'completed',
    PLANNING: 'plan_to_watch',
    DROPPED: 'dropped',
    PAUSED: 'on_hold',
  };
  const localStatus = statusMap[status] || status;

  const res = await fetch(`${resolveApiV3Base()}/sync/single-sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearer}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'anime',
      anilistId: mediaId,
      status: localStatus,
      progress
    })
  });

  if (!res.ok) {
    throw new Error('Failed to update AniList anime status');
  }
  return true;
}

// Update AniList manga status
export async function updateAniListMangaStatus(
  accessToken: string,
  mediaId: number,
  status: 'CURRENT' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'PLANNING' | string,
  progress?: number
): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const bearer = session?.access_token;
  if (!bearer) throw new Error('Not authenticated');

  const statusMap: Record<string, string> = {
    CURRENT: 'watching',
    COMPLETED: 'completed',
    PLANNING: 'plan_to_watch',
    DROPPED: 'dropped',
    PAUSED: 'on_hold',
  };
  const localStatus = statusMap[status] || status;

  const res = await fetch(`${resolveApiV3Base()}/sync/single-sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearer}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'manga',
      anilistId: mediaId,
      status: localStatus,
      progress
    })
  });

  if (!res.ok) {
    throw new Error('Failed to update AniList manga status');
  }
  return true;
}

export type AniListSort =
  | 'POPULARITY_DESC'
  | 'SCORE_DESC'
  | 'TRENDING_DESC'
  | 'START_DATE_DESC'
  | 'FAVOURITES_DESC';

export type AniListSearchFilters = {
  page?: number;
  perPage?: number;
  format?: 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';
  status?: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
  countryOfOrigin?: 'JP' | 'KR' | 'CN' | 'TW' | 'US';
  genres?: string[];
  sort?: AniListSort;
};

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  bannerImage?: string | null;
  format?: string | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  };
  coverImage?: {
    medium?: string | null;
    large?: string | null;
  };
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  status?: string | null;
  seasonYear?: number | null;
  season?: string | null;
  genres?: string[];
  averageScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  trending?: number | null;
  countryOfOrigin?: string | null;
  startDate?: { year?: number | null };
}

// Search anime on AniList
export async function searchAniListAnime(title: string, filters: AniListSearchFilters = {}): Promise<AniListMedia[]> {
  const query = `
    query (
      $page: Int,
      $search: String,
      $perPage: Int,
      $format: MediaFormat,
      $status: MediaStatus,
      $season: MediaSeason,
      $seasonYear: Int,
      $countryOfOrigin: CountryCode,
      $genreIn: [String],
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        media(
          search: $search,
          type: ANIME,
          format: $format,
          status: $status,
          season: $season,
          seasonYear: $seasonYear,
          countryOfOrigin: $countryOfOrigin,
          genre_in: $genreIn,
          sort: $sort
        ) {
          id
          idMal
          bannerImage
          format
          title { romaji english native }
          coverImage { medium large }
          episodes
          status
          seasonYear
          season
          genres
          averageScore
          popularity
          favourites
          trending
          countryOfOrigin
          startDate { year }
        }
      }
    }
  `;
  const variables = {
    page: filters.page || 1,
    search: title,
    perPage: filters.perPage || 10,
    format: filters.format,
    status: filters.status,
    season: filters.season,
    seasonYear: filters.seasonYear,
    countryOfOrigin: filters.countryOfOrigin,
    genreIn: filters.genres,
    sort: filters.sort ? [filters.sort] : undefined,
  };

  const data = await anilistQuery(query, variables);
  return data.Page?.media || [];
}

export async function searchAniListManga(title: string): Promise<AniListMedia[]> {
  const query = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, type: MANGA, sort: [POPULARITY_DESC]) {
          id
          idMal
          bannerImage
          format
          title { romaji english native }
          coverImage { medium large }
          chapters
          volumes
          status
          seasonYear
          genres
          averageScore
          popularity
          favourites
          trending
          countryOfOrigin
          startDate { year }
        }
      }
    }
  `;

  const data = await anilistQuery(query, {
    search: title,
    page: 1,
    perPage: 10,
  });

  return data.Page?.media || [];
}

export async function fetchAniListDiscover(filters: AniListSearchFilters = {}): Promise<AniListMedia[]> {
  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $format: MediaFormat,
      $status: MediaStatus,
      $season: MediaSeason,
      $seasonYear: Int,
      $countryOfOrigin: CountryCode,
      $genreIn: [String],
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        media(
          type: ANIME,
          format: $format,
          status: $status,
          season: $season,
          seasonYear: $seasonYear,
          countryOfOrigin: $countryOfOrigin,
          genre_in: $genreIn,
          sort: $sort
        ) {
          id
          idMal
          bannerImage
          format
          title { romaji english native }
          coverImage { medium large }
          episodes
          status
          seasonYear
          season
          genres
          averageScore
          popularity
          favourites
          trending
          countryOfOrigin
          startDate { year }
        }
      }
    }
  `;

  const variables = {
    page: filters.page || 1,
    perPage: filters.perPage || 20,
    format: filters.format,
    status: filters.status,
    season: filters.season,
    seasonYear: filters.seasonYear,
    countryOfOrigin: filters.countryOfOrigin,
    genreIn: filters.genres,
    sort: filters.sort ? [filters.sort] : ['TRENDING_DESC'],
  };

  const data = await anilistQuery(query, variables);
  return data.Page?.media || [];
}

export async function fetchAniListMediaById(ids: {
  anilistId?: number | null;
  malId?: number | null;
}): Promise<AniListMedia | null> {
  const anilistId = Number(ids?.anilistId);
  const malId = Number(ids?.malId);

  const hasAniListId = Number.isFinite(anilistId) && anilistId > 0;
  const hasMalId = Number.isFinite(malId) && malId > 0;
  if (!hasAniListId && !hasMalId) return null;

  const query = `
    query ($id: Int, $idMal: Int) {
      Media(id: $id, idMal: $idMal, type: ANIME) {
        id
        idMal
        bannerImage
        format
        title { romaji english native }
        coverImage { medium large }
        episodes
        status
        seasonYear
        season
        genres
        averageScore
        popularity
        favourites
        trending
        countryOfOrigin
        startDate { year }
      }
    }
  `;

  const variables = {
    id: hasAniListId ? anilistId : undefined,
    idMal: !hasAniListId && hasMalId ? malId : undefined,
  };

  const data = await anilistQuery(query, variables);
  return data?.Media || null;
}

// Disconnect integrations
export async function disconnectMAL(userId: string): Promise<void> {
  await disconnectMal(userId);
}

export async function disconnectAniList(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      anilist_user_id: null,
      anilist_access_token: null,
      // Cleared too: leaving the refresh token behind meant a "disconnected"
      // account still held a credential that could mint new access tokens.
      // `disconnectMal` already clears its counterpart (mal.ts:628).
      anilist_refresh_token: null,
      anilist_token_expires_at: null,
    })
    .eq('user_id', userId);

  if (error) throw error;
}

export function mapTatakaiStatusToAniList(status: string) {
  const map: Record<string, any> = {
    'watching': 'CURRENT',
    'completed': 'COMPLETED',
    'plan_to_watch': 'PLANNING',
    'dropped': 'DROPPED',
    'on_hold': 'PAUSED'
  };
  return map[status] || 'PLANNING';
}

export function mapAniListMangaStatusToTatakai(status: string) {
  const map: Record<string, string> = {
    'CURRENT': 'reading',
    'COMPLETED': 'completed',
    'PLANNING': 'plan_to_read',
    'DROPPED': 'dropped',
    'PAUSED': 'on_hold',
    'REPEATING': 'reading'
  };
  return map[String(status || '').toUpperCase()] || 'plan_to_read';
}

export function mapTatakaiMangaStatusToAniList(status: string) {
  const map: Record<string, any> = {
    'reading': 'CURRENT',
    'completed': 'COMPLETED',
    'plan_to_read': 'PLANNING',
    'dropped': 'DROPPED',
    'on_hold': 'PAUSED'
  };
  return map[String(status || '').toLowerCase()] || 'PLANNING';
}
