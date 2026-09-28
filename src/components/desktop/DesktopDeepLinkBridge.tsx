import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Consumes `tatakai://` deep links forwarded by the Electron main process
 * (desktop/window/deep-link.cjs -> `navigate` IPC -> preload `onNavigate`) and
 * routes them into the SPA router. This is what lets the desktop OAuth flow
 * complete: the system browser redirects to `tatakai://integration/anilist/redirect
 * ?code=...`, the main process hands the sanitized route here, and we push it so
 * the corresponding RedirectPage runs the token exchange with the app's session.
 *
 * Renders nothing. Safe to mount unconditionally — it no-ops off desktop.
 */
export function DesktopDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const bridge = (window as any)?.electron;
    if (!bridge?.onNavigate) return;

    const unsubscribe = bridge.onNavigate((route: string) => {
      if (typeof route !== 'string' || !route.startsWith('/')) return;
      navigate(route);
    });

    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigate]);

  return null;
}
