
/**
 * MyAnimeList OAuth2 Integration
 * Uses PKCE flow for security.
 */

import { resolveApiV3Base } from '@/lib/api/backendOrigin';
import { getWebMalRedirectUri, isNativeOAuthApp, MAL_PROD_ORIGIN, MAL_REDIRECT_PATH } from '@/lib/desktopOAuth';

const MAL_CLIENT_ID = import.meta.env.VITE_MAL_CLIENT_ID;
/** Canonical production redirect URI (register this in the MAL app settings). */
export const MAL_CANONICAL_REDIRECT_URI = `${MAL_PROD_ORIGIN}${MAL_REDIRECT_PATH}`;
/** Fresh redirect URI per call — never captured at module load (Vite bakes env). */
function getMalRedirectUri(): string {
    return getWebMalRedirectUri();
}

function getMalAuthFunctionUrl(): string {
    return `${resolveApiV3Base()}/sync/mal/legacy`;
}

// Helper to generate a random string for code_verifier
function generateRandomString(length: number) {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    // Rejection sampling keeps all PKCE characters equally likely.
    while (text.length < length) {
        for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
            if (byte < 256 - (256 % possible.length)) text += possible[byte % possible.length];
            if (text.length === length) break;
        }
    }
    return text;
}

/**
 * Generates the MAL authorization URL.
 * Also stores the code_verifier in localStorage for later use.
 */
const MAL_REDIRECT_STORAGE_KEY = 'mal_redirect_uri';
const MAL_STATE_STORAGE_KEY = 'mal_oauth_state';
const MAL_OAUTH_STARTED_AT_KEY = 'mal_oauth_started_at';
/** A login that never reached the callback page within this window still counts as pending. */
const MAL_PENDING_FLOW_TTL_MS = 10 * 60 * 1000;

/**
 * The `redirect_uri` sent on the authorize call must be a SINGLE URL that
 * exactly matches one entry in the MAL app settings. MAL's dashboard accepts
 * MULTIPLE urls (one per line) — register both the production URL and the
 * localhost URL there. What it does NOT accept is a comma-joined pair sent as
 * one literal string: the authorize call then answers 401 with
 * `WWW-Authenticate: Basic`, so Chromium / Electron pops a native
 * "Please Sign In — https://myanimelist.net" HTTP-auth dialog that loops.
 * Guard here so a misconfigured value surfaces a readable error instead.
 */
function assertSingleRedirectUri(redirectUri: string): string {
    const value = String(redirectUri || '').trim();
    if (!value) {
        throw new Error('Missing MAL redirect URI (no window location context and no VITE_MAL_REDIRECT_URI)');
    }
    if (value.includes(',') || /[\s]/.test(value)) {
        throw new Error(
            `Invalid MAL redirect URI: send exactly one URL (canonical: ${MAL_CANONICAL_REDIRECT_URI}). ` +
            'Register each URL on its own line in the MAL app settings — never send a comma/space-separated pair as one URL, ' +
            'or MAL answers 401 and the browser shows an HTTP login prompt that loops forever.',
        );
    }
    return value;
}

export function getMalAuthUrl(redirectUriOverride?: string, stateOverride?: string) {
    if (!MAL_CLIENT_ID) {
        throw new Error('Missing VITE_MAL_CLIENT_ID');
    }
    const redirectUri = assertSingleRedirectUri(redirectUriOverride || getMalRedirectUri());
    // Persist so exchangeMalCode sends the identical redirect_uri (required by MAL).
    localStorage.setItem(MAL_REDIRECT_STORAGE_KEY, redirectUri);
    // Marks a login in flight. Starting a second flow overwrites the verifier,
    // which permanently invalidates any code issued for the first challenge
    // (MAL answers `invalid_grant`), so callers check isMalLoginPendingFresh()
    // before silently restarting.
    localStorage.setItem(MAL_OAUTH_STARTED_AT_KEY, String(Date.now()));

    const codeVerifier = generateRandomString(128);
    localStorage.setItem('mal_code_verifier', codeVerifier);

    // MAL uses the plain PKCE challenge method.
    const codeChallenge = codeVerifier;

    // Desktop passes its bridge marker here so the https redirect page can
    // forward the callback to the app; web flows keep a random CSRF value.
    const state = stateOverride || generateRandomString(16);
    localStorage.setItem(MAL_STATE_STORAGE_KEY, state);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: MAL_CLIENT_ID,
        code_challenge: codeChallenge,
        code_challenge_method: 'plain',
        state,
        redirect_uri: redirectUri,
    });

    return `https://myanimelist.net/v1/oauth2/authorize?${params.toString()}`;
}

/**
 * True when a login was started recently but its callback never ran — i.e. the
 * user still has a MAL tab open for the previous challenge. Starting a new
 * flow now would overwrite the stored verifier and doom the old tab to
 * `invalid_grant`. Terminal callback states (success / exchange failure) clear
 * the marker, so a fresh `true` here always means "in flight".
 */
export function isMalLoginPendingFresh(): boolean {
    try {
        const startedAt = Number(localStorage.getItem(MAL_OAUTH_STARTED_AT_KEY) || 0);
        return Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < MAL_PENDING_FLOW_TTL_MS;
    } catch {
        return false;
    }
}

/** Clears a pending/in-flight login so a brand-new flow can start. */
export function clearMalOAuthStorage(): void {
    try {
        localStorage.removeItem('mal_code_verifier');
        localStorage.removeItem(MAL_REDIRECT_STORAGE_KEY);
        localStorage.removeItem(MAL_STATE_STORAGE_KEY);
        localStorage.removeItem(MAL_OAUTH_STARTED_AT_KEY);
    } catch {
        /* ignore */
    }
}

/** Clears just the in-flight marker (the flow reached the callback page and is over). */
export function clearMalPendingMarker(): void {
    try {
        localStorage.removeItem(MAL_OAUTH_STARTED_AT_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * Pre-flight for pure-web logins: the PKCE verifier + state live in the
 * CURRENT origin's localStorage, so the redirect URI MAL sends the user back
 * to MUST share this origin. With the origin-aware `getWebMalRedirectUri`
 * above this should rarely trigger — it fires only when a stale stored URI or
 * an explicit override points elsewhere.
 *
 * Fix: in the MAL app settings (API panel → App Redirect URL) register BOTH
 * URLs, one per line:
 *   https://tatakai.me/api/mal/redirect
 *   <this-origin>/api/mal/redirect
 * (MAL supports multiple redirect URIs line-separated in the SAME app — no
 * second app / second client ID needed.)
 *
 * Native apps are exempt: the https page forwards to `tatakai://` and the
 * desktop session owns the verifier.
 */
export function assertWebMalRedirectMatchesOrigin(redirectUri: string): void {
    if (isNativeOAuthApp()) return;
    if (typeof window === 'undefined') return;
    let redirectOrigin: string;
    try {
        redirectOrigin = new URL(redirectUri).origin;
    } catch {
        return; // Malformed URL — let the authorize call surface the error.
    }
    if (redirectOrigin !== window.location.origin) {
        throw new Error(
            `MAL login can't complete from ${window.location.origin}: this build sends redirect URI ${redirectUri}, ` +
            `which points at a different origin. In your MAL app settings, register BOTH URLs (one per line): ` +
            `${MAL_CANONICAL_REDIRECT_URI} and ${window.location.origin}${MAL_REDIRECT_PATH} — then reconnect. ` +
            `No second MAL app is needed.`,
        );
    }
}

/**
 * Completes the MAL authentication by exchanging the code for tokens.
 * Calls TatakaiAPI to keep the client_secret secure.
 */
export async function exchangeMalCode(code: string) {
    const codeVerifier = localStorage.getItem('mal_code_verifier');
    if (!codeVerifier) {
        throw new Error('Missing code_verifier');
    }
    const redirectUri = assertSingleRedirectUri(
        localStorage.getItem(MAL_REDIRECT_STORAGE_KEY) || getMalRedirectUri(),
    );

    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        console.error('[MAL Auth] No active session found');
        throw new Error('You must be logged in to link MyAnimeList.');
    }

    console.debug('[MAL Auth] Calling TatakaiAPI exchange...');

    const response = await fetch(`${resolveApiV3Base()}/sync/exchange`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            integration: 'mal',
            code,
            codeVerifier,
            redirectUri,
            // Public (non-secret) app id used at authorize time. The server
            // compares it with its own exchange credentials to diagnose the
            // classic dev/prod app mismatch ("issued to another client").
            clientId: MAL_CLIENT_ID,
        })
    });

    if (!response.ok) {
        let errorBody;
        try {
            errorBody = await response.json();
        } catch (e) {
            errorBody = { raw: await response.text().catch(() => 'No body') };
        }

        console.error('[MAL Auth] TatakaiAPI exchange error response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorBody
        });

        const message = errorBody.error || errorBody.details || 'Failed to exchange code';
        const details = typeof errorBody.details === 'object' ? JSON.stringify(errorBody.details) : (errorBody.details || '');
        throw new Error(`MAL Error (${response.status}): ${message}${details ? ` - ${details}` : ''}`);
    }

    const data = await response.json();
    console.debug('[MAL Auth] TatakaiAPI exchange success:', data);

    clearMalOAuthStorage();
    return data;
}

/**
 * Resolves a MAL ID by fetching the first episode of an anime.
 * This is used as a fallback when the ID is missing in our database.
 */
export async function resolveMalIdFromEpisodes(animeId: string): Promise<number | null> {
    console.log(`[MAL Sync] Fallback - Resolving MAL ID for ${animeId} via Episode 1...`);
    try {
        const { fetchEpisodes, fetchTatakaiEpisodeSources, fetchCombinedSources } = await import('@/lib/api');

        // 1. Get episode list
        const { episodes } = await fetchEpisodes(animeId);
        if (!episodes || episodes.length === 0) {
            console.warn('[MAL Sync] Fallback - No episodes found for', animeId);
            return null;
        }

        // 2. Get sources for the first episode (reliable source for MAL ID)
        const firstEpisode = episodes[0];
        const sourceData = await fetchTatakaiEpisodeSources(firstEpisode.episodeId);

        if (sourceData?.malID) {
            const malId = Number(sourceData.malID);
            console.log(`[MAL Sync] Fallback - Successfully resolved MAL ID: ${malId}`);
            return malId;
        }

        // 3. Broader fallback: combined sources often carry provider-derived IDs.
        const combined = await fetchCombinedSources(firstEpisode.episodeId, animeId, 1, 'hd-2', 'sub');
        if (combined?.malID) {
            const malId = Number(combined.malID);
            console.log(`[MAL Sync] Fallback - Resolved MAL ID via combined sources: ${malId}`);
            return malId;
        }

        console.warn('[MAL Sync] Fallback - No MAL ID found in episode sources for', animeId);
        return null;
    } catch (error) {
        console.error('[MAL Sync] Fallback - Error during resolution:', error);
        return null;
    }
}

/**
 * Updates the status of an anime on the user's MyAnimeList.
 * If malId is not provided or animeId is a HiAnime ID, it will attempt to look it up from the database.
 */
export async function updateMalAnimeStatus(
    animeIdOrMalId: string | number,
    status: string,
    score?: number,
    numWatchedEpisodes?: number
) {
    console.log('[MAL Sync] INIT - Attempting sync for:', { animeIdOrMalId, status, score, numWatchedEpisodes });

    // Explicitly import supabase inside function to avoid circular deps if they exist
    const { supabase } = await import('@/integrations/supabase/client');

    // 1. Determine MAL ID
    let malId: number;

    if (typeof animeIdOrMalId === 'number') {
        malId = animeIdOrMalId;
        console.log('[MAL Sync] ID - Using provided numeric MAL ID:', malId);
    } else if (/^\d+$/.test(animeIdOrMalId)) {
        malId = parseInt(animeIdOrMalId);
        console.log('[MAL Sync] ID - Parsed numeric string to MAL ID:', malId);
    } else {
        console.log('[MAL Sync] ID - Non-numeric ID detected, looking up from DB:', animeIdOrMalId);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.error('[MAL Sync] ERR - User not authenticated');
            throw new Error('Not authenticated');
        }

        console.log('[MAL Sync] DB - Checking watchlist for MAL ID...');
        let { data: watchlistEntry } = await supabase
            .from('watchlist')
            .select('mal_id')
            .eq('user_id', user.id)
            .eq('anime_id', animeIdOrMalId)
            .maybeSingle();

        if (watchlistEntry?.mal_id) {
            malId = watchlistEntry.mal_id;
            console.log('[MAL Sync] DB - Found MAL ID in watchlist:', malId);
        } else {
            console.log('[MAL Sync] DB - Not in watchlist, checking watch_history...');
            let { data: historyEntry } = await supabase
                .from('watch_history')
                .select('mal_id')
                .eq('user_id', user.id)
                .eq('anime_id', animeIdOrMalId)
                .order('watched_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (historyEntry?.mal_id) {
                malId = historyEntry.mal_id;
                console.log('[MAL Sync] DB - Found MAL ID in history:', malId);
            } else {
                console.log('[MAL Sync] Fallback - ID missing everywhere, attempting live resolution...');
                const resolvedId = await resolveMalIdFromEpisodes(animeIdOrMalId);

                if (resolvedId) {
                    malId = resolvedId;

                    // 1.1 Persist found ID to DB for future efficiency
                    console.log('[MAL Sync] DB - Persisting resolved ID to watchlist/history...');

                    // Update watchlist
                    await supabase
                        .from('watchlist')
                        .update({ mal_id: malId })
                        .eq('user_id', user.id)
                        .eq('anime_id', animeIdOrMalId);

                    // Update watch history
                    await supabase
                        .from('watch_history')
                        .update({ mal_id: malId })
                        .eq('user_id', user.id)
                        .eq('anime_id', animeIdOrMalId);
                } else {
                    console.error('[MAL Sync] ERR - No MAL ID found for:', animeIdOrMalId);
                    throw new Error('MAL ID not found for this anime. Try watching an episode first.');
                }
            }
        }
    }

    // 2. Call TatakaiAPI to sync
    console.log('[MAL Sync] REQ - Calling TatakaiAPI single-sync for malId:', malId);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const response = await fetch(`${resolveApiV3Base()}/sync/single-sync`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'anime',
            malId,
            status,
            score,
            progress: numWatchedEpisodes
        })
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { error: 'Unknown server error', details: await response.text().catch(() => 'No body') };
        }

        console.error('[MAL Sync] Sync failed in TatakaiAPI:', errorData);
        throw new Error(`MAL Sync Error: ${errorData.error || 'Failed to update MAL'}${errorData.details ? `: ${JSON.stringify(errorData.details)}` : ''}`);
    }

    const result = await response.json();
    console.log('[MAL Sync] OK - Sync successful result:', result);
    return result;
}

/**
 * Fetches the user's entire anime list from MyAnimeList.
 */
export async function fetchMalUserList() {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const functionUrl = getMalAuthFunctionUrl();

    console.log('[MAL Sync] REQ - Fetching user list via Edge Function');

    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            action: 'fetch_list'
        })
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { error: 'Unknown server error' };
        }

        const details = errorData.details ? (typeof errorData.details === 'string' ? errorData.details : JSON.stringify(errorData.details)) : '';
        const message = errorData.error || 'Failed to fetch list';

        console.error('[MAL Sync] Fetch List failed:', { errorData, details });
        throw new Error(`MAL Fetch Error: ${message}${details ? ` (${details})` : ''}`);
    }

    const { data } = await response.json();
    return data;
}

/**
 * Maps MAL status strings to Tatakai status strings.
 */
export function mapMalStatusToTatakai(malStatus: string): any {
    const map: Record<string, string> = {
        'watching': 'watching',
        'completed': 'completed',
        'plan_to_watch': 'plan_to_watch',
        'dropped': 'dropped',
        'on_hold': 'on_hold'
    };
    return map[malStatus] || 'plan_to_watch';
}

function parseMalNumericId(value: string | number): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.trunc(value);
    }

    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/^\d+$/.test(raw)) {
        return parseInt(raw, 10);
    }

    const prefixed = raw.match(/^mal[:-](\d+)$/i);
    if (prefixed?.[1]) {
        return parseInt(prefixed[1], 10);
    }

    return null;
}

async function resolveMalMangaId(mangaIdOrMalId: string | number): Promise<number> {
    const parsed = parseMalNumericId(mangaIdOrMalId);
    if (parsed) return parsed;

    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const mangaId = String(mangaIdOrMalId || '').trim();
    if (!mangaId) throw new Error('Missing manga ID');

    const { data: mappedByMangaId } = await supabase
        .from('manga_readlist')
        .select('mal_id')
        .eq('user_id', user.id)
        .eq('manga_id', mangaId)
        .maybeSingle();

    if (mappedByMangaId?.mal_id) {
        return Number(mappedByMangaId.mal_id);
    }

    const anilistPrefixed = mangaId.match(/^anilist:(\d+)$/i);
    if (anilistPrefixed?.[1]) {
        const { data: mappedByAniListId } = await supabase
            .from('manga_readlist')
            .select('mal_id')
            .eq('user_id', user.id)
            .eq('anilist_id', Number(anilistPrefixed[1]))
            .maybeSingle();

        if (mappedByAniListId?.mal_id) {
            return Number(mappedByAniListId.mal_id);
        }
    }

    throw new Error('MAL manga ID not found for this entry');
}

/**
 * Fetches the user's entire manga list from MyAnimeList.
 */
export async function fetchMalMangaList() {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const functionUrl = getMalAuthFunctionUrl();

    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            action: 'fetch_manga_list'
        })
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = { error: 'Unknown server error' };
        }

        const details = errorData.details
            ? (typeof errorData.details === 'string' ? errorData.details : JSON.stringify(errorData.details))
            : '';
        const message = errorData.error || 'Failed to fetch manga list';

        throw new Error(`MAL Manga Fetch Error: ${message}${details ? ` (${details})` : ''}`);
    }

    const { data } = await response.json();
    return data;
}

/**
 * Maps MAL manga status strings to local manga readlist status strings.
 */
export function mapMalMangaStatusToTatakai(malStatus: string): any {
    const normalized = String(malStatus || '').trim().toLowerCase();
    const map: Record<string, string> = {
        'reading': 'reading',
        'completed': 'completed',
        'plan_to_read': 'plan_to_read',
        'dropped': 'dropped',
        'on_hold': 'on_hold'
    };
    return map[normalized] || 'plan_to_read';
}

/**
 * Maps local manga readlist status strings to MAL manga status strings.
 */
export function mapTatakaiMangaStatusToMal(status: string): any {
    const normalized = String(status || '').trim().toLowerCase();
    const map: Record<string, string> = {
        'reading': 'reading',
        'completed': 'completed',
        'plan_to_read': 'plan_to_read',
        'dropped': 'dropped',
        'on_hold': 'on_hold'
    };
    return map[normalized] || 'plan_to_read';
}

/**
 * Updates the status of a manga on the user's MyAnimeList.
 */
export async function updateMalMangaStatus(
    mangaIdOrMalId: string | number,
    status: string,
    score?: number,
    numReadChapters?: number
) {
    const { supabase } = await import('@/integrations/supabase/client');
    const malId = await resolveMalMangaId(mangaIdOrMalId);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const response = await fetch(`${resolveApiV3Base()}/sync/single-sync`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'manga',
            malId,
            status: mapTatakaiMangaStatusToMal(status),
            score,
            progress: numReadChapters,
        })
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = { error: 'Unknown server error' };
        }

        throw new Error(`MAL Manga Sync Error: ${errorData.error || 'Failed to update MAL manga status'}`);
    }

    return response.json();
}

/**
 * Removes a manga from the user's MyAnimeList library.
 */
export async function deleteMalMangaStatus(mangaIdOrMalId: string): Promise<void> {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const malId = await resolveMalMangaId(mangaIdOrMalId);
    const functionUrl = getMalAuthFunctionUrl();

    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            action: 'delete_manga',
            malId,
        })
    });

    if (!response.ok) {
        console.error('[MAL Manga Sync] Delete failed in Edge Function');
    }
}


/**
 * Removes an anime from the user's MyAnimeList library.
 */
export async function deleteMalAnimeStatus(animeIdOrMalId: string): Promise<void> {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let malId: number;
    if (/^\d+$/.test(animeIdOrMalId)) {
        malId = parseInt(animeIdOrMalId);
    } else {
        // Try searching in watchlist first
        const { data: watchlistEntry } = await supabase
            .from('watchlist')
            .select('mal_id')
            .eq('user_id', user.id)
            .eq('anime_id', animeIdOrMalId)
            .maybeSingle();

        if (watchlistEntry?.mal_id) {
            malId = watchlistEntry.mal_id;
        } else {
            console.warn('[MAL Sync] ERR - No MAL ID found to delete for:', animeIdOrMalId);
            return; // Exit silently if we can't find the ID to delete
        }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const functionUrl = getMalAuthFunctionUrl();

    console.log('[MAL Sync] REQ - Calling Edge Function delete for malId:', malId);

    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            action: 'delete',
            malId
        })
    });

    if (!response.ok) {
        console.error('[MAL Sync] Delete failed in Edge Function');
    } else {
        console.log('[MAL Sync] OK - Delete successful');
    }
}

/**
 * Checks if the user is linked to MAL.
 */
export async function getMalStatus(profile: any) {
    return !!(profile?.mal_access_token);
}
/**
 * Disconnects the user's MyAnimeList account by clearing tokens.
 */
export async function disconnectMal(userId: string): Promise<void> {
    const { supabase } = await import('@/integrations/supabase/client');
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
