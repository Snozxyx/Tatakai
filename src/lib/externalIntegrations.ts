import { supabase } from '@/integrations/supabase/client';
import { disconnectMal, exchangeMalCode, getMalAuthUrl } from '@/lib/mal';

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
const ANILIST_API_URL = 'https://graphql.anilist.co';

// Generate AniList OAuth URL
export function getAniListAuthUrl(): string {
  if (!ANILIST_CLIENT_ID) {
    throw new Error('Missing VITE_ANILIST_CLIENT_ID');
  }

  const params = new URLSearchParams({
    client_id: ANILIST_CLIENT_ID,
    redirect_uri: ANILIST_REDIRECT_URI,
    response_type: 'code',
  });

  return `${ANILIST_AUTH_URL}?${params.toString()}`;
}

// Exchange code for tokens via Edge Function
export async function exchangeAniListCode(code: string, userId: string): Promise<boolean> {
  // Refresh session first to ensure we have a valid JWT
  await supabase.auth.refreshSession().catch(() => { });
  const { data: { session } } = await supabase.auth.getSession();

  const bearer = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!bearer) throw new Error('Missing auth token for AniList exchange');

  const authHeaders: Record<string, string> = {
    'Authorization': `Bearer ${bearer}`,
  };

  const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('external-auth', {
    body: {
      action: 'anilist',
      code,
      redirectUri: ANILIST_REDIRECT_URI,
    },
    headers: authHeaders,
  });

  if (edgeFunctionError) throw new Error(edgeFunctionError.message);
  if (edgeFunctionData.error) throw new Error(edgeFunctionData.error);

  const data = edgeFunctionData;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Store tokens in profile
  const { error } = await supabase
    .from('profiles')
    .update({
      anilist_access_token: data.access_token,
      anilist_token_expires_at: expiresAt.toISOString(),
      anilist_refresh_token: data.refresh_token, // Store refresh token if available (though AniList JWTs are long-lived usually)
    })
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// GraphQL query helper
async function anilistQuery(query: string, variables: Record<string, any>, accessToken?: string, retries = 3): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429 && retries > 0) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
      console.warn(`[AniList] Rate limited. Retrying in ${delay}ms...`);
      await sleep(delay);
      return anilistQuery(query, variables, accessToken, retries - 1);
    }

    if (!response.ok) throw new Error(`AniList query failed with status ${response.status}`);
    const data = await response.json();
    if (data.errors) throw new Error(data.errors[0].message);
    return data.data;
  } catch (err: any) {
    if (retries > 0 && (err.name === 'TypeError' || err.message === 'Failed to fetch')) {
      // Network error or CORS block to due rate drop
      console.warn(`[AniList] Network error/Fetch failed. Retrying in 2s...`, err);
      await sleep(2000);
      return anilistQuery(query, variables, accessToken, retries - 1);
    }
    throw err;
  }
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
  status: 'CURRENT' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'PLANNING',
  progress?: number
): Promise<boolean> {
  const query = `
    mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) {
        id
        status
        progress
      }
    }
  `;
  await anilistQuery(query, { mediaId, status, progress }, accessToken);
  return true;
}

// Update AniList manga status
export async function updateAniListMangaStatus(
  accessToken: string,
  mediaId: number,
  status: 'CURRENT' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'PLANNING',
  progress?: number
): Promise<boolean> {
  const query = `
    mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) {
        id
        status
        progress
      }
    }
  `;
  await anilistQuery(query, { mediaId, status, progress }, accessToken);
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
