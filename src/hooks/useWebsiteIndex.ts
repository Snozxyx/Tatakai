import { useState, useRef, useEffect } from 'react';

interface WebsiteIndexEpisode {
  number: number;
  title?: string;
  aired?: string;
}

export interface WebsiteIndexResult {
  provider: string | null;
  episodeCount: number;
  episodes: WebsiteIndexEpisode[];
}

interface UseWebsiteIndexParams {
  anilistId: number;
  tatakaiId?: string;
  titles: string[];
}

const TIMEOUT_MS = 10_000;

export function useWebsiteIndex(params: UseWebsiteIndexParams): WebsiteIndexResult | null {
  const [result, setResult] = useState<WebsiteIndexResult | null>(null);
  const cacheRef = useRef<Map<number, WebsiteIndexResult>>(new Map());
  const fetchedRef = useRef<Set<number>>(new Set());

  // Clear page-scoped cache on unmount (req 8.6)
  useEffect(() => {
    return () => {
      cacheRef.current.clear();
      fetchedRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const { anilistId, tatakaiId, titles } = params;
    if (!anilistId || fetchedRef.current.has(anilistId)) return;

    // Check in-memory cache first
    const cached = cacheRef.current.get(anilistId);
    if (cached) {
      setResult(cached);
      return;
    }

    fetchedRef.current.add(anilistId);
    let cancelled = false;

    const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
        ),
      ]);

    (async () => {
      let data: WebsiteIndexResult | null = null;

      // Desktop path: extension:invoke getWebsiteEpisodeIndex (req 8.1)
      try {
        const tatakaiRuntime = (window as any).tatakaiRuntime;
        if (tatakaiRuntime?.invoke) {
          const resp = await withTimeout(
            tatakaiRuntime.invoke('extension:invoke', {
              extensionId: 'tatakai.extension.toko',
              method: 'getWebsiteEpisodeIndex',
              args: [{ anilistId, tatakaiId, titles }],
            })
          );
          if (resp?.success && resp?.data?.episodeCount > 0) {
            data = resp.data as WebsiteIndexResult;
          }
        }
      } catch { /* fall through to web path */ }

      // Web path: GET /api/v3/toko/index/episodes (req 8.1)
      if (!data && !cancelled) {
        try {
          const p = new URLSearchParams();
          p.set('anilistId', String(anilistId));
          if (tatakaiId) p.set('tatakaiId', tatakaiId);
          titles.forEach(t => p.append('titles[]', t));

          const res = await withTimeout(fetch(`/api/v3/toko/index/episodes?${p}`));
          if (res.ok) {
            const json = await res.json() as WebsiteIndexResult;
            if (json?.episodeCount > 0) data = json;
          }
        } catch { /* silent failure — req 8.3 */ }
      }

      if (!cancelled) {
        if (data) {
          cacheRef.current.set(anilistId, data);
          setResult(data);
        }
        // If null: silently stay null (req 8.3) — no error state set
      }
    })();

    return () => { cancelled = true; };
  }, [params.anilistId]); // Re-run only when anilistId changes

  return result;
}
