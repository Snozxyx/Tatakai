type AnyRecord = Record<string, any>;

export type DubQualityProfile = "balanced" | "prefer-quality" | "prefer-speed";

const PREFERRED_SERVER_KEY = "tatakai.preferred.server";
const COMBINED_SOURCE_CACHE_PREFIX = "tatakai.combined.sources";
const combinedSourceCache = new Map<string, unknown>();

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function normalizeServerKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

/** comboFailureKey — accepts 3 or 4 args (WatchPage passes 4). */
export function comboFailureKey(episodeId: string, server: string, category: string, _extra?: string): string {
  return [String(episodeId || ""), normalizeServerKey(server), String(category || "")].join("::");
}

/** getPreferredServer — WatchPage passes (animeId, category). */
export function getPreferredServer(_animeIdOrEpisodeId?: string, _category?: string): string | null {
  const value = safeLocalStorageGet(PREFERRED_SERVER_KEY);
  return value && value.trim().length > 0 ? value : null;
}

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

/** setPreferredServer — called as setPreferredServer(server) or setPreferredServer(animeId, category, server). */
export function setPreferredServer(animeIdOrServer: string, _category?: string, server?: string): void {
  const value = server || animeIdOrServer;
  if (!value) return;
  safeLocalStorageSet(PREFERRED_SERVER_KEY, value);
}

export function clearCachedCombinedSourcesByEpisodeAndCategory(_episodeId?: string, _category?: string): void {
  // Compatibility no-op while source intelligence cache is being rebuilt.
}

export function getCachedCombinedSources<T = unknown>(key: string): T | null {
  return combinedSourceCache.has(key) ? (combinedSourceCache.get(key) as T) : null;
}

export function setCachedCombinedSources<T = unknown>(key: string, value: T): void {
  combinedSourceCache.set(key, value);
}

export function getSourceFailureCount(_key: string): number {
  return 0;
}

export function clearSourceFailure(_key: string): void {
  // Compatibility no-op.
}

export function recordSourceFailure(_key: string): void {
  // Compatibility no-op.
}

/** recordSourceHealth — WatchPage calls (server, category, ok, latencyMs). */
export function recordSourceHealth(_server: string, ..._args: any[]): void {
  // Compatibility no-op.
}

export function getSourceHealthScore(_server: string): number {
  return 1;
}

export function sortServersByHealth<T extends AnyRecord>(servers: T[]): T[] {
  return [...servers];
}

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
  const hasUsableUrl = (s: T) => Boolean(String(s?.url || '').trim());
  const isDubtitle = (s: T) => {
    const value = `${s?.lang || ''} ${s?.label || ''} ${s?.url || ''}`.toLowerCase();
    return (
      value.includes('dubtitle') ||
      value.includes('dub-title') ||
      value.includes('dub title') ||
      value.includes('dub cc') ||
      value.includes('dub captions') ||
      value.includes('signs & songs') ||
      value.includes('signs/songs')
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

  // In dub playback, normal subtitle tracks from the sub stream are the cleanest
  // fallback. Dubtitles are only used when there are no normal subtitles at all.
  normalSubTracks.forEach(add);
  normalDubTracks.forEach(add);

  if (results.length === 0) {
    (subSubtitles || []).filter(hasUsableUrl).forEach(add);
    (dubSubtitles || []).filter(hasUsableUrl).forEach(add);
  }

  return results;
}

/** shouldAutoSkipSource — called with string (comboKey) or AnyRecord. */
export function shouldAutoSkipSource(_source: AnyRecord | string, _profile?: DubQualityProfile): boolean {
  return false;
}

/** logPlaybackTelemetry — called as logPlaybackTelemetry(obj) or logPlaybackTelemetry(string, obj). */
export function logPlaybackTelemetry(_eventOrPayload: string | AnyRecord, _payload?: AnyRecord): void {
  // Avoid noisy logs in production fallback mode.
}

/** recordProviderQualityOutcome — WatchPage calls with 4 args (key, category, quality, ok). */
export function recordProviderQualityOutcome(_providerKey: string, ..._args: any[]): void {
  // Compatibility no-op.
}
