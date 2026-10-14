/**
 * MangaBaka tracker integration (OAuth2 / OpenID Connect).
 *
 * MangaBaka is an OpenID Connect provider
 * (https://mangabaka.org/.well-known/openid-configuration):
 *   authorization: https://mangabaka.org/auth/oauth2/authorize
 *   token:         https://mangabaka.org/auth/oauth2/token (server-side only)
 *   userinfo:      https://mangabaka.org/auth/oauth2/userinfo
 * Scopes: openid profile library.read library.write offline_access.
 *
 * Flow mirrors MAL/AniList: the browser hits the authorize URL with PKCE
 * (S256 — the only challenge method MangaBaka advertises) and a `state`
 * value, MangaBaka redirects to the registered redirect URI, the callback
 * page exchanges the code through TatakaiAPI (`POST /sync/exchange` with
 * `integration: 'mangabaka'`), and the server persists the tokens in the
 * `mangabaka_credentials` table (service_role only — never readable by the
 * browser). Library reads/imports and chapter pushes all go through the
 * server; the client secret never ships to the browser.
 */

import { resolveApiV3Base } from '@/lib/api/backendOrigin';
import {
  getWebMangabakaRedirectUri,
  isNativeOAuthApp,
  MANGABAKA_PROD_ORIGIN,
  MANGABAKA_REDIRECT_PATH,
} from '@/lib/desktopOAuth';

const MANGABAKA_CLIENT_ID = import.meta.env.VITE_MANGABAKA_CLIENT_ID;
const MANGABAKA_AUTHORIZE_URL = 'https://mangabaka.org/auth/oauth2/authorize';
const MANGABAKA_SCOPES = ['openid', 'profile', 'library.read', 'library.write', 'offline_access'];

/** Canonical production redirect URI (register this in the MangaBaka app). */
export const MANGABAKA_CANONICAL_REDIRECT_URI = `${MANGABAKA_PROD_ORIGIN}${MANGABAKA_REDIRECT_PATH}`;

export const MANGABAKA_LOGO_URL = 'https://mangabaka.org/images/logo.png';
/** MangaBaka brand accent — their site `--primary` (crimson). Mirrored as
 * `#e30047` literals in Tailwind class strings (which need compile-time values). */
export const MANGABAKA_ACCENT = '#e30047';
export const MANGABAKA_SITE_URL = 'https://mangabaka.org';
export const MANGABAKA_SETTINGS_URL = 'https://mangabaka.org/my/settings';
export const MANGABAKA_LIBRARY_URL = 'https://mangabaka.org/my/library';

const MANGABAKA_REDIRECT_STORAGE_KEY = 'mangabaka_redirect_uri';
const MANGABAKA_STATE_STORAGE_KEY = 'mangabaka_oauth_state';
const MANGABAKA_VERIFIER_STORAGE_KEY = 'mangabaka_code_verifier';
const MANGABAKA_OAUTH_STARTED_AT_KEY = 'mangabaka_oauth_started_at';
/** A login that never reached the callback page within this window still counts as pending. */
const MANGABAKA_PENDING_FLOW_TTL_MS = 10 * 60 * 1000;

function generateRandomString(length: number) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  while (text.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < 256 - (256 % possible.length)) text += possible[byte % possible.length];
      if (text.length === length) break;
    }
  }
  return text;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The `redirect_uri` sent on the authorize call must be a SINGLE URL exactly
 * matching one entry in the MangaBaka app settings (multiple URLs go one per
 * line in the dashboard — never send a joined pair as one URL).
 */
function assertSingleRedirectUri(redirectUri: string): string {
  const value = String(redirectUri || '').trim();
  if (!value) {
    throw new Error('Missing MangaBaka redirect URI (no window location context and no VITE_MANGABAKA_REDIRECT_URI)');
  }
  if (value.includes(',') || /[\s]/.test(value)) {
    throw new Error(
      `Invalid MangaBaka redirect URI: send exactly one URL (canonical: ${MANGABAKA_CANONICAL_REDIRECT_URI}). ` +
        'Register each URL on its own line in the MangaBaka app settings.',
    );
  }
  return value;
}

/**
 * Builds the MangaBaka authorization URL (async: S256 PKCE needs a digest).
 * Persists the verifier/redirect/state for the callback page. Falls back to a
 * no-PKCE URL when `crypto.subtle` is unavailable — the confidential server
 * exchange still authenticates the app via client_secret.
 */
export async function getMangaBakaAuthUrl(
  redirectUriOverride?: string,
  stateOverride?: string,
): Promise<string> {
  if (!MANGABAKA_CLIENT_ID) {
    throw new Error('Missing VITE_MANGABAKA_CLIENT_ID');
  }
  const redirectUri = assertSingleRedirectUri(
    redirectUriOverride || getWebMangabakaRedirectUri(),
  );
  localStorage.setItem(MANGABAKA_REDIRECT_STORAGE_KEY, redirectUri);
  localStorage.setItem(MANGABAKA_OAUTH_STARTED_AT_KEY, String(Date.now()));

  const codeVerifier = generateRandomString(96);
  localStorage.setItem(MANGABAKA_VERIFIER_STORAGE_KEY, codeVerifier);

  // Desktop passes its bridge marker here so the https redirect page can
  // forward the callback to the app; web flows keep a random CSRF value.
  const state = stateOverride || generateRandomString(16);
  localStorage.setItem(MANGABAKA_STATE_STORAGE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: MANGABAKA_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: MANGABAKA_SCOPES.join(' '),
    state,
  });

  try {
    if (crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
      params.set('code_challenge', base64UrlEncode(digest));
      params.set('code_challenge_method', 'S256');
    } else {
      localStorage.removeItem(MANGABAKA_VERIFIER_STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(MANGABAKA_VERIFIER_STORAGE_KEY);
  }

  return `${MANGABAKA_AUTHORIZE_URL}?${params.toString()}`;
}

/** True when a login was started recently but its callback never ran. */
export function isMangaBakaLoginPendingFresh(): boolean {
  try {
    const startedAt = Number(localStorage.getItem(MANGABAKA_OAUTH_STARTED_AT_KEY) || 0);
    return (
      Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < MANGABAKA_PENDING_FLOW_TTL_MS
    );
  } catch {
    return false;
  }
}

/** Clears a pending/in-flight login so a brand-new flow can start. */
export function clearMangaBakaOAuthStorage(): void {
  try {
    localStorage.removeItem(MANGABAKA_VERIFIER_STORAGE_KEY);
    localStorage.removeItem(MANGABAKA_REDIRECT_STORAGE_KEY);
    localStorage.removeItem(MANGABAKA_STATE_STORAGE_KEY);
    localStorage.removeItem(MANGABAKA_OAUTH_STARTED_AT_KEY);
    // Legacy PAT-era leftovers (this browser never holds a token anymore).
    localStorage.removeItem('mangabaka_pat');
    localStorage.removeItem('mangabaka_connected_at');
  } catch {
    /* ignore */
  }
}

/** Clears just the in-flight marker (the flow reached the callback page and is over). */
export function clearMangaBakaPendingMarker(): void {
  try {
    localStorage.removeItem(MANGABAKA_OAUTH_STARTED_AT_KEY);
  } catch {
    /* ignore */
  }
}

/** Non-sensitive cached flag so background sync can skip its POST when idle. */
export function isMangaBakaConnectedCached(): boolean {
  try {
    return localStorage.getItem('mangabaka_connected') === '1';
  } catch {
    return false;
  }
}

/**
 * Non-sensitive cached connection snapshot (flag + username) so the settings
 * card paints "Connected" instantly like the MAL/AniList cards — the server
 * check revalidates in the background and corrects it if it changed.
 */
export function readMangaBakaCachedStatus(): { connected: boolean; username: string | null } {
  try {
    return {
      connected: localStorage.getItem('mangabaka_connected') === '1',
      username: localStorage.getItem('mangabaka_username'),
    };
  } catch {
    return { connected: false, username: null };
  }
}

export function setMangaBakaConnectedCached(connected: boolean, username?: string | null): void {
  try {
    if (connected) {
      localStorage.setItem('mangabaka_connected', '1');
      if (username !== undefined) {
        if (username) localStorage.setItem('mangabaka_username', username);
        else localStorage.removeItem('mangabaka_username');
      }
    } else {
      localStorage.removeItem('mangabaka_connected');
      localStorage.removeItem('mangabaka_username');
    }
  } catch {
    /* ignore */
  }
}

/**
 * Pre-flight for pure-web logins: the PKCE verifier + state live in the
 * CURRENT origin's localStorage, so the redirect URI must share this origin.
 * Native apps are exempt (https bridge forwards to `tatakai://`).
 */
export function assertWebMangabakaRedirectMatchesOrigin(redirectUri: string): void {
  if (isNativeOAuthApp()) return;
  if (typeof window === 'undefined') return;
  let redirectOrigin: string;
  try {
    redirectOrigin = new URL(redirectUri).origin;
  } catch {
    return;
  }
  if (redirectOrigin !== window.location.origin) {
    throw new Error(
      `MangaBaka login can't complete from ${window.location.origin}: this build sends redirect URI ${redirectUri}, ` +
        `which points at a different origin. In your MangaBaka app settings, register BOTH URLs (one per line): ` +
        `${MANGABAKA_CANONICAL_REDIRECT_URI} and ${window.location.origin}${MANGABAKA_REDIRECT_PATH} — then reconnect.`,
    );
  }
}

async function getBearerHeader(): Promise<Record<string, string>> {
  const { supabase } = await import('@/integrations/supabase/client');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('You must be logged in to link MangaBaka.');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (body as { error?: string })?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : `Request failed (${res.status})`);
  }
  return (body as { data?: T })?.data ?? (body as T);
}

/**
 * Completes the MangaBaka login by exchanging the code server-side.
 * The verifier is optional (S256 fallback when crypto.subtle was missing).
 */
export async function exchangeMangaBakaCode(code: string) {
  const codeVerifier = (() => {
    try {
      return localStorage.getItem(MANGABAKA_VERIFIER_STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  let redirectUri: string;
  try {
    redirectUri = assertSingleRedirectUri(
      localStorage.getItem(MANGABAKA_REDIRECT_STORAGE_KEY) || getWebMangabakaRedirectUri(),
    );
  } catch {
    redirectUri = getWebMangabakaRedirectUri();
  }

  const response = await fetch(`${resolveApiV3Base()}/sync/exchange`, {
    method: 'POST',
    headers: {
      ...(await getBearerHeader()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      integration: 'mangabaka',
      code,
      codeVerifier,
      redirectUri,
      clientId: MANGABAKA_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    let errorBody: { error?: string; details?: unknown };
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { error: 'Failed to exchange code' };
    }
    const message = errorBody.error || 'Failed to exchange code';
    const details =
      typeof errorBody.details === 'object' ? JSON.stringify(errorBody.details) : errorBody.details || '';
    throw new Error(`MangaBaka Error (${response.status}): ${message}${details ? ` - ${details}` : ''}`);
  }

  const data = await response.json();
  clearMangaBakaOAuthStorage();
  setMangaBakaConnectedCached(true);
  return data;
}

export interface MangaBakaStatus {
  connected: boolean;
  username: string | null;
  connectedAt: string | null;
}

/** Connection state (never exposes tokens — the server holds them). */
export async function getMangaBakaStatus(): Promise<MangaBakaStatus> {
  const res = await fetch(`${resolveApiV3Base()}/sync/mangabaka/status`, {
    headers: await getBearerHeader(),
  });
  const data = await readJson<{ connected: boolean; username: string | null; connectedAt: string | null }>(res);
  setMangaBakaConnectedCached(!!data.connected, data.username ?? null);
  return {
    connected: !!data.connected,
    username: data.username ?? null,
    connectedAt: data.connectedAt ?? null,
  };
}

export async function disconnectMangaBaka(): Promise<void> {
  const res = await fetch(`${resolveApiV3Base()}/sync/mangabaka/disconnect`, {
    method: 'POST',
    headers: await getBearerHeader(),
  });
  await readJson(res);
  clearMangaBakaOAuthStorage();
  setMangaBakaConnectedCached(false);
}

// ── Library (server-held token) ───────────────────────────────────────────────

export interface MangaBakaLibraryEntry {
  seriesId: number;
  state: string | null;
  progressChapter: number | null;
  progressVolume: number | null;
  rating: number | null;
  title: string | null;
  coverUrl: string | null;
  anilistId: number | null;
  malId: number | null;
  kitsuId: number | null;
  updatedAt: string | null;
}

/** Full MangaBaka manga library for the import review step. */
export async function fetchMangaBakaLibrary(): Promise<MangaBakaLibraryEntry[]> {
  const res = await fetch(`${resolveApiV3Base()}/sync/mangabaka/library`, {
    headers: await getBearerHeader(),
  });
  const data = await readJson<{ entries: MangaBakaLibraryEntry[] }>(res);
  return Array.isArray(data.entries) ? data.entries : [];
}

// ── Status mapping ────────────────────────────────────────────────────────────

const MANGABAKA_TO_TATAKAI: Record<string, string> = {
  reading: 'reading',
  rereading: 'reading',
  completed: 'completed',
  plan_to_read: 'plan_to_read',
  considering: 'plan_to_read',
  dropped: 'dropped',
  paused: 'on_hold',
};

export function mapMangaBakaStatusToTatakai(status: string): string {
  return MANGABAKA_TO_TATAKAI[String(status || '').trim().toLowerCase()] || 'plan_to_read';
}

/**
 * Pushes manga progress through the server single-sync route (which fans out
 * to every linked tracker, including MangaBaka). Fire-and-forget from the
 * reader — returns false when nothing was sent.
 */
export async function pushMangaProgressViaServer(input: {
  anilistId?: number | null;
  malId?: number | null;
  status: string;
  chapter?: number | null;
}): Promise<boolean> {
  try {
    if (!isMangaBakaConnectedCached()) return false;
    const { supabase } = await import('@/integrations/supabase/client');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const res = await fetch(`${resolveApiV3Base()}/sync/single-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'manga',
        anilistId: input.anilistId ?? null,
        malId: input.malId ?? null,
        status: input.status,
        progress: input.chapter ?? 0,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
