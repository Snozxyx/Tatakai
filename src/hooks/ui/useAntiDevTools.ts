import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsDesktopApp } from './useIsNativeApp';
import {
  clearDevtoolsTrapState,
  isDevtoolsGuardBypassedHost,
  isDevtoolsLockActive,
  isLikelyDevtoolsOpenByDebugger,
  isLikelyDevtoolsOpenByViewport,
  persistDevtoolsTrapState,
} from '@/lib/devtoolsTrap';

/**
 * Detects if the browser developer tools are open and redirects to a
 * blocked page. Skipped entirely in the desktop (Electron) app and in
 * non‑production environments so developers can work normally.
 *
 * Uses the `disable-devtool` library (https://github.com/theajack/disable-devtool)
 * for robust detection in production, plus custom checks as fallback.
 */
export function useAntiDevTools() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktopApp();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef(false);
  const disableDevtoolRef = useRef<any>(null);
  const tickCountRef = useRef(0);

  useEffect(() => {
    // Skip detection in:
    // 1. Electron desktop app (devtools are legitimate there)
    // 2. Local development (localhost)
    // 3. Non-browser environments
    if (isDesktop) return;
    if (typeof window === 'undefined') return;

    const disableGuard =
      String(import.meta.env.VITE_DISABLE_DEVTOOLS_GUARD ?? 'false').toLowerCase() === 'true';
    if (disableGuard) return;

    if (isDevtoolsGuardBypassedHost()) {
      clearDevtoolsTrapState();
      return;
    }

    const redirect = (reason: string) => {
      const payload = persistDevtoolsTrapState(reason);

      if (window.location.pathname === '/devtools-blocked') {
        triggeredRef.current = true;
        return;
      }

      if (triggeredRef.current) return;
      triggeredRef.current = true;

      // eslint-disable-next-line no-console
      console.error(JSON.stringify(payload, null, 2));

      navigate('/devtools-blocked', {
        replace: true,
        state: { trapPayload: payload },
      });
    };

    if (isDevtoolsLockActive() && window.location.pathname !== '/devtools-blocked') {
      redirect('lock-active');
      return;
    }

    // ── Primary: disable-devtool library ──────────────────────────────
    // Dynamically import to keep bundle light in dev
    import('disable-devtool').then((mod) => {
      const DisableDevtool: any = mod.default;
      disableDevtoolRef.current = DisableDevtool({
        ondevtoolopen: (_type: string) => {
          redirect('disable-devtool-detector');
        },
        // Disable the built-in "close window" behaviour — we redirect instead
        disableMenu: true,
        clearLog: true,
        clearIntervalWhenDev: false,
        // Check interval in ms
        interval: 1000,
        // Detect all methods
        detectors: [0, 1, 2, 3, 4, 5, 6, 7],
      });
    }).catch(() => {
      // Fallback: if dynamic import fails, rely on manual checks below
    });

    // ── Method 1: Size-based detection ────────────────────────────────
    // DevTools adds ~100–400 px when docked.
    const checkSizeThreshold = () => {
      if (isLikelyDevtoolsOpenByViewport(200)) {
        redirect('viewport-detection');
        return true;
      }
      return false;
    };

    // ── Method 2: console.log profile trick ───────────────────────────
    // DevTools expands objects in the console by calling getters eagerly.
    let devtoolsOpenViaConsole = false;
    const detectObj = Object.defineProperty({}, '_', {
      get() {
        devtoolsOpenViaConsole = true;
        return undefined;
      },
    });

    const checkConsole = () => {
      devtoolsOpenViaConsole = false;
      // eslint-disable-next-line no-console
      console.log('%c', detectObj);
      if (devtoolsOpenViaConsole) {
        redirect('console-getter-detection');
        return true;
      }
      return false;
    };

    // ── Method 3: debugger timing trick ──────────────────────────────
    // The debugger statement is fast when devtools is closed but slow when open.
    const checkDebuggerTiming = () => {
      if (isLikelyDevtoolsOpenByDebugger(180)) {
        redirect('debugger-timing-detection');
        return true;
      }
      return false;
    };

    // Run checks at an interval
    const runChecks = () => {
      if (triggeredRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      if (isDevtoolsLockActive() && window.location.pathname !== '/devtools-blocked') {
        redirect('lock-active');
        return;
      }

      if (checkSizeThreshold()) return;

      tickCountRef.current += 1;
      // Run console getter check less frequently to avoid noisy logs.
      if (tickCountRef.current % 3 === 0 && checkConsole()) return;
      // Run debugger timing less often due to CPU impact.
      if (tickCountRef.current % 4 === 0) checkDebuggerTiming();
    };

    // Initial check with a slight delay (allow page to settle)
    const initTimer = setTimeout(() => {
      if (checkSizeThreshold()) return;
      checkConsole();
      checkDebuggerTiming();
    }, 400);

    // Polling interval (less frequent = less performance impact)
    intervalRef.current = setInterval(runChecks, 750);

    // Run size check on resize events (common when undocking devtools)
    const handleResize = () => {
      if (!triggeredRef.current) checkSizeThreshold();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !triggeredRef.current) {
        runChecks();
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrlLike = event.ctrlKey || event.metaKey;

      const blockedCombos =
        key === 'f12' ||
        (ctrlLike && event.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'k')) ||
        (ctrlLike && !event.shiftKey && key === 'u');

      if (blockedCombos) {
        event.preventDefault();
        event.stopPropagation();
        redirect(`blocked-shortcut-${key}`);
      }
    };

    // const handleContextMenu = (event: MouseEvent) => {
    //   const target = event.target as HTMLElement | null;
    //   const allowMenu = Boolean(target?.closest?.('[data-allow-context-menu="true"]'));
    //   if (allowMenu) return;
    //   event.preventDefault();
    //   redirect('blocked-context-menu');
    // };

    const handleFocus = () => {
      if (!triggeredRef.current) runChecks();
    };

    document.addEventListener('keydown', handleKeydown, { capture: true });
    // document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(initTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('keydown', handleKeydown, { capture: true } as EventListenerOptions);
      // document.removeEventListener('contextmenu', handleContextMenu, { capture: true } as EventListenerOptions); //to strict
      window.removeEventListener('focus', handleFocus);
      // Tear down disable-devtool if it was initialised
      if (disableDevtoolRef.current && typeof disableDevtoolRef.current === 'function') {
        try { disableDevtoolRef.current(); } catch { /* ignore */ }
      }
    };
  }, [isDesktop, navigate]);
}
