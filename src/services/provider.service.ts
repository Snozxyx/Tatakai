import { TATAKAI_API_URL, getProxiedImageUrl, externalApiGet } from "@/lib/api/api-client";
import { EpisodeServer, StreamingData, StreamingSource, Subtitle } from "@/types/anime";

// ──────────────────────────────────────────────────────────────
// Shared helper — every provider just uses plain fetch() now.
// The Vite dev proxy handles CORS (→ localhost:9000).
// ──────────────────────────────────────────────────────────────
const TIMEOUT = 12000; // Single-pass provider mode: allow slower upstreams enough time to resolve.
const RAW_ANIME_MAPPER_API = String(import.meta.env.VITE_ANIME_MAPPER_API || "").trim();
const DEFAULT_ANIME_MAPPER_API = "/api/v2/anime/mapper";
const MAPPER_REQUEST_TIMEOUT_MS = 4500;
const TOONSTREAM_NEGATIVE_CACHE_TTL = 10 * 60 * 1000;
const PROVIDER_NOT_FOUND_CACHE_TTL = 2 * 60 * 1000;
const MAPPER_DISABLE_TTL = 30 * 1000; // 30 seconds (was 30 min causing 12-provider blackout on 402 errors)
const MAPPER_FAILURE_CACHE_TTL = 60 * 1000;
const PROVIDER_ENDPOINT_COOLDOWN_TTL = 15 * 60 * 1000;
const PROVIDER_EXECUTION_TIMEOUT_MS = 12000;
const PROVIDER_TIMEOUT_COOLDOWN_TTL = 90 * 1000;
const PROVIDER_LAST_GOOD_CACHE_TTL = 10 * 60 * 1000;
const PROVIDER_EXECUTION_TIMEOUTS_MS: Record<string, number> = {
  animelok: 14000,
  animeya: 18000,
  animepahe: 22000,
  animekai: 22000,
  toonstream: 18000,
  aniworld: 18000,
  desidub: 18000,
  hindiapi: 18000,
  anilisthindi: 18000,
  watchaw: 15000,
  toonworld: 15000,
  hindidubbed: 15000,
};
const PROVIDER_MAX_CONCURRENCY = 20; // Run providers in parallel so all results return in a single pass.
const PROVIDER_TIMEOUT_RETRY_ATTEMPTS = 1;
const PROVIDER_TIMEOUT_RETRY_TIMEOUT_BONUS_MS = 2500;
const BACKGROUND_RETRY_CONCURRENCY = 1;
const toonstreamNegativePathCache = new Map<string, number>();
const providerNotFoundPathCache = new Map<string, number>();
const providerEndpointCooldown = new Map<string, number>();
const providerTimeoutCooldown = new Map<string, number>();
const providerLastGoodCache = new Map<
  string,
  {
    expiresAt: number;
    data: StreamingData & { providerServers: EpisodeServer[] };
  }
>();
const mapperFailureCache = new Map<string, number>();
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
  desidub: ["desidub", "desidubanime"],
  aniworld: ["aniworld"],
  hindidubbed: ["hindidubbed"],
  toonstream: ["toonstream"],
  animeya: ["animeya"],
  watchaw: ["watchaw"],
  anilisthindi: ["anilisthindi"],
  toonworld: ["toonworld"],
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

function getProviderExecutionTimeoutMs(providerKey: string): number {
  return PROVIDER_EXECUTION_TIMEOUTS_MS[providerKey] || PROVIDER_EXECUTION_TIMEOUT_MS;
}

function isProviderTimeoutCoolingDown(providerKey: string): boolean {
  const expiresAt = providerTimeoutCooldown.get(providerKey);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    providerTimeoutCooldown.delete(providerKey);
    return false;
  }
  return true;
}

function markProviderTimeout(providerKey: string): void {
  const ttl = providerKey === "animelok" ? 15 * 1000 : PROVIDER_TIMEOUT_COOLDOWN_TTL;
  providerTimeoutCooldown.set(providerKey, Date.now() + ttl);
}

function buildProviderLastGoodCacheKey(params: {
  animeId?: string;
  slug?: string;
  animeName?: string;
  episodeNumber: number;
  season: number;
  category: "sub" | "dub";
  anilistId?: number;
  malId?: number;
}): string {
  const normalizedAnimeId = String(params.animeId || "").trim().toLowerCase();
  const normalizedSlug = String(params.slug || "").trim().toLowerCase();
  const normalizedName = slugify(String(params.animeName || "").trim().toLowerCase());
  return [
    normalizedAnimeId || normalizedSlug || normalizedName || "unknown",
    `ep:${params.episodeNumber}`,
    `s:${params.season}`,
    `cat:${params.category}`,
    `anilist:${params.anilistId || 0}`,
    `mal:${params.malId || 0}`,
  ].join("|");
}

function getProviderLastGood(cacheKey: string): (StreamingData & { providerServers: EpisodeServer[] }) | null {
  const cached = providerLastGoodCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    providerLastGoodCache.delete(cacheKey);
    return null;
  }
  return cached.data;
}

function setProviderLastGood(cacheKey: string, data: StreamingData & { providerServers: EpisodeServer[] }): void {
  providerLastGoodCache.set(cacheKey, {
    expiresAt: Date.now() + PROVIDER_LAST_GOOD_CACHE_TTL,
    data,
  });
}

function shouldSkipMapperFailure(alias: string, anilistId: number): boolean {
  const key = `${alias}:${anilistId}`;
  const expiresAt = mapperFailureCache.get(key);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    mapperFailureCache.delete(key);
    return false;
  }
  return true;
}

function markMapperFailure(alias: string, anilistId: number): void {
  mapperFailureCache.set(`${alias}:${anilistId}`, Date.now() + MAPPER_FAILURE_CACHE_TTL);
}

function buildMapperBaseCandidates(): string[] {
  const candidates: string[] = [];

  const add = (value?: string) => {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  const configured = RAW_ANIME_MAPPER_API;
  if (configured && !/anime-mapper\.vercel\.app/i.test(configured)) {
    if (configured.startsWith("/api/tatakai/anime/mapper")) {
      add(configured.replace(/^\/api\/tatakai\/anime\/mapper/i, "/api/v2/anime/mapper"));
    } else {
      add(configured);
    }

    if (configured.includes("/api/v2/hianime/anime/mapper")) {
      add(configured.replace("/api/v2/hianime/anime/mapper", "/api/v2/anime/mapper"));
    }
  }

  add("/api/v2/anime/mapper");
  add(DEFAULT_ANIME_MAPPER_API);

  return candidates;
}

const MAPPER_BASE_CANDIDATES = buildMapperBaseCandidates();

function shouldSkipNotFoundPath(path: string): boolean {
  const expiresAt = providerNotFoundPathCache.get(path);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    providerNotFoundPathCache.delete(path);
    return false;
  }
  return true;
}

function markNotFoundPath(path: string): void {
  providerNotFoundPathCache.set(path, Date.now() + PROVIDER_NOT_FOUND_CACHE_TTL);
}

async function fetchMapperMap(alias: string, anilistId: number): Promise<any | null> {
  if (isMapperDisabled()) return null;
  if (shouldSkipMapperFailure(alias, anilistId)) return null;

  for (const base of MAPPER_BASE_CANDIDATES) {
    try {
      const res = await fetch(`${base}/map/${alias}/${anilistId}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(MAPPER_REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (res.status >= 500 || res.status === 404) {
          markMapperFailure(alias, anilistId);
        }

        const shouldDisable =
          /anime-mapper\.vercel\.app/i.test(base) &&
          (res.status === 402 || res.status === 401 || res.status === 403 || res.status === 429);

        if (shouldDisable) {
          disableMapperTemporarily();
        }

        continue;
      }

      return await res.json();
    } catch {
      markMapperFailure(alias, anilistId);
      continue;
    }
  }

  return null;
}

async function providerFetch<T = any>(path: string, timeout = TIMEOUT): Promise<T | null> {
  if (shouldSkipNotFoundPath(path)) return null;
  if (isProviderEndpointCoolingDown(path)) return null;
  try {
    const res = await fetch(`${TATAKAI_API_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      if (res.status === 404) {
        markNotFoundPath(path);
      }
      if (res.status === 405) {
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

function stripSeasonPartTokens(value?: string): string {
  if (!value) return "";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b(?:season|staffel|s)\s*\d+\b/gi, " ")
    .replace(/\b(?:part|cour|pt)\s*\d+\b/gi, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchQueryCandidates(...inputs: Array<string | undefined>): string[] {
  const candidates: string[] = [];
  const add = (value?: string) => {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  for (const input of inputs) {
    add(cleanedSearchTitle(input));
    add(stripSeasonPartTokens(input));

    const normalized = stripSeasonPartTokens(input);
    if (normalized) {
      const tokens = normalized.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) add(tokens.slice(0, 2).join(" "));
      if (tokens.length >= 3) add(tokens.slice(0, 3).join(" "));
    }
  }

  return candidates;
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
  const normalized = String(value).trim();

  // Trust explicit AniList markers like "anilist-12345", "anilist_id: 12345", etc.
  const explicitMatch = normalized.match(/(?:^|[^a-z0-9])anilist(?:[_\s:-]*id)?[_\s:-]*(\d{2,9})(?:$|[^0-9])/i);
  if (explicitMatch?.[1]) return toPositiveNumber(explicitMatch[1]);

  // Also accept plain numeric IDs when caller already provides a direct ID string.
  if (/^\d{4,9}$/.test(normalized)) {
    return toPositiveNumber(normalized);
  }

  return undefined;
}

function extractLegacyAniListIdFromSlug(value?: string): number | undefined {
  if (!value) return undefined;
  const base = String(value).split("?")[0].trim();
  if (!base) return undefined;

  let decoded = base;
  try {
    decoded = decodeURIComponent(base);
  } catch {
    decoded = base;
  }

  // Legacy Animelok slugs embed small AniList IDs (e.g. one-piece-21, naruto-shippuden-1735).
  // Avoid 5+ digit suffixes because those are frequently HiAnime/internal IDs (e.g. ...-20401).
  const match = decoded.toLowerCase().match(/^[a-z0-9]+(?:-[a-z0-9]+)+-(\d{1,4})$/);
  if (!match?.[1]) return undefined;
  return toPositiveNumber(match[1]);
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

async function resolveProviderMap(providerKey: string, anilistId?: number): Promise<MapperResolution | null> {
  if (!anilistId || isMapperDisabled()) return null;
  const aliases = PROVIDER_MAPPER_ALIASES[providerKey];
  if (!aliases || aliases.length === 0) return null;

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
  const parsed = episodeUrl.match(/^(.+?)-(\d+)(?:x|-)(\d+)$/i);
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
    anilistID: anilistId ?? extractTrailingAniListId(animeSlug) ?? null,
    malID: null,
  };

  const seasonCandidates = Array.from(
    new Set(
      [season, season === 1 ? 2 : 1, season + 1, 2, 1].filter(
        (v) => Number.isFinite(v) && v > 0
      )
    )
  );

  const slugCandidates = Array.from(
    new Set(
      [
        slugify(cleanedSearchTitle(animeName)),
        slugify(animeName),
        slugify(cleanedSearchTitle(animeSlug || "")),
      ].filter(Boolean)
    )
  );

  for (const baseSlug of slugCandidates) {
    for (const s of seasonCandidates) {
      // Preferred format from user request: {simpleanime}-{season}-{episode}
      const preferred = await fetchWatchanimeworldSources(`${baseSlug}-${s}-${episodeNumber}`);
      if (preferred.sources.length > 0) return preferred;

      // Legacy fallback accepted by older upstream slugs.
      const legacy = await fetchWatchanimeworldSources(`${baseSlug}-${s}x${episodeNumber}`);
      if (legacy.sources.length > 0) return legacy;
    }
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
  anilistId?: number,
  animeName?: string
): Promise<StreamingSource[]> {
  const targetSlug = slugify(cleanedSearchTitle(slug) || slug);

  let animeJson: any = null;

  if (anilistId) {
    const mapper = await resolveProviderMap("hindidubbed", anilistId);
    if (mapper?.id) {
      try {
        animeJson = await fetchAnimeHindiDubbedData(String(mapper.id), episodeNumber);
      } catch {
        // fallback below
      }
    }
  }

  try {
    animeJson = animeJson || await fetchAnimeHindiDubbedData(targetSlug, episodeNumber);
  } catch {
    // fallback below
  }

  if (!animeJson && slug && slug !== targetSlug) {
    try {
      animeJson = await fetchAnimeHindiDubbedData(slug, episodeNumber);
    } catch {
      // fallback below
    }
  }

  if (!animeJson) {
    const searchQueries = buildSearchQueryCandidates(animeName, slug);
    for (const searchQuery of searchQueries.slice(0, 3)) {
      const searchRes = await providerFetch<any>(`/hindidubbed/search/${encodeURIComponent(searchQuery)}`, 12000);
      const ranked = Array.isArray(searchRes?.animeList)
        ? [...searchRes.animeList]
            .filter((entry: any) => entry?.slug)
            .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery))
        : [];

      for (const candidate of ranked.slice(0, 5)) {
        const candidateSlug = String(candidate?.slug || "").trim();
        if (!candidateSlug) continue;
        try {
          animeJson = await fetchAnimeHindiDubbedData(candidateSlug, episodeNumber);
        } catch {
          animeJson = null;
        }
        if (animeJson) break;
      }

      if (animeJson) break;
    }
  }

  if (!animeJson) return [];

  // Extract servers for the requested episode number
  const episodes: any[] = animeJson.episodes || [];
  const targetEpisode = episodes.find((ep: any) => Number(ep?.number) === Number(episodeNumber)) || episodes[0];
  const servers: any[] = targetEpisode?.servers || [];

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
  anilistId?: number,
  animeName?: string,
  malId?: number
): Promise<{ sources: StreamingSource[]; subtitles?: Subtitle[]; malID?: number; anilistID?: number }> {
  // Keep Animelok execution under provider timeout budget to avoid request-level timeouts.
  const ANIMELOK_EXECUTION_BUDGET_MS = 12500;
  const budgetDeadline = Date.now() + ANIMELOK_EXECUTION_BUDGET_MS;

  const getBudgetedTimeout = (preferredMs: number, minMs: number): number => {
    const remaining = budgetDeadline - Date.now();
    if (remaining <= minMs + 120) return 0;
    return Math.max(minMs, Math.min(preferredMs, remaining - 120));
  };

  const fetchAnimelokWatch = async (candidateId: string, preferredMs = 7600, anilistHint?: number, malHint?: number) => {
    const timeout = getBudgetedTimeout(preferredMs, 5500);
    if (timeout <= 0) return null;
    const safeAniListHint = toPositiveNumber(anilistHint);
    const safeMalHint = toPositiveNumber(malHint);
    
    const params = new URLSearchParams({
      ep: episodeNumber.toString()
    });
    if (safeAniListHint) params.set("anilistId", safeAniListHint.toString());
    if (safeMalHint) params.set("malId", safeMalHint.toString());
    
    return providerFetch<any>(`/animelok/watch/${encodeURIComponent(candidateId)}?${params.toString()}`, timeout);
  };

  const fetchAnimelokSearch = async (query: string, preferredMs = 2600) => {
    const timeout = getBudgetedTimeout(preferredMs, 1200);
    if (timeout <= 0) return null;
    return providerFetch<any>(`/animelok/search?q=${encodeURIComponent(query)}`, timeout);
  };

  const normalizedSlug = String(animeSlug || "").split("?")[0].trim();
  const derivedAniListId =
    anilistId ??
    extractLegacyAniListIdFromSlug(normalizedSlug) ??
    extractTrailingAniListId(normalizedSlug) ??
    extractTrailingAniListId(animeName);

  const canonicalSlugCandidate = (() => {
    if (!derivedAniListId) return "";
    const base = slugify(animeName || normalizedSlug || "");
    if (!base) return "";
    return `${base}-${derivedAniListId}`;
  })();

  const parseSources = (json: any): { sources: StreamingSource[]; subtitles?: Subtitle[]; malID?: number; anilistID?: number } => {
    const rawServers =
      json?.servers ||
      json?.data?.servers ||
      json?.episode?.servers ||
      json?.data?.episode?.servers ||
      json?.results ||
      json?.data?.results;
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
      subtitles: collectSubtitleEntries(
        json?.subtitles ||
        json?.data?.subtitles ||
        json?.episode?.subtitles ||
        json?.data?.episode?.subtitles ||
        json?.tracks ||
        json?.data?.tracks
      ),
      malID: json?.malId || json?.malID || json?.data?.malId || json?.data?.malID,
      anilistID: json?.anilistId || json?.anilistID || json?.data?.anilistId || json?.data?.anilistID,
    };
  };

  const structuredSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)+-\d{5,9}$/i;
  const isStructuredSlug = structuredSlugPattern.test(normalizedSlug);

  // Prefer AniList-based resolution first when available.
  if (derivedAniListId) {
    const anilistDirectJson = await fetchAnimelokWatch(String(derivedAniListId), 7800, derivedAniListId, malId);
    const anilistDirectResult = parseSources(anilistDirectJson);
    if (anilistDirectResult.sources.length > 0) return anilistDirectResult;
  }

  const directSlugCandidates = isStructuredSlug
    ? [normalizedSlug]
    : Array.from(
        new Set(
          [normalizedSlug, canonicalSlugCandidate]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

  for (const slugCandidate of directSlugCandidates) {
    const directSlugJson = await fetchAnimelokWatch(slugCandidate, 7600, derivedAniListId, malId);
    const directSlugResult = parseSources(directSlugJson);
    if (directSlugResult.sources.length > 0) return directSlugResult;
  }

  if (isStructuredSlug) {
    const strippedSlugQuery = normalizedSlug.replace(/-\d{4,9}$/i, "");
    const fastQueries = buildSearchQueryCandidates(animeName, strippedSlugQuery || normalizedSlug);
    for (const query of fastQueries.slice(0, 1)) {
      const searchJson = await fetchAnimelokSearch(query);
      const results = searchJson?.animes || searchJson?.results || searchJson?.data?.animes || searchJson?.data?.results || [];
      if (!Array.isArray(results) || results.length === 0) continue;

      const ranked = [...results]
        .filter((entry: any) => entry?.id)
        .sort((a: any, b: any) => scoreSearchCandidate(b, query) - scoreSearchCandidate(a, query));

      for (const candidate of ranked.slice(0, 1)) {
        const candidateId = String(candidate.id || "").trim();
        if (!candidateId) continue;

        const watchedJson = await fetchAnimelokWatch(candidateId, 7600, derivedAniListId, malId);
        const watchedResult = parseSources(watchedJson);
        if (watchedResult.sources.length > 0) return watchedResult;
      }
    }

    return { sources: [] };
  }

  const numericSlugId = toPositiveNumber(normalizedSlug);
  if (numericSlugId && numericSlugId !== derivedAniListId) {
    const numericJson = await fetchAnimelokWatch(String(numericSlugId), 7600, derivedAniListId, malId);
    const numericResult = parseSources(numericJson);
    if (numericResult.sources.length > 0) return numericResult;
  }

  // When we already have a canonical slug-id form, avoid expensive fallback search loops.
  if (structuredSlugPattern.test(canonicalSlugCandidate)) {
    return { sources: [] };
  }

  const searchQueries = buildSearchQueryCandidates(animeName, normalizedSlug || animeSlug);
  for (const query of searchQueries.slice(0, 1)) {
    const searchJson = await fetchAnimelokSearch(query, 3000);
    const results = searchJson?.animes || searchJson?.results || searchJson?.data?.animes || searchJson?.data?.results || [];
    if (!Array.isArray(results) || results.length === 0) continue;

    const ranked = [...results]
      .filter((entry: any) => entry?.id)
      .sort((a: any, b: any) => scoreSearchCandidate(b, query) - scoreSearchCandidate(a, query));

    for (const candidate of ranked.slice(0, 1)) {
      const candidateId = String(candidate.id || "").trim();
      if (!candidateId) continue;

      const watchedJson = await fetchAnimelokWatch(candidateId, 7600, derivedAniListId, malId);
      const watchedResult = parseSources(watchedJson);
      if (watchedResult.sources.length > 0) return watchedResult;
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
  anilistId?: number,
  animeName?: string
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

  // Strategy 2: Search fallback when mapper is unavailable or incomplete.
  const searchQuery = cleanedSearchTitle(animeName || animeSlug);
  if (searchQuery) {
    const searchJson = await providerFetch<any>(`/animekai/search/${encodeURIComponent(searchQuery)}`);
    const results = searchJson?.results || searchJson?.data?.results || [];
    if (Array.isArray(results) && results.length > 0) {
      const ranked = [...results]
        .filter((entry: any) => entry?.id)
        .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery));

      for (const candidate of ranked.slice(0, 3)) {
        const episodeId = await resolveEpisodeId(String(candidate.id), episodeNumber);
        const result = episodeId ? await fetchByEpisodeId(episodeId) : { sources: [], subtitles: [] };
        if (result.sources.length > 0) {
          return {
            sources: result.sources,
            subtitles: result.subtitles,
            anilistID: anilistId,
          };
        }
      }
    }
  }

  return { sources: [] };

  return { sources: [] };
}

// ──────────────────────────────────────────────────────────────
// Animepahe (Anime-Mapper + Search-First)
// ──────────────────────────────────────────────────────────────
export async function fetchAnimepaheSources(
  animeSlug: string,
  episodeNumber: number,
  anilistId?: number,
  animeName?: string
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

  // Strategy 2: Search fallback when mapper is unavailable or incomplete.
  const searchQuery = cleanedSearchTitle(animeName || animeSlug);
  if (searchQuery) {
    const searchJson = await providerFetch<any>(`/animepahe/search/${encodeURIComponent(searchQuery)}`);
    const results = searchJson?.results || searchJson?.data?.results || [];
    if (Array.isArray(results) && results.length > 0) {
      const ranked = [...results]
        .filter((entry: any) => entry?.id || entry?.session)
        .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery));

      for (const candidate of ranked.slice(0, 3)) {
        const animepaheId = String(candidate?.id || candidate?.session || "").trim();
        if (!animepaheId) continue;
        const fromSearch = await fetchByAnimepaheId(animepaheId, episodeNumber);
        if (fromSearch.length > 0) return fromSearch;
      }
    }
  }

  return [];

  return [];
}

// ──────────────────────────────────────────────────────────────
// DesiDubAnime
// ──────────────────────────────────────────────────────────────
export async function fetchDesidubanimeSources(
  watchSlug: string,
  episodeNumber: number,
  anilistId?: number,
  animeName?: string
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

  const fetchByAnimeSlug = async (animeSlug: string) => {
    const infoRes = await providerFetch<any>(`/desidub/info/${encodeURIComponent(animeSlug)}`);
    const episodes = infoRes?.episodes || infoRes?.data?.episodes || [];
    if (!Array.isArray(episodes) || episodes.length === 0) return [] as ReturnType<typeof toSources>;

    const targetEpisode =
      episodes.find((ep: any) => Number(ep?.number) === Number(episodeNumber)) ||
      episodes[0];

    const watchIdFromUrl = String(targetEpisode?.url || "").match(/\/watch\/([^/]+)/i)?.[1];
    const watchId = String(targetEpisode?.id || watchIdFromUrl || "").trim();
    if (!watchId) return [] as ReturnType<typeof toSources>;

    const watchRes = await providerFetch<any>(`/desidub/watch/${encodeURIComponent(watchId)}`);
    return toSources(watchRes);
  };

  const preflightSearchSlug = async (query: string): Promise<string | null> => {
    const searchRes = await providerFetch<any>(`/desidub/search?q=${encodeURIComponent(query)}`);
    const results = searchRes?.results || searchRes?.data?.results || [];
    if (!Array.isArray(results) || results.length === 0) return null;
    const ranked = [...results]
      .filter((entry: any) => entry?.slug)
      .sort((a: any, b: any) => scoreSearchCandidate(b, query) - scoreSearchCandidate(a, query));
    return ranked[0]?.slug ? String(ranked[0].slug) : null;
  };

  if (anilistId) {
    const mapper = await resolveProviderMap("desidub", anilistId);
    if (mapper?.id) {
      const mappedParsed = await fetchByAnimeSlug(String(mapper.id));
      if (Array.isArray(mappedParsed) ? mappedParsed.length > 0 : mappedParsed.sources.length > 0) {
        return mappedParsed;
      }
    }
  }

  const preflightQuery = cleanedSearchTitle(animeName || watchSlug);
  if (preflightQuery) {
    const preferredSlug = await preflightSearchSlug(preflightQuery);
    if (preferredSlug) {
      const preferredParsed = await fetchByAnimeSlug(preferredSlug);
      if (Array.isArray(preferredParsed) ? preferredParsed.length > 0 : preferredParsed.sources.length > 0) {
        return preferredParsed;
      }
    }
  }

  const searchQueries = buildSearchQueryCandidates(animeName, watchSlug);
  for (const searchQuery of searchQueries.slice(0, 3)) {
    const searchRes = await providerFetch<any>(`/desidub/search?q=${encodeURIComponent(searchQuery)}`);
    const results = searchRes?.results || searchRes?.data?.results || [];
    if (!Array.isArray(results) || results.length === 0) continue;

    const ranked = [...results]
      .filter((entry: any) => entry?.slug)
      .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery));

    for (const candidate of ranked.slice(0, 5)) {
      if (!candidate?.slug) continue;
      const searchedParsed = await fetchByAnimeSlug(String(candidate.slug));
      if (Array.isArray(searchedParsed) ? searchedParsed.length > 0 : searchedParsed.sources.length > 0) {
        return searchedParsed;
      }
    }
  }

  const directSlugCandidates = Array.from(
    new Set(
      [
        watchSlug,
        watchSlug.replace(/-part-\d+$/i, ""),
        watchSlug.replace(/-season-\d+(?:-part-\d+)?$/i, ""),
        slugify(cleanedSearchTitle(watchSlug) || watchSlug),
        ...searchQueries.map((query) => slugify(query)),
      ].filter(Boolean)
    )
  );

  for (const candidateSlug of directSlugCandidates.slice(0, 6)) {
    const directParsed = await fetchByAnimeSlug(candidateSlug);
    if (Array.isArray(directParsed) ? directParsed.length > 0 : directParsed.sources.length > 0) {
      return directParsed;
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
  anilistId?: number,
  animeName?: string
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

  const mappedSlug = anilistId
    ? await resolveProviderMap("aniworld", anilistId).then((resolved) => String(resolved?.id || ""))
    : "";

  const searchQueries = buildSearchQueryCandidates(animeName, slug, mappedSlug);
  const baseSlugCandidates = Array.from(
    new Set([
      slugify(cleanedSearchTitle(slug) || slug),
      slugify(stripSeasonPartTokens(slug)),
      slugify(stripSeasonPartTokens(mappedSlug)),
      slugify(mappedSlug),
      ...searchQueries.map((query) => slugify(query)),
      slugify(slug),
    ].filter(Boolean))
  );

  const seasonCandidates = Array.from(
    new Set([season, 1, 2, 3].filter((value) => Number.isFinite(value) && value > 0))
  );

  const seasonSlugs = Array.from(new Set([
    ...baseSlugCandidates.flatMap((base) => seasonCandidates.map((currentSeason) => `${base}/staffel-${currentSeason}`)),
    ...seasonCandidates.map((currentSeason) => (slug.includes("staffel-") ? slug : `${slug}/staffel-${currentSeason}`)),
  ].filter(Boolean)));

  for (const seasonSlug of seasonSlugs.slice(0, 10)) {
    const json = await providerFetch<any>(`/aniworld/watch/${seasonSlug}/episode/${episodeNumber}`);
    const parsed = parseResponse(json);
    if (parsed.length > 0) return parsed;
  }

  for (const searchQuery of searchQueries.slice(0, 3)) {
    const searchRes = await providerFetch<any>(`/aniworld/search/${encodeURIComponent(searchQuery)}`);
    const results = searchRes?.results || searchRes?.data?.results || [];
    const ranked = Array.isArray(results) && results.length > 0
      ? [...results]
          .filter((entry: any) => entry?.slug)
          .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery))
      : [];

    for (const candidate of ranked.slice(0, 6)) {
      for (const currentSeason of seasonCandidates) {
        const seasonSlug = `${candidate.slug}/staffel-${currentSeason}`;
        const json = await providerFetch<any>(`/aniworld/watch/${seasonSlug}/episode/${episodeNumber}`);
        const parsed = parseResponse(json);
        if (parsed.length > 0) return parsed;
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

  const searchQuery = cleanedSearchTitle(animeName);
  if (searchQuery) {
    const indexSearch = await providerFetchToonstream<any>(`/toonstream/search/${encodeURIComponent(searchQuery)}/1`, 6000);
    const indexed = indexSearch?.data || indexSearch?.results || [];
    if (Array.isArray(indexed) && indexed.length > 0) {
      const ranked = [...indexed]
        .filter((entry: any) => entry?.slug)
        .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery));
      for (const candidate of ranked.slice(0, 2)) {
        const candidateSlug = String(candidate.slug || "").trim();
        if (!candidateSlug) continue;
        const indexedEpisodeSlug = `${candidateSlug}-${season}x${episodeNumber}`;
        const indexedJson = await providerFetchToonstream<any>(`/toonstream/episode/sources/${indexedEpisodeSlug}`, 8000);
        const indexedParsed = parseResponse(indexedJson);
        if (indexedParsed.length > 0) return indexedParsed;
      }
    }
  }

  const simpleAnime = slugify(animeName);
  const fallbackEpisodeSlug = `${simpleAnime}-${season}x${episodeNumber}`;
  const searchJson = await providerFetchToonstream<any>(`/toonstream/episode/sources/${fallbackEpisodeSlug}`, 8000);
  const searchParsed = parseResponse(searchJson);
  if (searchParsed.length > 0) return searchParsed;

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

  const json = await providerFetch<any>(`/techinmind/episode?${params}`, 15000);
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
        url = `${TATAKAI_API_URL}/techinmind/proxy?url=${encodeURIComponent(s.dhls)}${ref ? `&referer=${encodeURIComponent(ref)}` : ""}`;
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

  const json = await providerFetch<any>(`/techinmind/episode?${params}`, 20000);
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
        url = `${TATAKAI_API_URL}/techinmind/proxy?url=${encodeURIComponent(s.dhls)}${ref ? `&referer=${encodeURIComponent(ref)}` : ""}`;
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
  void anilistId;

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

  // Search-first mapping strategy for ToonWorld.
  const searchQuery = cleanedSearchTitle(animeName);
  if (searchQuery) {
    const searchRes = await providerFetch<any>(`/toonworld/search/${encodeURIComponent(searchQuery)}`);
    const results = searchRes?.results || searchRes?.data?.results || [];
    if (Array.isArray(results) && results.length > 0) {
      const ranked = [...results]
        .filter((entry: any) => entry?.slug || entry?.id)
        .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery));

      for (const entry of ranked.slice(0, 3)) {
        const searchSlug = entry?.slug || entry?.id;
        if (!searchSlug) continue;

        const searchParams = new URLSearchParams({ slug: searchSlug, season: String(season), episode: String(episodeNumber) });
        const searchJson = await providerFetch<any>(`/toonworld/episode?${searchParams}`, 25000);
        const searchParsed = parseResponse(searchJson);
        if (searchParsed.length > 0) return searchParsed;

        // Try EP1 fallback
        if (episodeNumber !== 1) {
          const ep1Params = new URLSearchParams({ slug: searchSlug, season: String(season), episode: "1" });
          const ep1Json = await providerFetch<any>(`/toonworld/episode?${ep1Params}`, 25000);
          const ep1Parsed = parseResponse(ep1Json);
          if (ep1Parsed.length > 0) return ep1Parsed;
        }
      }
    }
  }

  // Final direct fallback.
  const directSlug = slugify(searchQuery || animeName);
  if (directSlug) {
    const params = new URLSearchParams({ slug: directSlug, season: String(season), episode: String(episodeNumber) });
    const json = await providerFetch<any>(`/toonworld/episode?${params}`, 25000);
    const parsed = parseResponse(json);
    if (parsed.length > 0) return parsed;
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
  const targetEpisode = episodeNumber && episodeNumber > 0 ? episodeNumber : 1;

  const parseWatchSources = (payload: any): StreamingSource[] => {
    const sources = payload?.sources || payload?.data?.sources;
    if (!Array.isArray(sources) || sources.length === 0) return [];
    return sources.map((s: any, i: number) => formatAnimeyaSource(s, i));
  };

  const watchByEpisodeId = async (episodeId: string): Promise<StreamingSource[]> => {
    const watchRes = await providerFetch<any>(`/animeya/watch/${encodeURIComponent(episodeId)}`);
    return parseWatchSources(watchRes);
  };

  const numericId = typeof id === "number"
    ? id
    : (typeof id === "string" && /^\d+$/.test(id.trim()) ? Number(id.trim()) : NaN);

  if (Number.isFinite(numericId) && numericId > 0) {
    const directByAnilist = await providerFetch<any>(
      `/animeya/watch/anilist/${encodeURIComponent(String(numericId))}/episode/${encodeURIComponent(String(targetEpisode))}`
    );
    const directByAnilistSources = parseWatchSources(directByAnilist);
    if (directByAnilistSources.length > 0) return directByAnilistSources;
  }

  const searchQuery = cleanedSearchTitle(animeName || (typeof id === "string" ? id : ""));
  if (searchQuery) {
    const searchRes = await providerFetch<any>(`/animeya/search?q=${encodeURIComponent(searchQuery)}`, 9000);
    const results = searchRes?.results || searchRes?.data?.results || searchRes?.data;
    if (Array.isArray(results) && results.length > 0) {
      const ranked = [...results]
        .filter((entry: any) => entry?.slug)
        .sort((a: any, b: any) => scoreSearchCandidate(b, searchQuery) - scoreSearchCandidate(a, searchQuery));

      for (const candidate of ranked.slice(0, 3)) {
        const infoRes = await providerFetch<any>(`/animeya/info/${candidate.slug}`, 9000);
        const episodes = infoRes?.episodes || infoRes?.data?.episodes || [];
        if (!Array.isArray(episodes) || episodes.length === 0) continue;

        const exact =
          episodes.find((e: any) => Number(e?.number) === Number(targetEpisode)) ||
          episodes.find((e: any) => Number(e?.episode) === Number(targetEpisode)) ||
          episodes[0];

        const episodeId = exact?.id;
        if (!episodeId) continue;

        const sources = await watchByEpisodeId(String(episodeId));
        if (sources.length > 0) return sources;
      }
    }
  }

  if (typeof id === "string" && id.trim() && !/^\d+$/.test(id.trim())) {
    const slugInfo = await providerFetch<any>(`/animeya/info/${encodeURIComponent(id.trim())}`);
    const episodes = slugInfo?.episodes || slugInfo?.data?.episodes || [];
    if (Array.isArray(episodes) && episodes.length > 0) {
      const exact =
        episodes.find((e: any) => Number(e?.number) === Number(targetEpisode)) ||
        episodes.find((e: any) => Number(e?.episode) === Number(targetEpisode)) ||
        episodes[0];
      if (exact?.id) {
        const sources = await watchByEpisodeId(String(exact.id));
        if (sources.length > 0) return sources;
      }
    }
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

              const providerTimeoutMs = Math.max(1200, Math.floor(getProviderExecutionTimeoutMs(provider.key) * 0.6));
              const result = await Promise.race([
                provider.execute(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), providerTimeoutMs)),
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

function extractTrailingNumericSuffix(value?: string): number | undefined {
  if (!value) return undefined;
  const base = String(value).split("?")[0].trim();
  const match = base.match(/-(\d{1,9})$/);
  if (!match?.[1]) return undefined;
  return toPositiveNumber(match[1]);
}

export async function fetchTatakaiProviderSources(
  query: TatakaiProviderSourceQuery
): Promise<StreamingData & { providerServers: EpisodeServer[] }> {
  const animeIdBase = String(query.animeId || "").split("?")[0].trim();

  // Clean animeName by removing trailing anime IDs (e.g., "name-20401" → "name")
  let rawAnimeName = query.animeName?.trim() || animeIdBase.replace(/[-_]+/g, " ") || "";
  const animeName = rawAnimeName.replace(/-\d{4,}$/, "").trim();

  let decodedAnimeIdBase = animeIdBase;
  try {
    decodedAnimeIdBase = decodeURIComponent(animeIdBase);
  } catch {
    decodedAnimeIdBase = animeIdBase;
  }

  const slug = query.slug?.trim() || decodedAnimeIdBase || (animeName ? slugify(animeName) : "");
  const season = query.season && query.season > 0 ? query.season : 1;
  const episodeNumber = query.episodeNumber && query.episodeNumber > 0 ? query.episodeNumber : 1;
  const category = query.category === "dub" ? "dub" : "sub";
  const animeIdTail = extractTrailingNumericSuffix(animeIdBase);
  const rawAniListHint = toPositiveNumber(query.anilistId || (query as any).anilistID);
  const rawMalHint = toPositiveNumber(query.malId || (query as any).malID);
  // Guard against HiAnime/internal ID leakage into AniList hinting.
  const anilistId =
    rawAniListHint && !(animeIdTail && animeIdTail >= 10000 && animeIdTail === rawAniListHint && !(query.anilistId || (query as any).anilistID))
      ? rawAniListHint
      : undefined;
  // Prefer explicit IDs; allow only legacy small-id slug suffixes and explicit AniList markers.
  const derivedAniListId =
    anilistId ??
    extractLegacyAniListIdFromSlug(query.slug) ??
    extractLegacyAniListIdFromSlug(animeIdBase) ??
    extractLegacyAniListIdFromSlug(slug) ??
    extractTrailingAniListId(rawAnimeName) ??
    extractTrailingAniListId(slug) ??
    extractTrailingAniListId(query.animeId) ??
    animeIdTail;
  const malId = rawMalHint;
  const providerLastGoodKey = buildProviderLastGoodCacheKey({
    animeId: query.animeId,
    slug,
    animeName,
    episodeNumber,
    season,
    category,
    anilistId: derivedAniListId,
    malId,
  });

  if (import.meta.env.DEV) {
    console.log(`[Tatakai] Identifier Check:`, {
      originalQueryAnilist: query.anilistId,
      originalQueryMal: query.malId,
      rawAniListHint,
      anilistId,
      derivedAniListId,
      malId,
      slug,
      animeName
    });
  }

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
      execute: () => fetchAnimelokSources(slug, episodeNumber, derivedAniListId, animeName, malId),
    },
    {
      key: "desidub",
      enabled: !!slug,
      execute: () => fetchDesidubanimeSources(slug, episodeNumber, derivedAniListId, animeName),
    },
    {
      key: "aniworld",
      enabled: !!slug,
      execute: () => fetchAniworldSources(slug, episodeNumber, season, derivedAniListId, animeName),
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
      execute: () => fetchHindiDubbedSources(slug, episodeNumber, derivedAniListId, animeName),
    },
    {
      key: "animepahe",
      enabled: !!(derivedAniListId || animeName),
      execute: () => fetchAnimepaheSources(slug, episodeNumber, derivedAniListId, animeName),
    },
    {
      key: "animekai",
      enabled: !!(derivedAniListId || animeName),
      execute: () => fetchAnimeKaiSources(slug, episodeNumber, derivedAniListId, animeName),
    },
  ];

  const activeProviderTasks = providerTasks.filter((t) => {
    if (!t.enabled) {
      if (import.meta.env.DEV) {
        let reason = "unknown";
        if (t.key === "animelok") reason = "!slug";
        if (t.key === "hindiapi") reason = "!(malId || derivedAniListId)";
        if (t.key === "anilisthindi") reason = "!derivedAniListId";
        console.log(`[Tatakai] Task Disabled: ${t.key} (Reason: ${reason})`);
      }
      return false;
    }
    return true;
  });
  
  if (import.meta.env.DEV) {
    console.log(`[Tatakai] Enabled providers: ${activeProviderTasks.map(t => t.key).join(", ")}`);
  }

  const filteredActiveProviderTasks = activeProviderTasks.filter((task) => {
    const coolingDown = isProviderTimeoutCoolingDown(task.key);
    if (coolingDown) {
      // TEMPORARY: Bypass cooldown for targeted providers during debug
      if (task.key === "animelok" || task.key === "hindiapi") {
        console.log(`[Tatakai] Bypassing cooldown for ${task.key}`);
        return true;
      }
      if (import.meta.env.DEV) {
        console.log(`[Tatakai] Task Cooldown Skip: ${task.key}`);
      }
      return false;
    }
    return true;
  });
  if (filteredActiveProviderTasks.length === 0) {
    const cached = getProviderLastGood(providerLastGoodKey);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log(`[Tatakai] Provider aggregation: using cached last-good sources (all providers cooling down)`);
      }
      return cached;
    }
  }
  const timeoutMarker = Symbol("provider-timeout");
  const runProviderBatch = async (
    tasks: Array<{ key: string; execute: () => Promise<any> }>,
    timeoutOffsetMs = 0
  ) =>
    mapWithConcurrency(
      tasks,
      PROVIDER_MAX_CONCURRENCY,
      async (task) => {
        const timeoutMs = Math.max(1000, getProviderExecutionTimeoutMs(task.key) + timeoutOffsetMs);
        try {
          const result = await Promise.race([
            task.execute(),
            new Promise<typeof timeoutMarker>((resolve) => setTimeout(() => resolve(timeoutMarker), timeoutMs)),
          ]);
          if (result === timeoutMarker) {
            return { key: task.key, ok: true as const, result: null, timedOut: true as const, timeoutMs };
          }
          return { key: task.key, ok: true as const, result, timedOut: false as const, timeoutMs };
        } catch (error) {
          return { key: task.key, ok: false as const, error, timeoutMs };
        }
      }
    );

  let providerResults = await runProviderBatch(filteredActiveProviderTasks);

  for (let attempt = 1; attempt <= PROVIDER_TIMEOUT_RETRY_ATTEMPTS; attempt += 1) {
    const timedOutTasks = filteredActiveProviderTasks.filter((task) => {
      const entry = providerResults.find((candidate) => candidate.key === task.key);
      return !!entry?.ok && !!entry.timedOut;
    });

    if (timedOutTasks.length === 0) break;

    if (import.meta.env.DEV) {
      const labels = timedOutTasks.map((task) => prettyProviderName(task.key)).join(", ");
      console.log(`[Tatakai] Timeout retry #${attempt}: ${labels}`);
    }

    const retryResults = await runProviderBatch(timedOutTasks, PROVIDER_TIMEOUT_RETRY_TIMEOUT_BONUS_MS);
    const retryByKey = new Map(retryResults.map((entry) => [entry.key, entry]));
    providerResults = providerResults.map((entry) => retryByKey.get(entry.key) ?? entry);
  }

  // Timeout retries are handled inline once per request; avoid background retry loops.

  const aggregatedSources: StreamingSource[] = [];
  let headers = empty.headers;
  let intro = empty.intro;
  let outro = empty.outro;
  let subtitles = empty.subtitles;
  let tracks = empty.tracks;
  let providerAnilistId: number | null = empty.anilistID;
  let providerMalId: number | null = empty.malID;
  const providerDiagnostics: Array<{ key: string; status: "success" | "empty" | "error" | "timeout"; sourceCount: number; timeoutMs?: number; error?: string }> = [];

  for (const entry of providerResults) {
    if (!entry.ok) {
      providerDiagnostics.push({
        key: entry.key,
        status: "error",
        sourceCount: 0,
        timeoutMs: entry.timeoutMs,
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
      timeoutMs: entry.timeoutMs,
    });

    if (entry.timedOut) {
      markProviderTimeout(key);
      continue;
    }

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

  // Do not merge background retry results; server list should be stable per request.

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
        console.log(`[Tatakai] Provider ${label}: timeout | sources=0 | ${item.timeoutMs || PROVIDER_EXECUTION_TIMEOUT_MS}ms`);
      } else {
        console.log(`[Tatakai] Provider ${label}: ${item.status} | sources=${item.sourceCount}`);
      }
    }
    console.log(
      `[Tatakai] Provider aggregation: ${providerCount} provider(s) returned ${sourceCount} total source(s) | ${successfulProviders || "none"}`
    );
  }

  const finalPayload: StreamingData & { providerServers: EpisodeServer[] } = {
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

  if (dedupedSources.length > 0) {
    setProviderLastGood(providerLastGoodKey, finalPayload);
    return finalPayload;
  }

  const cachedFallback = getProviderLastGood(providerLastGoodKey);
  if (cachedFallback) {
    if (import.meta.env.DEV) {
      console.log(`[Tatakai] Provider aggregation: returning cached last-good sources after empty live result`);
    }
    return cachedFallback;
  }

  return finalPayload;
}

