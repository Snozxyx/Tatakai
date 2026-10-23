/**
 * Quality-preference source selection, shared by VideoPlayer and
 * MobileVideoPlayer (which previously carried drifted copies of this logic).
 */

export type PreferredQuality = "auto" | "1080p" | "720p" | "480p" | "360p";

/** `"1080p HD"`, `"720 p"`, `"1080PHD"`… → 1080 / 720 (null when unparseable). */
export function parseQualityScore(quality?: string): number | null {
  const normalized = String(quality || "").toLowerCase();
  const match = normalized.match(/(\d{3,4})\s*p?/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

const normalizeKey = (value?: string) => String(value || "").trim().toLowerCase();

/**
 * Pick the source to play honoring the quality preference — without ever
 * leaving the explicitly selected server.
 *
 * `sources[0]` is the active selection: WatchPage (and every caller) puts the
 * server the user picked first, so any further entries belong to the same or
 * other servers. The preference must only choose AMONG the picked server's own
 * sources — otherwise a fixed quality like "1080p" jumped to whichever other
 * server had the numerically closest tag and switching servers silently
 * stopped changing what actually played.
 */
export function selectPreferredSource<
  T extends {
    url: string;
    quality?: string;
    server?: string;
    providerName?: string;
    providerKey?: string;
  },
>(sources: readonly T[], preferredQuality: PreferredQuality): T | undefined {
  const selected = sources[0];
  if (!selected) return undefined;
  if (preferredQuality === "auto") return selected;

  // Same-server pool, matched the same way `selectSourceForServer` does.
  const activeKeys = new Set<string>();
  for (const value of [selected.server, selected.providerKey, selected.providerName]) {
    const normalized = normalizeKey(value);
    if (normalized) activeKeys.add(normalized);
  }
  const pool = activeKeys.size
    ? sources.filter((source) => {
        const keys = [source.server, source.providerKey, source.providerName].map(normalizeKey);
        return keys.some((key) => key && activeKeys.has(key));
      })
    : [];
  const searchPool = pool.length > 0 ? pool : [selected];

  const preferredScore = parseQualityScore(preferredQuality);
  if (!preferredScore) {
    return (
      searchPool.find((source) => String(source.quality || "").toLowerCase() === preferredQuality) || selected
    );
  }

  const candidates = searchPool
    .map((source) => ({ source, score: parseQualityScore(source.quality) }))
    .filter((entry): entry is { source: T; score: number } => entry.score != null)
    // Stable sort keeps `selected` (pool[0]) ahead of equal-scored siblings.
    .sort((left, right) => {
      const distanceDiff =
        Math.abs(left.score - preferredScore) - Math.abs(right.score - preferredScore);
      if (distanceDiff !== 0) return distanceDiff;
      return right.score - left.score;
    });

  if (candidates.length > 0) return candidates[0].source;
  return (
    searchPool.find((source) => String(source.quality || "").toLowerCase() === preferredQuality) || selected
  );
}
