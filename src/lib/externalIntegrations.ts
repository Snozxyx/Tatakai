import { supabase } from '@/integrations/supabase/client';

// ===========================================
// MyAnimeList Integration
// ===========================================

const MAL_CLIENT_ID = import.meta.env.VITE_MAL_CLIENT_ID;
const MAL_CLIENT_SECRET = import.meta.env.VITE_MAL_CLIENT_SECRET;
const MAL_REDIRECT_URI = import.meta.env.VITE_MAL_REDIRECT_URI;
const MAL_AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize';
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
const MAL_API_URL = 'https://api.myanimelist.net/v2';

// Generate code verifier for PKCE
function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate MAL OAuth URL
export function getMALAuthUrl(): string {
  const codeVerifier = generateCodeVerifier();
  localStorage.setItem('mal_code_verifier', codeVerifier);
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: MAL_CLIENT_ID,
    redirect_uri: MAL_REDIRECT_URI,
    code_challenge: codeVerifier, // MAL uses plain code challenge
    code_challenge_method: 'plain',
    state: crypto.randomUUID(),
  });

  return `${MAL_AUTH_URL}?${params.toString()}`;
}

// Exchange code for tokens
export async function exchangeMALCode(code: string, userId: string): Promise<boolean> {
  const codeVerifier = localStorage.getItem('mal_code_verifier');
  if (!codeVerifier) throw new Error('Code verifier not found');

  const response = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MAL_CLIENT_ID,
      client_secret: MAL_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: MAL_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) throw new Error('Failed to exchange code');
  
  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Store tokens in profile
  const { error } = await supabase
    .from('profiles')
    .update({
      mal_access_token: data.access_token,
      mal_refresh_token: data.refresh_token,
      mal_token_expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  if (error) throw error;
  
  localStorage.removeItem('mal_code_verifier');
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
const ANILIST_CLIENT_SECRET = import.meta.env.VITE_ANILIST_CLIENT_SECRET;
const ANILIST_REDIRECT_URI = import.meta.env.VITE_ANILIST_REDIRECT_URI;
const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
const ANILIST_API_URL = 'https://graphql.anilist.co';

// Generate AniList OAuth URL
export function getAniListAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: ANILIST_CLIENT_ID,
    redirect_uri: ANILIST_REDIRECT_URI,
    response_type: 'code',
  });

  return `${ANILIST_AUTH_URL}?${params.toString()}`;
}

// Exchange code for tokens
export async function exchangeAniListCode(code: string, userId: string): Promise<boolean> {
  const response = await fetch(ANILIST_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ANILIST_CLIENT_ID,
      client_secret: ANILIST_CLIENT_SECRET,
      redirect_uri: ANILIST_REDIRECT_URI,
      code,
    }),
  });

  if (!response.ok) throw new Error('Failed to exchange code');
  
  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Store tokens in profile
  const { error } = await supabase
    .from('profiles')
    .update({
      anilist_access_token: data.access_token,
      anilist_token_expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

// GraphQL query helper
async function anilistQuery(query: string, variables: Record<string, any>, accessToken?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error('AniList query failed');
  const data = await response.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
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

// Fetch AniList anime list
export async function fetchAniListAnimeList(accessToken: string, userId: number): Promise<any[]> {
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
  return data.MediaListCollection?.lists || [];
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

// Search anime on AniList
export async function searchAniListAnime(title: string): Promise<any[]> {
  const query = `
    query ($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: ANIME) {
          id
          idMal
          title { romaji english native }
          coverImage { medium large }
          episodes
          status
          seasonYear
          season
        }
      }
    }
  `;
  const data = await anilistQuery(query, { search: title });
  return data.Page?.media || [];
}

// Disconnect integrations
export async function disconnectMAL(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      mal_user_id: null,
      mal_access_token: null,
      mal_refresh_token: null,
      mal_token_expires_at: null,
    })
    .eq('user_id', userId);

  if (error) throw error;
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
