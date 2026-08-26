const CANONICAL_SERVER_NAMES: Record<string, string> = {
  "hd-1": "Tatakai HD 1",
  "hd-2": "Tatakai HD 2",
  "vidstreaming": "Vidstreaming",
  "streamsb": "StreamSB",
  "streamtape": "StreamTape",
  "mp4upload": "Mp4Upload",
  "filemoon": "Filemoon",
};

/**
 * Curated friendly aliases for extension (Toko) provider keys. The Watch page
 * button shows the alias; the real provider name/key is surfaced in the hover
 * tooltip only. Keyed by the provider's base segment (the part before the first
 * `-`), so compound keys like `animelok-bato` resolve to the same alias and get
 * numbered by `buildUniqueSimpleNameMap` (e.g. "Levi 1", "Levi 2").
 */
const PROVIDER_ALIASES: Record<string, string> = {
  // ── Direct-stream providers ──
  animepahe: "Naruto",
  anikoto: "Sasuke",
  anizone: "Sakura",
  senshi: "Kakashi",
  senshianime: "Kakashi",
  animeya: "Miki",
  toonstream: "Goku",
  reanime: "Luffy",
  aniworld: "Zoro",
  fouranime: "Nami",
  "4anime": "Nami",
  animelok: "Levi",
  watchanimeworld: "Eren",
  animesalt: "Mikasa",
  mkissa: "Gojo",
  desidub: "Itadori",
  animeheaven: "Nezuko",
  animeblkom: "Tanjiro",
  vidnest: "Killua",
  rubystm: "Gon",
  // ── Torrent providers ──
  nyaa: "Shanks",
  acgrip: "Rukia",
  animetosho: "Ichigo",
  subplease: "Hinata",
  subsplease: "Hinata",
  seadex: "Asuna",
  nekobt: "Kirito",
  aniliberty: "Rem",
  acgnx: "Emilia",
};

function normalizeKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

/** The base provider segment: everything before the first `-` (or the whole key). */
function baseProviderKey(key: string): string {
  return key.split("-")[0] || key;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getFriendlyServerName(serverName: string): string {
  const key = normalizeKey(serverName);
  if (!key) return "Unknown Server";
  if (CANONICAL_SERVER_NAMES[key]) return CANONICAL_SERVER_NAMES[key];

  // Curated extension-provider aliases (exact key, then base segment).
  if (PROVIDER_ALIASES[key]) return PROVIDER_ALIASES[key];
  const base = baseProviderKey(key);
  if (PROVIDER_ALIASES[base]) return PROVIDER_ALIASES[base];

  return toTitleCase(
    key
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Resolves the short label shown on a source/server button.
 *
 * Curated aliases win over the caller-supplied `fallback`: the fallback is the
 * raw provider name (e.g. "anikoto"), which is what we want in the hover card,
 * never on the button. `fallback` is only consulted when `serverName` itself
 * carries no alias, and used verbatim as a last resort.
 */
export function getSimpleServerDisplayName(serverName: string, fallback?: string): string {
  const key = normalizeKey(serverName);
  const fallbackKey = normalizeKey(fallback);

  for (const candidate of [key, fallbackKey]) {
    if (!candidate) continue;
    if (CANONICAL_SERVER_NAMES[candidate]) return CANONICAL_SERVER_NAMES[candidate];
    if (PROVIDER_ALIASES[candidate]) return PROVIDER_ALIASES[candidate];
    const base = baseProviderKey(candidate);
    if (PROVIDER_ALIASES[base]) return PROVIDER_ALIASES[base];
  }

  if (key) return getFriendlyServerName(key);
  return String(fallback || "").trim() || "Unknown Server";
}

/**
 * Maps each server key to a label that is unique across the given key set.
 * Keys are deduped first (a repeated key must resolve to the same label rather
 * than inflating the collision counters), and the numeric suffix counts within
 * the colliding label group only — so three animetosho variants read
 * "Ichigo 1 / 2 / 3", not "Ichigo 12 / 27 / 34".
 */
export function buildUniqueSimpleNameMap(
  serverKeys: string[],
  fallbackByKey: Record<string, string> = {},
): Record<string, string> {
  const uniqueKeys: string[] = [];
  const seen = new Set<string>();
  for (const rawKey of serverKeys) {
    const key = String(rawKey || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueKeys.push(key);
  }

  const labelsByKey: Record<string, string> = {};
  const keysByLabel = new Map<string, string[]>();

  for (const key of uniqueKeys) {
    const label = getSimpleServerDisplayName(key, fallbackByKey[key]);
    labelsByKey[key] = label;
    const normalizedLabel = normalizeKey(label);
    const group = keysByLabel.get(normalizedLabel);
    if (group) group.push(key);
    else keysByLabel.set(normalizedLabel, [key]);
  }

  const output: Record<string, string> = {};
  for (const group of keysByLabel.values()) {
    group.forEach((key, indexInGroup) => {
      const label = labelsByKey[key];
      output[key] = group.length > 1 ? `${label} ${indexInGroup + 1}` : label;
    });
  }

  return output;
}
