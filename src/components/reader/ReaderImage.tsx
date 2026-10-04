import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  getMobileHeaderedImageBlobUrl,
  getMobileProxyImageBlobUrl,
  isMobileProxyUrl,
  normalizeMobileHeaders,
} from "@/core/extensions/mobile/mobileProxy";

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
export function ReaderImage({ page, mode, style, eager }: {
  page: ReaderPageImage;
  mode: "native" | "blob";
  style: CSSProperties;
  eager: boolean;
}) {
  const src = page.proxiedImageUrl || page.imageUrl;
  const isProxy = isMobileProxyUrl(src);
  const headerCount = Object.keys(normalizeMobileHeaders(page.headers)).length;
  // Header-gated plain URL: bare <img> will 403 → must go through blob path
  // even when the user picked "native" loading.
  const needsHeaderBlob = !isProxy && headerCount > 0 && /^https?:\/\//i.test(src);
  const useBlobPath = isProxy || mode === "blob" || needsHeaderBlob;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  }, [src, mode, isProxy, needsHeaderBlob, page.originalUrl, page.imageUrl, JSON.stringify(page.headers), nonce]);

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
    setFailed(false);
    setLoaded(false);
    setBlobUrl(null);
    setNonce((n) => n + 1);
  };

  if (failed || (!showImg && useBlobPath && failed)) {
    return (
      <div
        data-page={page.pageNumber}
        className="mx-auto flex w-full flex-col items-center justify-center gap-2 rounded-none bg-white/[0.04] px-6 py-14 text-center sm:rounded-md"
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
          className="mx-auto flex items-center justify-center rounded-none bg-white/[0.03] sm:rounded-md"
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
          className="mx-auto block h-auto rounded-none bg-black/30 sm:rounded-md"
          style={{ ...style, ...reserve }}
          loading={eager ? "eager" : "lazy"}
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
          className="mx-auto flex w-full flex-col items-center justify-center gap-2 rounded-none bg-white/[0.04] px-6 py-14 text-center sm:rounded-md"
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
