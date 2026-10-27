import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { dismissMobileOverlay } from './dismiss-mobile-overlay';
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
  useUiTranslation();
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
            if (dismissMobileOverlay(document)) return;
            // Locked mobile player: first back unlocks instead of leaving.
            const lockBtn = document.querySelector('[data-player-lock="locked"]');
            if (lockBtn) {
              (lockBtn as HTMLElement).click();
              return;
            }
            const fullscreenButton = document.querySelector<HTMLElement>('[data-player-fullscreen="active"]');
            if (fullscreenButton) {
              fullscreenButton.click();
              return;
            }
          } catch {
            /* fall through to router */
          }

          // 2. In-app history.
          const atRoot = pathRef.current === '/' || pathRef.current === '/home';
          if (!atRoot) {
            if (canGoBack || (window.history.state?.idx ?? 0) > 0) navigate(-1);
            else navigate('/', { replace: true });
            return;
          }

          // 3. Double-press to exit at root.
          const now = Date.now();
          if (now - lastRootPress.current < 2000) {
            void App.exitApp();
          } else {
            lastRootPress.current = now;
            toast.info(uiI18n.t('app.press_back_again_to_exit_deccaac6'), { id: 'mobile-back-exit', duration: 1800 });
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
