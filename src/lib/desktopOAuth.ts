/**
 * Desktop OAuth helpers.
 *
 * AniList only allows a SINGLE redirect URI per app, and it must match exactly.
 * Since the registered URI is the website (`https://tatakai.me/...`), the
 * desktop app can no longer use `tatakai://` as its OAuth `redirect_uri` —
 * AniList would reject the authorize request with a redirect mismatch.
 *
 * Instead desktop uses an HTTPS bridge (same pattern VS Code / many Electron
 * apps use):
 *   1. Desktop builds the authorize URL with the normal WEB redirect URI plus
 *      a `state` marker (`tatakai-desktop-…`) and opens it in the system browser.
 *   2. AniList/MAL redirects the system browser to
 *      `https://tatakai.me/integration/<provider>/redirect?code=…&state=…`.
 *   3. That web page sees the desktop `state` marker and — instead of consuming
 *      the code with the browser's session — forwards it to
 *      `tatakai://integration/<provider>/redirect?code=…&state=…`.
 *   4. The OS hands the deep link to Electron (see
 *      desktop/window/deep-link.cjs), DesktopDeepLinkBridge routes it into the
 *      SPA, and the redirect page exchanges the code with the DESKTOP session.
 *
 * Result: only the https URI ever needs registering in provider dashboards.
 * The `tatakai://` deep link is purely an internal handoff, never an OAuth
 * redirect_uri.
 */

type ElectronBridge = { openExternal?: (url: string) => Promise<unknown> };

export function getElectronBridge(): ElectronBridge | undefined {
  return (window as any)?.electron;
}

/** True when running inside the Electron desktop shell. */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'file:' || !!getElectronBridge()?.openExternal;
}

export const DESKTOP_ANILIST_REDIRECT_URI =
  import.meta.env.VITE_ANILIST_DESKTOP_REDIRECT_URI || 'tatakai://integration/anilist/redirect';

export const DESKTOP_MAL_REDIRECT_URI =
  import.meta.env.VITE_MAL_DESKTOP_REDIRECT_URI || 'tatakai://integration/mal/redirect';
// NOTE: the two constants above are deprecated. Desktop no longer uses
// `tatakai://` as an OAuth redirect_uri (AniList accepts only the single https
// URI registered in its dashboard). Kept for backwards compatibility only.

/** Web redirect URI shared by web + desktop (the ONLY URI to register in provider dashboards). */
export function getWebAnilistRedirectUri(): string {
  const explicit = String(import.meta.env.VITE_ANILIST_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return `${window.location.origin}/integration/anilist/redirect`;
  }
  return 'https://tatakai.me/integration/anilist/redirect';
}

/** Web redirect URI shared by web + desktop (the ONLY URI to register in provider dashboards). */
export function getWebMalRedirectUri(): string {
  const explicit = String(import.meta.env.VITE_MAL_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return `${window.location.origin}/integration/mal/redirect`;
  }
  return 'https://tatakai.me/integration/mal/redirect';
}

/** Prefix marking an OAuth flow as desktop-initiated (carried in `state`, echoed back by the provider). */
export const DESKTOP_OAUTH_STATE_PREFIX = 'tatakai-desktop-';

/** Builds a desktop `state` marker. Safe chars only: must survive deep-link sanitization (`[^a-zA-Z0-9/\-_.?=&]` stripped). */
export function buildDesktopOAuthState(): string {
  const rand = Math.random().toString(16).slice(2, 10) + Date.now().toString(36).slice(-4);
  return `${DESKTOP_OAUTH_STATE_PREFIX}${rand}`;
}

/** True when `state` carries the desktop bridge marker (prefix check — the random suffix is not verified). */
export function isDesktopOAuthState(state: string | null | undefined): boolean {
  return typeof state === 'string' && state.startsWith(DESKTOP_OAUTH_STATE_PREFIX);
}

/** Turns an in-app route (`/integration/...?code=…`) into the internal `tatakai://` handoff URL. */
export function buildDesktopDeepLink(route: string): string {
  const path = String(route || '').replace(/^\/*/, '');
  return `tatakai://${path}`;
}

/**
 * Opens an OAuth authorize URL in the user's default system browser.
 * Returns true if handed off to the desktop shell, false otherwise (caller
 * should fall back to same-window navigation).
 */
export function openOAuthInBrowser(url: string): boolean {
  const bridge = getElectronBridge();
  if (bridge?.openExternal) {
    void bridge.openExternal(url);
    return true;
  }
  return false;
}
