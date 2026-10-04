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
        const handle = await App.addListener('appUrlOpen', ({ url }) => {
          const route = toRoute(url);
          if (route) navigate(route);
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
 * Accepts both the custom scheme (`tatakai://path?...`) and https links whose
 * path should be routed. Only same-shape internal paths are honored.
 */
function toRoute(raw: string): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    // `tatakai://integration/anilist/redirect?code=…` → pathname is
    // `/integration/...` when parsed with the custom scheme. For https links,
    // take pathname + search directly.
    const u = new URL(raw);
    const path = `${u.pathname}${u.search}${u.hash}`;
    if (!path.startsWith('/')) return `/${path}`;
    return path;
  } catch {
    // Fallback: strip a leading `scheme://host` manually.
    const m = raw.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)$/i);
    return m ? m[1] : null;
  }
}
