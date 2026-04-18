import type { EpisodeServer, StreamingData, StreamingSource, Subtitle } from "@/types/anime";

const SOURCE_HEALTH_KEY = "watch-source-health-v1";
const SOURCE_FAILURE_KEY = "watch-source-failures-v1";
const PREFERRED_SERVER_KEY = "watch-preferred-servers-v1";
const PROVIDER_QUALITY_KEY = "watch-provider-quality-v1";
const SOURCE_CACHE_TTL_MS = 10 * 60 * 1000;

export type DubQualityProfile = "stability" | "quality";

type SourceHealth = {
  score: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  lastFailureAt?: number;
};

type SourceFailure = {
  count: number;
  lastFailureAt: number;
};

type PreferredServerByCategory = {
  sub?: string;
  dub?: string;
};

type ProviderQualityPreference = {
  quality: string;
  confidence: number;
  updatedAt: number;
};

type ProviderQualityMap = Record<string, ProviderQualityPreference>;

const combinedSourceCache = new Map<string, { expiresAt: number; data: StreamingData & { hasTatakaiAPI: boolean } }>();

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readHealthMap(): Record<string, SourceHealth> {
  if (typeof window === "undefined") return {};
  return safeParse<Record<string, SourceHealth>>(window.localStorage.getItem(SOURCE_HEALTH_KEY), {});
}

function writeHealthMap(data: Record<string, SourceHealth>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOURCE_HEALTH_KEY, JSON.stringify(data));
}

function readFailureMap(): Record<string, SourceFailure> {
  if (typeof window === "undefined") return {};
  return safeParse<Record<string, SourceFailure>>(window.localStorage.getItem(SOURCE_FAILURE_KEY), {});
}

function writeFailureMap(data: Record<string, SourceFailure>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOURCE_FAILURE_KEY, JSON.stringify(data));
}

function readPreferredServers(): Record<string, PreferredServerByCategory> {
  if (typeof window === "undefined") return {};
  return safeParse<Record<string, PreferredServerByCategory>>(window.localStorage.getItem(PREFERRED_SERVER_KEY), {});
}

function writePreferredServers(data: Record<string, PreferredServerByCategory>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFERRED_SERVER_KEY, JSON.stringify(data));
}

function readProviderQualityMap(): ProviderQualityMap {
  if (typeof window === "undefined") return {};
  return safeParse<ProviderQualityMap>(window.localStorage.getItem(PROVIDER_QUALITY_KEY), {});
}

function writeProviderQualityMap(data: ProviderQualityMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROVIDER_QUALITY_KEY, JSON.stringify(data));
}

function parseQualityRank(value?: string): number {
  if (!value) return 0;
  const normalized = value.toLowerCase();
  const numeric = normalized.match(/(\d{3,4})p?/);
  if (numeric) return parseInt(numeric[1], 10);
  if (normalized.includes("4k")) return 2160;
  if (normalized.includes("hd")) return 1080;
  if (normalized.includes("sd")) return 480;
  return 360;
}

function providerQualityKey(providerName: string, category: "sub" | "dub") {
  return `${category}:${providerName.toLowerCase()}`;
}

export function getPreferredProviderQuality(providerName: string, category: "sub" | "dub"): string | null {
  const all = readProviderQualityMap();
  const entry = all[providerQualityKey(providerName, category)];
  if (!entry) return null;
  return entry.quality;
}

export function recordProviderQualityOutcome(
  providerName: string,
  category: "sub" | "dub",
  quality: string | undefined,
  ok: boolean
) {
  if (!providerName || !quality) return;

  const all = readProviderQualityMap();
  const key = providerQualityKey(providerName, category);
  const prev = all[key];

  if (!prev) {
    all[key] = {
      quality,
      confidence: ok ? 0.6 : 0.3,
      updatedAt: Date.now(),
    };
    writeProviderQualityMap(all);
    return;
  }

  // If current quality repeatedly fails, confidence decays and replacement can take over.
  if (prev.quality === quality) {
    const nextConfidence = ok
      ? Math.min(1, prev.confidence + 0.12)
      : Math.max(0.05, prev.confidence - 0.22);
    all[key] = {
      quality,
      confidence: nextConfidence,
      updatedAt: Date.now(),
    };
    writeProviderQualityMap(all);
    return;
  }

  const candidateConfidence = ok
    ? Math.min(1, prev.confidence + 0.08)
    : Math.max(0.05, prev.confidence - 0.1);

  if (ok || prev.confidence < 0.35) {
    all[key] = {
      quality,
      confidence: candidateConfidence,
      updatedAt: Date.now(),
    };
    writeProviderQualityMap(all);
  }
}

export function rankSourcesByPreferredQuality(
  sources: StreamingSource[],
  providerName: string,
  category: "sub" | "dub"
): StreamingSource[] {
  const preferred = getPreferredProviderQuality(providerName, category);
  return [...sources].sort((a, b) => {
    const aPreferred = preferred && a.quality === preferred ? 1 : 0;
    const bPreferred = preferred && b.quality === preferred ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;

    const aRank = parseQualityRank(a.quality);
    const bRank = parseQualityRank(b.quality);
    if (aRank !== bRank) return bRank - aRank;

    // Prefer M3U8 if quality tie.
    const aStreamRank = Number(!!a.isM3U8);
    const bStreamRank = Number(!!b.isM3U8);
    return bStreamRank - aStreamRank;
  });
}

export function sourceKey(serverName: string, category: "sub" | "dub") {
  return `${category}:${serverName.toLowerCase()}`;
}

export function comboFailureKey(animeId: string, episodeId: string, serverName: string, category: "sub" | "dub") {
  return `${animeId}::${episodeId}::${category}::${serverName.toLowerCase()}`;
}

export function getPreferredServer(animeId: string, category: "sub" | "dub"): string | null {
  const all = readPreferredServers();
  return all[animeId]?.[category] || null;
}

export function setPreferredServer(animeId: string, category: "sub" | "dub", serverName: string) {
  const all = readPreferredServers();
  all[animeId] = { ...(all[animeId] || {}), [category]: serverName };
  writePreferredServers(all);
}

export function recordSourceHealth(serverName: string, category: "sub" | "dub", ok: boolean, latencyMs: number) {
  const key = sourceKey(serverName, category);
  const all = readHealthMap();
  const prev = all[key] || { score: 50, successes: 0, failures: 0, avgLatencyMs: 2500 };

  const successes = prev.successes + (ok ? 1 : 0);
  const failures = prev.failures + (ok ? 0 : 1);
  const avgLatencyMs = Math.round(prev.avgLatencyMs * 0.75 + latencyMs * 0.25);

  let score = prev.score;
  if (ok) {
    score = Math.min(100, score + 4);
  } else {
    score = Math.max(0, score - 10);
  }

  all[key] = {
    score,
    successes,
    failures,
    avgLatencyMs,
    lastFailureAt: ok ? prev.lastFailureAt : Date.now(),
  };

  writeHealthMap(all);
}

export function getSourceHealthScore(serverName: string, category: "sub" | "dub"): number {
  const all = readHealthMap();
  return all[sourceKey(serverName, category)]?.score ?? 50;
}

export function getSourceFailureCount(comboKey: string): number {
  const all = readFailureMap();
  const entry = all[comboKey];
  if (!entry) return 0;
  if (Date.now() - entry.lastFailureAt > 3 * 60 * 60 * 1000) return 0;
  return entry.count;
}

export function recordSourceFailure(comboKey: string) {
  const all = readFailureMap();
  const prev = all[comboKey] || { count: 0, lastFailureAt: Date.now() };
  all[comboKey] = { count: prev.count + 1, lastFailureAt: Date.now() };
  writeFailureMap(all);
}

export function clearSourceFailure(comboKey: string) {
  const all = readFailureMap();
  if (all[comboKey]) {
    delete all[comboKey];
    writeFailureMap(all);
  }
}

export function shouldAutoSkipSource(comboKey: string): boolean {
  return getSourceFailureCount(comboKey) >= 2;
}

export function sortServersByHealth(servers: EpisodeServer[], category: "sub" | "dub", profile: DubQualityProfile) {
  const qualityWeight = profile === "quality" ? 0.65 : 0.35;
  const stabilityWeight = profile === "quality" ? 0.35 : 0.65;

  const qualityRank = (name: string) => {
    const n = name.toLowerCase();
    if (n === "hd-2") return 100;
    if (n === "hd-1") return 90;
    if (n === "hd-3") return 80;
    return 60;
  };

  return [...servers].sort((a, b) => {
    const aScore = getSourceHealthScore(a.serverName, category) * stabilityWeight + qualityRank(a.serverName) * qualityWeight;
    const bScore = getSourceHealthScore(b.serverName, category) * stabilityWeight + qualityRank(b.serverName) * qualityWeight;
    return bScore - aScore;
  });
}

export function selectSourceForServer(sources: StreamingSource[], serverName: string, category?: "sub" | "dub"): StreamingSource | null {
  const target = serverName.toLowerCase();
  const matches = sources.filter((s) => {
    const candidates = [s.server, s.providerKey, s.providerName, s.langCode]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    if (!candidates.includes(target)) return false;
    if (!category) return true;
    return category === "dub" ? s.isDub === true : s.isDub !== true;
  });

  const pool = matches.length > 0 ? matches : sources.filter((s) => {
    const candidates = [s.server, s.providerKey, s.providerName, s.langCode]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return candidates.includes(target);
  });

  if (pool.length === 0) return null;

  const inferredCategory: "sub" | "dub" = category || (pool[0].isDub ? "dub" : "sub");
  const providerLabel = pool[0].providerName || pool[0].providerKey || serverName;
  const rankedByQuality = rankSourcesByPreferredQuality(pool, providerLabel, inferredCategory);

  return rankedByQuality
    .sort((a, b) => {
      const aScore = Number(!!a.isM3U8) + Number(a.isDub === true);
      const bScore = Number(!!b.isM3U8) + Number(b.isDub === true);
      return bScore - aScore;
    })[0] || null;
}

export function getCombinedSourceCacheKey(
  episodeId: string,
  server: string,
  category: string,
  userId?: string
) {
  return `${episodeId}::${server.toLowerCase()}::${category.toLowerCase()}::${userId || "guest"}`;
}

export function getCachedCombinedSources(cacheKey: string) {
  const cached = combinedSourceCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    combinedSourceCache.delete(cacheKey);
    return null;
  }
  return cached.data;
}

export function setCachedCombinedSources(cacheKey: string, data: StreamingData & { hasTatakaiAPI: boolean }) {
  combinedSourceCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + SOURCE_CACHE_TTL_MS,
  });
}

export function clearCachedCombinedSourcesByEpisodeAndCategory(episodeId: string, category: string) {
  const episodePrefix = `${episodeId}::`;
  const categoryMid = `::${category.toLowerCase()}::`;
  for (const key of combinedSourceCache.keys()) {
    if (key.startsWith(episodePrefix) && key.includes(categoryMid)) {
      combinedSourceCache.delete(key);
    }
  }
}

export async function preflightSourceUrl(url: string, timeoutMs = 4500): Promise<{ ok: boolean; latencyMs: number }> {
  const normalizedUrl = String(url || "").toLowerCase();
  if (
    normalizedUrl.includes("/api/v1/streamingproxy") ||
    normalizedUrl.includes("/api/v2/hianime/proxy/m3u8-streaming-proxy") ||
    normalizedUrl.includes("/api/proxy/m3u8-streaming-proxy")
  ) {
    // Proxy endpoints can reject ranged probes but still succeed for full playback.
    return { ok: true, latencyMs: 0 };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { ok: response.ok || response.status === 206, latencyMs: Date.now() - started };
  } catch {
    clearTimeout(timeoutId);
    return { ok: false, latencyMs: Date.now() - started };
  }
}

export function getRefererVariants(baseReferer?: string): string[] {
  const variants = [
    baseReferer || "",
    "https://megacloud.blog/",
    "https://megacloud.club/",
    "https://megacloud.tv/",
  ].filter(Boolean);

  return Array.from(new Set(variants));
}

export function buildDubSubtitles(
  dubTracks: Subtitle[],
  subTracks: Subtitle[]
): Array<Subtitle & { sourceOrigin?: string }> {
  const out: Array<Subtitle & { sourceOrigin?: string }> = [];
  const seenUrls = new Set<string>();
  const seenLanguages = new Set<string>();

  const normalizeLanguage = (track: Subtitle): string => {
    const raw = `${track.lang || ""} ${track.label || ""}`.toLowerCase();
    const compact = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (!compact) return "";

    if (compact === "en" || compact.includes("english") || compact.includes("eng")) return "en";
    if (compact === "ja" || compact.includes("japanese") || compact.includes("jpn")) return "ja";
    if (compact === "hi" || compact.includes("hindi")) return "hi";
    if (compact === "ta" || compact.includes("tamil")) return "ta";
    if (compact === "te" || compact.includes("telugu")) return "te";
    if (compact === "ml" || compact.includes("malayalam")) return "ml";
    if (compact === "es" || compact.includes("spanish") || compact.includes("espanol")) return "es";
    if (compact === "fr" || compact.includes("french")) return "fr";
    if (compact === "de" || compact.includes("german")) return "de";

    return compact;
  };

  const pushTrack = (track: Subtitle, sourceOrigin: string) => {
    if (!track?.url) return;

    const urlKey = String(track.url).trim();
    const languageKey = normalizeLanguage(track);
    if (seenUrls.has(urlKey)) return;
    if (languageKey && seenLanguages.has(languageKey)) return;

    seenUrls.add(urlKey);
    if (languageKey) seenLanguages.add(languageKey);

    out.push({
      ...track,
      label: track.label ? `${track.label} (${sourceOrigin})` : `${track.lang} (${sourceOrigin})`,
      sourceOrigin,
    });
  };

  subTracks.forEach((t) => pushTrack(t, "Sub Source"));
  dubTracks.forEach((t) => pushTrack(t, "Dub Source"));

  const hasEnglish = out.some((t) => (t.lang || "").toLowerCase().includes("english") || (t.label || "").toLowerCase().includes("english"));
  if (hasEnglish) {
    out.sort((a, b) => {
      const aEng = ((a.lang || "") + " " + (a.label || "")).toLowerCase().includes("english") ? 1 : 0;
      const bEng = ((b.lang || "") + " " + (b.label || "")).toLowerCase().includes("english") ? 1 : 0;
      return bEng - aEng;
    });
  }

  return out;
}

export async function logPlaybackTelemetry(event: {
  type: "source_health" | "source_failure" | "category_switch";
  animeId?: string;
  episodeId?: string;
  category?: string;
  serverName?: string;
  ok?: boolean;
  latencyMs?: number;
  userId?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const mod = await import("@/integrations/supabase/client");
    await (mod.supabase as any)
      .from("playback_telemetry")
      .insert({
        event_type: event.type,
        anime_id: event.animeId || null,
        episode_id: event.episodeId || null,
        category: event.category || null,
        server_name: event.serverName || null,
        ok: typeof event.ok === "boolean" ? event.ok : null,
        latency_ms: event.latencyMs || null,
        user_id: event.userId || null,
        metadata: event.metadata || {},
      });
  } catch {
    // Intentionally silent; telemetry should never break playback.
  }
}
