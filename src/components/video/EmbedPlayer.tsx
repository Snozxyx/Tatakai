import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useDesktopPlayerFullscreen } from "./hooks/useDesktopPlayerFullscreen";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, RefreshCw, Maximize, Minimize } from "lucide-react";
import { probeUrlReachable } from "@/hooks/media/useExtensionSourceStream";
import { isMobileNative } from "@/lib/platform/platform";
import { lockFullscreenAncestors } from "./fullscreenAncestors";

/**
 * Capacitor mobile fullscreen helpers. The native plugins are dynamically
 * imported so they never land in the web/desktop chunk — this component renders
 * on every platform, but only the in-WebView mobile shell has a device to rotate
 * or a status bar to hide. Each call is best-effort: a WebView that blocks the
 * lock still gets the CSS fixed-position fullscreen.
 */
async function lockLandscapeOrientation() {
  try {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "landscape" });
  } catch {
    /* orientation lock unavailable / blocked */
  }
}
async function unlockOrientation() {
  try {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.unlock();
  } catch {
    /* ignore */
  }
}
async function hideStatusBar() {
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.hide();
  } catch {
    /* ignore */
  }
}
async function showStatusBar() {
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.show();
  } catch {
    /* ignore */
  }
}

interface EmbedPlayerProps {
  url: string;
  poster?: string;
  language?: string;
  referer?: string;
  onError?: (context?: { statusCode?: number; reason?: string }) => void;
}

/**
 * Permissions-Policy for the embed — media playback only, no device access
 * (no camera/microphone/geolocation/usb/payment).
 *
 * Every feature is granted to `*` rather than bare. A bare feature name in
 * `allow` defaults its allowlist to `'self'`, i.e. *this* origin — so the
 * cross-origin embed was denied the very features the attribute looked like it
 * was granting. That is why the frame's own fullscreen button did nothing.
 *
 * There is also no `allowFullScreen` attribute alongside this. When both are
 * present Chromium logs "Allow attribute will take precedence over
 * 'allowfullscreen'" and honours `allow` — so the legacy attribute was inert
 * noise, and `fullscreen 'self'` from the bare name won over it.
 *
 * Note there is deliberately NO `sandbox` attribute. Several embed hosts
 * (vidnest, megacloud, …) detect a sandboxed frame and refuse to play with
 * "Please Disable Sandbox", so the attribute cost us the source entirely while
 * blocking nothing an ad layer could not route around. Popunders and click
 * hijacks are stopped in the main process instead, where they cannot be
 * detected or bypassed by the page: `desktop/security/ad-blocker.cjs` refuses
 * the `window.open` and drops ad-network requests at the network layer.
 */
const EMBED_ALLOW = [
  "accelerometer *",
  "autoplay *",
  "encrypted-media *",
  "gyroscope *",
  "picture-in-picture *",
  "fullscreen *",
  "clipboard-write *",
].join("; ");

/**
 * How long to wait for the frame to report *any* load before calling it dead.
 * Covers the case the probe cannot: a host that accepts the connection and then
 * never finishes responding, where `onLoad` and `onError` both stay silent.
 */
const LOAD_TIMEOUT_MS = 15000;

export function EmbedPlayer({ url, poster, language, referer, onError }: EmbedPlayerProps) {
  useUiTranslation();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ reason: string; statusCode?: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDesktop: isDesktopFullscreen, toggle: toggleDesktopFullscreen } = useDesktopPlayerFullscreen(containerRef, setIsFullscreen);
  const fullscreenPendingRef = useRef(false);
  const unlockAncestorsRef = useRef<(() => void) | null>(null);
  const fullscreenGenerationRef = useRef(0);
  const cssFullscreenRef = useRef(false);

  const releaseFullscreen = useCallback(() => {
    fullscreenGenerationRef.current += 1;
    cssFullscreenRef.current = false;
    try { unlockAncestorsRef.current?.(); } catch { /* ignore */ }
    unlockAncestorsRef.current = null;
    containerRef.current?.classList.remove("is-player-fullscreen");
    document.documentElement.classList.remove("app-fullscreen", "mobile-player-fullscreen");
    document.body.classList.remove("mobile-player-fullscreen");
    window.dispatchEvent(new CustomEvent('tatakai-mobile-player-fullscreen', { detail: { fullscreen: false } }));
    setIsFullscreen(false);
    if (isMobileNative()) {
      void showStatusBar();
      void unlockOrientation();
    }
  }, []);

  // On touch (Capacitor) there is no hover, so a hover-revealed control needs a
  // first tap just to appear and a second to activate — the "fullscreen needs
  // two taps" bug. Render the control visible outright on mobile; keep the
  // hover-reveal on desktop where a pointer exists.
  const isMobile = isMobileNative();

  // One failure report per mounted URL. The probe, the watchdog and the iframe's
  // own onError can all fire for the same dead host, and each report pushes the
  // page's failover another server along — so the first one wins.
  const reportedRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Tell every shell an untrusted embed is on screen, so window.open from any
  // frame is treated as a popunder rather than an in-app external link. The
  // shared bridge fans out to Electron IPC and the native
  // TatakaiLocalProxyPlugin on Android/iOS — the previous Electron-only check
  // left native `isEmbedActive` false forever, so only hard-listed ad hosts
  // were ever blocked on mobile.
  useEffect(() => {
    void import('@/core/mobile/securityBridge').then(({ setEmbedActiveBridge }) => {
      setEmbedActiveBridge(true);
    });
    return () => {
      void import('@/core/mobile/securityBridge').then(({ setEmbedActiveBridge }) => {
        setEmbedActiveBridge(false);
      });
    };
  }, []);

  const fail = useCallback(
    (reason: string, statusCode?: number) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      setIsLoading(false);
      setError({ reason, statusCode });
      onErrorRef.current?.({ reason, statusCode });
    },
    []
  );

  useEffect(() => {
    reportedRef.current = false;
    setError(null);
    setIsLoading(true);
  }, [url, reloadKey]);

  /**
   * An iframe cannot tell us the host is down: a 502 or a Cloudflare block page
   * loads fine as far as the frame is concerned, so `onLoad` fires and the app
   * keeps a broken player on screen forever. Ask the extension host — it does
   * the request without CORS in the way — and treat a hard 4xx/5xx as a dead
   * server so the watch page can move to the next one.
   *
   * Only a *status* is trusted for that verdict. `status: 0` means the probe
   * never got an HTTP answer at all: the host-server's own `fetch` threw, which
   * undici reports as the bare string "fetch failed" for DNS failure, a TLS
   * handshake reject, a connection reset — and, very commonly, for an embed CDN
   * that simply refuses a HEAD/GET arriving from something that is not a
   * browser. That last case plays perfectly well inside the iframe, so treating
   * it as a dead host cost us the source *and* blocked its URL for five minutes
   * (see `isEmbedHostFailure` in WatchPage). A transport failure is therefore
   * only logged; the iframe gets its chance and `LOAD_TIMEOUT_MS` below is what
   * catches a host that really never answers.
   */
  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    void (async () => {
      const result = await probeUrlReachable(url, referer);
      if (cancelled || !result.checked || result.ok) return;
      const host = (() => {
        try {
          return new URL(url).host;
        } catch {
          return "embed host";
        }
      })();

      if (result.status < 400) {
        console.info(
          `[EmbedPlayer] probe could not reach ${host} (${result.error || "no response"}) — ` +
            `letting the frame try anyway, watchdog has ${LOAD_TIMEOUT_MS}ms`
        );
        return;
      }

      console.warn(`[EmbedPlayer] ${host} answered HTTP ${result.status} — failing over`);
      fail(`embed-host-${result.status}`, result.status);
    })();

    return () => {
      cancelled = true;
    };
  }, [url, referer, reloadKey, fail]);

  // Watchdog for a host that connects and then stalls — neither onLoad nor
  // onError ever arrives, so nothing else would ever end the spinner.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      fail("embed-load-timeout");
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoading, url, reloadKey, fail]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    fail("embed-iframe-error");
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  /**
   * Fullscreen the *container*, not the iframe.
   *
   * The frame's own button depends on the host's script surviving whatever ad
   * blocking is in the way, and several hosts ship a button that only calls
   * `requestFullscreen` on an element inside their own document — which does
   * nothing useful when they are the ones being framed. Going fullscreen on our
   * wrapper takes the iframe with it and works regardless of what the embed does.
   */
  const toggleFullscreen = useCallback(async () => {
    const node = containerRef.current;
    if (!node) return;

    if (isDesktopFullscreen) return toggleDesktopFullscreen();
    if (fullscreenPendingRef.current) return;
    fullscreenPendingRef.current = true;
    try {
      const isMobile = isMobileNative();
      const currentlyFull = node.classList.contains("is-player-fullscreen") || document.fullscreenElement === node;

      // A transformed/filtered/contained ancestor reparents `position: fixed`
      // (player shifted right + clipped). Neutralize them for every CSS-fallback
      // entry, restore on exit.
      const lockAncestors = () => {
        try {
          unlockAncestorsRef.current?.();
        } catch { /* ignore */ }
        unlockAncestorsRef.current = lockFullscreenAncestors(node);
      };
      if (!currentlyFull) {
        if (isMobile) {
          // Capacitor WebView: the element Fullscreen API is flaky inside the
          // WebView, so use the CSS fixed-position fullscreen and rotate the
          // device to landscape + hide the status bar (mirrors MobileVideoPlayer).
          lockAncestors();
          cssFullscreenRef.current = true;
          node.classList.add("is-player-fullscreen");
          // Signal before rotation: landscape crosses the desktop-nav breakpoint.
          document.documentElement.classList.add("app-fullscreen", "mobile-player-fullscreen");
          document.body.classList.add("mobile-player-fullscreen");
          window.dispatchEvent(new CustomEvent('tatakai-mobile-player-fullscreen', { detail: { fullscreen: true } }));
          setIsFullscreen(true);
          const generation = fullscreenGenerationRef.current;
          await hideStatusBar();
          if (generation !== fullscreenGenerationRef.current) {
            void showStatusBar();
            return;
          }
          await lockLandscapeOrientation();
          if (generation !== fullscreenGenerationRef.current) {
            void showStatusBar();
            void unlockOrientation();
          }
        } else {
          try {
            await node.requestFullscreen();
          } catch {
            lockAncestors();
            cssFullscreenRef.current = true;
            node.classList.add("is-player-fullscreen");
            // Locks the document behind the player (scrollbar/wheel) while the
            // CSS fallback is active — see html.app-fullscreen in index.css.
            document.documentElement.classList.add("app-fullscreen");
            setIsFullscreen(true);
          }
        }
      } else {
        releaseFullscreen();
        if (!isMobile && document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
        }
      }
    } finally { fullscreenPendingRef.current = false; }
  }, [isDesktopFullscreen, toggleDesktopFullscreen, releaseFullscreen]);

  useEffect(() => {
    if (isDesktopFullscreen) return;
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current || cssFullscreenRef.current);
    document.addEventListener("fullscreenchange", onChange);

    // Esc / OS chrome leaving fullscreen must clear the CSS-class fallback too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && containerRef.current?.classList.contains("is-player-fullscreen")) {
        releaseFullscreen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
      releaseFullscreen();
    };
  }, [isDesktopFullscreen, releaseFullscreen]);

  useEffect(() => {
    if (error && !isDesktopFullscreen) releaseFullscreen();
  }, [error, isDesktopFullscreen, releaseFullscreen]);

  if (error) {
    const detail = error.statusCode
      ? t('player.embedHostHttp', { status: error.statusCode })
      : error.reason === "embed-load-timeout"
        ? t('player.embedTimeout')
        : t('player.embedUnreachable');
    return (
      <div
        className="w-full aspect-video bg-black flex flex-col items-center justify-center text-white"
        style={{ backgroundImage: poster ? `url(${poster})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="bg-black/80 p-6 rounded-xl flex flex-col items-center gap-3 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-lg">{t('player.embedUnavailable')}</p>
          <p className="text-sm text-white/60">{detail} {t('player.embedTryAnother')}</p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`video-player-container relative w-full bg-black ${isFullscreen ? "h-full is-player-fullscreen" : "aspect-video"}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-white/70 text-sm">
              {language ? t('player.embedLoadingLanguage', { language }) : t('player.embedLoadingGeneric')}
            </p>
          </div>
        </div>
      )}

      <iframe
        key={reloadKey}
        src={url}
        className="w-full h-full border-0"
        allow={EMBED_ALLOW}
        onLoad={handleLoad}
        onError={handleIframeError}
        title={t('player.embedFrameTitle', { language: language || "Embed" })}
        referrerPolicy="no-referrer-when-downgrade"
      />

      {/* Our own fullscreen control, in case the embed's is blocked or broken. */}
      <button
        type="button"
        onClick={toggleFullscreen}
        data-player-fullscreen={isFullscreen ? "active" : "inactive"}
        title={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
        aria-label={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
        className={`absolute bottom-3 right-3 z-20 rounded-md bg-black/60 p-2 text-white transition-opacity hover:bg-black/80 focus:opacity-100 focus-visible:outline focus-visible:outline-2 group-hover:opacity-100 [div:hover>&]:opacity-100 ${isMobile ? "opacity-100" : "opacity-0"}`}
      >
        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </button>
    </div>
  );
}
