const CANONICAL_SERVER_NAMES: Record<string, string> = {
  "hd-1": "Tatakai HD 1",
  "hd-2": "Tatakai HD 2",
  "vidstreaming": "Vidstreaming",
  "streamsb": "StreamSB",
  "streamtape": "StreamTape",
  "mp4upload": "Mp4Upload",
  "filemoon": "Filemoon",
};

function normalizeKey(value: string): string {
  return String(value || "").trim().toLowerCase();
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

  return toTitleCase(
    key
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function getSimpleServerDisplayName(serverName: string, fallback?: string): string {
  const normalizedFallback = String(fallback || "").trim();
  if (normalizedFallback) return normalizedFallback;
  return getFriendlyServerName(serverName);
}

export function buildUniqueSimpleNameMap(
  serverKeys: string[],
  fallbackByKey: Record<string, string> = {},
): Record<string, string> {
  const keyCounts = new Map<string, number>();
  const keyOrder = new Map<string, number>();
  const labelsByKey: Record<string, string> = {};

  serverKeys.forEach((rawKey, index) => {
    const key = String(rawKey || "");
    const label = getSimpleServerDisplayName(key, fallbackByKey[key]);
    const normalizedLabel = normalizeKey(label);

    keyCounts.set(normalizedLabel, (keyCounts.get(normalizedLabel) || 0) + 1);
    keyOrder.set(key, index + 1);
    labelsByKey[key] = label;
  });

  const output: Record<string, string> = {};
  for (const rawKey of serverKeys) {
    const key = String(rawKey || "");
    const label = labelsByKey[key] || getFriendlyServerName(key);
    const normalizedLabel = normalizeKey(label);
    const count = keyCounts.get(normalizedLabel) || 0;

    output[key] = count > 1 ? `${label} ${keyOrder.get(key)}` : label;
  }

  return output;
}
