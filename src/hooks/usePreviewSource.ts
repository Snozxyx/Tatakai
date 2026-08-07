import { useState, useRef, useEffect, useCallback } from 'react';
import { getProxiedVideoUrl } from '@/lib/api';

interface PreviewSource {
  provider: string | null;
  streamUrl: string | null;
  isHls: boolean;
  previewTimestampSec: number;
  streamHeaders?: Record<string, string>;
}

interface UsePreviewSourceReturn {
  source: PreviewSource | null;
  loading: boolean;
  startHover: (anilistId: number, titles: string[], episode?: number) => void;
  cancelHover: () => void;
}

interface PreviewResolutionResponse {
  success?: boolean;
  data?: PreviewSource;
}

const HOVER_DELAY_MS = 200;
const TIMEOUT_MS = 5_000;

function toProxyStreamUrl(source: PreviewSource | null): PreviewSource | null {
  if (!source?.streamUrl) return source;

  const referer = source.streamHeaders?.Referer || source.streamHeaders?.referer;
  return {
    ...source,
    streamUrl: getProxiedVideoUrl(source.streamUrl, referer),
  };
}

export function usePreviewSource(): UsePreviewSourceReturn {
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<number, PreviewSource>>(new Map());
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      // Clear cache and cancel on unmount
      cacheRef.current.clear();
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

  const resolve = useCallback(async (anilistId: number, titles: string[], episode?: number) => {
    // Check cache first
    const cached = cacheRef.current.get(anilistId);
    if (cached) {
      setSource(toProxyStreamUrl(cached));
      setLoading(false);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);

    const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
        ),
      ]);
    };

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
          fetch(`/api/v3/toko/preview?${params}`, { signal: abort.signal })
        );
        if (res.ok) {
          const data = await res.json() as PreviewSource;
          if (data?.streamUrl) result = data;
        }
      } catch { /* both tiers failed */ }
    }

    if (!abort.signal.aborted) {
      if (result) {
        const proxied = toProxyStreamUrl(result);
        cacheRef.current.set(anilistId, proxied || result);
        setSource(proxied);
      } else {
        setSource(null);
      }
      setLoading(false);
    }
  }, []);

  /**
   * Start the 200 ms hover guard (req 9.3). Delays resolution fetch so that
   * quick mouse-overs do not trigger unnecessary network requests.
   */
  const startHover = useCallback((anilistId: number, titles: string[], episode?: number) => {
    // Cancel any existing hover timer and in-flight request
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    abortRef.current?.abort();

    // 200ms guard before firing the resolution fetch
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      resolve(anilistId, titles, episode);
    }, HOVER_DELAY_MS);
  }, [resolve]);

  return { source, loading, startHover, cancelHover };
}
