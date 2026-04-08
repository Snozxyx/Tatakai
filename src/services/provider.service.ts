import { TATAKAI_API_URL, getProxiedImageUrl, externalApiGet } from "@/lib/api/api-client";
import { EpisodeServer, StreamingData, StreamingSource, Subtitle } from "@/types/anime";

// ──────────────────────────────────────────────────────────────
// Shared helper — every provider just uses plain fetch() now.
// The Vite dev proxy handles CORS (→ localhost:9000).
// ──────────────────────────────────────────────────────────────
const TIMEOUT = 4500; // Reduced from 12s to allow multiple fetches within 6s provider timeout
const ANIME_MAPPER_API = "https://anime-mapper.vercel.app";
const TOONSTREAM_NEGATIVE_CACHE_TTL = 10 * 60 * 1000;
const MAPPER_DISABLE_TTL = 30 * 1000; // 30 seconds (was 30 min causing 12-provider blackout on 402 errors)
const PROVIDER_ENDPOINT_COOLDOWN_TTL = 15 * 60 * 1000;
const PROVIDER_EXECUTION_TIMEOUT_MS = 1800;
const PROVIDER_MAX_CONCURRENCY = 1; // Keep provider fan-out serialized for weak/self-hosted APIs
const BACKGROUND_RETRY_CONCURRENCY = 1;
const toonstreamNegativePathCache = new Map<string, number>();
const providerEndpointCooldown = new Map<string, number>();
let mapperDisabledUntil = 0;

// ─── Background Retry Cache ───
// Stores in-flight and completed provider retries for each episode
type ProviderRetryState = {
  inProgress: boolean;
  results: Map<string, StreamingSource[]>; // provider key → sources
  lastRetry: number;
  retryCount: number;
};
const providerRetryCache = new Map<string, ProviderRetryState>();
const BACKGROUND_RETRY_DELAY = 500; // Keep first retry quick for progressive discovery
const BACKGROUND_RETRY_INTERVAL = 2000; // Back off to avoid hammering failing providers
const MAX_BACKGROUND_RETRIES = 6; // Cap retry window to reduce churn and request floods

// Clean up old cache entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  for (const [key, state] of providerRetryCache.entries()) {
    if (now - state.lastRetry > maxAge) {
      providerRetryCache.delete(key);
    }
  }
}, 30 * 60 * 1000);

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: limit }).map(async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

type MapperResolution = {
  id?: string;
  malId?: number;
  anilistId?: number;
  source?: "mapper" | "search" | "direct";
  alias?: string;
};

const PROVIDER_MAPPER_ALIASES: Record<string, string[]> = {
  animekai: ["animekai"],
  animepahe: ["animepahe"],
  animelok: ["animelok"],
  animeya: ["animeya"],
  desidub: ["desidub", "desidubanime"],
  toonstream: ["toonstream"],
  aniworld: ["aniworld"],
  toonworld: ["toonworld"],
  watchaw: ["watchaw", "watchanimeworld"],
  hindidubbed: ["hindidubbed", "animehindidubbed"],
  techinmind: ["techinmind", "hindiapi", "anilisthindi"],
};

const COOLDOWN_PREFIXES: string[] = [];

function getCooldownPrefix(path: string): string | null {
  for (const prefix of COOLDOWN_PREFIXES) {
    if (path.startsWith(prefix)) return prefix;
  }
  return null;
}

function isProviderEndpointCoolingDown(path: string): boolean {
  const prefix = getCooldownPrefix(path);
  if (!prefix) return false;
  const expiresAt = providerEndpointCooldown.get(prefix);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    providerEndpointCooldown.delete(prefix);
    return false;
  }
  return true;
}

function markProviderEndpointCooldown(path: string): void {
  const prefix = getCooldownPrefix(path);
  if (!prefix) return;
  providerEndpointCooldown.set(prefix, Date.now() + PROVIDER_ENDPOINT_COOLDOWN_TTL);
}

function isMapperDisabled(): boolean {
  if (Date.now() > mapperDisabledUntil) {
    mapperDisabledUntil = 0;
    return false;
  }
  return mapperDisabledUntil > 0;
}

function disableMapperTemporarily(): void {
  mapperDisabledUntil = Date.now() + MAPPER_DISABLE_TTL;
}

async function fetchMapperMap(alias: string, anilistId: number): Promise<any | null> {
  if (isMapperDisabled()) return null;
  try {
    const res = await fetch(`${ANIME_MAPPER_API}/${alias}/map/${anilistId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) {
      if (res.status === 402 || res.status === 401 || res.status === 403 || res.status === 429) {
        disableMapperTemporarily();
      }
      return null;
    }
    return await res.json();
  } catch {
    disableMapperTemporarily();
    return null;
  }
}

async function providerFetch<T = any>(path: string, timeout = TIMEOUT): Promise<T | null> {
  if (isProviderEndpointCoolingDown(path)) return null;
  try {
    const res = await fetch(`${TATAKAI_API_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 405) {
        markProviderEndpointCooldown(path);
      }
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function providerFetchText(path: string, timeout = TIMEOUT): Promise<string | null> {
  try {
    const res = await fetch(`${TATAKAI_API_URL}${path}`, {
      headers: { Accept: "application/json,text/plain,*/*" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cleanedSearchTitle(value?: string): string {
  if (!value) return "";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+season\s+\d+$/i, "")
    .replace(/\s+part\s+\d+$/i, "")
    .replace(/\s+\d{4,}$/g, "")
    .trim();
}

function normalizeMatchTitle(value?: string): string {
  return cleanedSearchTitle(value)
    .replace(/\bshippuden\b/gi, "shippuuden")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function scoreSearchCandidate(candidate: any, query: string): number {
  const needle = normalizeMatchTitle(query);
  const haystack = normalizeMatchTitle([candidate?.title, candidate?.name, candidate?.slug].filter(Boolean).join(" "));
  if (!needle || !haystack) return 0;
  if (haystack === needle) return 100;

  let score = 0;
  const tokens = needle.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (haystack.includes(token)) score += 2;
  }
  if (haystack.includes(needle)) score += 5;
  if (needle.includes(haystack)) score += 3;
  return score;
}

function subtitleKey(subtitle: Subtitle): string {
  return [subtitle.lang || "", subtitle.label || "", subtitle.url || subtitle.file || ""].join("|").toLowerCase();
}

function normalizeSubtitleEntry(entry: any, fallbackLang = "Subtitles"): Subtitle | null {
  if (!entry || typeof entry !== "object") return null;
  const url = entry.url || entry.src || entry.file || entry.href || entry.subtitleUrl || entry.subUrl;
  if (typeof url !== "string" || !url.trim()) return null;

  const lang = String(entry.lang || entry.language || entry.label || fallbackLang || "Subtitles").trim() || fallbackLang;
  const label = String(entry.label || entry.name || entry.language || entry.lang || lang).trim() || lang;

  return {
    lang,
    url: url.trim(),
    label,
    kind: entry.kind,
    file: typeof entry.file === "string" ? entry.file.trim() : url.trim(),
  };
}

function collectSubtitleEntries(value: any): Subtitle[] {
  const collected: Subtitle[] = [];
  const seen = new Set<string>();

  const addEntry = (entry: any, fallbackLang?: string) => {
    const normalized = normalizeSubtitleEntry(entry, fallbackLang);
    if (!normalized) return;
    const key = subtitleKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    collected.push(normalized);
  };

  const walk = (node: any, fallbackLang?: string) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, fallbackLang);
      return;
    }
    if (typeof node !== "object") return;

    addEntry(node, fallbackLang);

    const nestedKeys = ["subtitles", "subtitle", "tracks", "captions"];
    for (const key of nestedKeys) {
      const child = node[key];
      if (child) {
        walk(child, fallbackLang || String((node as any).lang || (node as any).language || (node as any).label || ""));
      }
    }
  };

  walk(value);
  return collected;
}

function mergeSubtitleLists(existing: Subtitle[], additions: Subtitle[]): Subtitle[] {
  const merged = [...existing];
  const seen = new Set(merged.map((subtitle) => subtitleKey(subtitle)));
  for (const subtitle of additions) {
    const key = subtitleKey(subtitle);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(subtitle);
  }
  return merged;
}

function extractTrailingAniListId(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(?:^|[-_/])(\d{4,})$/);
  return match ? toPositiveNumber(match[1]) : undefined;
}

function stripEpisodeSuffix(value: string): string {
  return value.replace(/(?:\?ep=\d+|-\d+x\d+)$/i, "").replace(/[?&]ep=\d+$/i, "");
}

function shouldSkipCachedToonstreamPath(path: string): boolean {
  const expiresAt = toonstreamNegativePathCache.get(path);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    toonstreamNegativePathCache.delete(path);
    return false;
  }
  return true;
}

async function providerFetchToonstream<T = any>(path: string, timeout = 4000): Promise<T | null> {
  if (shouldSkipCachedToonstreamPath(path)) return null;
  const json = await providerFetch<T>(path, timeout);
  if (!json) {
    toonstreamNegativePathCache.set(path, Date.now() + TOONSTREAM_NEGATIVE_CACHE_TTL);
  }
  return json;
}

function shouldAttemptHindiDubbedHls(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const normalized = url.toLowerCase();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) return false;
  // Shortener links frequently return 400 on /episode/hls resolver; treat as direct/embed source.
  if (/https?:\/\/(short\.icu|bit\.ly|tinyurl\.com|cutt\.ly|t\.co)\//i.test(normalized)) return false;
  return true;
}

async function resolveProviderMap(
  providerKey: keyof typeof PROVIDER_MAPPER_ALIASES,
  anilistId?: number
): Promise<MapperResolution | null> {
  if (!anilistId || isMapperDisabled()) return null;
  const aliases = PROVIDER_MAPPER_ALIASES[providerKey] || [providerKey];

  for (const alias of aliases) {
    const payload = await fetchMapperMap(alias, anilistId);
    if (!payload) {
      continue;
    }
    const block = payload?.[alias] || payload?.[providerKey] || payload;
    const mappedId = block?.id || block?.slug || block?.episodeId;
    if (mappedId) {
      return {
        id: String(mappedId),
        malId: toPositiveNumber(block?.malId ?? block?.malID),
        anilistId: toPositiveNumber(block?.anilistId ?? block?.anilistID) || anilistId,
        source: "mapper",
        alias,
      };
    }
  }

  return null;
}

function normalizeProviderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function prettyProviderName(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildProviderKey(providerName: string, fallback: string): string {
  return normalizeProviderKey(providerName || fallback);
}

function annotateProviderSources(
  sources: StreamingSource[],
  providerName: string,
  fallbackKey: string,
  extras: Partial<StreamingSource> = {}
): StreamingSource[] {
  const providerKey = buildProviderKey(providerName, fallbackKey);
  return sources.map((source, index) => ({
    ...source,
    ...extras,
    providerName: source.providerName || providerName,
    providerKey: source.providerKey || providerKey,
    server: source.server || source.providerKey || providerKey,
    langCode: source.langCode || `${(source.providerKey || providerKey)}-${index}`,
  }));
}

function buildSourceDedupeKey(source: StreamingSource): string {
  return [
    String(source.url || "").trim().toLowerCase(),
    String(source.providerKey || source.server || source.providerName || "").trim().toLowerCase(),
    String(source.langCode || source.language || "").trim().toLowerCase(),
    String(source.quality || "").trim().toLowerCase(),
    source.isEmbed ? "embed" : "direct",
    source.isM3U8 ? "m3u8" : "file",
  ].join("|");
}

function buildProviderServerGroups(sources: StreamingSource[]) {
  const groups = new Map<string, { sources: StreamingSource[]; displayName: string }>();
  const stableDisplayNames: Record<string, string> = {
    animelok: "Animelok",
    watchaw: "WatchAW",
  };

  for (const source of sources) {
    const providerKey = normalizeProviderKey(
      source.providerKey || source.server || source.providerName || source.langCode || "provider"
    );
    const displayName = stableDisplayNames[providerKey] || source.providerName || source.server || prettyProviderName(providerKey);
    const group = groups.get(providerKey);
    if (group) {
      group.sources.push(source);
    } else {
      groups.set(providerKey, { sources: [source], displayName });
    }
  }

  return Array.from(groups.entries())
    .map(([providerKey, group], index) => {
      const first = group.sources[0];
      const sourceCount = group.sources.length;
      const hasM3U8 = group.sources.some((source) => source.isM3U8 || source.url?.includes(".m3u8"));
      const hasEmbed = group.sources.some((source) => source.isEmbed);
      const hasDub = group.sources.some((source) => source.isDub !== false);
      const languages = Array.from(new Set(group.sources.map((source) => source.language || "Unknown")));

      return {
        serverId: index + 1,
        serverName: providerKey,
        providerKey,
        providerName: first.providerName || group.displayName,
        displayName: group.displayName,
        isProviderServer: true,
        sourceCount,
        language: languages[0] || "Unknown",
        isDub: hasDub,
        isEmbed: hasEmbed,
        hasM3U8,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ──────────────────────────────────────────────────────────────
// Jikan (MAL) cover fetcher
// ──────────────────────────────────────────────────────────────
export async function fetchJikanCover(
  malId: number | null | undefined,
  fallbackPoster: string
): Promise<string> {
  if (!malId) return getProxiedImageUrl(fallbackPoster);
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    const json = await res.json();
    const url: string | undefined =
      json?.data?.images?.webp?.large_image_url ||
      json?.data?.images?.jpg?.large_image_url;
    if (url) return getProxiedImageUrl(url);
  } catch {
    // fall through
  }
  return getProxiedImageUrl(fallbackPoster);
}

// ──────────────────────────────────────────────────────────────
// WatchAnimeWorld
// ──────────────────────────────────────────────────────────────
export async function fetchWatchanimeworldSources(
  episodeUrl: string
): Promise<StreamingData> {
  const empty: StreamingData = {
    headers: { Referer: "", "User-Agent": "" },
    sources: [],
    subtitles: [],
    anilistID: null,
    malID: null,
  };
  const json = await providerFetch<any>(`/watchaw/episode?id=${encodeURIComponent(episodeUrl)}`);
  const sourceEntries = (
    json?.sources ||
    json?.servers ||
    json?.data?.sources ||
    json?.data?.servers ||
    json?.results ||
    json?.data?.results ||
    []
  );
  if (Array.isArray(sourceEntries) && sourceEntries.length > 0) {
    return {
      ...empty,
      sources: sourceEntries
        .map((s: any, i: number) => {
          const url = s?.url || s?.directUrl || s?.src || s?.link || s?.proxiedUrl;
          if (!url) return null;
          return {
            url,
            isM3U8: Boolean(s?.isM3U8 || s?.type === "hls" || url.includes(".m3u8")),
            quality: s?.quality || s?.label || "HD",
            language: s?.language || "Unknown",
            langCode: `watchaw-${i}`,
            isDub: true,
            providerName: s?.name || `WatchAW ${i + 1}`,
            providerKey: "watchaw",
            server: "watchaw",
            isEmbed: s?.isEmbed ?? !url.includes(".m3u8"),
            needsHeadless: false,
            subtitles: collectSubtitleEntries(s?.subtitles || s?.tracks || s?.captions),
          };
        })
        .filter(Boolean) as StreamingSource[],
      subtitles: collectSubtitleEntries(json?.subtitles || json?.data?.subtitles || json?.tracks || json?.data?.tracks),
      malID: json?.malId || json?.malID || json?.data?.malId || json?.data?.malID || null,
      anilistID: json?.anilistId || json?.anilistID || json?.data?.anilistId || json?.data?.anilistID || null,
    };
  }

  // Fallback: same upstream family via toonworld endpoint when watchaw payload is empty.
  const parsed = episodeUrl.match(/^(.+?)-(\d+)x(\d+)$/i);
  if (parsed) {
    const [, fallbackSlug, fallbackSeason, fallbackEpisode] = parsed;
    const fallbackJson = await providerFetch<any>(
      `/toonworld/episode?slug=${encodeURIComponent(fallbackSlug)}&season=${fallbackSeason}&episode=${fallbackEpisode}`
    );
    const fallbackEntries = fallbackJson?.sources || fallbackJson?.data?.sources || [];
    if (Array.isArray(fallbackEntries) && fallbackEntries.length > 0) {
      return {
        ...empty,
        sources: fallbackEntries
          .map((s: any, i: number) => {
            const url = s?.url || s?.directUrl || s?.src || s?.link;
            if (!url) return null;
            return {
              url,
              isM3U8: Boolean(s?.isM3U8 || s?.type === "hls" || url.includes(".m3u8")),
              quality: s?.quality || "HD",
              language: s?.language || "Unknown",
              langCode: `watchaw-fallback-${i}`,
              isDub: true,
              providerName: s?.provider || s?.name || `WatchAW Fallback ${i + 1}`,
              providerKey: "watchaw",
              server: "watchaw",
              isEmbed: !url.includes(".m3u8"),
              needsHeadless: false,
              subtitles: collectSubtitleEntries(s?.subtitles || s?.tracks || s?.captions),
            };
          })
          .filter(Boolean) as StreamingSource[],
        subtitles: collectSubtitleEntries(fallbackJson?.subtitles || fallbackJson?.data?.subtitles || fallbackJson?.tracks || fallbackJson?.data?.tracks),
        malID: fallbackJson?.malId || fallbackJson?.malID || null,
        anilistID: fallbackJson?.anilistId || fallbackJson?.anilistID || null,
      };
    }
  }

  return empty;
}

export async function fetchWatchanimeworldFromContext(
  animeName: string,
  episodeNumber: number,
  season: number,
  anilistId?: number,
  animeSlug?: string
): Promise<StreamingData> {
  const empty: StreamingData = {
    headers: { Referer: "", "User-Agent": "" },
    sources: [],
    subtitles: [],
    anilistID: anilistId || null,
    malID: null,
  };

  const derivedAniListId = anilistId ?? extractTrailingAniListId(animeSlug);
  const mapper = await resolveProviderMap("watchaw", derivedAniListId);
  const seasonCandidates = Array.from(new Set([
    season,
    season === 1 ? 2 : 1,
    season + 1,
    2,
    1,
  ].filter((v) => Number.isFinite(v) && v > 0)));
  if (mapper?.id) {
    const normalizedMapperId = stripEpisodeSuffix(mapper.id);
    if (/\?ep=|\dx\d/i.test(normalizedMapperId)) {
      const mapped = await fetchWatchanimeworldSources(normalizedMapperId);
      if (mapped.sources.length > 0) return mapped;
    } else {
      for (const s of seasonCandidates) {
        const mapped = await fetchWatchanimeworldSources(`${normalizedMapperId}-${s}x${episodeNumber}`);
        if (mapped.sources.length > 0) return mapped;
        if (episodeNumber !== 1) {
          const mappedEp1 = await fetchWatchanimeworldSources(`${normalizedMapperId}-${s}x1`);
          if (mappedEp1.sources.length > 0) return mappedEp1;
        }
      }
    }
  }

  const q = cleanedSearchTitle(animeName);
  if (!q) return empty;
  
  const searchJson = await providerFetch<any>(`/watchaw/search?q=${encodeURIComponent(q)}`);
  const results = searchJson?.results || searchJson?.data?.results || [];
  if (!Array.isArray(results) || results.length === 0) return empty;

  const scoreTitle = (item: any): number => scoreSearchCandidate(item, q);

  const slugCandidates = Array.from(
    new Set(
      [...results]
        .sort((a: any, b: any) => scoreTitle(b) - scoreTitle(a))
        .slice(0, 6)
        .map((item: any) => stripEpisodeSuffix(String(item?.slug || item?.id || "")))
        .filter(Boolean)
    )
  );
  if (slugCandidates.length === 0) return empty;

  // Try all season/episode combinations for each candidate
  for (const candidateSlug of slugCandidates) {
    // Standard season + episode format
    for (const s of seasonCandidates) {
      const resolved = await fetchWatchanimeworldSources(`${candidateSlug}-${s}x${episodeNumber}`);
      if (resolved.sources.length > 0) return resolved;
    }
    
    // Fallback: try season 1 for each season candidate separately
    for (const s of seasonCandidates) {
      const ep1 = await fetchWatchanimeworldSources(`${candidateSlug}-${s}x1`);
      if (ep1.sources.length > 0) return ep1;
    }

    // Try no season prefix
    const noSeasonResolved = await fetchWatchanimeworldSources(`${candidateSlug}-1x${episodeNumber}`);
    if (noSeasonResolved.sources.length > 0) return noSeasonResolved;
    
    // Last resort: any candidate with ep 1
    const noSeasonEp1 = await fetchWatchanimeworldSources(`${candidateSlug}-1x1`);
    if (noSeasonEp1.sources.length > 0) return noSeasonEp1;
  }

  // Final fallback: try home catalog to find any working title
  const homeJson = await providerFetch<any>(`/watchaw/home`);
  const featured = homeJson?.featured || homeJson?.data?.featured || [];
  const lowerQ = q.toLowerCase();
  const catalogCandidates = Array.from(
    new Set(
      featured
        .filter((item: any) => {
          const itemTitle = String(item?.title || item?.name || "").toLowerCase();
          return itemTitle.includes(lowerQ.split(/\s+/)[0] || "");
        })
        .map((item: any) => stripEpisodeSuffix(String(item?.slug || item?.id || "")))
        .filter(Boolean)
        .slice(0, 3)
    )
  );

  for (const catalogSlug of catalogCandidates) {
    for (const s of seasonCandidates) {
      const resolved = await fetchWatchanimeworldSources(`${catalogSlug}-${s}x${episodeNumber}`);
      if (resolved.sources.length > 0) return resolved;
    }
    // Try ep 1 too
    const ep1 = await fetchWatchanimeworldSources(`${catalogSlug}-1x1`);
    if (ep1.sources.length > 0) return ep1;
  }
  
  return empty;
}

// ──────────────────────────────────────────────────────────────
// AnimeHindiDubbed
// ──────────────────────────────────────────────────────────────
export async function fetchAnimeHindiDubbedData(
  slug: string,
  _episode?: number
): Promise<any> {
  const json = await providerFetch<any>(`/hindidubbed/anime/${encodeURIComponent(slug)}`);
  if (json) return json;
  // Supabase fallback (kept as-is for prod)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Supabase URL not configured");
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const params = new URLSearchParams({ action: "anime", slug });
  if (_episode !== undefined) {
    params.set("episode", _episode.toString());
    params.set("ep", _episode.toString());
  }
  if (apikey) params.set("apikey", apikey);
  const url = `${supabaseUrl}/functions/v1/animehindidubbed-scraper?${params}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apikey) {
    headers["apikey"] = apikey;
    headers["Authorization"] = `Bearer ${apikey}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Failed to fetch AnimeHindiDubbed data: ${response.status}`);
  return response.json();
}

export async function fetchHindiDubbedSources(
  slug: string,
  episodeNumber: number,
  anilistId?: number
): Promise<StreamingSource[]> {
  const mapper = await resolveProviderMap("hindidubbed", anilistId);
  const targetSlug = mapper?.id || slug;

  let animeJson: any = null;
  try {
    animeJson = await fetchAnimeHindiDubbedData(targetSlug, episodeNumber);
  } catch {
    // fallback below
  }

  if (!animeJson) {
    try {
      animeJson = await fetchAnimeHindiDubbedData(slug, episodeNumber);
    } catch {
      return [];
    }
  }

  const episodes =
    animeJson?.episodes ||
    animeJson?.data?.episodes ||
    animeJson?.anime?.episodes ||
    animeJson?.data?.anime?.episodes ||
    [];
  const selectedEpisode = Array.isArray(episodes)
    ? episodes.find(
        (ep: any) =>
          Number(ep?.number ?? ep?.episode ?? ep?.episode_no ?? ep?.episodeNumber) === episodeNumber
      ) || episodes[0]
    : null;
  let servers = selectedEpisode?.servers || animeJson?.servers || animeJson?.data?.servers || [];

  if ((!Array.isArray(servers) || servers.length === 0) && selectedEpisode?.url) {
    if (shouldAttemptHindiDubbedHls(selectedEpisode.url)) {
      const hlsFromEpisodeUrl = await providerFetch<any>(
        `/hindidubbed/episode/hls?url=${encodeURIComponent(selectedEpisode.url)}&server=${encodeURIComponent(selectedEpisode?.name || "")}`,
        15000
      );
      const hlsList = hlsFromEpisodeUrl?.hls || hlsFromEpisodeUrl?.data?.hls || [];
      if (Array.isArray(hlsList) && hlsList.length > 0) {
        return hlsList.map((hlsUrl: string, i: number) => ({
          url: hlsUrl,
          isM3U8: true,
          quality: "HD",
          language: "Hindi",
          langCode: `hindidubbed-direct-${i}`,
          isDub: true,
          providerName: `HindiDubbed Direct ${i + 1}`,
          isEmbed: false,
          needsHeadless: false,
        }));
      }
    }
  }

  if (!Array.isArray(servers) || servers.length === 0) {
    const searchQuery = cleanedSearchTitle(slug);
    const searchJson = await providerFetch<any>(`/hindidubbed/search/${encodeURIComponent(searchQuery)}`);
    const candidates = searchJson?.animeList || searchJson?.data?.animeList || [];
    const best = Array.isArray(candidates) ? candidates.find((c: any) => c?.slug) || candidates[0] : null;
    if (best?.slug && best.slug !== targetSlug) {
      try {
        const retryAnimeJson = await fetchAnimeHindiDubbedData(best.slug, episodeNumber);
        const retryEpisodes = retryAnimeJson?.episodes || retryAnimeJson?.data?.episodes || [];
        const retryEp = Array.isArray(retryEpisodes)
          ? retryEpisodes.find(
              (ep: any) =>
                Number(ep?.number ?? ep?.episode ?? ep?.episode_no ?? ep?.episodeNumber) === episodeNumber
            ) || retryEpisodes[0]
          : null;
        servers = retryEp?.servers || retryAnimeJson?.servers || retryAnimeJson?.data?.servers || [];
      } catch {
        // ignore and fall through to empty return
      }
    }
  }

  if (!Array.isArray(servers) || servers.length === 0) return [];

  const collected: StreamingSource[] = [];
  for (const [serverIndex, server] of servers.entries()) {
    const serverUrl = server?.url;
    if (!serverUrl) continue;
    if (shouldAttemptHindiDubbedHls(serverUrl)) {
      const hlsJson = await providerFetch<any>(
        `/hindidubbed/episode/hls?url=${encodeURIComponent(serverUrl)}&server=${encodeURIComponent(server?.name || "")}`,
        15000
      );
      const hlsList = hlsJson?.hls || hlsJson?.data?.hls || [];
      if (Array.isArray(hlsList) && hlsList.length > 0) {
        hlsList.forEach((hlsUrl: string, i: number) => {
          collected.push({
            url: hlsUrl,
            isM3U8: true,
            quality: "HD",
            language: server?.language || "Hindi",
            langCode: `hindidubbed-${serverIndex}-${i}`,
            isDub: true,
            providerName: server?.name || `HindiDubbed ${serverIndex + 1}`,
            isEmbed: false,
            needsHeadless: false,
          });
        });
        continue;
      }
    }

    collected.push({
      url: serverUrl,
      isM3U8: serverUrl.includes(".m3u8"),
      quality: "HD",
      language: server?.language || "Hindi",
      langCode: `hindidubbed-${serverIndex}`,
      isDub: true,
      providerName: server?.name || `HindiDubbed ${serverIndex + 1}`,
      isEmbed: !serverUrl.includes(".m3u8"),
      needsHeadless: !serverUrl.includes(".m3u8"),
    });
  }

  return collected;
}

// ──────────────────────────────────────────────────────────────
// Animelok
// ──────────────────────────────────────────────────────────────
export async function fetchAnimelokSources(
  animeSlug: string,
  episodeNumber: number,
  anilistId?: number
): Promise<{ sources: StreamingSource[]; subtitles?: Subtitle[]; malID?: number; anilistID?: number }> {
  const derivedAniListId = anilistId ?? extractTrailingAniListId(animeSlug);

  const parseSources = (json: any): { sources: StreamingSource[]; subtitles?: Subtitle[]; malID?: number; anilistID?: number } => {
    const rawServers = json?.servers || json?.data?.servers || json?.results || json?.data?.results;
    const servers = Array.isArray(rawServers)
      ? rawServers.flatMap((server: any) => {
          if (Array.isArray(server?.sources) && server.sources.length > 0) {
            return server.sources.map((stream: any) => ({ ...server, ...stream }));
          }
          return [server];
        })
      : [];
    if (!servers || !Array.isArray(servers)) return { sources: [], subtitles: [] };
    const sources: StreamingSource[] = servers
      .map((server: any, index: number) => {
        const url = server?.url || server?.directUrl || server?.src || server?.link || server?.proxiedUrl;
        if (!url) return null;
        const isM3U8 = Boolean(server?.isM3U8 || server?.type === "hls" || url.includes(".m3u8"));
        const lang = server.language || "Unknown";
        const serverName = server.name?.toLowerCase() || "";
        let displayLang = "UNK";
        if (lang.toUpperCase().includes("HIN")) displayLang = "HIN";
        else if (lang.toUpperCase().includes("JAP")) displayLang = "JAP";
        else if (lang.toUpperCase().includes("ENG") || lang.toUpperCase() === "EN") displayLang = "ENG";
        else if (lang.toUpperCase().includes("TAM")) displayLang = "TAM";
        else if (lang.toUpperCase().includes("MAL")) displayLang = "MAL";
        else if (lang.toUpperCase().includes("TEL")) displayLang = "TEL";
        else displayLang = lang.substring(0, 3).toUpperCase();
        if (serverName.includes("cloud")) displayLang = "HIN";

        let providerName = displayLang;
        if (serverName.includes("bato")) providerName = `Totoro (${displayLang})`;
        else if (serverName.includes("kuro")) providerName = `Kuro (${displayLang})`;
        else if (serverName.includes("pahe")) providerName = `Pahe (${displayLang})`;
        else if (serverName.includes("gogo")) providerName = `Gogo (${displayLang})`;
        else if (serverName.includes("stream")) providerName = `Stream (${displayLang})`;
        else if (serverName.includes("all")) providerName = `AllMight (${displayLang})`;
        else if (serverName.includes("pain")) providerName = `Pain (${displayLang})`;
        else if (serverName.includes("kaido")) providerName = `Kaido (${displayLang})`;
        else if (serverName.includes("cloud")) providerName = `Hindi (Cloud)`;
        else if (serverName.includes("multi") || server.tip?.toLowerCase()?.includes("multi")) providerName = `Multi (${displayLang})`;

        return {
          url,
          isM3U8,
          quality: server.quality || "HD",
          language: displayLang === "HIN" ? "Hindi" : displayLang === "JAP" ? "Japanese" : displayLang === "TAM" ? "Tamil" : displayLang === "MAL" ? "Malayalam" : "English",
          langCode: `animelok-${index}-${displayLang}`,
          isDub: displayLang !== "JAP",
          providerName: providerName.trim(),
          providerKey: "animelok",
          server: "animelok",
          isEmbed: !isM3U8,
          needsHeadless: !isM3U8,
          subtitles: collectSubtitleEntries(server?.subtitles || server?.tracks || server?.captions),
        };
      })
      .filter(Boolean) as StreamingSource[];
    return {
      sources,
      subtitles: collectSubtitleEntries(json?.subtitles || json?.data?.subtitles || json?.tracks || json?.data?.tracks),
      malID: json?.malId || json?.malID || json?.data?.malId || json?.data?.malID,
      anilistID: json?.anilistId || json?.anilistID || json?.data?.anilistId || json?.data?.anilistID,
    };
  };

  const mapper = await resolveProviderMap("animelok", derivedAniListId);
  if (mapper?.id) {
    const mappedJson = await providerFetch<any>(`/animelok/watch/${encodeURIComponent(mapper.id)}?ep=${episodeNumber}`);
    const mappedResult = parseSources(mappedJson);
    if (mappedResult.sources.length > 0) return mappedResult;
  }

  // Search-first approach: find anime ID via search with multiple strategies
  const searchQuery = cleanedSearchTitle(stripEpisodeSuffix(animeSlug));
  
  if (searchQuery.length > 0) {
    const searchRes = await providerFetch<any>(`/animelok/search?q=${encodeURIComponent(searchQuery)}`);
    const animes = searchRes?.animes || searchRes?.data?.animes || searchRes?.results || searchRes?.data?.results;
    
    if (animes?.length > 0) {
      const candidates = animes
        .map((a: any) => stripEpisodeSuffix(String(a?.id || a?.slug || a?.animeId || a?._id || "")))
        .filter((id: any) => typeof id === "string" && id.length > 0)
        .slice(0, 10);
      
      for (const candidate of candidates) {
        // Try exact episode first
        const json = await providerFetch<any>(`/animelok/watch/${candidate}?ep=${episodeNumber}`);
        const result = parseSources(json);
        if (result.sources.length > 0) return result;

        // Try episode 1 as fallback
        if (episodeNumber !== 1) {
          const ep1Json = await providerFetch<any>(`/animelok/watch/${candidate}?ep=1`);
          const ep1Result = parseSources(ep1Json);
          if (ep1Result.sources.length > 0) return ep1Result;
        }
      }
    }
  }

  // Fallback: try home/catalog to find anime with working episodes
  const homeRes = await providerFetch<any>(`/animelok/home`);
  const sections = homeRes?.sections || [];
  const catalogItems = sections.flatMap((sec: any) => sec?.items || []);
  const lowerSearchQuery = searchQuery.toLowerCase();
  const catalogIds = catalogItems
    .filter((item: any) => {
      const lowerTitle = String(item?.title || item?.name || "").toLowerCase();
      return lowerTitle.includes(lowerSearchQuery) || lowerSearchQuery.includes(lowerTitle.split(/\s+/)[0] || "");
    })
    .map((item: any) => stripEpisodeSuffix(String(item?.id || item?.slug || item?.animeId || "")))
    .filter(String)
    .slice(0, 5);

  for (const candidate of catalogIds) {
    if (!candidate) continue;
    const json = await providerFetch<any>(`/animelok/watch/${candidate}?ep=${episodeNumber}`);
    const result = parseSources(json);
    if (result.sources.length > 0) return result;
    if (episodeNumber !== 1) {
      const ep1Json = await providerFetch<any>(`/animelok/watch/${candidate}?ep=1`);
      const ep1Result = parseSources(ep1Json);
      if (ep1Result.sources.length > 0) return ep1Result;
    }
  }

  return { sources: [] };
}

// ──────────────────────────────────────────────────────────────
// AnimeKai (Anime-Mapper + Search-First)
// ──────────────────────────────────────────────────────────────
export async function fetchAnimeKaiSources(
  animeSlug: string,
  episodeNumber: number,
  anilistId?: number
): Promise<{ sources: StreamingSource[]; subtitles?: Subtitle[]; malID?: number; anilistID?: number }> {
  const toAnimeKaiSources = (json: any, isDub: boolean): StreamingSource[] => {
    const servers = json?.results || json?.servers || json?.data?.results || json?.data?.servers;
    if (!servers || !Array.isArray(servers)) return [];

    const providerName = `AnimeKai ${isDub ? "Dub" : "Sub"}`;
    const providerKey = `animekai-${isDub ? "dub" : "sub"}`;
    const sources: StreamingSource[] = [];

    servers.forEach((server: any, serverIndex: number) => {
      const streamEntries = Array.isArray(server?.sources) ? server.sources : [];
      const fallbackEntries = typeof server?.url === "string" && server.url.includes(".m3u8")
        ? [{ url: server.url, quality: server.quality, language: server.language }]
        : [];
      const entries = streamEntries.length > 0 ? streamEntries : fallbackEntries;

      entries.forEach((stream: any, sourceIndex: number) => {
        const url = stream?.url || stream?.directUrl || stream?.src || stream?.link || "";
        if (!url) return;
        const isM3U8 = Boolean(stream?.isM3U8 || stream?.type === "hls" || url.includes(".m3u8"));
        sources.push({
          url,
          isM3U8,
          quality: stream?.quality || server?.quality || "HD",
          language: stream?.language || server?.language || (isDub ? "Dub" : "Sub"),
          langCode: `${providerKey}-${serverIndex}-${sourceIndex}`,
          isDub,
          providerName: stream?.providerName || providerName,
          providerKey,
          server: providerKey,
          isEmbed: !isM3U8,
          needsHeadless: !isM3U8,
        });
      });
    });

    return sources;
  };

  const toAnimeKaiSubtitles = (json: any): Subtitle[] => {
    const servers = json?.results || json?.servers || json?.data?.results || json?.data?.servers;
    if (!servers || !Array.isArray(servers)) return [];

    return mergeSubtitleLists(
      [],
      servers.flatMap((server: any) => collectSubtitleEntries(server?.subtitles || server?.tracks || server?.captions))
    );
  };

  const resolveEpisodeId = async (animeId: string, epNum: number): Promise<string | null> => {
    const infoJson = await providerFetch<any>(`/animekai/info/${encodeURIComponent(animeId)}`);
    const episodes = infoJson?.episodes || infoJson?.data?.episodes || [];
    if (!Array.isArray(episodes) || episodes.length === 0) return null;
    const exact = episodes.find((ep: any) => Number(ep?.number ?? ep?.episode) === epNum);
    if (exact?.id) return exact.id;

    const near = episodes.find((ep: any) => {
      const number = Number(ep?.number ?? ep?.episode);
      return Number.isFinite(number) && Math.abs(number - epNum) <= 1;
    });
    if (near?.id) return near.id;

    return episodes[0]?.id || null;
  };

  const fetchByEpisodeId = async (episodeId: string): Promise<{ sources: StreamingSource[]; subtitles: Subtitle[] }> => {
    const subJson = await providerFetch<any>(`/animekai/watch/${encodeURIComponent(episodeId)}`);
    const dubJson = await providerFetch<any>(`/animekai/watch/${encodeURIComponent(episodeId)}?dub=true`);

    const sources = [
      ...toAnimeKaiSources(subJson, false),
      ...toAnimeKaiSources(dubJson, true),
    ];
    const subtitles = [
      ...toAnimeKaiSubtitles(subJson),
      ...toAnimeKaiSubtitles(dubJson),
    ];

    const seen = new Set<string>();
    const uniqueSources = sources.filter((source) => {
      const key = `${source.providerKey}:${source.url}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const uniqueSubtitles = mergeSubtitleLists([], subtitles);

    return {
      sources: uniqueSources,
      subtitles: uniqueSubtitles,
    };
  };

  // Strategy 1: Use anime-mapper to resolve anilistId if available
  if (anilistId) {
    const mapper = await resolveProviderMap("animekai", anilistId);
    if (mapper?.id) {
      const episodeId = await resolveEpisodeId(String(mapper.id), episodeNumber);
      const result = episodeId ? await fetchByEpisodeId(episodeId) : { sources: [], subtitles: [] };
      if (result.sources.length > 0) {
        return {
          sources: result.sources,
          subtitles: result.subtitles,
          malID: mapper.malId,
          anilistID: anilistId,
        };
      }

      // Try EP1 fallback
      if (episodeNumber !== 1) {
        const ep1Id = await resolveEpisodeId(String(mapper.id), 1);
        const ep1Result = ep1Id ? await fetchByEpisodeId(ep1Id) : { sources: [], subtitles: [] };
        if (ep1Result.sources.length > 0) {
          return {
            sources: ep1Result.sources,
            subtitles: ep1Result.subtitles,
            malID: mapper.malId,
            anilistID: anilistId,
          };
        }
      }
    }
  }

  // Strategy 2: Search-first fallback if mapper fails or no anilistId
  const searchQuery = cleanedSearchTitle(animeSlug);
  const searchRes = await providerFetch<any>(`/animekai/search/${encodeURIComponent(searchQuery)}`);
  const animes = searchRes?.results || searchRes?.data?.results || searchRes?.data || [];

  if (Array.isArray(animes) && animes.length > 0) {
    const candidates = animes
      .filter((a: any) => a?.id)
      .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery))
      .slice(0, 8);
    const episodeTargets = Array.from(new Set([
      episodeNumber,
      episodeNumber > 1 ? episodeNumber - 1 : undefined,
      episodeNumber + 1,
      1,
    ].filter((value): value is number => typeof value === "number" && value > 0)));

    for (const candidate of candidates) {
      for (const targetEpisode of episodeTargets) {
        const episodeId = await resolveEpisodeId(String(candidate.id), targetEpisode);
        const result = episodeId ? await fetchByEpisodeId(episodeId) : { sources: [], subtitles: [] };
        if (result.sources.length > 0) {
          return {
            sources: result.sources,
            subtitles: result.subtitles,
            malID: candidate.malId,
            anilistID: anilistId,
          };
        }
      }
    }
  }

  return { sources: [] };
}

// ──────────────────────────────────────────────────────────────
// Animepahe (Anime-Mapper + Search-First)
// ──────────────────────────────────────────────────────────────
export async function fetchAnimepaheSources(
  animeSlug: string,
  episodeNumber: number,
  anilistId?: number
): Promise<StreamingSource[]> {
  const toSourcesFromStreamText = (streamText: string | null): StreamingSource[] => {
    if (!streamText) return [];
    const lines = streamText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const sources: StreamingSource[] = [];
    for (const [i, line] of lines.entries()) {
      try {
        const entry = JSON.parse(line);
        const url = entry?.directUrl || entry?.url;
        if (!url) continue;
        sources.push({
          url,
          isM3U8: url.includes(".m3u8"),
          quality: entry?.quality ? `${entry.quality}p` : "HD",
          language: entry?.audio || "Japanese",
          langCode: `animepahe-${i}`,
          isDub: String(entry?.audio || "").toLowerCase().includes("eng") || String(entry?.audio || "").toLowerCase().includes("dub"),
          providerName: `AnimePahe ${entry?.quality || i + 1}`,
          isEmbed: !url.includes(".m3u8"),
          needsHeadless: false,
        });
      } catch {
        // skip malformed stream chunks
      }
    }
    return sources;
  };

  const fetchByAnimepaheId = async (animepaheId: string, epNum: number): Promise<StreamingSource[]> => {
    const episodesJson = await providerFetch<any>(`/animepahe/episodes/${encodeURIComponent(animepaheId)}`);
    const episodes = episodesJson?.results || episodesJson?.episodes || episodesJson?.data?.results || [];
    if (!Array.isArray(episodes) || episodes.length === 0) return [];

    const picked = episodes.find((ep: any) => Number(ep?.episode) === epNum) || episodes[0];
    const session = picked?.session;
    if (!session) return [];

    const streamText = await providerFetchText(
      `/animepahe/episode/${encodeURIComponent(animepaheId)}/${encodeURIComponent(session)}`,
      20000
    );
    return toSourcesFromStreamText(streamText);
  };

  // Strategy 1: Use anime-mapper to resolve anilistId
  if (anilistId) {
    const mapper = await resolveProviderMap("animepahe", anilistId);
    if (mapper?.id) {
      const episodes = await fetchByAnimepaheId(String(mapper.id), episodeNumber);
      if (episodes.length > 0) return episodes;

      // Try EP1 fallback
      if (episodeNumber !== 1) {
        return fetchByAnimepaheId(String(mapper.id), 1);
      }
    }
  }

  // Strategy 2: Search-first fallback
  const baseQuery = cleanedSearchTitle(animeSlug);
  const searchVariants = Array.from(new Set([
    baseQuery,
    baseQuery.replace(/:/g, " "),
    baseQuery.replace(/shippuden/gi, "shippuuden"),
    baseQuery.split(" ").slice(0, 2).join(" "),
  ].filter(Boolean)));

  let results: any[] = [];
  for (const query of searchVariants) {
    const searchRes = await providerFetch<any>(`/animepahe/search/${encodeURIComponent(query)}`);
    const current = searchRes?.results || searchRes?.data?.results || [];
    if (Array.isArray(current) && current.length > 0) {
      results = current;
      break;
    }
  }

  if (Array.isArray(results) && results.length > 0) {
    const ranked = [...results]
      .filter((item: any) => item?.id)
      .sort((a: any, b: any) => scoreSearchCandidate(b, baseQuery) - scoreSearchCandidate(a, baseQuery))
      .slice(0, 5);

    for (const candidate of ranked) {
      const episodes = await fetchByAnimepaheId(String(candidate.id), episodeNumber);
      if (episodes.length > 0) return episodes;

      if (episodeNumber !== 1) {
        const ep1 = await fetchByAnimepaheId(String(candidate.id), 1);
        if (ep1.length > 0) return ep1;
      }
    }
  }

  return [];
}

// ──────────────────────────────────────────────────────────────
// DesiDubAnime
// ──────────────────────────────────────────────────────────────
export async function fetchDesidubanimeSources(
  watchSlug: string,
  anilistId?: number
): Promise<StreamingSource[] | { sources: StreamingSource[]; nextEpisodeEstimates?: any[] }> {
  const toSources = (payload: any): StreamingSource[] | { sources: StreamingSource[]; nextEpisodeEstimates?: any[] } => {
    const data = payload?.data || payload;
    if (!data?.sources || !Array.isArray(data.sources)) return [];
    const sources: StreamingSource[] = data.sources.map((source: any, index: number) => ({
      url: source.url,
      isM3U8: source.isM3U8 || false,
      quality: source.quality || "default",
      language: source.language || "Unknown",
      langCode: `desidubanime-${index}-${(source.language || "unknown").toLowerCase()}`,
      isDub: source.category === "dub" || source.language?.toLowerCase().includes("hindi"),
      providerName: source.name || `DesiDub ${index + 1}`,
      isEmbed: source.isEmbed || !source.isM3U8,
      needsHeadless: source.needsHeadless || false,
    }));
    if (data.nextEpisodeEstimates?.length > 0) {
      return { sources, nextEpisodeEstimates: data.nextEpisodeEstimates };
    }
    return sources;
  };

  const mapper = await resolveProviderMap("desidub", anilistId);
  if (mapper?.id) {
    const mapped = await providerFetch<any>(`/desidub/watch/${encodeURIComponent(mapper.id)}`);
    const mappedParsed = toSources(mapped);
    if (Array.isArray(mappedParsed) ? mappedParsed.length > 0 : mappedParsed.sources.length > 0) {
      return mappedParsed;
    }
  }

  const direct = await providerFetch<any>(`/desidub/watch/${watchSlug}`);
  const directParsed = toSources(direct);
  if (Array.isArray(directParsed) ? directParsed.length > 0 : directParsed.sources.length > 0) {
    return directParsed;
  }

  const searchQuery = cleanedSearchTitle(watchSlug).replace(/\s+\d+$/, "").trim();
  const search = await providerFetch<any>(`/desidub/search?q=${encodeURIComponent(searchQuery)}`);
  const candidates = search?.animes || search?.data?.animes || search?.results || search?.data?.results || [];
  if (Array.isArray(candidates) && candidates.length > 0) {
    const best = candidates.find((item: any) => {
      const id = String(item?.id || "").toLowerCase();
      return id.includes(String(watchSlug).toLowerCase()) || String(watchSlug).toLowerCase().includes(id);
    }) || candidates[0];
    const bestId = best?.id || best?.slug;
    if (bestId) {
      const infoJson = await providerFetch<any>(`/desidub/info/${encodeURIComponent(bestId)}`);
      const infoEpisodes = infoJson?.episodes || infoJson?.data?.episodes || [];
      if (Array.isArray(infoEpisodes) && infoEpisodes.length > 0) {
        const epFromSlug = String(watchSlug).match(/(\d+)(?:$|[^\d])/);
        const wantedEp = epFromSlug ? Number(epFromSlug[1]) : 1;
        const pickedEpisode = infoEpisodes.find((ep: any) => Number(ep?.number) === wantedEp) || infoEpisodes[0];
        const watchId = pickedEpisode?.id || pickedEpisode?.slug;
        if (watchId) {
          const retried = await providerFetch<any>(`/desidub/watch/${encodeURIComponent(watchId)}`);
          const retryParsed = toSources(retried);
          if (Array.isArray(retryParsed) ? retryParsed.length > 0 : retryParsed.sources.length > 0) {
            return retryParsed;
          }
        }
      }
    }
  }

  return [];
}

// ──────────────────────────────────────────────────────────────
// Aniworld
// ──────────────────────────────────────────────────────────────
export async function fetchAniworldSources(
  slug: string,
  episodeNumber: number,
  season: number,
  anilistId?: number
): Promise<StreamingSource[]> {
  const parseResponse = (json: any): StreamingSource[] => {
    const data = json?.data || json;
    const entries = data?.sources || data?.servers || data?.results || [];
    if (Array.isArray(entries)) {
      return entries
        .map((s: any, i: number) => {
          const url = s?.url || s?.directUrl || s?.src || s?.link;
          if (!url) return null;
          return {
            url,
            isM3U8: Boolean(s?.isM3U8 || s?.type === "hls" || url.includes(".m3u8")),
            quality: s?.quality || "HD",
            language: s?.language || "German",
            langCode: `aniworld-${i}-${(s?.langCode || "de").toLowerCase()}`,
            isDub: s?.isDub !== false,
            providerName: s?.name || `Aniworld ${i + 1}`,
            isEmbed: s?.isEmbed ?? !url.includes(".m3u8"),
            needsHeadless: Boolean(s?.needsHeadless) || !url.includes(".m3u8"),
          };
        })
        .filter(Boolean) as StreamingSource[];
    }
    return [];
  };

  const mapper = await resolveProviderMap("aniworld", anilistId);
  if (mapper?.id) {
    const mappedWithSeason = mapper.id.includes("staffel-") ? mapper.id : `${mapper.id}/staffel-${season}`;
    const mappedJson = await providerFetch<any>(`/aniworld/watch/${encodeURIComponent(mappedWithSeason)}/episode/${episodeNumber}`);
    const mappedParsed = parseResponse(mappedJson);
    if (mappedParsed.length > 0) return mappedParsed;
  }

  // Attempt 1: Try direct slug first
  const seasonSlug = slug.includes("staffel-") ? slug : `${slug}/staffel-${season}`;
  const json = await providerFetch<any>(`/aniworld/watch/${seasonSlug}/episode/${episodeNumber}`);
  const parsed = parseResponse(json);
  if (parsed.length > 0) return parsed;

  if (season !== 1) {
    const seasonOneJson = await providerFetch<any>(`/aniworld/watch/${slug}/staffel-1/episode/${episodeNumber}`);
    const seasonOneParsed = parseResponse(seasonOneJson);
    if (seasonOneParsed.length > 0) return seasonOneParsed;
  }

  // Attempt 2: Search-first fallback
  const searchQuery = cleanedSearchTitle(slug);
  const searchRes = await providerFetch<any>(`/aniworld/search/${encodeURIComponent(searchQuery)}`);
  const results = searchRes?.results || [];
  if (Array.isArray(results) && results.length > 0) {
    const firstResult = results[0];
    const searchSlug = firstResult?.slug || firstResult?.id;
    if (searchSlug) {
      const searchSeasonSlug = searchSlug.includes("staffel-") ? searchSlug : `${searchSlug}/staffel-${season}`;
      const searchJson = await providerFetch<any>(`/aniworld/watch/${searchSeasonSlug}/episode/${episodeNumber}`);
      const searchParsed = parseResponse(searchJson);
      if (searchParsed.length > 0) return searchParsed;

      // Try EP1 fallback
      if (episodeNumber !== 1) {
        const ep1Json = await providerFetch<any>(`/aniworld/watch/${searchSeasonSlug}/episode/1`);
        return parseResponse(ep1Json);
      }
    }

    // Attempt 3: episode index fallback via info endpoint
    const infoJson = await providerFetch<any>(`/aniworld/info/${encodeURIComponent(searchSlug || "")}`);
    const infoEpisodes = infoJson?.episodes || infoJson?.data?.episodes || [];
    if (Array.isArray(infoEpisodes) && infoEpisodes.length > 0) {
      const picked = infoEpisodes.find((ep: any) => Number(ep?.number) === episodeNumber) || infoEpisodes[0];
      const epUrl = picked?.url || "";
      const watchPath = typeof epUrl === "string" ? epUrl.split("/anime/stream/")[1] : "";
      const match = watchPath.match(/^(.+)\/episode-(\d+)$/i);
      if (match) {
        const [, infoSlug, infoEp] = match;
        const infoWatchJson = await providerFetch<any>(`/aniworld/watch/${infoSlug}/episode/${infoEp}`);
        const infoParsed = parseResponse(infoWatchJson);
        if (infoParsed.length > 0) return infoParsed;
      }
    }
  }

  return [];
}

// ──────────────────────────────────────────────────────────────
// ToonStream
// ──────────────────────────────────────────────────────────────
export async function fetchToonStreamSources(
  animeName: string,
  season: number,
  episodeNumber: number,
  anilistId?: number
): Promise<StreamingSource[]> {
  const slug = slugify(animeName);
  const episodeSlug = `${slug}-${season}x${episodeNumber}`;

  const parseResponse = (json: any): StreamingSource[] => {
    const data = json?.data || json || {};
    const sources = data?.sources || data?.results || data?.streams || [];
    if (!sources || !Array.isArray(sources)) return [];
    const primaryLang = data?.languages?.[0] || data?.language || "Hindi";
    const langAbbr = primaryLang.toLowerCase().startsWith("hin") ? "HIN"
      : primaryLang.toLowerCase().startsWith("tam") ? "TAM"
        : primaryLang.toLowerCase().startsWith("tel") ? "TEL"
          : primaryLang.toLowerCase().startsWith("eng") ? "ENG"
            : primaryLang.toLowerCase().startsWith("jap") ? "JAP"
              : primaryLang.toUpperCase().slice(0, 3);
    const servers = data.servers || [];
    return sources
      .map((s: any, i: number) => {
      const resolvedUrl = s?.url || s?.proxiedUrl || s?.src || s?.link;
      if (!resolvedUrl) return null;
      const serverInfo = servers[i] || {};
      const serverName = s.serverName || serverInfo.name || `Server ${i + 1}`;
      return {
        url: resolvedUrl,
        isM3U8: Boolean(s?.isM3U8 || s?.type === "hls" || resolvedUrl.includes(".m3u8")),
        quality: s.quality || "HD",
        language: s?.language || primaryLang,
        langCode: `toonstream-${i}-${s.serverId || serverInfo.id || i}`,
        isDub: true,
        providerName: `${serverName} (${langAbbr})`,
        isEmbed: s.type === "iframe" || !resolvedUrl.includes(".m3u8"),
        needsHeadless: false,
      };
    })
      .filter(Boolean) as StreamingSource[];
  };

  const mapper = await resolveProviderMap("toonstream", anilistId);
  if (mapper?.id) {
    const mappedEpisodeSlug = `${mapper.id}-${season}x${episodeNumber}`;
    const mappedJson = await providerFetchToonstream<any>(`/toonstream/episode/sources/${mappedEpisodeSlug}`, 8000);
    const mappedParsed = parseResponse(mappedJson);
    if (mappedParsed.length > 0) return mappedParsed;
  }

  const trySeriesInfoSlug = async (seriesSlug: string, epNum: number): Promise<StreamingSource[]> => {
    const infoJson = await providerFetchToonstream<any>(`/toonstream/series/info/${encodeURIComponent(seriesSlug)}`, 8000);
    const seasons = infoJson?.seasons || infoJson?.data?.seasons || [];
    const seasonData = Array.isArray(seasons)
      ? seasons.find((s: any) => Number(s?.season_no) === season) || seasons[0]
      : null;
    const episodes = seasonData?.episodes || [];
    if (!Array.isArray(episodes) || episodes.length === 0) return [];
    const picked = episodes.find((ep: any) => Number(ep?.episode_no) === epNum) || episodes[0];
    const episodeSlugFromInfo = picked?.slug;
    if (!episodeSlugFromInfo) return [];
    const infoEpisodeJson = await providerFetchToonstream<any>(`/toonstream/episode/sources/${encodeURIComponent(episodeSlugFromInfo)}`, 8000);
    return parseResponse(infoEpisodeJson);
  };

  const findSlugFromCatalog = async (): Promise<{ seriesSlug?: string; movieSlug?: string }> => {
    const q = cleanedSearchTitle(animeName).toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const score = (title: string) => {
      const t = (title || "").toLowerCase();
      return words.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    };

    const seriesJson = await providerFetchToonstream<any>(`/toonstream/series`, 8000);
    const seriesItems = seriesJson?.data || seriesJson?.results || [];
    const movieJson = await providerFetchToonstream<any>(`/toonstream/movies`, 8000);
    const movieItems = movieJson?.data || movieJson?.results || [];

    const bestSeries = Array.isArray(seriesItems)
      ? [...seriesItems].sort((a: any, b: any) => score(b?.title || "") - score(a?.title || ""))[0]
      : null;
    const bestMovie = Array.isArray(movieItems)
      ? [...movieItems].sort((a: any, b: any) => score(b?.title || "") - score(a?.title || ""))[0]
      : null;

    return {
      seriesSlug: bestSeries?.slug,
      movieSlug: bestMovie?.slug,
    };
  };

  // Attempt 2: Catalog-driven fallback (search endpoint is unstable)
  const catalog = await findSlugFromCatalog();
  if (catalog.seriesSlug) {
    const fromInfo = await trySeriesInfoSlug(catalog.seriesSlug, episodeNumber);
    if (fromInfo.length > 0) return fromInfo;

    const searchEpisodeSlug = `${catalog.seriesSlug}-${season}x${episodeNumber}`;
    const searchJson = await providerFetchToonstream<any>(`/toonstream/episode/sources/${searchEpisodeSlug}`, 8000);
    const searchParsed = parseResponse(searchJson);
    if (searchParsed.length > 0) return searchParsed;

    if (episodeNumber !== 1) {
      const ep1FromInfo = await trySeriesInfoSlug(catalog.seriesSlug, 1);
      if (ep1FromInfo.length > 0) return ep1FromInfo;
      const ep1Slug = `${catalog.seriesSlug}-${season}x1`;
      const ep1Json = await providerFetchToonstream<any>(`/toonstream/episode/sources/${ep1Slug}`, 8000);
      const ep1Parsed = parseResponse(ep1Json);
      if (ep1Parsed.length > 0) return ep1Parsed;
    }
  }

  // Attempt 3: Movie fallback only when catalog explicitly resolves a movie slug.
  if (catalog.movieSlug) {
    const movieJson = await providerFetchToonstream<any>(`/toonstream/movie/sources/${catalog.movieSlug}`, 8000);
    const movieParsed = parseResponse(movieJson);
    if (movieParsed.length > 0) return movieParsed;
  }

  // Attempt 4: Mirror fallback via ToonWorld endpoint family.
  const mirror = await fetchToonWorldSources(animeName, season, episodeNumber, anilistId);
  if (mirror.length > 0) {
    return mirror.map((s) => ({
      ...s,
      langCode: s.langCode?.startsWith("toonstream-") ? s.langCode : `toonstream-mirror-${s.langCode || "0"}`,
      providerName: s.providerName?.includes("Toonstream")
        ? s.providerName
        : `Toonstream Mirror - ${s.providerName || "ToonWorld4ALL"}`,
    }));
  }

  return [];
}

// ──────────────────────────────────────────────────────────────
// HindiAPI (TechInMind)
// ──────────────────────────────────────────────────────────────
export async function fetchHindiApiSources(
  episodeNumber: number,
  malId?: number | string,
  anilistId?: number | string,
  season: number = 1
): Promise<StreamingSource[]> {
  const params = new URLSearchParams({ season: String(season), episode: String(episodeNumber), type: "series" });
  if (malId) params.set("malId", String(malId));
  else if (anilistId) params.set("anilistId", String(anilistId));
  else return [];

  const json = await providerFetch<any>(`/hindiapi/episode?${params}`, 15000);
  const streams = json?.data?.streams || json?.streams;
  if (!streams) return [];
  return streams
    .filter((s: any) => s.url || s.dhls)
    .map((s: any, i: number) => {
      const hasDirect = !!s.dhls;
      const pKey = s.provider?.toLowerCase().replace(/\s+/g, "") || `server${i}`;
      let url: string;
      if (hasDirect) {
        const ref = s.headers?.Referer || s.headers?.referer || "";
        url = `${TATAKAI_API_URL}/hindiapi/proxy?url=${encodeURIComponent(s.dhls)}${ref ? `&referer=${encodeURIComponent(ref)}` : ""}`;
      } else {
        url = s.url;
      }
      return {
        url,
        isM3U8: hasDirect,
        quality: "HD",
        language: "Hindi",
        langCode: `hindiapi-${i}-${pKey}`,
        isDub: true,
        providerName: `${s.provider || `Server ${i + 1}`} (HIN)`,
        isEmbed: !hasDirect,
        needsHeadless: !hasDirect,
      };
    });
}

// ──────────────────────────────────────────────────────────────
// AnilistHindi (also TechInMind, different ID route)
// ──────────────────────────────────────────────────────────────
export async function fetchAnilistHindiSources(
  episodeNumber: number,
  anilistId?: number | string,
  season: number = 1
): Promise<StreamingSource[]> {
  if (!anilistId) return [];
  const params = new URLSearchParams({
    anilistId: String(anilistId),
    episode: String(episodeNumber),
    season: String(season),
    type: "series",
  });

  const json = await providerFetch<any>(`/anilisthindi/episode?${params}`, 20000);
  const streams = json?.data?.streams || json?.streams;
  if (!streams) return [];
  return streams
    .filter((s: any) => s.url || s.dhls)
    .map((s: any, i: number) => {
      const hasDirect = !!s.dhls;
      const pKey = s.provider?.toLowerCase().replace(/\s+/g, "") || `server${i}`;
      let url: string;
      if (hasDirect) {
        const ref = s.headers?.Referer || s.headers?.referer || "";
        url = `${TATAKAI_API_URL}/anilisthindi/proxy?url=${encodeURIComponent(s.dhls)}${ref ? `&referer=${encodeURIComponent(ref)}` : ""}`;
      } else {
        url = s.url;
      }
      return {
        url,
        isM3U8: hasDirect,
        quality: "HD",
        language: "Hindi",
        langCode: `anilisthindi-${i}-${pKey}`,
        isDub: true,
        providerName: `${s.provider || `Server ${i + 1}`} (AH)`,
        isEmbed: !hasDirect,
        needsHeadless: !hasDirect,
      };
    });
}

// ──────────────────────────────────────────────────────────────
// ToonWorld
// ──────────────────────────────────────────────────────────────
export async function fetchToonWorldSources(
  animeName: string,
  season: number = 1,
  episodeNumber: number = 1,
  anilistId?: number
): Promise<StreamingSource[]> {
  const slug = slugify(animeName);

  const parseResponse = (json: any): StreamingSource[] => {
    const data = json?.data || json;
    if (!data?.sources) return [];
    return data.sources.map((s: any, i: number) => ({
      url: s.url,
      isM3U8: s.isM3U8 || s.type === "hls",
      quality: s.quality || "HD",
      language: "English",
      langCode: s.langCode || `toonworld-${i}`,
      isDub: false,
      providerName: s.provider || "ToonWorld4ALL",
      isEmbed: s.type === "iframe",
      needsHeadless: false,
    }));
  };

  const mapper = await resolveProviderMap("toonworld", anilistId);
  if (mapper?.id) {
    const mappedParams = new URLSearchParams({ slug: mapper.id, season: String(season), episode: String(episodeNumber) });
    const mappedJson = await providerFetch<any>(`/toonworld/episode?${mappedParams}`, 25000);
    const mappedParsed = parseResponse(mappedJson);
    if (mappedParsed.length > 0) return mappedParsed;
  }

  // Attempt 1: Try direct slug first
  const params = new URLSearchParams({ slug, season: String(season), episode: String(episodeNumber) });
  const json = await providerFetch<any>(`/toonworld/episode?${params}`, 25000);
  const parsed = parseResponse(json);
  if (parsed.length > 0) return parsed;

  // Attempt 2: Search-first fallback
  const searchQuery = cleanedSearchTitle(animeName);
  const searchRes = await providerFetch<any>(`/toonworld/search/${encodeURIComponent(searchQuery)}`);
  const results = searchRes?.results || searchRes?.data?.results || [];
  if (Array.isArray(results) && results.length > 0) {
    const firstResult = results[0];
    const searchSlug = firstResult?.slug || firstResult?.id;
    if (searchSlug) {
      const searchParams = new URLSearchParams({ slug: searchSlug, season: String(season), episode: String(episodeNumber) });
      const searchJson = await providerFetch<any>(`/toonworld/episode?${searchParams}`, 25000);
      const searchParsed = parseResponse(searchJson);
      if (searchParsed.length > 0) return searchParsed;

      // Try EP1 fallback
      if (episodeNumber !== 1) {
        const ep1Params = new URLSearchParams({ slug: searchSlug, season: String(season), episode: "1" });
        const ep1Json = await providerFetch<any>(`/toonworld/episode?${ep1Params}`, 25000);
        return parseResponse(ep1Json);
      }
    }
  }

  return [];
}

// ──────────────────────────────────────────────────────────────
// Animeya
// ──────────────────────────────────────────────────────────────
export async function fetchAnimeyaSources(
  id: string | number,
  episodeNumber?: number,
  animeName?: string
): Promise<StreamingSource[]> {
  const anilistCandidate = typeof id === "number" ? id : undefined;
  const mapper = await resolveProviderMap("animeya", anilistCandidate);
  if (mapper?.id) {
    const mappedRes = await providerFetch<any>(`/animeya/watch/${encodeURIComponent(mapper.id)}`);
    const mappedSources = mappedRes?.sources || mappedRes?.data?.sources;
    if (Array.isArray(mappedSources) && mappedSources.length > 0) {
      return mappedSources.map((s: any, i: number) => formatAnimeyaSource(s, i));
    }
  }

  if (typeof id === "number" && animeName && episodeNumber) {
    try {
      const sRes = await providerFetch<any>(`/animeya/search?q=${encodeURIComponent(animeName)}`);
      const results = sRes?.results || sRes?.data?.results || sRes?.data;
      if (Array.isArray(results) && results.length > 0) {
        const querySlug = slugify(animeName);
        const ranked = [...results]
          .filter((a: any) => a?.slug)
          .sort((a: any, b: any) => scoreSearchCandidate(b, animeName) - scoreSearchCandidate(a, animeName));
        const best = ranked.find((a: any) => {
          const slug = String(a?.slug || "").toLowerCase();
          return slug.includes(querySlug) || querySlug.includes(slug);
        }) || ranked[0];
        if (best?.slug) {
          const iRes = await providerFetch<any>(`/animeya/info/${best.slug}`);
          const episodes = iRes?.episodes || iRes?.data?.episodes;
          if (Array.isArray(episodes) && episodes.length > 0) {
            const exact = episodes.find((e: any) => Number(e.number) === Number(episodeNumber));
            if (exact?.id) {
              const res = await providerFetch<any>(`/animeya/watch/${encodeURIComponent(exact.id)}`);
              const sources = res?.sources || res?.data?.sources;
              if (Array.isArray(sources) && sources.length > 0) {
                return sources.map((s: any, i: number) => formatAnimeyaSource(s, i));
              }
            }
          }
        }
      }
    } catch {
      // fall through to the beta/direct branches
    }
  }

  // If we have an anilistID, use the mapping endpoint on TatakaiCore
  if (typeof id === "number" && animeName && episodeNumber) {
    const mappedJson = await providerFetch<any>(
      `/animeya/watch/anilist_id=${id}/episode=${episodeNumber}`
    );
    if (mappedJson?.sources || mappedJson?.data?.sources) {
      const sources = mappedJson?.sources || mappedJson?.data?.sources;
      return sources.map((s: any, i: number) => formatAnimeyaSource(s, i));
    }
    // Beta mapping disabled on backend or failed — fall back to search
  }

  let epId: string | number = id;

  // If we got a text identifier, resolve to Animeya slug and episode ID first.
  if (typeof epId === "string" && !/^\d+$/.test(epId)) {
    const query = animeName || epId;
    const sRes = await providerFetch<any>(`/animeya/search?q=${encodeURIComponent(query)}`);
    const results = sRes?.results || sRes?.data?.results || sRes?.data;
    if (Array.isArray(results) && results.length > 0) {
      const querySlug = slugify(query);
      const best = results.find((a: any) => {
        const slug = String(a?.slug || "").toLowerCase();
        return slug.includes(querySlug) || querySlug.includes(slug);
      }) || results[0];
      if (best?.slug) {
        const iRes = await providerFetch<any>(`/animeya/info/${best.slug}`);
        const episodes = iRes?.episodes || iRes?.data?.episodes;
        if (Array.isArray(episodes) && episodes.length > 0) {
          const targetEpNo = episodeNumber || 1;
          const exact = episodes.find((e: any) => e.number === targetEpNo);
          epId = exact?.id || episodes[0]?.id;
        }
      }
    }
  }

  if (animeName && episodeNumber && typeof id === "number") {
    try {
      const sRes = await providerFetch<any>(`/animeya/search?q=${encodeURIComponent(animeName)}`);
      const results = sRes?.results || sRes?.data?.results || sRes?.data;
      if (Array.isArray(results)) {
        const match = [...results]
          .filter((a: any) => a.slug)
          .sort((a: any, b: any) => scoreSearchCandidate(b, animeName) - scoreSearchCandidate(a, animeName))
          .find((a: any) => a.slug?.endsWith(`-${id}`)) || results[0];
        if (match?.slug) {
          const iRes = await providerFetch<any>(`/animeya/info/${match.slug}`);
          const episodes = iRes?.episodes || iRes?.data?.episodes;
          if (Array.isArray(episodes)) {
            const exact = episodes.find((e: any) => e.number === episodeNumber);
            if (exact?.id) epId = exact.id;
            else if (episodes[0]) epId = episodes[0].id + (episodeNumber - episodes[0].number);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const watchUrl = `/animeya/watch/${epId}`;

  const res = await providerFetch<any>(watchUrl);
  const sources = res?.sources || res?.data?.sources;
  if (sources && Array.isArray(sources)) {
    return sources.map((s: any, i: number) => formatAnimeyaSource(s, i));
  }
  return [];
}

function formatAnimeyaSource(s: any, i: number): StreamingSource {
  const lang = s.langue || s.language || "ENG";
  const sub = s.subType || "NONE";
  let pName = s.name || `Source ${i + 1}`;
  if (pName.includes("Vidnest")) pName = sub === "NONE" ? `Bebop Dub (${lang})` : `Bebop Sub (${lang})`;
  else pName = `${pName} (${lang})`;
  return {
    url: s.url,
    isM3U8: s.type === "HLS",
    quality: s.quality || "720p",
    language: lang,
    langCode: `animeya-${s.id || i}`,
    isDub: sub === "NONE" || lang !== "JAP",
    providerName: pName,
    isEmbed: s.type === "EMBED",
    needsHeadless: s.type === "EMBED",
  };
}

// ──────────────────────────────────────────────────────────────
// Custom Supabase sources (unchanged — these go to Supabase, not TatakaiCore)
// ──────────────────────────────────────────────────────────────
export async function fetchCustomSupabaseSources(
  animeId?: string,
  episodeId?: string,
  episodeNumber?: number,
  currentUserId?: string
): Promise<StreamingSource[]> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: cData } = await supabase
      .from("custom_sources")
      .select("*")
      .eq("is_active", true)
      .or(animeId ? `anime_id.is.null,anime_id.eq.${animeId}` : "anime_id.is.null")
      .order("created_at", { ascending: false });
    let mQuery = supabase.from("marketplace_items").select("*, profiles!user_id(display_name, username)");
    if (currentUserId) mQuery = mQuery.or(`status.eq.approved,and(status.eq.pending,user_id.eq.${currentUserId})`);
    else mQuery = mQuery.eq("status", "approved");
    if (animeId) mQuery = mQuery.eq("anime_id", animeId);
    if (episodeNumber !== undefined) mQuery = mQuery.eq("episode_number", episodeNumber);
    const { data: mData } = await mQuery;
    const sources: StreamingSource[] = [];
    if (cData)
      cData.forEach((s) =>
        sources.push({
          url: s.url,
          isM3U8: s.type === "direct" && s.url.includes(".m3u8"),
          quality: "HD",
          language: "Custom",
          langCode: `custom-${s.id}`,
          providerName: s.name,
          isEmbed: s.type === "embed",
          needsHeadless: s.type === "embed",
        })
      );
    if (mData)
      mData.forEach((item: any) => {
        if (item.type === "server") {
          const isEmbed = item.data?.isEmbed ?? !item.data?.url?.includes(".m3u8");
          const display =
            item.profiles?.display_name ||
            item.profiles?.username ||
            (currentUserId && item.user_id === currentUserId ? "You" : "Community");
          sources.push({
            url: item.data?.url,
            isM3U8: item.data?.url?.includes(".m3u8"),
            quality: "HD",
            language: item.data?.lang || "Custom",
            langCode: `marketplace-${item.id}`,
            providerName:
              item.status === "pending"
                ? `${item.data?.label || "User Source"} (Pending)`
                : item.data?.label || "User Source",
            isEmbed,
            needsHeadless: isEmbed,
            server: `Shared by ${display}`,
            contributorDisplay: display,
            contributorUsername: item.profiles?.username || "user",
          });
        }
      });
    return sources;
  } catch {
    return [];
  }
}

// ─── Background Provider Retry Logic ───
function scheduleProviderBackgroundRetries(
  episodeId: string,
  timedOutProviders: Array<{ key: string; execute?: () => Promise<any> }>,
  allProviderTasks: Array<{ key: string; enabled: boolean; execute: () => Promise<any> }>
) {
  const cacheKey = episodeId;
  let retryState = providerRetryCache.get(cacheKey);

  if (!retryState) {
    retryState = {
      inProgress: false,
      results: new Map(),
      lastRetry: 0,
      retryCount: 0,
    };
    providerRetryCache.set(cacheKey, retryState);
  }

  // Skip if already retrying or retry budget exhausted
  if (retryState.inProgress || retryState.retryCount >= MAX_BACKGROUND_RETRIES) {
    return;
  }

  retryState.inProgress = true;
  retryState.retryCount++;
  const now = Date.now();

  // Delay before retry to avoid hammering providers
  const delayBeforeRetry = Math.max(0, BACKGROUND_RETRY_DELAY - (now - retryState.lastRetry));

  setTimeout(() => {
    (async () => {
      const unresolvedProviders: Array<{ key: string; execute?: () => Promise<any> }> = [];

      try {
        await mapWithConcurrency(
          timedOutProviders,
          BACKGROUND_RETRY_CONCURRENCY,
          async (provider) => {
            try {
              if (!provider.execute) return;

              // Skip providers that already produced background results.
              if (retryState!.results.has(provider.key)) return;

              const result = await Promise.race([
                provider.execute(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), PROVIDER_EXECUTION_TIMEOUT_MS / 2)),
              ]);

              if (result === null) {
                unresolvedProviders.push(provider);
                return;
              }

              if (result) {
                const sources = Array.isArray(result) ? result : Array.isArray(result?.sources) ? result.sources : [];
                if (sources.length > 0) {
                  retryState!.results.set(provider.key, sources);
                  if (import.meta.env.DEV) {
                    console.log(`[Tatakai] Background retry succeeded for ${provider.key}: ${sources.length} sources`);
                  }
                  return;
                }
              }
            } catch (err) {
              console.debug(`[Tatakai] Background retry failed for ${provider.key}:`, err);
            }
          }
        );
      } finally {
        retryState!.inProgress = false;
        retryState!.lastRetry = Date.now();

        // Keep retrying unresolved timeout providers in the background until budget is exhausted.
        if (unresolvedProviders.length > 0 && retryState!.retryCount < MAX_BACKGROUND_RETRIES) {
          setTimeout(() => {
            scheduleProviderBackgroundRetries(episodeId, unresolvedProviders, allProviderTasks);
          }, BACKGROUND_RETRY_INTERVAL);
        }
      }
    })();
  }, delayBeforeRetry);
}

// ─── Get cached results from background retries ───
function getCachedProviderResults(episodeId: string): Map<string, StreamingSource[]> {
  const retryState = providerRetryCache.get(episodeId);
  return retryState?.results || new Map();
}

export type TatakaiProviderSourceQuery = {
  animeId?: string;
  animeName?: string;
  episodeNumber?: number;
  season?: number;
  category?: "sub" | "dub";
  anilistId?: number | string | null;
  malId?: number | string | null;
  episodeUrl?: string;
  slug?: string;
};

function toPositiveNumber(value?: number | string | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function fetchTatakaiProviderSources(
  query: TatakaiProviderSourceQuery
): Promise<StreamingData & { providerServers: EpisodeServer[] }> {
  // Clean animeName by removing trailing anime IDs (e.g., "name-20401" → "name")
  let rawAnimeName = query.animeName?.trim() || query.animeId?.replace(/[-_]+/g, " ") || "";
  const animeName = rawAnimeName.replace(/-\d{4,}$/, "").trim();
  
  const slug = query.slug?.trim() || (animeName ? slugify(animeName) : query.animeId?.split("?")[0] || "");
  const season = query.season && query.season > 0 ? query.season : 1;
  const episodeNumber = query.episodeNumber && query.episodeNumber > 0 ? query.episodeNumber : 1;
  const category = query.category === "dub" ? "dub" : "sub";
  const anilistId = toPositiveNumber(query.anilistId);
  // Extract AniList ID from raw name before cleaning, then slug, then query.animeId
  const derivedAniListId = anilistId ?? extractTrailingAniListId(rawAnimeName) ?? extractTrailingAniListId(slug) ?? extractTrailingAniListId(query.animeId);
  const malId = toPositiveNumber(query.malId);

  const empty: StreamingData & { providerServers: EpisodeServer[] } = {
    headers: { Referer: "", "User-Agent": "" },
    sources: [],
    subtitles: [],
    tracks: [],
    anilistID: derivedAniListId ?? null,
    malID: malId ?? null,
    providerServers: [],
  };

  const providerTasks: Array<{ key: string; enabled: boolean; execute: () => Promise<any> }> = [
    {
      key: "animelok",
      enabled: !!slug,
      execute: () => fetchAnimelokSources(slug, episodeNumber, derivedAniListId),
    },
    {
      key: "desidub",
      enabled: !!slug,
      execute: () => fetchDesidubanimeSources(slug, derivedAniListId),
    },
    {
      key: "aniworld",
      enabled: !!slug,
      execute: () => fetchAniworldSources(slug, episodeNumber, season, derivedAniListId),
    },
    {
      key: "toonstream",
      enabled: !!animeName,
      execute: () => fetchToonStreamSources(animeName, season, episodeNumber, derivedAniListId),
    },
    {
      key: "hindiapi",
      enabled: !!(malId || derivedAniListId),
      execute: () => fetchHindiApiSources(episodeNumber, malId, derivedAniListId, season),
    },
    {
      key: "anilisthindi",
      enabled: !!derivedAniListId,
      execute: () => fetchAnilistHindiSources(episodeNumber, derivedAniListId, season),
    },
    {
      key: "toonworld",
      enabled: !!animeName,
      execute: () => fetchToonWorldSources(animeName, season, episodeNumber, derivedAniListId),
    },
    {
      key: "animeya",
      enabled: !!(derivedAniListId || animeName),
      execute: () => fetchAnimeyaSources(derivedAniListId ?? (animeName || slug || ""), episodeNumber, animeName || slug),
    },
    {
      key: "watchaw",
      enabled: !!(query.episodeUrl || animeName),
      execute: () => query.episodeUrl
        ? fetchWatchanimeworldSources(query.episodeUrl)
        : fetchWatchanimeworldFromContext(animeName, episodeNumber, season, derivedAniListId, slug),
    },
    {
      key: "hindidubbed",
      enabled: !!slug,
      execute: () => fetchHindiDubbedSources(slug, episodeNumber, derivedAniListId),
    },
    {
      key: "animepahe",
      enabled: !!(derivedAniListId || animeName),
      execute: () => fetchAnimepaheSources(slug, episodeNumber, derivedAniListId),
    },
    {
      key: "animekai",
      enabled: !!(derivedAniListId || animeName),
      execute: () => fetchAnimeKaiSources(slug, episodeNumber, derivedAniListId),
    },
  ];

  const activeProviderTasks = providerTasks.filter((task) => task.enabled);
  const timeoutMarker = Symbol("provider-timeout");
  const providerResults = await mapWithConcurrency(
    activeProviderTasks,
    PROVIDER_MAX_CONCURRENCY,
    async (task) => {
      try {
        const result = await Promise.race([
          task.execute(),
          new Promise<typeof timeoutMarker>((resolve) => setTimeout(() => resolve(timeoutMarker), PROVIDER_EXECUTION_TIMEOUT_MS)),
        ]);
        if (result === timeoutMarker) {
          return { key: task.key, ok: true as const, result: null, timedOut: true as const };
        }
        return { key: task.key, ok: true as const, result, timedOut: false as const };
      } catch (error) {
        return { key: task.key, ok: false as const, error };
      }
    }
  );

  // Schedule background retries for timed-out providers
  const timedOutProviders = providerResults
    .filter((entry) => entry.ok && entry.timedOut)
    .map((entry) => {
      const taskDef = providerTasks.find((t) => t.key === entry.key);
      return { key: entry.key, execute: taskDef?.execute };
    })
    .filter((p) => p.execute);

  if (timedOutProviders.length > 0) {
    const cacheKey = `${slug}:ep${episodeNumber}`;
    scheduleProviderBackgroundRetries(cacheKey, timedOutProviders, providerTasks);
  }

  const aggregatedSources: StreamingSource[] = [];
  let headers = empty.headers;
  let intro = empty.intro;
  let outro = empty.outro;
  let subtitles = empty.subtitles;
  let tracks = empty.tracks;
  let providerAnilistId: number | null = empty.anilistID;
  let providerMalId: number | null = empty.malID;
  const providerDiagnostics: Array<{ key: string; status: "success" | "empty" | "error" | "timeout"; sourceCount: number; error?: string }> = [];

  for (const entry of providerResults) {
    if (!entry.ok) {
      providerDiagnostics.push({
        key: entry.key,
        status: "error",
        sourceCount: 0,
        error: String((entry.error as any)?.message || entry.error || "unknown error"),
      });
      continue;
    }
    const { key, result } = entry;
    const sources = Array.isArray(result)
      ? result
      : Array.isArray(result?.sources)
        ? result.sources
        : [];

    providerDiagnostics.push({
      key,
      status: entry.timedOut ? "timeout" : (sources.length > 0 ? "success" : "empty"),
      sourceCount: sources.length,
    });

    const normalizedSources = annotateProviderSources(
      sources.map((source: any, index: number) => ({
        url: source.url,
        isM3U8: source.isM3U8 ?? source.url?.includes(".m3u8"),
        quality: source.quality || "HD",
        language: source.language || source.lang || "Unknown",
        langCode: source.langCode || `${key}-${index}`,
        isDub: typeof source.isDub === "boolean" ? source.isDub : category === "dub",
        providerName: source.providerName || source.name || prettyProviderName(key),
        isEmbed: source.isEmbed ?? !source.url?.includes(".m3u8"),
        needsHeadless: source.needsHeadless ?? false,
        server: source.server,
      })),
      prettyProviderName(key),
      key
    );

    aggregatedSources.push(...normalizedSources);

    const sourceSubtitleCandidates = sources.flatMap((source: any) =>
      collectSubtitleEntries(source?.subtitles || source?.tracks || source?.captions)
    );
    if (sourceSubtitleCandidates.length > 0) {
      subtitles = mergeSubtitleLists(subtitles, sourceSubtitleCandidates);
    }

    if (Array.isArray(result?.subtitles) && result.subtitles.length > 0) {
      subtitles = mergeSubtitleLists(subtitles, collectSubtitleEntries(result.subtitles));
    }
    if (Array.isArray(result?.tracks) && result.tracks.length > 0) {
      tracks = [...tracks, ...result.tracks];
      subtitles = mergeSubtitleLists(subtitles, collectSubtitleEntries(result.tracks));
    }
    if (result?.headers && typeof result.headers === "object") {
      headers = { ...headers, ...result.headers };
    }
    if (result?.intro) intro = intro || result.intro;
    if (result?.outro) outro = outro || result.outro;
    providerAnilistId = providerAnilistId ?? toPositiveNumber(result?.anilistID ?? result?.anilistId) ?? null;
    providerMalId = providerMalId ?? toPositiveNumber(result?.malID ?? result?.malId) ?? null;
  }

  // Include cached results from background retries
  const cacheKey = `${slug}:ep${episodeNumber}`;
  const cachedProviderResults = getCachedProviderResults(cacheKey);
  for (const [providerKey, cachedSources] of cachedProviderResults.entries()) {
    if (cachedSources.length > 0) {
      const annotated = annotateProviderSources(
        cachedSources.map((source: any, index: number) => ({
          url: source.url,
          isM3U8: source.isM3U8 ?? source.url?.includes(".m3u8"),
          quality: source.quality || "HD",
          language: source.language || source.lang || "Unknown",
          langCode: source.langCode || `${providerKey}-${index}`,
          isDub: typeof source.isDub === "boolean" ? source.isDub : category === "dub",
          providerName: source.providerName || source.name || prettyProviderName(providerKey),
          isEmbed: source.isEmbed ?? !source.url?.includes(".m3u8"),
          needsHeadless: source.needsHeadless ?? false,
          server: source.server,
        })),
        prettyProviderName(providerKey),
        providerKey
      );
      aggregatedSources.push(...annotated);
      if (import.meta.env.DEV) {
        console.log(`[Tatakai] Added ${cachedSources.length} cached source(s) from background retry: ${providerKey}`);
      }
    }
  }

  const dedupedSources: StreamingSource[] = [];
  const seenSourceKeys = new Set<string>();
  for (const source of aggregatedSources) {
    const key = buildSourceDedupeKey(source);
    if (seenSourceKeys.has(key)) continue;
    seenSourceKeys.add(key);
    dedupedSources.push(source);
  }

  // Log provider aggregation summary
  const providerServerGroups = buildProviderServerGroups(dedupedSources);
  const providerCount = providerServerGroups.length;
  const sourceCount = dedupedSources.length;
  const successfulProviders = providerServerGroups.map(g => g.displayName).join(", ");
  if (import.meta.env.DEV) {
    for (const item of providerDiagnostics) {
      const label = prettyProviderName(item.key);
      if (item.status === "error") {
        console.log(`[Tatakai] Provider ${label}: error | sources=0 | ${item.error || "unknown"}`);
      } else if (item.status === "timeout") {
        console.log(`[Tatakai] Provider ${label}: timeout | sources=0 | ${PROVIDER_EXECUTION_TIMEOUT_MS}ms`);
      } else {
        console.log(`[Tatakai] Provider ${label}: ${item.status} | sources=${item.sourceCount}`);
      }
    }
    console.log(
      `[Tatakai] Provider aggregation: ${providerCount} provider(s) returned ${sourceCount} total source(s) | ${successfulProviders || "none"}`
    );
  }

  return {
    ...empty,
    headers,
    intro,
    outro,
    subtitles: mergeSubtitleLists(subtitles, collectSubtitleEntries(tracks)),
    tracks,
    anilistID: providerAnilistId,
    malID: providerMalId,
    sources: dedupedSources,
    providerServers: providerServerGroups,
  };
}

