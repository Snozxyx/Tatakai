import { ReaderImageSlot } from './ReaderImageSlot';
import { readerImageLayout } from '@/lib/reader/imageLayout';
import { readerDelay } from '@/lib/reader/loading';
import { acquireReaderImageResource, readerDimensions, rememberReaderDimensions } from '@/lib/reader/imageResources';
import { readerResourceKey, resolveReaderImageResource } from '@/lib/reader/imageTransport';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import {
  isMobileProxyUrl,
  isNativeProxyUrl,
  normalizeMobileHeaders,
} from "@/core/extensions/mobile/mobileProxy";
import { triggerHaptic } from "@/lib/haptics";
import { shouldUseReaderHeaderBlob } from "@/lib/reader/imageLifecycle";
import { useTranslation } from "react-i18next";
import { useMobileConfig } from '@/hooks/ui/useMobileConfig';
import { buildMobileCloudImageProxyUrl } from '@/core/player/mobile-cloud-proxy';
import { usePageUpscaling, type PageUpscalingSettings } from '@/hooks/media/usePageUpscaling';

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
export function ReaderImage({ page, mode, style, eager, priority = eager ? 10 : 0, onRetryChapter, upscaling, upscaleScope, resourceScope = "", onPageLoaded }: {
  page: ReaderPageImage;
  mode: "native" | "blob";
  style: CSSProperties;
  eager: boolean;
  /** Visible/starting pages take precedence over full-chapter background work. */
  priority?: number;
  resourceScope?: string;
  onRetryChapter?: () => void;
  upscaling?: PageUpscalingSettings;
  /** Chapter identity this page reports its enhancement to, so the reader can
   *  show one overall progress pill instead of mid-page text. */
  upscaleScope?: string;
  /** Called when the page image finishes loading (or fails), so the chapter can
   *  report how many pages are ready while its initial load screen is up. */
  onPageLoaded?: (pageNumber: number) => void;
}) {
  useUiTranslation();
  const { config } = useMobileConfig();
  const cloudUrl = Capacitor.isNativePlatform() && config.cloudProxyByDefault
    ? buildMobileCloudImageProxyUrl(page) : null;
  const [failedCloudUrl, setFailedCloudUrl] = useState<string | null>(null);
  const useCloud = Boolean(cloudUrl && failedCloudUrl !== cloudUrl);
  const src = useCloud ? cloudUrl! : page.proxiedImageUrl || page.imageUrl;
  const { t } = useTranslation();
  // Native loopback (`http://127.0.0.1:<port>/stream/…`) loads directly in
  // `<img>` like desktop — headers are replayed server-side, CORS is `*`.
  const isNativeLoopback = isNativeProxyUrl(src);
  const isProxy = !isNativeLoopback && isMobileProxyUrl(src);
  const headerCount = useCloud ? 0 : Object.keys(normalizeMobileHeaders(page.headers)).length;
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

  const resourceKey = readerResourceKey(page, mode, src, resourceScope);
  const [learnedDimensions, setLearnedDimensions] = useState(readerDimensions(resourceKey));
  const imageRef = useRef<HTMLImageElement>(null);
  const leaseRef = useRef<ReturnType<typeof acquireReaderImageResource> | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(eager);
  const shouldLoad = eager || nearViewport;
  useEffect(() => {
    if (eager) { setNearViewport(true); return; }
    if (config.dataSaver) setNearViewport(false);
    const element = slotRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') { setNearViewport(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNearViewport(true); observer.disconnect(); }
    }, { rootMargin: '400px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [eager, sourceIdentity, config.dataSaver]);

  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Cloud image errors (including a 200 HTML challenge) fall back once to the
  // original local/header-aware transport. Each new page gets its own attempt.
  useEffect(() => {
    if (failed && useCloud) setFailedCloudUrl(cloudUrl);
  }, [failed, useCloud, cloudUrl]);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reader routes do not remount between chapters. Reset every source-bound
  // bit when React reuses this component (paged mode and old page-number keys
  // are especially prone to it), otherwise a failed page from chapter N keeps
  // chapter N+1 in the retry UI without ever assigning its new `src`.
  useLayoutEffect(() => {
    setBlobUrl(null);
    setLoaded(false);
    setFailed(false);
    setNonce(0);
    setNearViewport(eager);
    setLearnedDimensions(readerDimensions(resourceKey));
  }, [sourceIdentity, resourceKey]);

  useEffect(() => {
    if (!shouldLoad) return;
    const controller = new AbortController();
    const lease = acquireReaderImageResource(resourceKey + (nonce ? `:retry:${nonce}` : ''),
      signal => resolveReaderImageResource(page, mode, src, signal, useCloud),
      controller.signal, priority, useBlobPath, priority < 10);
    leaseRef.current = lease;
    void lease.promise.then(value => {
      if (!controller.signal.aborted) {
        if (useBlobPath) setBlobUrl(value.src);
        setLearnedDimensions(readerDimensions(resourceKey));
      }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => {
      controller.abort();
      lease.release();
      if (leaseRef.current === lease) leaseRef.current = null;
    };
  }, [resourceKey, nonce, shouldLoad, useBlobPath]);

  useEffect(() => { leaseRef.current?.promote(priority); }, [priority]);

  // Retry uses the same scheduler and transport as foreground/prepared images.
  const autoAttempts = useRef(0);
  useEffect(() => { autoAttempts.current = 0; }, [resourceKey]);
  useEffect(() => {
    if (!failed || autoAttempts.current >= 3) return;
    const controller = new AbortController();
    const delay = [750, 2000, 4500][autoAttempts.current++];
    void readerDelay(delay, controller.signal).then(() => {
      setFailed(false);
      setLoaded(false);
      setNonce(value => value + 1);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [failed, resourceKey]);

  useEffect(() => { if (failed) onPageLoaded?.(page.pageNumber); }, [failed, onPageLoaded, page.pageNumber]);

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

  const layout = readerImageLayout(style, { width: page.width || learnedDimensions?.width, height: page.height || learnedDimensions?.height }, loaded);

  // Proxy/headered payloads render from their resolved blob URL; while it
  // resolves, hold the placeholder (never hand the opaque token URL to `<img>`).
  const imgSrc = useBlobPath ? blobUrl ?? undefined : src;
  const showImg = shouldLoad && Boolean(imgSrc) && !failed;
  const enhancement = usePageUpscaling(failed || !loaded ? undefined : imgSrc, upscaling, upscaleScope);

  const retry = () => {
    void triggerHaptic("reader-toggle");
    setFailed(false);
    setLoaded(false);
    setBlobUrl(null);
    setFailedCloudUrl(null);
    autoAttempts.current = 0;
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
        style={layout.slot}
      >
        <p className="text-sm text-muted-foreground">{t('migration.pageFailed', { number: page.pageNumber })}</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/10 active:scale-95"
        >
          <RefreshCw className="h-4 w-4" /> {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <ReaderImageSlot ref={element => { slotRef.current = element; enhancement.ref.current = element; }}
      pageNumber={page.pageNumber} style={layout.slot} pending={!loaded && !failed}>
      {showImg ? (
        <img
          key={nonce}
          ref={imageRef}
          data-reader-image-state={loaded ? "ready" : "loading"}
          data-image-original
          data-original-src={imgSrc}
          src={enhancement.enhanced || imgSrc}
          alt={t('reader.pageNumber', { number: page.pageNumber })}
          className="mx-auto block h-auto rounded-none bg-black/30"
          style={layout.image}
          width={page.width || learnedDimensions?.width || undefined}
          height={page.height || learnedDimensions?.height || undefined}
          loading={eager ? "eager" : "lazy"}
          {...{ fetchpriority: priority > 0 ? "high" : eager ? "low" : "auto" }}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={async (event) => {
            const image = event.currentTarget;
            const loadedSrc = image.src;
            rememberReaderDimensions(resourceKey, image.naturalWidth, image.naturalHeight);
            setLearnedDimensions(readerDimensions(resourceKey));
            try {
              if (priority >= 10 && image.decode) await image.decode();
              if (imageRef.current !== image || image.src !== loadedSrc || !mountedRef.current) return;
              setLoaded(true);
              onPageLoaded?.(page.pageNumber);
            } catch {
              if (imageRef.current === image && image.src === loadedSrc) setFailed(true);
            }
          }}
          onError={() => {
            // Bare <img> failed (hotlink 403 etc). If headers exist, the blob
            // path will succeed — flip to it by flagging failure so the retry
            // UI offers a native-header reload instead of staying broken.
            setFailed(true);
            setLoaded(true);
            onPageLoaded?.(page.pageNumber);
          }}
        />
      ) : null}
      {/* Only ever a failure with a retry now — enhancement progress lives in
          the chapter-level pill, never in the middle of the page. */}
      {enhancement.state && <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 bg-background/90 px-2 py-1 text-xs text-muted-foreground">
        <span role="status">{enhancement.state}</span>
        {enhancement.state.startsWith('Showing original.') && <button type="button" className="underline underline-offset-2" onClick={enhancement.retry}>Retry enhancement</button>}
      </div>}
      {/* Direct <img> fallback failed but headers exist → offer headered reload */}
      {!showImg && !useBlobPath && headerCount > 0 && (
        <div
          data-page={page.pageNumber}
          className="mx-auto flex w-full flex-col items-center justify-center gap-2 rounded-none bg-white/[0.04] px-6 py-14 text-center"
          style={{ minHeight: "32vh" }}
        >
          <p className="text-sm text-muted-foreground">{t('migration.pageReload', { number: page.pageNumber })}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" /> {t('migration.reload')}
          </button>
        </div>
      )}
    </ReaderImageSlot>
  );
}
