import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { isCapacitor } from '@/lib/platform/platform';

/**
 * MobileBackHandler — Capacitor hardware-back behavior:
 *  1. Fullscreen video / locked player / open dialog → exit that first (Escape).
 *  2. In-app history → go back.
 *  3. At root → double-press within 2s to exit, else a hint toast.
 *
 * Mount once in MainLayout. No-op off Capacitor.
 */
export function MobileBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastRootPress = useRef(0);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (!isCapacitor()) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          // 1. Let fullscreen / dialogs consume the press first.
          try {
            if (document.fullscreenElement) {
              void document.exitFullscreen().catch(() => undefined);
              return;
            }
            const openDialog = document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]');
            if (openDialog) {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
              return;
            }
            // Locked mobile player: first back unlocks instead of leaving.
            const lockBtn = document.querySelector('[data-player-lock="locked"]');
            if (lockBtn) {
              (lockBtn as HTMLElement).click();
              return;
            }
          } catch {
            /* fall through to router */
          }

          // 2. In-app history.
          const atRoot = pathRef.current === '/' || pathRef.current === '/home';
          if (!atRoot && (canGoBack || window.history.length > 1)) {
            navigate(-1);
            return;
          }

          // 3. Double-press to exit at root.
          const now = Date.now();
          if (now - lastRootPress.current < 2000) {
            void App.exitApp();
          } else {
            lastRootPress.current = now;
            toast.info('Press back again to exit', { id: 'mobile-back-exit', duration: 1800 });
          }
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
