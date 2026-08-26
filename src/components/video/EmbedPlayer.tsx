import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, RefreshCw, Maximize, Minimize } from "lucide-react";
import { probeUrlReachable } from "@/hooks/media/useExtensionSourceStream";

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ reason: string; statusCode?: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // One failure report per mounted URL. The probe, the watchdog and the iframe's
  // own onError can all fire for the same dead host, and each report pushes the
  // page's failover another server along — so the first one wins.
  const reportedRef = useRef(false);

  // Tell the main process an untrusted embed is on screen, so window.open from
  // any frame is treated as a popunder rather than an in-app external link.
  useEffect(() => {
    const security = (window as any).electron?.security;
    if (!security?.setEmbedActive) return;
    security.setEmbedActive(true);
    return () => {
      security.setEmbedActive(false);
    };
  }, []);

  const fail = useCallback(
    (reason: string, statusCode?: number) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      setIsLoading(false);
      setError({ reason, statusCode });
      onError?.({ reason, statusCode });
    },
    [onError]
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
  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void node.requestFullscreen?.().catch((err) => {
      console.warn("[EmbedPlayer] fullscreen request rejected:", err?.message || err);
    });
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (error) {
    const detail = error.statusCode
      ? `The embed host returned HTTP ${error.statusCode}.`
      : error.reason === "embed-load-timeout"
        ? "The embed host stopped responding."
        : "The embed host could not be reached.";
    return (
      <div
        className="w-full aspect-video bg-black flex flex-col items-center justify-center text-white"
        style={{ backgroundImage: poster ? `url(${poster})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="bg-black/80 p-6 rounded-xl flex flex-col items-center gap-3 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-lg">Embed player unavailable</p>
          <p className="text-sm text-white/60">{detail} Try another server from the list below.</p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black ${isFullscreen ? "h-full" : "aspect-video"}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-white/70 text-sm">
              Loading {language ? `${language} ` : ''}player...
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
        title={`Video player - ${language || "Embed"}`}
        referrerPolicy="no-referrer-when-downgrade"
      />

      {/* Our own fullscreen control, in case the embed's is blocked or broken. */}
      <button
        type="button"
        onClick={toggleFullscreen}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        className="absolute bottom-3 right-3 z-20 rounded-md bg-black/60 p-2 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 focus-visible:outline focus-visible:outline-2 group-hover:opacity-100 [div:hover>&]:opacity-100"
      >
        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </button>
    </div>
  );
}
