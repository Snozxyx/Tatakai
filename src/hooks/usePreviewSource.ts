import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { getProxiedVideoUrl } from '@/lib/api';
import { resolveApiV3Base } from '@/lib/api/backendOrigin';

interface PreviewSource {
  provider: string | null;
  streamUrl: string | null;
  isHls: boolean;
  previewTimestampSec: number;
  streamHeaders?: Record<string, string>;
  /**
   * Loopback URL minted by the desktop in-app proxy (`registerSource`). When
   * present it is preferred for playback — no cloud round-trip — and the
   * cloud-proxied URL becomes the fallback the player switches to on failure.
   */
  localProxyUrl?: string | null;
  /** Cloud-proxied URL used when the local proxy is absent or fails. */
  fallbackStreamUrl?: string | null;
}

interface UsePreviewSourceReturn {
  source: PreviewSource | null;
  loading: boolean;
  unavailable: boolean;
  startHover: (anilistId: number | null, titles: string[], episode?: number, malId?: number | null) => void;
  cancelHover: () => void;
}

interface PreviewResolutionResponse {
  success?: boolean;
  data?: PreviewSource;
}

const HOVER_DELAY_MS = 200;
const TIMEOUT_MS = 12_000;
const titleIds = new Map<string, number>();

/**
 * Register the resolved stream with the desktop in-app loopback proxy so hover
 * previews play through 127.0.0.1 (no cloud round-trip). The proxy mints its
 * token server-side, so the renderer cannot build this URL itself — it must ask
 * the main process. Returns the loopback URL, or null on web / any failure, in
 * which case `toProxyStreamUrl` falls back to the cloud proxy.
 */
async function registerLocalPreviewProxy(source: PreviewSource): Promise<string | null> {
  const invoke: any = (window as any).electron?.invoke;
  const streamUrl = source?.streamUrl;
  if (typeof invoke !== 'function') return null;
  if (typeof streamUrl !== 'string' || !/^https?:\/\//i.test(streamUrl)) return null;

  try {
    const res = await invoke('runtime:register-preview-proxy', {
      url: streamUrl,
      headers: source.streamHeaders || {},
    });
    if (res?.success && typeof res.url === 'string' && /^https?:\/\//i.test(res.url)) {
      return res.url;
    }
  } catch {
    /* web build or IPC failure — cloud proxy is used instead */
  }
  return null;
}

function toProxyStreamUrl(source: PreviewSource | null): PreviewSource | null {
  if (!source?.streamUrl) return source;

  const referer = source.streamHeaders?.Referer || source.streamHeaders?.referer;
  const userAgent = source.streamHeaders?.['User-Agent'] || source.streamHeaders?.['user-agent'];
  const cloudUrl = getProxiedVideoUrl(source.streamUrl, referer, userAgent);

  // Desktop registers the resolved stream with the in-app loopback proxy and
  // hands back a 127.0.0.1 URL. Play that first (no cloud round-trip) and keep
  // the cloud-proxied URL as the fallback `useHoverPreview` switches to if the
  // local one fails. On web there is no local proxy, so the cloud URL is used
  // directly with no fallback.
  const localUrl =
    typeof source.localProxyUrl === 'string' && /^https?:\/\//i.test(source.localProxyUrl)
      ? source.localProxyUrl
      : null;

  return {
    ...source,
    streamUrl: localUrl || cloudUrl,
    fallbackStreamUrl: localUrl ? cloudUrl : null,
  };
}

export function usePreviewSource(): UsePreviewSourceReturn {
  useUiTranslation();
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const cacheRef = useRef<Map<number, PreviewSource>>(new Map());
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      // Clear cache and cancel on unmount
      cache.clear();
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const cancelHover = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const resolve = useCallback(async (anilistId: number | null, titles: string[], episode?: number, malId?: number | null) => {
    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);
    const withTimeout = async <T,>(promise: Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout>;
      try {
        return await Promise.race([promise, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(uiI18n.t('app.timeout_56d3c949'))), TIMEOUT_MS);
        })]);
      } finally { clearTimeout(timer!); }
    };
    if (!anilistId) {
      const identity = `${malId || ''}:${titles[0] || ''}`;
      anilistId = titleIds.get(identity) || null;
      if (!anilistId && titles[0]) {
        try {
          const { searchAniListAnime } = await import('@/lib/externalIntegrations');
          const matches = await withTimeout(searchAniListAnime(titles[0], { perPage: 5 }));
          const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          const match = matches.find(item => malId ? item.idMal === malId : Object.values(item.title).some(value => value && titles.some(title => normalize(value) === normalize(title)))) || (matches.length === 1 && !malId ? matches[0] : null);
          if (match) { anilistId = match.id; titleIds.set(identity, match.id); }
        } catch { /* Keep the poster when identity or the provider is unavailable. */ }
      }
    }
    if (abort.signal.aborted) return;
    if (!anilistId) { setSource(null); setLoading(false); setUnavailable(true); return; }
    const cached = cacheRef.current.get(anilistId);
    if (cached) { setSource(toProxyStreamUrl(cached)); setLoading(false); return; }

    let result: PreviewSource | null = null;

    // Tier 1: desktop IPC via window.electron.invokeExtension
    try {
      const invokeExtension: any = (window as any).electron?.invokeExtension;

      if (invokeExtension && !abort.signal.aborted) {
        const data = (await withTimeout(
          invokeExtension('getPreviewSource', { anilistId, titles, episode })
        )) as PreviewResolutionResponse;
        if (data?.success && data?.data?.streamUrl) {
          result = data.data;
        }
      }
    } catch { /* fall through to tier 2 */ }

    // Tier 2: web API fallback
    if (!result && !abort.signal.aborted) {
      try {
        const params = new URLSearchParams();
        params.set('anilistId', String(anilistId));
        titles.forEach(t => params.append('titles[]', t));
        if (episode != null) params.set('episode', String(episode));

        const res = await withTimeout(
          fetch(`${resolveApiV3Base()}/toko/preview?${params}`, { signal: abort.signal })
        );
        if (res.ok) {
          const data = await res.json() as PreviewSource;
          if (data?.streamUrl) result = data;
        }
      } catch { /* both tiers failed */ }
    }

    // The lightweight preview provider may be unavailable while the normal
    // multi-provider stream service still has a playable source.
    if (!result && !abort.signal.aborted) {
      try {
        const params = new URLSearchParams({ anilistId: String(anilistId), episode: String(episode ?? 1) });
        titles.forEach(title => params.append('titles[]', title));
        const res = await withTimeout(fetch(`${resolveApiV3Base()}/toko/stream?${params}`, { signal: abort.signal }));
        if (res.ok) {
          const data = await res.json() as { sources?: Array<{ url?: string; provider?: string; isHls?: boolean; sourceType?: string; headers?: Record<string, string> }> };
          const stream = data.sources?.find(item => item.url && /^https?:\/\//i.test(item.url) &&
            (item.isHls || item.sourceType === 'hls' || item.sourceType === 'mp4' || /\.(mp4|m3u8)(?:\?|$)/i.test(item.url)));
          if (stream?.url) result = { provider: stream.provider || null, streamUrl: stream.url,
            isHls: Boolean(stream.isHls || stream.sourceType === 'hls' || /\.m3u8(?:\?|$)/i.test(stream.url)),
            streamHeaders: stream.headers, previewTimestampSec: 0 };
        }
      } catch { /* The static poster remains useful when both services fail. */ }
    }

    if (!abort.signal.aborted) {
      if (result) {
        // Prefer the in-app loopback proxy for playback. Mint its URL now (the
        // token is server-side) and store it on the cached source; on web this
        // is null and `toProxyStreamUrl` uses the cloud proxy instead.
        const localProxyUrl = await registerLocalPreviewProxy(result);
        if (localProxyUrl) result.localProxyUrl = localProxyUrl;
      }
    }

    if (!abort.signal.aborted) {
      if (result) {
        // Cache the raw resolution; `toProxyStreamUrl` is applied on every read
        // so the local-preferred/cloud-fallback split is recomputed cleanly
        // (caching the proxied form would collapse the fallback on cache hits).
        cacheRef.current.set(anilistId, result);
        setSource(toProxyStreamUrl(result));
      } else {
        setSource(null);
      }
      setUnavailable(!result);
      setLoading(false);
    }
  }, []);

  /**
   * Start the 200 ms hover guard (req 9.3). Delays resolution fetch so that
   * quick mouse-overs do not trigger unnecessary network requests.
   */
  const startHover = useCallback((anilistId: number | null, titles: string[], episode?: number, malId?: number | null) => {
    setUnavailable(false);
    // Cancel any existing hover timer and in-flight request
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    abortRef.current?.abort();

    // 200ms guard before firing the resolution fetch
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      resolve(anilistId, titles, episode, malId);
    }, HOVER_DELAY_MS);
  }, [resolve]);

  return { source, loading, unavailable, startHover, cancelHover };
}
