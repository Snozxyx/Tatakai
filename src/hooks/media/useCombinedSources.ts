import { useQuery } from "@tanstack/react-query";
import { fetchCombinedSources } from "@/lib/api";
import type { StreamingData } from "@/lib/api";
import { getCachedCombinedSources, getCombinedSourceCacheKey, setCachedCombinedSources } from "@/lib/watch/sourceIntelligence";
import type { EpisodeServer } from "@/types/anime";

/**
 * V6 combined hook that fetches TatakaiAPI playback dispatch metadata.
 * Actual stream resolution is performed by the local runtime / extensions.
 */
export function useCombinedSources(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string,
  knownAnilistId?: number | string | null,
  knownMalId?: number | string | null
) {
  return useQuery<StreamingData & {
    hasTatakaiProviders: boolean;
    malID?: number | null;
    anilistID?: number | null;
    nextEpisodeEstimates?: Array<{ lang?: string, server?: string, label: string }>;
  }, Error>({
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
              const TOKO_EXT_ID = 'tatakai.extension.toko';
              // Every Toko SourceResult carries a human label in `source`
              // (e.g. "reanime", "animelok-bato", "animeblkom-blkom"). Use it
              // as the provider identity so the Watch page groups each
              // provider into its own server row.
              const resolveProviderKey = (src: any): string =>
                String(src.providerKey || src.providerName || src.server || src.source || 'toko').trim();
              const resolveProviderName = (src: any): string =>
                String(src.providerName || src.server || src.source || 'Toko').trim();
              const DUB_LABELS: Record<string, string> = {
                ar: 'Arabic', fr: 'French', de: 'German', pl: 'Polish',
                zh: 'Chinese', es: 'Spanish', pt: 'Portuguese', it: 'Italian',
                ko: 'Korean', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
              };
              const resolveLang = (src: any): string => {
                const explicit = String(src.language || '').trim();
                if (explicit) return explicit;
                if (src.audioLanguage) {
                  const code = String(src.audioLanguage).toLowerCase();
                  if (code === 'ja') return 'Japanese';
                  if (code === 'en') return 'English';
                  return DUB_LABELS[code] || code.toUpperCase();
                }
                return category || '';
              };
              const resolveIsDub = (src: any, lang: string): boolean => {
                if (typeof src.isDub === 'boolean') return src.isDub;
                if (src.audioLanguage && src.audioLanguage !== 'ja') return true;
                return /dub/i.test(lang) || category === 'dub';
              };
              const isEmbedSource = (src: any): boolean => {
                if (typeof src.isEmbed === 'boolean') return src.isEmbed;
                const t = String(src.sourceType || '');
                if (t === 'hls' || t === 'mp4') return false;
                return !/\.m3u8($|[?#/])/i.test(String(src.url || ''));
              };

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
                  hasM3U8: !!src.isM3U8 || src.sourceType === 'hls' || /\.m3u8/i.test(String(src.url || '')),
                };
              });

              const localResult: StreamingData = {
                headers: { Referer: "", "User-Agent": "" },
                sources: localSources.map((src: any) => {
                  const key = resolveProviderKey(src);
                  const name = resolveProviderName(src);
                  const lang = resolveLang(src);
                  return {
                    url: String(src.url || ""),
                    isM3U8: !!src.isM3U8 || (src.sourceType === 'hls') || /\.m3u8/i.test(String(src.url || '')),
                    quality: src.quality ? String(src.quality) : "auto",
                    language: lang,
                    langCode: src.audioLanguage ? String(src.audioLanguage) : undefined,
                    isDub: resolveIsDub(src, lang),
                    isEmbed: isEmbedSource(src),
                    providerName: name,
                    providerKey: key,
                    server: key,
                  };
                }),                subtitles: [],
                tracks: [],
                providerServers,
                anilistID: typeof knownAnilistId === "number" ? knownAnilistId : Number(knownAnilistId) || null,
                malID: typeof knownMalId === "number" ? knownMalId : Number(knownMalId) || null,
              };

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
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

/**
 * One-shot variant kept for API compatibility with existing WatchPage callsites.
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
  return useCombinedSources(episodeId, animeName, episodeNumber, server, category, currentUserId, knownAnilistId, knownMalId);
}
