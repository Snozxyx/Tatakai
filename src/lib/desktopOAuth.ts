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

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

type ElectronBridge = { openExternal?: (url: string) => Promise<unknown> };

/** Packaged apps hand OAuth to a system browser, preserving the app WebView. */
export function isNativeOAuthApp(): boolean {
  return Capacitor.isNativePlatform() || isDesktopApp();
}

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

function usableWebRedirect(explicit: string): boolean {
  if (!explicit) return false;
  // A comma-joined pair is one literal (invalid) URL to MAL/AniList — never use it.
  if (explicit.includes(',')) return false;
  if (!isNativeOAuthApp()) return true;
  try {
    const url = new URL(explicit);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

/**
 * Takes the first URL of a possibly comma-separated env value (logs when the
 * env is misconfigured) so callers never send MAL/AniList a literal pair that
 * triggers their HTTP Basic `invalid_client` prompt.
 */
function firstRedirectUri(explicit: string): string {
  const first = String(explicit || '').split(',')[0]?.trim() ?? '';
  if (!first) return '';
  if (String(explicit).includes(',')) {
    console.warn(
      '[OAuth] Redirect URI env contains a comma-separated pair; using only the first URL. ' +
      'Register exactly one URL per provider — a pair triggers an HTTP login prompt that loops.',
    );
  }
  return first;
}

/** Web redirect URI shared by web + desktop (the ONLY URI to register in provider dashboards). */
export function getWebAnilistRedirectUri(): string {
  const explicit = firstRedirectUri(String(import.meta.env.VITE_ANILIST_REDIRECT_URI || '').trim());
  if (usableWebRedirect(explicit)) return explicit;
  if (!isNativeOAuthApp() && typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return `${window.location.origin}/integration/anilist/redirect`;
  }
  return 'https://tatakai.me/integration/anilist/redirect';
}

/** Web redirect URI shared by web + desktop (the ONLY URI to register in provider dashboards). */
export function getWebMalRedirectUri(): string {
  const explicit = firstRedirectUri(String(import.meta.env.VITE_MAL_REDIRECT_URI || '').trim());
  if (usableWebRedirect(explicit)) return explicit;
  if (!isNativeOAuthApp() && typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return `${window.location.origin}/api/mal/redirect`;
  }
  return 'https://tatakai.me/api/mal/redirect';
}

/** Prefix marking an OAuth flow as desktop-initiated (carried in `state`, echoed back by the provider). */
export const DESKTOP_OAUTH_STATE_PREFIX = 'tatakai-desktop-';

/** Builds a desktop `state` marker. Safe chars only: must survive deep-link sanitization (`[^a-zA-Z0-9/\-_.?=&]` stripped). */
export function buildDesktopOAuthState(): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
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
export async function openOAuthInBrowser(url: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return true;
  }
  const bridge = getElectronBridge();
  if (bridge?.openExternal) {
    await bridge.openExternal(url);
    return true;
  }
  return false;
}
