
/**
 * MyAnimeList OAuth2 Integration
 * Uses PKCE flow for security.
 */

const MAL_CLIENT_ID = "95c3ad3639e1840ee700cb5485d11135";
const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/integration/mal/redirect`
    : "https://tatakai.qzz.io/integration/mal/redirect";

// Helper to generate a random string for code_verifier
function generateRandomString(length: number) {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Generates the MAL authorization URL.
 * Also stores the code_verifier in localStorage for later use.
 */
export async function getMalAuthUrl() {
    const codeVerifier = generateRandomString(128);
    localStorage.setItem('mal_code_verifier', codeVerifier);

    // For MAL, the code_challenge is simply the code_verifier if not using S256
    // But MAL supports plain or S256. We'll use plain for simplicity as allowed by MAL docs
    // if S256 is not explicitly required.
    const codeChallenge = codeVerifier;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: MAL_CLIENT_ID,
        code_challenge: codeChallenge,
        code_challenge_method: 'plain',
        state: generateRandomString(16),
        redirect_uri: REDIRECT_URI,
    });

    return `https://myanimelist.net/v1/oauth2/authorize?${params.toString()}`;
}

/**
 * Completes the MAL authentication by exchanging the code for tokens.
 * Calls our Supabase Edge Function to keep the client_secret secure.
 */
export async function exchangeMalCode(code: string) {
    const codeVerifier = localStorage.getItem('mal_code_verifier');
    if (!codeVerifier) {
        throw new Error('Missing code_verifier');
    }

    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        console.error('[MAL Auth] No active session found');
        throw new Error('You must be logged in to link MyAnimeList.');
    }

    const functionUrl = `https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/mal-auth`;

    console.debug('[MAL Auth] Calling Edge Function:', functionUrl, 'action:', 'exchange');

    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            action: 'exchange',
            code,
            code_verifier: codeVerifier,
            redirect_uri: REDIRECT_URI,
        })
    });

    if (!response.ok) {
        let errorBody;
        try {
            errorBody = await response.json();
        } catch (e) {
            errorBody = { raw: await response.text().catch(() => 'No body') };
        }

        console.error('[MAL Auth] Edge Function error response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorBody
        });

        const message = errorBody.error || errorBody.details || 'Failed to exchange code';
        const details = typeof errorBody.details === 'object' ? JSON.stringify(errorBody.details) : (errorBody.details || '');
        throw new Error(`MAL Error (${response.status}): ${message}${details ? ` - ${details}` : ''}`);
    }

    const data = await response.json();
    console.debug('[MAL Auth] Edge Function success:', data);

    localStorage.removeItem('mal_code_verifier');
    return data;
}

/**
 * Resolves a MAL ID by fetching the first episode of an anime.
 * This is used as a fallback when the ID is missing in our database.
 */
export async function resolveMalIdFromEpisodes(animeId: string): Promise<number | null> {
    console.log(`[MAL Sync] Fallback - Resolving MAL ID for ${animeId} via Episode 1...`);
    try {
        const { fetchEpisodes, fetchTatakaiEpisodeSources } = await import('@/lib/api');

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

    // 2. Call Edge Function to sync
    console.log('[MAL Sync] REQ - Calling Edge Function sync for malId:', malId);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const functionUrl = `https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/mal-auth`;

    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            action: 'sync',
            malId,
            status,
            score,
            numWatchedEpisodes
        })
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { error: 'Unknown server error', details: await response.text().catch(() => 'No body') };
        }

        console.error('[MAL Sync] Sync failed in Edge Function:', errorData);
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

    const functionUrl = `https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/mal-auth`;

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

    const functionUrl = `https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/mal-auth`;

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
