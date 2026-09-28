/**
 * Desktop OAuth helpers.
 *
 * In the desktop (Electron) build the renderer runs under the `file:` protocol
 * with no localhost server, so the normal web redirect (`window.location.origin
 * /integration/...`) cannot receive the OAuth callback. Instead we launch the
 * user's system browser and route the provider back through the app's registered
 * `tatakai://` deep-link protocol (see desktop/window/deep-link.cjs). The main
 * process forwards the deep link to the renderer via `window.electron.onNavigate`,
 * which DesktopDeepLinkBridge pushes into the SPA router.
 *
 * IMPORTANT: the `tatakai://` redirect URIs below must also be registered in the
 * AniList and MyAnimeList developer app settings, otherwise the provider rejects
 * the authorize request.
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
