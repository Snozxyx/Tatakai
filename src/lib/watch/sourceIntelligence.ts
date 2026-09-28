type AnyRecord = Record<string, any>;

import { evictToCap } from "@/lib/cache/boundedMap";
import { getProfileKnobs } from "@/lib/memoryProfile";

export type DubQualityProfile = "balanced" | "prefer-quality" | "prefer-speed";

const PREFERRED_SERVER_PREFIX = "tatakai.preferred.server";
const PREFERRED_SERVER_EPISODE_PREFIX = "tatakai.preferred.server.ep";
const SOURCE_HEALTH_PREFIX = "tatakai.source.health";
const SOURCE_FAILURE_PREFIX = "tatakai.source.failures";
const COMBINED_SOURCE_CACHE_PREFIX = "tatakai.combined.sources";
const combinedSourceCache = new Map<string, unknown>();

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (quota exceeded, private browsing, etc.)
  }
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function normalizeServerKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function preferredServerKey(animeId: string, category?: string): string {
  const cat = category ? `:${category}` : "";
  return `${PREFERRED_SERVER_PREFIX}:${animeId}${cat}`;
}

function preferredServerEpisodeKey(episodeId: string, category?: string): string {
  const cat = category ? `:${category}` : "";
  return `${PREFERRED_SERVER_EPISODE_PREFIX}:${episodeId}${cat}`;
}

function sourceHealthKey(server: string): string {
  return `${SOURCE_HEALTH_PREFIX}:${normalizeServerKey(server)}`;
}

function sourceFailureKey(key: string): string {
  return `${SOURCE_FAILURE_PREFIX}:${key}`;
}

// ---------------------------------------------------------------------------
// comboFailureKey
// ---------------------------------------------------------------------------

/** comboFailureKey — accepts 3 or 4 args (WatchPage passes 4). */
export function comboFailureKey(episodeId: string, server: string, category: string, _extra?: string): string {
  return [String(episodeId || ""), normalizeServerKey(server), String(category || "")].join("::");
}

// ---------------------------------------------------------------------------
// Preferred server (per-anime, per-category)
// ---------------------------------------------------------------------------

/** getPreferredServer — returns the stored preferred server for an anime (+ optional category). */
export function getPreferredServer(animeId?: string, category?: string): string | null {
  if (!animeId) return null;

  // Try category-specific first, then global for the anime.
  if (category) {
    const catValue = safeLocalStorageGet(preferredServerKey(animeId, category));
    if (catValue && catValue.trim().length > 0) return catValue;
  }
  const globalValue = safeLocalStorageGet(preferredServerKey(animeId));
  return globalValue && globalValue.trim().length > 0 ? globalValue : null;
}

/** setPreferredServer — stores the preferred server for an anime (+ optional category). */
export function setPreferredServer(animeId: string, category?: string, server?: string): void {
  // Support legacy call: setPreferredServer(server) with no real animeId
  const actualServer = server || category; // if called as setPreferredServer(server)
  if (!animeId || !actualServer) return;

  safeLocalStorageSet(preferredServerKey(animeId, category), actualServer);
}

/** clearPreferredServer — removes stored preference for an anime. */
export function clearPreferredServer(animeId: string, category?: string): void {
  if (!animeId) return;
  if (category) {
    safeLocalStorageRemove(preferredServerKey(animeId, category));
  }
  safeLocalStorageRemove(preferredServerKey(animeId));
}

// ---------------------------------------------------------------------------
// Preferred server (per-episode, per-category)
// ---------------------------------------------------------------------------

/** getPreferredServerForEpisode — returns the stored preferred server for an episode (+ optional category). */
export function getPreferredServerForEpisode(episodeId?: string, category?: string): string | null {
  if (!episodeId) return null;

  // Try category-specific first, then global for the episode.
  if (category) {
    const catValue = safeLocalStorageGet(preferredServerEpisodeKey(episodeId, category));
    if (catValue && catValue.trim().length > 0) return catValue;
  }
  const globalValue = safeLocalStorageGet(preferredServerEpisodeKey(episodeId));
  return globalValue && globalValue.trim().length > 0 ? globalValue : null;
}

/** setPreferredServerForEpisode — stores the preferred server for an episode (+ optional category). */
export function setPreferredServerForEpisode(episodeId: string, category: string | undefined, server: string): void {
  if (!episodeId || !server) return;

  safeLocalStorageSet(preferredServerEpisodeKey(episodeId, category), server);
}

// ---------------------------------------------------------------------------
// Source health tracking
// ---------------------------------------------------------------------------

interface SourceHealth {
  ok: number;
  fail: number;
  totalLatency: number;
  lastCheck: number;
}

function getSourceHealth(server: string): SourceHealth | null {
  const raw = safeLocalStorageGet(sourceHealthKey(server));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSourceHealth(server: string, health: SourceHealth): void {
  // Keep at most 200 server entries to avoid bloating storage.
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SOURCE_HEALTH_PREFIX)) keys.push(k);
    }
    if (keys.length > 200) {
      keys
        .sort((a, b) => {
          const ha = getSourceHealth(a.slice(SOURCE_HEALTH_PREFIX.length + 1));
          const hb = getSourceHealth(b.slice(SOURCE_HEALTH_PREFIX.length + 1));
          return (ha?.lastCheck || 0) - (hb?.lastCheck || 0);
        })
        .slice(0, keys.length - 200)
        .forEach((k) => safeLocalStorageRemove(k));
    }
  } catch {
    // Ignore cleanup failures.
  }
  safeLocalStorageSet(sourceHealthKey(server), JSON.stringify(health));
}

/** recordSourceHealth — called as recordSourceHealth(server, category, ok, latencyMs). */
export function recordSourceHealth(server: string, _category?: string, ok?: boolean | string, latencyMs?: number): void {
  if (!server) return;
  const isOk = ok === true || ok === "true" || ok === undefined;
  const latency = Number(latencyMs) || 0;
  const existing = getSourceHealth(server);

  const health: SourceHealth = {
    ok: (existing?.ok || 0) + (isOk ? 1 : 0),
    fail: (existing?.fail || 0) + (isOk ? 0 : 1),
    totalLatency: (existing?.totalLatency || 0) + latency,
    lastCheck: Date.now(),
  };

  setSourceHealth(server, health);
}

export function getSourceHealthScore(server: string): number {
  const h = getSourceHealth(server);
  if (!h) return 1; // Unknown = neutral
  const total = h.ok + h.fail;
  if (total === 0) return 1;
  return h.ok / total;
}

export function sortServersByHealth<T extends AnyRecord>(servers: T[]): T[] {
  return [...servers].sort((a, b) => {
    const scoreA = getSourceHealthScore(String(a?.serverName || a?.providerName || ""));
    const scoreB = getSourceHealthScore(String(b?.serverName || b?.providerName || ""));
    return scoreB - scoreA; // Higher score first
  });
}

// ---------------------------------------------------------------------------
// Source failure tracking
// ---------------------------------------------------------------------------

export function getSourceFailureCount(key: string): number {
  const raw = safeLocalStorageGet(sourceFailureKey(key));
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.count === "number" ? parsed.count : 0;
  } catch {
    return 0;
  }
}

export function recordSourceFailure(key: string): void {
  const existing = getSourceFailureCount(key);
  safeLocalStorageSet(
    sourceFailureKey(key),
    JSON.stringify({ count: existing + 1, lastFailure: Date.now() }),
  );
}

export function clearSourceFailure(key: string): void {
  safeLocalStorageRemove(sourceFailureKey(key));
}

/** shouldAutoSkipSource — returns true if a source has failed too many times (≥3). */
export function shouldAutoSkipSource(source: AnyRecord | string, _profile?: DubQualityProfile): boolean {
  const key = typeof source === "string" ? source : comboFailureKey(source?.episodeId || "", source?.server || source?.providerName || "", source?.category || "");
  return getSourceFailureCount(key) >= 3;
}

// ---------------------------------------------------------------------------
// Combined source cache (in-memory, ephemeral)
// ---------------------------------------------------------------------------

export function getCombinedSourceCacheKey(
  episodeId: string,
  server: string,
  category: string,
  currentUserId?: string,
): string {
  return [
    COMBINED_SOURCE_CACHE_PREFIX,
    String(episodeId || ""),
    normalizeServerKey(server),
    String(category || ""),
    String(currentUserId || "guest"),
  ].join("::");
}

export function getCachedCombinedSources<T = unknown>(key: string): T | null {
  return combinedSourceCache.has(key) ? (combinedSourceCache.get(key) as T) : null;
}

export function setCachedCombinedSources<T = unknown>(key: string, value: T): void {
  combinedSourceCache.set(key, value);
  evictToCap(combinedSourceCache, getProfileKnobs().cacheCaps.combinedSource);
}

/** Drop every combined-source entry (used by the "Free memory now" reclaim). */
export function clearAllCombinedSources(): void {
  combinedSourceCache.clear();
}

export function clearCachedCombinedSourcesByEpisodeAndCategory(episodeId?: string, _category?: string): void {
  if (!episodeId) return;
  const prefix = `${COMBINED_SOURCE_CACHE_PREFIX}::${episodeId}`;
  for (const key of combinedSourceCache.keys()) {
    if (String(key).startsWith(prefix)) {
      combinedSourceCache.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Misc utilities
// ---------------------------------------------------------------------------

export function getRefererVariants(url: string): string[] {
  const value = String(url || "").trim();
  if (!value) return [];

  try {
    const parsed = new URL(value);
    return [parsed.origin, `${parsed.origin}/`];
  } catch {
    return [];
  }
}

/** preflightSourceUrl — returns { ok, latencyMs } to match WatchPage usage. */
export async function preflightSourceUrl(_url: string, _timeoutMs?: number): Promise<{ ok: boolean; latencyMs: number }> {
  return { ok: true, latencyMs: 0 };
}

export function selectSourceForServer<T extends AnyRecord>(sources: T[], serverName?: string, _category?: string): T | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const wanted = normalizeServerKey(String(serverName || ""));
  if (!wanted) return sources[0] || null;

  return sources.find((source) => {
    const server = normalizeServerKey(String(source?.server || ""));
    const providerName = normalizeServerKey(String(source?.providerName || ""));
    const providerKey = normalizeServerKey(String(source?.providerKey || ""));
    return server === wanted || providerName === wanted || providerKey === wanted;
  }) || null;
}

export function buildDubSubtitles<T extends { lang?: string; url?: string; label?: string }>(
  dubSubtitles: T[],
  subSubtitles: T[]
): T[] {
  const seen = new Set<string>();
  const results: T[] = [];
  const hasUsableUrl = (s: T) => Boolean(String(s?.url || "").trim());
  const isDubtitle = (s: T) => {
    const value = `${s?.lang || ""} ${s?.label || ""} ${s?.url || ""}`.toLowerCase();
    return (
      value.includes("dubtitle") ||
      value.includes("dub-title") ||
      value.includes("dub title") ||
      value.includes("dub cc") ||
      value.includes("dub captions") ||
      value.includes("signs & songs") ||
      value.includes("signs/songs")
    );
  };
  const add = (s: T) => {
    if (!hasUsableUrl(s)) return;
    const key = `${s.lang}|${s.url}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(s);
  };

  const normalSubTracks = (subSubtitles || []).filter((s) => hasUsableUrl(s) && !isDubtitle(s));
  const normalDubTracks = (dubSubtitles || []).filter((s) => hasUsableUrl(s) && !isDubtitle(s));

  normalSubTracks.forEach(add);
  normalDubTracks.forEach(add);

  if (results.length === 0) {
    (subSubtitles || []).filter(hasUsableUrl).forEach(add);
    (dubSubtitles || []).filter(hasUsableUrl).forEach(add);
  }

  return results;
}

/** logPlaybackTelemetry — called as logPlaybackTelemetry(obj) or logPlaybackTelemetry(string, obj). */
export function logPlaybackTelemetry(_eventOrPayload: string | AnyRecord, _payload?: AnyRecord): void {
  // Avoid noisy logs in production fallback mode.
}

/** recordProviderQualityOutcome — WatchPage calls with 4 args (key, category, quality, ok). */
export function recordProviderQualityOutcome(_providerKey: string, ..._args: any[]): void {
  // Compatibility no-op.
}
