import { apiGet, externalApiGet, TATAKAI_API_URL, getProxiedImageUrl } from "@/lib/api/api-client";
import { AnimeInfo, AnimeCard, EpisodeData, EpisodeServer, StreamingData, NextEpisodeSchedule } from "@/types/anime";

const STREAM_API_BASE = (import.meta.env.VITE_STREAM_API_URL || '/api').replace(/\/$/, '');

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

export async function fetchEpisodes(
  animeId: string
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
    const response = await fetch(`${STREAM_API_BASE}/servers/${encodeURIComponent(episodeId)}`);
    if (!response.ok) throw new Error("Failed to fetch servers");
    
    const json = await response.json();
    const serversArray: any[] = json.success ? json.results : json;
    let { sub, dub, raw } = Array.isArray(serversArray)
      ? parseServers(serversArray)
      : { sub: [], dub: [], raw: [] };

    if (sub.length === 0 && dub.length === 0 && raw.length === 0) {
      const streamRes = await fetch(
        `${STREAM_API_BASE}/stream?id=${encodeURIComponent(episodeId)}&server=hd-1&type=sub`
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
  category: string = "sub"
): Promise<StreamingData> {
  const targetUrl = `${STREAM_API_BASE}/stream?id=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(server)}&type=${encodeURIComponent(category)}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) throw new Error(`HiAnime Stream API returned status ${response.status}`);

    const json = await response.json();
    if (json.success && json.results) {
      const results = json.results;
      const streamingLinks = results.streamingLink || [];
      
      const subtitles = (results.tracks || []).map((track: any) => ({
        lang: track.lang || track.label || 'Unknown',
        url: track.url || track.src || track.file,
        label: track.lang || track.label
      }));

      const parsedSources = streamingLinks.map((sLink: any) => ({
        url: sLink.link || sLink.file,
        type: sLink.type,
        isM3U8: sLink.type === 'hls' || sLink.link?.includes('.m3u8'),
        quality: 'auto',
        server: sLink.server || server,
        providerName: sLink.server || server,
        isDub: category === 'dub',
        language: category === 'dub' ? 'Dub' : 'Sub',
      }));

      return {
        headers: { Referer: 'https://megacloud.blog/', 'User-Agent': 'Mozilla/5.0' },
        sources: parsedSources,
        subtitles,
        tracks: results.tracks,
        anilistID: results.anilistID || null,
        malID: results.malID || null,
        intro: results.intro,
        outro: results.outro
      };
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
