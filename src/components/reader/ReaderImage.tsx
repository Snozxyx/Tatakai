import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import {
  getMobileHeaderedImageBlobUrl,
  getMobileProxyImageBlobUrl,
  isMobileProxyUrl,
  isNativeProxyUrl,
  normalizeMobileHeaders,
} from "@/core/extensions/mobile/mobileProxy";
import { triggerHaptic } from "@/lib/haptics";
import { shouldUseReaderHeaderBlob } from "@/lib/reader/imageLifecycle";

/** Minimal page shape the reader image needs. `MangaPage` and the custom-source
 *  `CustomReadPage` are both structurally compatible with this. */
export interface ReaderPageImage {
  pageNumber: number;
  imageUrl: string;
  proxiedImageUrl?: string | null;
  /** Original upstream URL for an in-app proxy page (re-registration fallback). */
  originalUrl?: string | null;
  /** Upstream headers for dead-token re-registration (see MangaPage.headers). */
  headers?: Record<string, string> | null;
  width?: number | null;
  height?: number | null;
}

/**
 * One reader page image. Blob mode fetches the (proxied) URL and shows an object
 * URL so the exact image headers the proxy replays are reused; native mode points
 * the `<img>` straight at the URL — EXCEPT header-gated plain URLs, which always
 * resolve through the native client (bare `<img>` drops the CDN Referer and
 * 403s — the "some pages load, some don't" bug).
 *
 * In-app proxy pages (`mobile-proxy://`) always resolve through the native
 * HTTP client with header replay. The resolved blob URL is cached by the proxy
 * module, so re-renders are free. Transient failures retry with backoff and
 * surface a tap-to-retry state instead of a permanent broken-image icon.
 *
 * Shared by the manga reader (`MangaReaderPage`) and custom-source read pages so
 * the blob/proxy subtlety lives in one place.
 */
export function ReaderImage({ page, mode, style, eager, onRetryChapter }: {
  page: ReaderPageImage;
  mode: "native" | "blob";
  style: CSSProperties;
  eager: boolean;
  onRetryChapter?: () => void;
}) {
  const src = page.proxiedImageUrl || page.imageUrl;
  // Native loopback (`http://127.0.0.1:<port>/stream/…`) loads directly in
  // `<img>` like desktop — headers are replayed server-side, CORS is `*`.
  const isNativeLoopback = isNativeProxyUrl(src);
  const isProxy = !isNativeLoopback && isMobileProxyUrl(src);
  const headerCount = Object.keys(normalizeMobileHeaders(page.headers)).length;
  // Header-gated plain URL: bare <img> will 403 → must go through blob path
  // even when the user picked "native" loading. Native loopback URLs are
  // already header-aware server-side and must stay on the direct <img> path.
  const needsHeaderBlob = shouldUseReaderHeaderBlob({
    src,
    headerCount,
    isMobileProxy: isProxy,
    isNativeLoopback,
  });
  // The native proxy is already the zero-copy/header-replay transport. Even an
  // old "blob" preference must not download that loopback response a second
  // time into JS memory.
  const useBlobPath = !isNativeLoopback && (isProxy || mode === "blob" || needsHeaderBlob);
  const headerSignature = JSON.stringify(normalizeMobileHeaders(page.headers));
  const sourceIdentity = [
    src,
    mode,
    page.originalUrl || "",
    page.imageUrl,
    headerSignature,
  ].join("\u0000");

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mountedRef = useRef(true);
  const retryOwnedBlobRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A successful plain-URL automatic retry mints its own object URL outside
  // the primary fetch effect. Keep that URL alive while the image uses it, but
  // release it when the source changes or this page unmounts.
  useEffect(() => () => {
    const owned = retryOwnedBlobRef.current;
    retryOwnedBlobRef.current = null;
    if (owned) URL.revokeObjectURL(owned);
  }, [sourceIdentity]);

  // Reader routes do not remount between chapters. Reset every source-bound
  // bit when React reuses this component (paged mode and old page-number keys
  // are especially prone to it), otherwise a failed page from chapter N keeps
  // chapter N+1 in the retry UI without ever assigning its new `src`.
  useEffect(() => {
    setBlobUrl(null);
    setLoaded(false);
    setFailed(false);
  }, [sourceIdentity]);

  useEffect(() => {
    if (!useBlobPath) return;
    setFailed(false);
    // Don't reset blobUrl to null on nonce retry when we already have one —
    // keeps the old frame visible behind the spinner.
    let cancelled = false;
    let obj: string | null = null;
    let owned = false;
    const run = async () => {
      try {
        if (isProxy) {
          const resolved = await getMobileProxyImageBlobUrl(src, {
            originalUrl: page.originalUrl || page.imageUrl,
            headers: page.headers || undefined,
            retries: 3,
          });
          if (cancelled || !mountedRef.current) return;
          if (resolved) {
            setBlobUrl(resolved);
            setFailed(false);
          } else {
            setFailed(true);
          }
          return;
        }
        if (needsHeaderBlob) {
          const resolved = await getMobileHeaderedImageBlobUrl(src, page.headers, { retries: 3 });
          if (cancelled || !mountedRef.current) return;
          if (resolved) {
            setBlobUrl(resolved);
            setFailed(false);
          } else {
            setFailed(true);
          }
          return;
        }
        for (let i = 0; i < 3; i++) {
          try {
            const r = await fetch(src);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const b = await r.blob();
            if (!b || b.size === 0) throw new Error("empty");
            if (cancelled || !mountedRef.current) return;
            obj = URL.createObjectURL(b);
            owned = true;
            setBlobUrl(obj);
            setFailed(false);
            return;
          } catch {
            if (i + 1 < 3) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
          }
        }
        if (!cancelled && mountedRef.current) setFailed(true);
      } catch {
        if (!cancelled && mountedRef.current) setFailed(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (owned && obj) URL.revokeObjectURL(obj);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, mode, isProxy, needsHeaderBlob, page.originalUrl, page.imageUrl, headerSignature, nonce]);

  // Automatic retry ladder after a failure — Android WebView commonly drops
  // CapacitorHttp requests mid-flight on suspend/radio-swap, and manual
  // tap-to-retry was the only escape. Up to 3 auto-attempts with growing
  // backoff; a single blip no longer leaves a permanent black page.
  useEffect(() => {
    if (!failed || !useBlobPath) return;
    let cancelled = false;
    const delays = [750, 2000, 4500];
    const chain = async () => {
      for (const delay of delays) {
        await new Promise((r) => setTimeout(r, delay));
        if (cancelled || !mountedRef.current) return;
        try {
          let resolved: string | null = null;
          // Proxy/header helpers return cache-owned object URLs. Only the
          // plain-fetch branch creates a URL owned by this retry attempt; an
          // obsolete chapter must never revoke a shared cached page URL when
          // its async work finishes after cancellation.
          let ownsResolved = false;
          if (isProxy) {
            resolved = await getMobileProxyImageBlobUrl(src, {
              originalUrl: page.originalUrl || page.imageUrl,
              headers: page.headers || undefined,
              retries: 1,
            });
          } else if (needsHeaderBlob) {
            resolved = await getMobileHeaderedImageBlobUrl(src, page.headers, { retries: 1 });
          } else {
            const r = await fetch(src);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const b = await r.blob();
            if (!b || b.size === 0) throw new Error("empty");
            resolved = URL.createObjectURL(b);
            ownsResolved = true;
          }
          if (cancelled || !mountedRef.current) {
            if (resolved && ownsResolved) URL.revokeObjectURL(resolved);
            return;
          }
          if (resolved) {
            if (ownsResolved) {
              const previous = retryOwnedBlobRef.current;
              if (previous && previous !== resolved) URL.revokeObjectURL(previous);
              retryOwnedBlobRef.current = resolved;
            }
            setBlobUrl(resolved);
            setFailed(false);
            return;
          }
        } catch {
          /* fall through to the next delay */
        }
      }
    };
    void chain();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, useBlobPath, isProxy, needsHeaderBlob, src, page.originalUrl, page.imageUrl, headerSignature]);

  // Foreground resume refresh: Android WebView can silently drop in-flight
  // blob URLs and image decodes while suspended. On return to active, bump
  // `nonce` on any page still showing a spinner or a broken state so the
  // fetcher above re-runs through the (possibly still warm) proxy cache.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (failed) {
        // Recreate a direct <img>, or restart the blob resolver, after a WebView
        // suspension left it in the error UI.
        setFailed(false);
        setLoaded(false);
        setBlobUrl(null);
        setNonce((n) => n + 1);
        return;
      }
      if (!loaded || (useBlobPath && !blobUrl)) setNonce((n) => n + 1);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loaded, failed, useBlobPath, blobUrl]);

  // Reserve vertical space before the image loads so continuous-scroll append /
  // prepend doesn't cause layout jumps. Use the known aspect ratio when the
  // provider reported dimensions; otherwise hold a compact placeholder (the old
  // 70vh blank per page made failures look like huge black gaps).
  const aspectRatio =
    page.width && page.height ? `${page.width} / ${page.height}` : undefined;
  const reserve: CSSProperties = aspectRatio
    ? { aspectRatio }
    : loaded
      ? {}
      : { minHeight: "32vh" };

  // Proxy/headered payloads render from their resolved blob URL; while it
  // resolves, hold the placeholder (never hand the opaque token URL to `<img>`).
  const imgSrc = isProxy || needsHeaderBlob ? blobUrl ?? undefined : mode === "blob" ? blobUrl ?? src : src;
  const showImg = Boolean(imgSrc) && !failed;

  const retry = () => {
    void triggerHaptic("reader-toggle");
    setFailed(false);
    setLoaded(false);
    setBlobUrl(null);
    setNonce((n) => n + 1);
    // Signed page URLs can expire. Refresh the chapter response (or fail over
    // its provider) as well as recreating this image.
    onRetryChapter?.();
  };

  if (failed || (!showImg && useBlobPath && failed)) {
    return (
      <div
        data-page={page.pageNumber}
        className="mx-auto flex w-full flex-col items-center justify-center gap-2 rounded-none bg-white/[0.04] px-6 py-14 text-center"
        style={{ ...style, minHeight: "32vh" }}
      >
        <p className="text-sm text-muted-foreground">Page {page.pageNumber} failed to load</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/10 active:scale-95"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto" style={style}>
      {!loaded && showImg && (
        <div
          className="mx-auto flex items-center justify-center rounded-none bg-white/[0.03]"
          style={{ ...style, ...reserve }}
          aria-hidden
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
        </div>
      )}
      {showImg ? (
        <img
          data-page={page.pageNumber}
          src={imgSrc}
          alt={`Page ${page.pageNumber}`}
          className="mx-auto block h-auto rounded-none bg-black/30"
          style={{ ...style, ...reserve, contentVisibility: "auto" }}
          loading={eager ? "eager" : "lazy"}
          // First pages of the chapter win the bandwidth race; the rest wait.
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            // Bare <img> failed (hotlink 403 etc). If headers exist, the blob
            // path will succeed — flip to it by flagging failure so the retry
            // UI offers a native-header reload instead of staying broken.
            setFailed(true);
            setLoaded(true);
          }}
        />
      ) : null}
      {/* Direct <img> fallback failed but headers exist → offer headered reload */}
      {!showImg && !useBlobPath && headerCount > 0 && (
        <div
          data-page={page.pageNumber}
          className="mx-auto flex w-full flex-col items-center justify-center gap-2 rounded-none bg-white/[0.04] px-6 py-14 text-center"
          style={{ minHeight: "32vh" }}
        >
          <p className="text-sm text-muted-foreground">Page {page.pageNumber} needs a headered reload</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
        </div>
      )}
    </div>
  );
}
