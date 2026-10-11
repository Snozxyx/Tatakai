import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isCapacitor } from '@/lib/platform/platform';

/**
 * Consumes `tatakai://` (and https universal-link) deep links on Capacitor and
 * routes them into the SPA router — the mobile counterpart to
 * `DesktopDeepLinkBridge`. This is what lets the mobile OAuth flow complete:
 * the system browser redirects to `tatakai://integration/anilist/redirect?code=…`,
 * the OS hands it to `@capacitor/app`'s `appUrlOpen`, and we push the sanitized
 * route so the matching RedirectPage runs the token exchange.
 *
 * Renders nothing. Safe to mount unconditionally — no-ops off Capacitor.
 */
export function MobileDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCapacitor()) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const followRoute = (route: string, replace = false) => {
          if (cancelled) return;
          if (route.startsWith('/integration/') || route.startsWith('/api/mal/redirect')) {
            void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => undefined);
          }
          navigate(route, { replace });
        };
        // Cold start: the launch URL is NOT delivered via appUrlOpen.
        try {
          const launch = await App.getLaunchUrl();
          const route = launch?.url ? toRoute(launch.url) : null;
          if (route) followRoute(route, true);
        } catch {
          /* no launch url */
        }
        const handle = await App.addListener('appUrlOpen', ({ url }) => {
          const route = toRoute(url);
          if (route) followRoute(route);
        });
        if (cancelled) {
          void handle.remove();
        } else {
          cleanup = () => void handle.remove();
        }
      } catch {
        /* plugin missing — ignore */
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [navigate]);

  return null;
}

/**
 * Turn a deep-link URL into an in-app route path, or null when it isn't one.
 *
 * Accepts:
 *  - `tatakai://integration/anilist/redirect?code=…`
 *  - `tatakai://anime/123/ep/5` → `/anime/123?ep=5` (native share shorthand)
 *  - `tatakai://watch/abc?ep=5`, `tatakai://manga/read/1?chapterKey=x`
 *  - `https://tatakai.me/anime/123`, `https://app.tatakai.me/watch/…`
 *
 * NOTE: for the custom scheme, `new URL('tatakai://anime/123').pathname` is
 * `/123` with host `anime` — the host IS the first path segment, so it must
 * be re-attached (the old code dropped it and routed to `/123` → NotFound).
 */
export function toRoute(raw: string): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    const isCustomScheme = u.protocol === 'tatakai:';
    const host = String(u.host || '').toLowerCase();

    let path: string;
    if (isCustomScheme) {
      // `tatakai://anime/123/ep/5` → host `anime` + pathname `/123/ep/5`.
      // `tatakai:///watch/x` (empty host) → pathname only.
      path = host ? `/${host}${u.pathname}${u.search}${u.hash}` : `${u.pathname}${u.search}${u.hash}`;
      // `tatakai:watch/x` (opaque, no slashes) → pathname is `watch/x`.
      if (!path.startsWith('/')) path = `/${path}`;
    } else {
      if (!['https:', 'http:'].includes(u.protocol) || !/(^|\.)tatakai\.me$/i.test(u.hostname)) return null;
      path = `${u.pathname}${u.search}${u.hash}`;
    }
    if (!path.startsWith('/')) return `/${path}`;

    // Shorthand: /anime/:id/ep/:n → /anime/:id?ep=:n (AnimePage resolves it).
    const epMatch = path.match(/^\/anime\/([^/]+)\/ep\/([^/?#]+)([?#].*)?$/i);
    if (epMatch) {
      const [, id, ep, rest] = epMatch;
      const sep = rest && rest.startsWith('?') ? '&' : '?';
      return `/anime/${id}${rest || ''}${rest ? sep : '?'}ep=${encodeURIComponent(ep)}`;
    }
    return path;
  } catch {
    // Bare `tatakai:anime/1/ep/2` without slashes.
    const bare = raw.match(/^tatakai:(.+)$/i);
    if (bare) return bare[1].startsWith('/') ? bare[1] : `/${bare[1]}`;
    return null;
  }
}
