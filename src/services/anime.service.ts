import { apiGet, externalApiGet, TATAKAI_API_URL, API_URL, getProxiedImageUrl, unwrapApiData } from "@/lib/api/api-client";
import type {
  AnimeInfo,
  AnimeCard,
  EpisodeData,
  EpisodeServer,
  StreamingData,
  NextEpisodeSchedule,
} from "@/types/anime";

const JUSTANIME_PROXY_BASE = String(import.meta.env.VITE_JUSTANIME_PROXY_BASE || `${TATAKAI_API_URL}/justanime`).replace(/\/+$/, "");

export async function fetchAnimeInfo(
  animeId: string
): Promise<{ anime: AnimeInfo; recommendedAnimes: AnimeCard[]; relatedAnimes: AnimeCard[] }> {
  if (/^\d+$/.test(animeId)) {
    const res = await externalApiGet<any>(TATAKAI_API_URL, `/animelok/anime/${animeId}`);
    if (res.status === 200 && res.data) {
      return mapAnimelokToAnimePage(res.data);
    }
  }
  return apiGet(`/anime/${animeId}`);
}

type FetchEpisodesOptions = {
  preferDirect?: boolean;
  timeoutMs?: number;
  skipProxyFallback?: boolean;
};

export async function fetchEpisodes(
  animeId: string,
  options: FetchEpisodesOptions = {}
): Promise<{ totalEpisodes: number; episodes: EpisodeData[] }> {
  if (/^\d+$/.test(animeId)) {
    let allEpisodes: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const res = await externalApiGet<any>(TATAKAI_API_URL, `/animelok/watch/${animeId}?ep=${page}`);
        if (res.status === 200 && res.data && res.data.episodes) {
          const pageEpisodes = res.data.episodes;
          allEpisodes = [...allEpisodes, ...pageEpisodes];
          if (pageEpisodes.length === 0) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Failed to fetch episodes page ${page}:`, error);
        hasMore = false;
      }
    }

    return {
      totalEpisodes: allEpisodes.length,
      episodes: allEpisodes.map((ep: any) => ({
        number: parseInt(ep.number),
        title: ep.title || `Episode ${ep.number}`,
        episodeId: `${animeId}?ep=${ep.number}`,
        isFiller: false
      }))
    };
  }
  if (options.preferDirect) {
    try {
      const directUrl = `${API_URL}/anime/${encodeURIComponent(animeId)}/episodes`;
      const response = await fetch(directUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.max(1200, Number(options.timeoutMs || 12000))),
      });

      if (response.ok) {
        const json = await response.json();
        return unwrapApiData<{ totalEpisodes: number; episodes: EpisodeData[] }>(json);
      }

      if (options.skipProxyFallback) {
        throw new Error(`Direct episode fetch failed with status ${response.status}`);
      }
    } catch {
      if (options.skipProxyFallback) {
        throw new Error('Direct episode fetch timed out');
      }

      // Fall back to the existing apiGet proxy chain.
    }
  }

  if (options.skipProxyFallback) {
    throw new Error('Episode fetch failed in fast mode');
  }

  return apiGet(`/anime/${animeId}/episodes`);
}

function mapAnimelokToAnimePage(data: any) {
  return {
    anime: {
      info: {
        id: data.id,
        name: data.title,
        poster: data.poster,
        description: data.description || "No description available.",
        stats: {
          rating: data.rating?.toString() || "?",
          quality: "HD",
          episodes: data.stats?.episodes || { sub: 0, dub: 0 },
          type: data.stats?.type || "TV",
          duration: data.stats?.duration || "?"
        },
        promotionalVideos: [],
        characterVoiceActor: []
      },
      moreInfo: {
        aired: data.stats?.aired || "?",
        genres: data.genres || [],
        status: data.stats?.status || "?",
        studios: data.stats?.studios || "?",
        duration: data.stats?.duration || "?",
        malId: data.malID || data.mal_id,
        anilistId: data.anilistID || data.anilist_id
      }
    },
    recommendedAnimes: [],
    relatedAnimes: []
  };
}

export async function fetchEpisodeServers(
  episodeId: string
): Promise<{
  episodeId: string;
  episodeNo: number;
  sub: EpisodeServer[];
  dub: EpisodeServer[];
  raw: EpisodeServer[];
}> {
  const parseServers = (serversArray: any[]) => {
    const sub: EpisodeServer[] = [];
    const dub: EpisodeServer[] = [];
    const raw: EpisodeServer[] = [];
    const seen = new Set<string>();

    serversArray.forEach((server, index) => {
      const serverName = server.serverName || 'Unknown';
      const serverType = server.type || 'sub';
      const key = `${serverType}:${serverName.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);

      const payload: EpisodeServer = {
        serverId: Number(server.server_id || server.data_id || index + 1),
        serverName,
      };

      if (serverType === 'sub') sub.push(payload);
      else if (serverType === 'dub') dub.push(payload);
      else if (serverType === 'raw') raw.push(payload);
    });

    return { sub, dub, raw };
  };

  try {
    const response = await fetch(`${API_URL}/servers/${encodeURIComponent(episodeId)}`);
    if (!response.ok) throw new Error("Failed to fetch servers");
    
    const json = await response.json();
    const serversArray: any[] = json.success ? json.results : json;
    let { sub, dub, raw } = Array.isArray(serversArray)
      ? parseServers(serversArray)
      : { sub: [], dub: [], raw: [] };

    if (sub.length === 0 && dub.length === 0 && raw.length === 0) {
      const streamRes = await fetch(
        `${API_URL}/stream?id=${encodeURIComponent(episodeId)}&server=hd-1&type=sub`
      );
      if (streamRes.ok) {
        const streamJson = await streamRes.json();
        const fallbackServers = streamJson?.results?.servers;
        if (Array.isArray(fallbackServers)) {
          ({ sub, dub, raw } = parseServers(fallbackServers));
        }
      }
    }

    // Extract the sequential episode number by looking at the part before the ?ep= or using a match
    let episodeNo = 0;
    const epMatch = episodeId.match(/ep=(\d+)/);
    // Note: In HiAnime, the ep=ID is a database ID, not the sequential number.
    // However, the frontend usually expects the sequential number.
    // If the episodeId contains the sequential number in the slug (e.g. frieren-episode-1), we could extract it.
    // For now, let's keep it as is but ensure the WatchPage handles it gracefully by prioritizing its own currentEpisode state.
    if (epMatch) episodeNo = parseInt(epMatch[1]);

    const shouldShowJustAnime = String(import.meta.env.VITE_ENABLE_JUSTANIME_FAST_FIRST ?? "true").toLowerCase() !== "false";
    if (shouldShowJustAnime) {
      const hasJustAnimeSub = sub.some((server) => String(server.serverName || "").toLowerCase() === "justanime");
      const hasJustAnimeDub = dub.some((server) => String(server.serverName || "").toLowerCase() === "justanime");

      if (!hasJustAnimeSub) {
        sub.push({
          serverId: 9001,
          serverName: "justanime",
          providerKey: "justanime",
          providerName: "Koro",
          displayName: "Koro",
          isProviderServer: true,
        });
      }

      if (!hasJustAnimeDub) {
        dub.push({
          serverId: 9002,
          serverName: "justanime",
          providerKey: "justanime",
          providerName: "Koro",
          displayName: "Koro",
          isProviderServer: true,
        });
      }
    }

    return {
      episodeId,
      episodeNo,
      sub,
      dub,
      raw
    };
  } catch (error) {
    console.error("fetchEpisodeServers error:", error);
    return {
      episodeId,
      episodeNo: 0,
      sub: [],
      dub: [],
      raw: []
    };
  }
}

export async function fetchStreamingSources(
  episodeId: string,
  server: string = "hd-1",
  category: string = "sub",
  options: { timeoutMs?: number; animeName?: string; anilistId?: number | string | null } = {}
): Promise<StreamingData> {
  const toPositiveNumber = (value?: number | string | null): number | null => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  };

  const slugifySimple = (value?: string): string => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/["'`]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const extractEpisodeToken = (value: string): string | null => {
    const source = String(value || "").trim();
    if (!source) return null;
    const epMatch = source.match(/[?&]ep=([^&]+)/i);
    if (epMatch?.[1]) {
      try {
        return decodeURIComponent(epMatch[1]);
      } catch {
        return epMatch[1];
      }
    }
    if (/^\d+$/.test(source)) return source;
    return null;
  };

  const buildJustAnimeBaseId = (inputEpisodeId: string, animeName?: string, anilistId?: number | string | null): string | null => {
    const rawBase = String(inputEpisodeId || "").split("?")[0].trim();
    if (!rawBase) return null;

    let decodedBase = rawBase;
    try {
      decodedBase = decodeURIComponent(rawBase);
    } catch {
      decodedBase = rawBase;
    }

    if (/^[a-z0-9]+(?:-[a-z0-9]+)+-\d{5,9}$/i.test(decodedBase)) {
      return decodedBase;
    }

    const explicitAniListId = toPositiveNumber(anilistId);
    if (explicitAniListId) {
      if (new RegExp(`-${explicitAniListId}$`).test(decodedBase.toLowerCase())) {
        return decodedBase;
      }
      const simple = slugifySimple(animeName || inputEpisodeId.split("?")[0]);
      if (simple) return `${simple}-${explicitAniListId}`;
    }

    return decodedBase;
  };

  const parseStreamResponse = (results: any, fallbackServer: string): StreamingData | null => {
    const streamingLinks = results?.streamingLink || [];
    if (!Array.isArray(streamingLinks) || streamingLinks.length === 0) return null;

    const parsedSources = streamingLinks
      .map((sLink: any) => ({
        url: sLink.link || sLink.file,
        type: sLink.type,
        isM3U8: sLink.type === "hls" || sLink.link?.includes(".m3u8"),
        quality: "auto",
        server: sLink.server || fallbackServer,
        providerName: sLink.server || fallbackServer,
        isDub: category === "dub",
        language: category === "dub" ? "Dub" : "Sub",
      }))
      .filter((item: any) => !!item.url);

    if (parsedSources.length === 0) return null;

    const subtitles = (results.tracks || []).map((track: any) => ({
      lang: track.lang || track.label || "Unknown",
      url: track.url || track.src || track.file,
      label: track.lang || track.label,
    }));

    return {
      headers: { Referer: "https://justanime.fun/", "User-Agent": "Mozilla/5.0" },
      sources: parsedSources,
      subtitles,
      tracks: results.tracks,
      anilistID: results.anilistID || null,
      malID: results.malID || null,
      intro: results.intro,
      outro: results.outro,
    };
  };

  const tryJustAnimeFastFirst = async (): Promise<StreamingData | null> => {
    const enabled = String(import.meta.env.VITE_ENABLE_JUSTANIME_FAST_FIRST ?? "true").toLowerCase() !== "false";
    if (!enabled) return null;

    const requestedServer = String(server || "").trim().toLowerCase();
    if (requestedServer && requestedServer !== "hd-1" && requestedServer !== "justanime") {
      return null;
    }

    const epToken = extractEpisodeToken(episodeId);
    const baseId = buildJustAnimeBaseId(episodeId, options.animeName, options.anilistId);
    if (!epToken || !baseId) return null;

    const justAnimeEpisodeId = `${baseId}?ep=${epToken}`;
    const justAnimeUrl = `${JUSTANIME_PROXY_BASE}/stream?id=${encodeURIComponent(justAnimeEpisodeId)}&server=hd-1&type=${encodeURIComponent(category)}`;

    try {
      const response = await fetch(justAnimeUrl, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(Math.max(1000, Math.min(Number(options.timeoutMs || 4500), 7000))),
      });

      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload?.success || !payload?.results) return null;
      const parsed = parseStreamResponse(payload.results, "hd-1");
      if (!parsed) return null;

      return {
        ...parsed,
        sources: (parsed.sources || []).map((source, index) => ({
          ...source,
          server: source.server || "hd-1",
          providerKey: "justanime",
          providerName: source.providerName && String(source.providerName).toLowerCase().includes("hd")
            ? `Koro ${source.providerName}`
            : "Koro",
          langCode: source.langCode || `justanime-${index}`,
        })),
      };
    } catch {
      return null;
    }
  };

  const justAnimeFast = await tryJustAnimeFastFirst();
  if (justAnimeFast) {
    return justAnimeFast;
  }

  const targetUrl = `${API_URL}/stream?id=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(server)}&type=${encodeURIComponent(category)}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(Math.max(1200, Number(options.timeoutMs || 20000))),
    });

    if (!response.ok) throw new Error(`HiAnime Stream API returned status ${response.status}`);

    const json = await response.json();
    if (json.success && json.results) {
      const results = json.results;
      const parsed = parseStreamResponse(results, server);
      if (parsed) {
        return {
          ...parsed,
          headers: { Referer: 'https://megacloud.blog/', 'User-Agent': 'Mozilla/5.0' },
        };
      }
    }
    throw new Error('HiAnime API returned invalid response');
  } catch (error) {
    console.error('Failed to fetch from HiAnime API:', error);
    throw error;
  }
}

export async function fetchNextEpisodeSchedule(
  animeId: string
): Promise<NextEpisodeSchedule> {
  return apiGet(`/anime/${animeId}/next-episode-schedule`);
}

export function getHighQualityPoster(poster: string, _anilistId?: number | null): string {
  return getProxiedImageUrl(poster);
}

export async function fetchTatakaiEpisodeSources(
  episodeId: string,
  server: string = "hd-2",
  category: string = "sub"
): Promise<StreamingData & { malID?: number; anilistID?: number }> {
  // Use the same core function for the fallback
  const data = await fetchStreamingSources(episodeId, server, category);
  return data;
}
