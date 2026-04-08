import { apiGet, externalApiGet, TATAKAI_API_URL } from "@/lib/api/api-client";
import { StreamingData, StreamingSource, Subtitle } from "@/types/anime";
import { fetchStreamingSources, fetchTatakaiEpisodeSources } from "./anime.service";
import { fetchCustomSupabaseSources, fetchTatakaiProviderSources } from "./provider.service";

function inferSeasonFromContext(animeName?: string, episodeId?: string): number {
  const haystack = `${animeName || ""} ${episodeId || ""}`.toLowerCase();
  const patterns = [
    /season\s*(\d{1,2})/i,
    /s(\d{1,2})\b/i,
    /staffel\s*(\d{1,2})/i,
    /part\s*(\d{1,2})/i,
    /cour\s*(\d{1,2})/i,
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 1;
}

function mergeSubtitleLikeLists(
  ...lists: Array<Array<{ url?: string; file?: string; lang?: string; label?: string; [key: string]: any }> | undefined>
) {
  const merged: Subtitle[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const item of list || []) {
      if (!item) continue;
      const url = typeof item.url === 'string' && item.url.trim()
        ? item.url.trim()
        : (typeof item.file === 'string' ? item.file.trim() : '');
      if (!url) continue;
      const lang = typeof item.lang === 'string' && item.lang.trim()
        ? item.lang.trim()
        : (typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Unknown');
      const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : lang;
      const identity = `${url}|${lang}|${label}`.toLowerCase();
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      merged.push({
        ...(item as Record<string, unknown>),
        url,
        lang,
        label,
        file: typeof item.file === 'string' && item.file.trim() ? item.file.trim() : url,
      } as Subtitle);
    }
  }

  return merged;
}

// Extract video URL from embed page using Puppeteer service
export async function extractEmbedVideo(
  embedUrl: string,
  timeout: number = 30000
): Promise<{
  success: boolean;
  sources?: Array<{
    url: string;
    type: 'hls' | 'mp4' | 'unknown';
    quality?: string;
  }>;
  error?: string;
}> {
  const extractorUrl = import.meta.env.VITE_EXTRACTOR_SERVICE_URL || 'http://localhost:3001';
  try {
    const response = await fetch(`${extractorUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: embedUrl, timeout })
    });
    if (!response.ok) throw new Error(`Extractor service error: ${response.status}`);
    return response.json();
  } catch (error) {
    console.error('Extract embed video failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Global combined source fetcher
export async function fetchCombinedSources(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-1",
  category: string = "sub",
  currentUserId?: string
): Promise<StreamingData & { hasTatakaiAPI: boolean }> {
  if (!episodeId) throw new Error("Episode ID required");

  let primaryData: StreamingData = {
    headers: { Referer: "", "User-Agent": "" },
    sources: [],
    subtitles: [],
    anilistID: null,
    malID: null
  };
  let directHiAnimeSuccess = false;

  try {
    primaryData = await fetchStreamingSources(episodeId, server, category);
    directHiAnimeSuccess = true;
  } catch (error) {
    console.warn('Direct HiAnime API failed, trying TatakaiAPI fallback');
    try {
      const fallback = await fetchTatakaiEpisodeSources(episodeId, server, category);
      primaryData = fallback;
    } catch (f) {
      console.warn('All HiAnime source attempts failed');
    }
  }

  let malID = primaryData.malID || undefined;
  let anilistID = primaryData.anilistID || undefined;
  const hasTatakaiAPI = directHiAnimeSuccess;

  let providerData: StreamingData & { providerServers?: Array<any> } = {
    headers: { Referer: "", "User-Agent": "" },
    sources: [],
    subtitles: [],
    anilistID: null,
    malID: null,
    providerServers: [],
  };

  try {
    const inferredSeason = inferSeasonFromContext(animeName, episodeId);
    providerData = await fetchTatakaiProviderSources({
      animeId: episodeId?.split("?")[0],
      animeName,
      episodeNumber,
      season: inferredSeason,
      category: category as "sub" | "dub",
      anilistId: anilistID,
      malId: malID,
    });
  } catch (error) {
    console.warn("Tatakai provider aggregation failed:", error);
  }

  // Always include custom/marketplace sources in returned payload.
  let customSources: any[] = [];
  try {
    customSources = await fetchCustomSupabaseSources(episodeId.split('?')[0], episodeId, episodeNumber, currentUserId);
  } catch {
    customSources = [];
  }

  // Fetch Marketplace Subtitles
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    let { data: marketplaceSubtitles, error: subError } = await supabase
      .from('marketplace_items')
      .select('*, profiles!user_id(display_name, username)')
      .eq('status', 'approved')
      .eq('type', 'subtitle')
      .eq('anime_id', episodeId.split('?')[0])
      .eq('episode_number', episodeNumber || 1);

    if (subError || !marketplaceSubtitles) {
      const { data: simpleSubData } = await supabase.from('marketplace_items').select('*').eq('status', 'approved').eq('type', 'subtitle').eq('anime_id', episodeId.split('?')[0]).eq('episode_number', episodeNumber || 1);
      marketplaceSubtitles = simpleSubData;
    }

    if (marketplaceSubtitles) {
      const extraSubs = marketplaceSubtitles.map((item: any) => ({
        lang: item.data.lang || 'Custom',
        url: item.data.url,
        label: `${item.data.label || 'Sub'} (by ${item.profiles?.display_name || item.profiles?.username || 'Community'})`,
        contributorDisplay: item.profiles?.display_name || item.profiles?.username || 'Community',
        contributorUsername: item.profiles?.username || 'user'
      }));
      primaryData.subtitles = [...(primaryData.subtitles || []), ...extraSubs];
    }
  } catch (e) {
    console.warn('Marketplace subtitles fetch failed:', e);
  }

  const allSources = [
    ...(primaryData.sources || []),
    ...(providerData.sources || []),
    ...(Array.isArray(customSources) ? customSources : [])
  ];

  const mergedProviderServers = [
    ...((providerData.providerServers || []) as any[]),
  ];

  return {
    sources: allSources,
    subtitles: mergeSubtitleLikeLists(primaryData.subtitles as any[], providerData.subtitles as any[]),
    tracks: mergeSubtitleLikeLists(primaryData.tracks as any[], providerData.tracks as any[]),
    providerServers: mergedProviderServers,
    anilistID: typeof anilistID === 'string' ? parseInt(anilistID) : (anilistID || null),
    malID: typeof malID === 'string' ? parseInt(malID) : (malID || null),
    intro: primaryData.intro,
    outro: primaryData.outro,
    headers: primaryData.headers,
    hasTatakaiAPI
  };
}
