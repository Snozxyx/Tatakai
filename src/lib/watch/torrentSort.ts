/**
 * Comparators and parsers for the torrent release list.
 *
 * Torrent sources arrive from the indexers as loose strings — `fileSize` is
 * `"1.4 GB"`, `quality` is `"1080p"`, and `seeders` may be missing entirely
 * because not every indexer reports peer counts. Sorting on those raw values
 * puts `"700 MB"` above `"1.4 GB"` (string order) and treats an unreported
 * seeder count as zero, which is the difference between "dead release" and
 * "this indexer just doesn't say". So everything here normalizes first and
 * keeps "unknown" distinct from "zero".
 */

export type TorrentSortKey = 'seeders' | 'size' | 'quality' | 'provider' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface TorrentSortOption {
  key: TorrentSortKey;
  label: string;
  /** The direction that is useful first — most seeders, biggest file, A→Z. */
  defaultDirection: SortDirection;
}

export const TORRENT_SORT_OPTIONS: TorrentSortOption[] = [
  { key: 'seeders', label: 'Seeders', defaultDirection: 'desc' },
  { key: 'size', label: 'Size', defaultDirection: 'desc' },
  { key: 'quality', label: 'Quality', defaultDirection: 'desc' },
  { key: 'provider', label: 'Provider', defaultDirection: 'asc' },
  { key: 'name', label: 'Name', defaultDirection: 'asc' },
];

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  k: 1024,
  mb: 1024 ** 2,
  m: 1024 ** 2,
  gb: 1024 ** 3,
  g: 1024 ** 3,
  tb: 1024 ** 4,
  t: 1024 ** 4,
};

/**
 * `"1.4 GB"` → bytes. Returns `null` when there is no size to parse, which the
 * comparators treat as unknown rather than as an empty file.
 *
 * Accepts a raw byte count too, since marketplace sources sometimes carry one.
 */
export function parseSizeLabelToBytes(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  // Comma decimal separator ("1,4 GiB") is common in non-English release names.
  const match = /(\d+(?:[.,]\d+)?)\s*(gib|mib|kib|tib|[kmgt]?b|[kmgt])\b/i.exec(text);
  if (!match) {
    const bare = Number(text);
    return Number.isFinite(bare) && bare > 0 ? bare : null;
  }

  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // GiB/MiB/KiB are already the binary units the table below uses.
  const unit = match[2].toLowerCase().replace('i', '');
  const multiplier = SIZE_UNITS[unit] ?? 1;
  return amount * multiplier;
}

/** Bytes → a short label, for rows whose provider gave no size string. */
export function formatBytesShort(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * `"1080p"` → 1080, `"4K"` → 2160, `"auto"`/unknown → `null`.
 *
 * `null` sinks to the bottom on a descending sort instead of ranking alongside
 * genuine 360p releases.
 */
export function parseQualityRank(value: unknown): number | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'auto' || text === 'unknown') return null;
  if (/(^|\D)(4k|uhd|2160)/.test(text)) return 2160;
  if (/(^|\D)(2k|1440)/.test(text)) return 1440;
  const match = /(\d{3,4})\s*p?/.exec(text);
  if (!match) return null;
  const height = Number(match[1]);
  return Number.isFinite(height) && height > 0 ? height : null;
}

/** Seeder count, or `null` when the indexer reported none at all. */
export function seederCountOf(source: any): number | null {
  const raw = source?.seeders;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const peers = source?.peers;
  if (typeof peers === 'number' && Number.isFinite(peers)) return peers;
  return null;
}

const BATCH_PATTERN = /\b(batch|complete|season\s*pack|s\d{1,2}\s*complete)\b/i;

/**
 * Whether a release covers more than the one episode being watched.
 *
 * Worth surfacing because a batch downloads in full — a 20 GB season pack for a
 * single episode — which is the storage surprise the confirmation dialog warns
 * about. `episodeRange` is the reliable signal when the provider sets it; the
 * title pattern is the fallback.
 */
export function isBatchRelease(source: any): boolean {
  const range = String(source?.episodeRange ?? '').trim();
  if (/\d+\s*[-~–]\s*\d+/.test(range)) return true;
  if (BATCH_PATTERN.test(range)) return true;
  return BATCH_PATTERN.test(String(source?.torrentTitle ?? ''));
}

/** The release title a row should display, falling back through the provider fields. */
export function torrentDisplayTitle(source: any): string {
  return (
    String(source?.torrentTitle ?? '').trim() ||
    String(source?.releaseGroup ?? '').trim() ||
    String(source?.providerName ?? source?.server ?? source?.providerKey ?? '').trim() ||
    'Untitled release'
  );
}

/** Sorts numbers with `null` always last, whichever direction is asked for. */
function compareNullableNumbers(a: number | null, b: number | null, direction: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

function compareStrings(a: string, b: string, direction: SortDirection): number {
  const result = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

/**
 * Returns a new sorted array — never mutates the input, which is a memoized
 * source list shared with the rest of the page.
 *
 * Ties break on seeders then size, so equal-quality rows still come out in a
 * useful order rather than in whatever order the providers happened to resolve.
 */
export function sortTorrentSources(
  sources: any[],
  key: TorrentSortKey,
  direction: SortDirection,
): any[] {
  const decorated = sources.map((source, index) => ({
    source,
    index,
    seeders: seederCountOf(source),
    bytes: parseSizeLabelToBytes(source?.fileSize),
    quality: parseQualityRank(source?.quality),
    provider: String(source?.providerName ?? source?.server ?? source?.providerKey ?? ''),
    title: torrentDisplayTitle(source),
  }));

  decorated.sort((a, b) => {
    let primary = 0;
    switch (key) {
      case 'seeders':
        primary = compareNullableNumbers(a.seeders, b.seeders, direction);
        break;
      case 'size':
        primary = compareNullableNumbers(a.bytes, b.bytes, direction);
        break;
      case 'quality':
        primary = compareNullableNumbers(a.quality, b.quality, direction);
        break;
      case 'provider':
        primary = compareStrings(a.provider, b.provider, direction);
        break;
      case 'name':
        primary = compareStrings(a.title, b.title, direction);
        break;
    }
    if (primary !== 0) return primary;

    if (key !== 'seeders') {
      const bySeeders = compareNullableNumbers(a.seeders, b.seeders, 'desc');
      if (bySeeders !== 0) return bySeeders;
    }
    if (key !== 'size') {
      const bySize = compareNullableNumbers(a.bytes, b.bytes, 'desc');
      if (bySize !== 0) return bySize;
    }
    // Stable fallback: keep the provider-resolution order for true ties.
    return a.index - b.index;
  });

  return decorated.map((entry) => entry.source);
}

/** Health band for a seeder count, used for the row dot and the "dead" filter. */
export function seederHealth(seeders: number | null): 'unknown' | 'dead' | 'weak' | 'ok' | 'strong' {
  if (seeders == null) return 'unknown';
  if (seeders <= 0) return 'dead';
  if (seeders < 5) return 'weak';
  if (seeders < 25) return 'ok';
  return 'strong';
}
