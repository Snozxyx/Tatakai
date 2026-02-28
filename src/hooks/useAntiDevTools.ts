import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsDesktopApp } from './useIsNativeApp';

/**
 * Detects if the browser developer tools are open and redirects to a
 * blocked page. Skipped entirely in the desktop (Electron) app and in
 * non‑production environments so developers can work normally.
 */
export function useAntiDevTools() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktopApp();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    // Skip detection in:
    // 1. Electron desktop app (devtools are legitimate there)
    // 2. Local development (localhost)
    // 3. Non-browser environments
    if (isDesktop) return;
    if (typeof window === 'undefined') return;

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.endsWith('.local');

    if (isLocalhost) return;

    const redirect = () => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      navigate('/devtools-blocked', { replace: true });
    };

    // ── Method 1: Size-based detection ────────────────────────────────
    // DevTools adds ~100–400 px when docked.
    const checkSizeThreshold = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      // A large difference suggests docked devtools
      if (widthDiff > 200 || heightDiff > 200) {
        redirect();
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
        redirect();
        return true;
      }
      return false;
    };

    // ── Method 3: debugger timing trick ──────────────────────────────
    // The debugger statement is fast when devtools is closed but slow when open.
    const checkDebuggerTiming = () => {
      const startTime = performance.now();
      // eslint-disable-next-line no-debugger
      debugger; // nocheck
      const endTime = performance.now();
      if (endTime - startTime > 200) {
        redirect();
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
      checkSizeThreshold();
      // Only run console check on first few ticks (not continuously noisy)
    };

    // Initial check with a slight delay (allow page to settle)
    const initTimer = setTimeout(() => {
      checkSizeThreshold();
      checkConsole();
    }, 1500);

    // Polling interval (less frequent = less performance impact)
    intervalRef.current = setInterval(runChecks, 2000);

    // Run size check on resize events (common when undocking devtools)
    const handleResize = () => {
      if (!triggeredRef.current) checkSizeThreshold();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [isDesktop, navigate]);
}
