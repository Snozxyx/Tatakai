import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCombinedSources } from "@/lib/api";
import type { StreamingData } from "@/lib/api";
import { getCachedCombinedSources, getCombinedSourceCacheKey, setCachedCombinedSources } from "@/lib/watch/sourceIntelligence";
import type { EpisodeServer, StreamingSource, Subtitle } from "@/types/anime";
import { useExtensionSourceStream } from "@/hooks/media/useExtensionSourceStream";

type CombinedResult = StreamingData & {
  hasTatakaiProviders: boolean;
  malID?: number | null;
  anilistID?: number | null;
  nextEpisodeEstimates?: Array<{ lang?: string; server?: string; label: string }>;
  providerStatus?: Array<{ provider: string; status: string; resultCount?: number; durationMs?: number; error?: string }>;
};

interface MapContext {
  category: string;
  knownAnilistId?: number | string | null;
  knownMalId?: number | string | null;
}

const DUB_LABELS: Record<string, string> = {
  ar: "Arabic", fr: "French", de: "German", pl: "Polish",
  zh: "Chinese", es: "Spanish", pt: "Portuguese", it: "Italian",
  ko: "Korean", hi: "Hindi", ta: "Tamil", te: "Telugu",
};

/**
 * A partial track that captions only signs and song lyrics, not dialogue.
 * Providers label these "English (Signs & Songs)" and ship them alongside the
 * real thing.
 */
const SIGNS_ONLY_RE = /signs?\s*(?:&|and)?\s*songs?|\bs&s\b/i;

/**
 * Provider subtitle tracks → the player's `Subtitle` shape.
 *
 * Toko emits `{ url, label, language, default }` per source; the player wants
 * `{ lang, url, label }`. Providers put tracks on `subtitles`, a couple on
 * `tracks`, so both are read.
 *
 * Ordering is load-bearing. WatchPage dedupes by *normalized language* and keeps
 * the first track it sees for each one, so an "English (Signs & Songs)" track
 * arriving ahead of the full dialogue track claims the `en` slot and leaves the
 * episode looking subtitled while showing almost no text. Default tracks first,
 * then full dialogue, signs-and-songs last.
 */
function toAppSubtitles(src: any): Subtitle[] {
  const raw = [
    ...(Array.isArray(src?.subtitles) ? src.subtitles : []),
    ...(Array.isArray(src?.tracks) ? src.tracks : []),
  ];

  const scored = raw
    .map((t: any) => {
      const url = String(t?.url || t?.file || "").trim();
      if (!url) return null;
      const label = String(t?.label || t?.language || t?.lang || "Subtitles").trim();
      const lang = String(t?.lang || t?.language || label).trim();
      const rank = t?.default ? 0 : SIGNS_ONLY_RE.test(label) ? 2 : 1;
      return { rank, sub: { lang, url, label } as Subtitle };
    })
    .filter((t): t is { rank: number; sub: Subtitle } => !!t);

  scored.sort((a, b) => a.rank - b.rank);
  return scored.map((t) => t.sub);
}

/**
 * Flatten per-source tracks into one list; first occurrence of each URL wins.
 *
 * Sources arrive in provider-completion order, so without a global pass a
 * signs-and-songs track from whichever provider answered first would outrank the
 * full dialogue track from a slower one. Stable-sorted, so the per-source
 * ordering above survives within each rank.
 */
function unionSubtitles(perSource: Subtitle[][]): Subtitle[] {
  const seen = new Set<string>();
  const out: Subtitle[] = [];
  for (const list of perSource) {
    for (const sub of list) {
      if (seen.has(sub.url)) continue;
      seen.add(sub.url);
      out.push(sub);
    }
  }
  return out
    .map((sub, i) => ({ sub, i, rank: SIGNS_ONLY_RE.test(sub.label || sub.lang) ? 1 : 0 }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((e) => e.sub);
}

/**
 * Maps raw resolver/stream sources (Toko `SourceResult` from the one-shot local
 * path, OR host-normalized sources from the progressive Extension-API stream)
 * into the `StreamingData` shape WatchPage consumes. Both shapes are handled:
 * host-normalized sources already carry `providerKey`/`languageLabel`/`isEmbed`/
 * seeder metadata, and the resolvers below degrade gracefully when a field is
 * absent (one-shot local sources). Extracted so both code paths share identical
 * grouping + enrichment logic.
 */
function mapRawSourcesToStreamingData(rawSources: any[], ctx: MapContext): StreamingData {
  const { category } = ctx;

  /**
   * Honour the extension's own server ranking.
   *
   * `providerPriority` is stamped by the extension from its registry order (see
   * `providerPriorityOf` in `extension/toko/src/providers/registry.ts`) and
   * relayed untouched by the host. Without this sort the list is in SSE arrival
   * order, i.e. provider *completion* order — whichever site was quickest that
   * minute — so the page opened on an arbitrary server. Sorting here is not a
   * second ordering policy: the numbers are the extension's, this only stops the
   * transport from scrambling them.
   *
   * Stable within a priority so a provider's own preferred-quality order (and
   * torrent seeder ranking) survives, and sources with no priority — an
   * extension that does not rank, or the central dispatch fallback — keep their
   * relative order at the end.
   */
  const localSources = rawSources
    .map((src, idx) => ({ src, idx }))
    .sort((a, b) => {
      const pa = Number.isFinite(a.src?.providerPriority)
        ? Number(a.src.providerPriority)
        : Number.MAX_SAFE_INTEGER;
      const pb = Number.isFinite(b.src?.providerPriority)
        ? Number(b.src.providerPriority)
        : Number.MAX_SAFE_INTEGER;
      return pa === pb ? a.idx - b.idx : pa - pb;
    })
    .map(({ src }) => src);

  const resolveProviderKey = (src: any): string =>
    String(src.providerKey || src.providerName || src.server || src.source || "toko").trim();
  const resolveProviderName = (src: any): string =>
    String(src.providerName || src.server || src.source || "Toko").trim();
  const resolveLang = (src: any): string => {
    const explicit = String(src.language || "").trim();
    if (explicit) return explicit;
    if (src.audioLanguage) {
      const code = String(src.audioLanguage).toLowerCase();
      if (code === "ja") return "Japanese";
      if (code === "en") return "English";
      return DUB_LABELS[code] || code.toUpperCase();
    }
    return category || "";
  };
  const resolveIsDub = (src: any, lang: string): boolean => {
    if (typeof src.isDub === "boolean") return src.isDub;
    if (src.audioLanguage && src.audioLanguage !== "ja") return true;
    return /dub/i.test(lang) || category === "dub";
  };
  const isEmbedSource = (src: any): boolean => {
    if (typeof src.isEmbed === "boolean") return src.isEmbed;
    const t = String(src.sourceType || "");
    if (t === "hls" || t === "mp4") return false;
    return !/\.m3u8($|[?#/])/i.test(String(src.url || ""));
  };
  const isM3U8Source = (src: any): boolean =>
    !!src.isM3U8 || src.sourceType === "hls" || /\.m3u8/i.test(String(src.url || ""));

  const perSourceSubtitles: Subtitle[][] = localSources.map((src: any) => toAppSubtitles(src));

  const providerServers: EpisodeServer[] = localSources.map((src: any, idx: number) => {
    const key = resolveProviderKey(src);
    const name = resolveProviderName(src);
    const lang = resolveLang(src);
    return {
      serverId: idx,
      serverName: key,
      providerKey: key,
      providerName: name,
      displayName: name,
      isProviderServer: true,
      language: lang,
      langCode: src.audioLanguage ? String(src.audioLanguage) : undefined,
      isDub: resolveIsDub(src, lang),
      isEmbed: isEmbedSource(src),
      hasM3U8: isM3U8Source(src),
      // ── Extension-API enrichment (present on host-normalized sources) ────────
      sourceType: src.sourceType,
      seeders: typeof src.seeders === "number" ? src.seeders : undefined,
      leechers: typeof src.leechers === "number" ? src.leechers : undefined,
      peers: typeof src.peers === "number" ? src.peers : undefined,
      torrentTitle: src.torrentTitle,
      fileFormat: src.fileFormat,
      fileSize: src.fileSize,
      languageLabel: src.languageLabel,
      audioLanguage: src.audioLanguage ? String(src.audioLanguage) : undefined,
      // Carried through so WatchPage can re-apply the extension's ranking after
      // it dedupes/merges servers — that pass loses the array order this sort
      // established.
      providerPriority: Number.isFinite(src?.providerPriority)
        ? Number(src.providerPriority)
        : undefined,
    } as EpisodeServer;
  });

  const sources: StreamingSource[] = localSources.map((src: any, idx: number) => {
    const key = resolveProviderKey(src);
    const name = resolveProviderName(src);
    const lang = resolveLang(src);
    return {
      url: String(src.url || ""),
      isM3U8: isM3U8Source(src),
      quality: src.quality ? String(src.quality) : "auto",
      language: lang,
      langCode: src.audioLanguage ? String(src.audioLanguage) : undefined,
      isDub: resolveIsDub(src, lang),
      isEmbed: isEmbedSource(src),
      providerName: name,
      providerKey: key,
      server: key,
      // ── Extension-API enrichment ────────────────────────────────────────────
      sourceType: src.sourceType,
      isTorrent: typeof src.isTorrent === "boolean" ? src.isTorrent : src.sourceType === "torrent",
      originalUrl: src.originalUrl,
      magnetLink: src.magnetLink,
      torrentFileUrl: src.torrentFileUrl,
      seeders: typeof src.seeders === "number" ? src.seeders : undefined,
      leechers: typeof src.leechers === "number" ? src.leechers : undefined,
      peers: typeof src.peers === "number" ? src.peers : undefined,
      torrentTitle: src.torrentTitle,
      fileFormat: src.fileFormat,
      fileSize: src.fileSize,
      languageLabel: src.languageLabel,
      audioLanguage: src.audioLanguage ? String(src.audioLanguage) : undefined,
      // Tracks belong to the source that resolved them — keep them attached so
      // switching server switches subtitles instead of reusing the union.
      subtitles: perSourceSubtitles[idx],
    } as StreamingSource;
  });

  return {
    headers: { Referer: "", "User-Agent": "" },
    sources,
    // The providers ship subtitles per source and the player reads them off
    // `StreamingData`, so the union goes here. This was hardcoded `[]`, which
    // silently dropped every track the providers returned — measured at 96 tracks
    // across 12 of 27 sources on one episode, so subtitles never appeared at all.
    subtitles: unionSubtitles(perSourceSubtitles),
    tracks: [],
    providerServers,
    anilistID: typeof ctx.knownAnilistId === "number" ? ctx.knownAnilistId : Number(ctx.knownAnilistId) || null,
    malID: typeof ctx.knownMalId === "number" ? ctx.knownMalId : Number(ctx.knownMalId) || null,
  };
}

/**
 * V6 combined hook that fetches TatakaiAPI playback dispatch metadata.
 * Actual stream resolution is performed by the local runtime / extensions.
 *
 * This is the **fallback** (one-shot) path: local runtime `resolveEpisodeSources`
 * first, then central API dispatch. `useCombinedSourcesWithRefetch` prefers the
 * progressive Extension-API stream and only enables this query when the stream
 * host is unavailable.
 */
export function useCombinedSources(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string,
  knownAnilistId?: number | string | null,
  knownMalId?: number | string | null,
  options?: { enabled?: boolean }
) {
  return useQuery<CombinedResult, Error>({
    queryKey: ["combined-sources", episodeId, animeName, episodeNumber, server, category, currentUserId, knownAnilistId, knownMalId],
    queryFn: async () => {
      const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`combined sources timeout (${timeoutMs}ms)`)), timeoutMs);
        });
        try {
          return await Promise.race([promise, timeoutPromise]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      };

      const ENABLE_COMBINED_SOURCE_CACHE =
        String(import.meta.env.VITE_ENABLE_COMBINED_SOURCE_CACHE ?? "false").toLowerCase() === "true";

      const cacheKey = getCombinedSourceCacheKey(episodeId!, server, category, currentUserId);
      const cached = ENABLE_COMBINED_SOURCE_CACHE ? getCachedCombinedSources<StreamingData & { hasTatakaiProviders?: boolean }>(cacheKey) : null;

      // Desktop local runtime first (master-plan): extension resolver + local proxy,
      // then fall back to central API dispatch for parity.
      if (typeof window !== "undefined" && window.tatakaiRuntime?.resolveEpisodeSources) {
        try {
          const health = await window.tatakaiRuntime.health?.();
          const healthOk = !!health && (health as any).status === "ok";
          if (healthOk) {
            const local = await withTimeout(
              window.tatakaiRuntime.resolveEpisodeSources({
                episodeId,
                animeName,
                episodeNumber,
                anilistId: knownAnilistId,
                malId: knownMalId,
                preferredLanguage: category,
                method: "single",
                resolution: "1080p",
              }),
              12000,
            );

            const localSources = Array.isArray((local as any)?.sources) ? (local as any).sources : [];
            if (localSources.length > 0) {
              const localResult = mapRawSourcesToStreamingData(localSources, { category, knownAnilistId, knownMalId });

              if (ENABLE_COMBINED_SOURCE_CACHE) {
                setCachedCombinedSources(cacheKey, localResult);
              }

              return {
                ...localResult,
                hasTatakaiProviders: true,
              };
            }
          }
        } catch {
          // Runtime errors are non-fatal; continue with central dispatch fallback.
        }
      }

      let data: StreamingData;
      try {
        data = await withTimeout(
          fetchCombinedSources(episodeId, animeName, episodeNumber, server, category, currentUserId, knownAnilistId, knownMalId),
          45000
        );
      } catch (error) {
        if (ENABLE_COMBINED_SOURCE_CACHE && cached) {
          return {
            ...cached,
            hasTatakaiProviders: (cached.providerServers?.length || 0) > 0,
          };
        }
        throw error;
      }
      if (ENABLE_COMBINED_SOURCE_CACHE) {
        setCachedCombinedSources(cacheKey, data);
      }

      if (import.meta.env.DEV) {
        console.debug('[useCombinedSources] Dispatch metadata:', {
          providerServers: data.providerServers?.length,
          malID: data.malID,
          anilistID: data.anilistID,
        });
      }

      return {
        ...data,
        hasTatakaiProviders: (data.providerServers?.length || 0) > 0,
      };
    },
    enabled: (options?.enabled ?? true) && !!episodeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

/**
 * Progressive variant consumed by WatchPage. Prefers the app-owned Extension-API
 * host's SSE stream (`/api/v3/toko/sources?...&stream=1`) so each provider's
 * sources appear **as soon as that provider resolves**, and falls back to the
 * one-shot `useCombinedSources` query when the host/namespace is unavailable or
 * the stream fails before producing anything.
 *
 * Returns the same `{ data, isLoading, isFetching, error, refetch }` interface as
 * a react-query result so WatchPage consumes it unchanged.
 */
export function useCombinedSourcesWithRefetch(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string,
  knownAnilistId?: number | string | null,
  knownMalId?: number | string | null
) {
  const anilistIdNum = Number(knownAnilistId);
  const hasAnilist = Number.isFinite(anilistIdNum) && anilistIdNum > 0;
  const streamEnabled =
    !!episodeId && (hasAnilist || !!animeName) && typeof episodeNumber === "number" && !!episodeNumber;

  const stream = useExtensionSourceStream("toko", {
    anilistId: hasAnilist ? anilistIdNum : undefined,
    titles: animeName ? [animeName] : undefined,
    episode: episodeNumber ?? undefined,
    resolution: "1080p",
    preferredLanguage: category,
    route: "sources",
    enabled: streamEnabled,
  });

  // The stream can't serve → run the one-shot fallback query.
  const streamUnavailable = stream.baseResolved && (!stream.baseUrl || !stream.namespaceMounted);
  const streamFailed = stream.phase === "error" && stream.sources.length === 0;
  const useFallback = !streamEnabled || streamUnavailable || streamFailed;

  const fallback = useCombinedSources(
    episodeId,
    animeName,
    episodeNumber,
    server,
    category,
    currentUserId,
    knownAnilistId,
    knownMalId,
    { enabled: useFallback }
  );

  // Build progressive data from the accumulated stream sources.
  const streamData = useMemo<CombinedResult | undefined>(() => {
    if (!streamEnabled) return undefined;
    if (stream.sources.length === 0 && stream.phase !== "done") return undefined;
    const sd = mapRawSourcesToStreamingData(stream.sources, { category, knownAnilistId, knownMalId });
    return {
      ...sd,
      hasTatakaiProviders: (sd.providerServers?.length || 0) > 0,
      providerStatus: stream.providerStatus,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamEnabled, stream.sources, stream.phase, stream.providerStatus, category, knownAnilistId, knownMalId]);

  const data = useFallback ? fallback.data : (streamData ?? fallback.data);

  const isLoading = useFallback ? fallback.isLoading : data === undefined;
  const isFetching = useFallback
    ? fallback.isFetching
    : !stream.baseResolved || stream.phase === "connecting" || stream.phase === "streaming";
  const error = useFallback ? fallback.error : stream.phase === "error" ? stream.error : null;

  const streamReload = stream.reload;
  const fallbackRefetch = fallback.refetch;
  const refetch = useCallback(async () => {
    streamReload();
    return fallbackRefetch();
  }, [streamReload, fallbackRefetch]);

  return { data, isLoading, isFetching, error, refetch };
}
