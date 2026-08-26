/**
 * Torrent title matching utilities — ported from desktop/runtime/torrent/naming/
 *
 * Used by all torrent providers to:
 *   1. Parse episode numbers from release filenames
 *   2. Score title similarity between a torrent release and the target anime
 *   3. Detect batch packs
 *   4. Build magnet links from info hashes
 *
 * Kept as pure TS with no external deps so it works in both
 * the worker sandbox and the Node API server.
 */

// ── Trackers appended to all constructed magnets ────────────────────────────
const MAGNET_TRACKERS = [
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
].map(t => `&tr=${encodeURIComponent(t)}`).join('');

/**
 * Playable containers. Kept in sync with `PLAYABLE_VIDEO_EXTENSIONS` in
 * `desktop/runtime/torrent/session/session-manager.cjs` — the streaming engine
 * happily plays all of these, so the UI tag should not pretend only mkv/mp4
 * exist.
 */
const VIDEO_FORMATS = [
  'mkv', 'mp4', 'webm', 'avi', 'mov', 'm4v',
  'ts', 'flv', 'wmv', 'mpg', 'mpeg', 'ogv',
] as const;

/**
 * Containers too ambiguous to detect from a mid-name token. In release names
 * "TS" almost always means Telesync (a rip source), not an MPEG-TS container,
 * so it is only honoured as a trailing extension.
 */
const AMBIGUOUS_MID_NAME_FORMATS = new Set<string>(['ts']);

export type DetectedTorrentFileFormat = typeof VIDEO_FORMATS[number] | 'video';

/**
 * Build a magnet URI from a hex or base32 info hash.
 */
export function buildMagnet(infoHash: string, displayName: string): string {
  const dn = encodeURIComponent(displayName.trim());
  return `magnet:?xt=urn:btih:${infoHash}&dn=${dn}${MAGNET_TRACKERS}`;
}

/**
 * Infer the playable container from release metadata. Torrent URLs are often
 * magnets, so inspect their `dn` value as well as a raw release/file name.
 * `video` is an intentional fallback: it keeps the UI tag useful when an
 * indexer does not expose an individual filename.
 */
export function inferTorrentFileFormat(...values: Array<string | null | undefined>): DetectedTorrentFileFormat {
  const isVideoFormat = (candidate: string): candidate is DetectedTorrentFileFormat =>
    (VIDEO_FORMATS as readonly string[]).includes(candidate);

  const texts: string[] = [];
  for (const value of values) {
    if (!value) continue;
    let text = value;
    const dn = text.match(/[?&]dn=([^&]+)/i)?.[1];
    if (dn) {
      try { text = decodeURIComponent(dn.replace(/\+/g, ' ')); } catch { text = dn; }
    }
    texts.push(text);
  }

  // Pass 1 — a trailing extension is the strongest signal, so every container is
  // trusted here, including the mid-name-ambiguous ones.
  for (const text of texts) {
    const format = text.match(/\.([a-z0-9]{2,5})(?:$|[?#&\s\]})])/i)?.[1]?.toLowerCase();
    if (format && isVideoFormat(format)) return format;
  }

  // Pass 2 — indexers routinely omit the filename and tag the container in the
  // release name instead ("… [1080p][x265][MKV]", "Show.S01.AVI-Group"), which
  // the trailing-extension match alone can never see.
  for (const text of texts) {
    for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (!token || AMBIGUOUS_MID_NAME_FORMATS.has(token)) continue;
      if (isVideoFormat(token)) return token;
    }
  }

  return 'video';
}

// ── Episode extraction ───────────────────────────────────────────────────────

interface EpisodeInfo {
  episodeNumber: number | null;
  episodeEnd: number | null;
  season: number | null;
  isBatch: boolean;
}

/**
 * Extract episode information from a torrent release title.
 * Handles SubsPlease "- 001", SxExx, E01, range "01-12", keyword "Episode 5".
 */
export function parseEpisodeFromTitle(title: string): EpisodeInfo {
  const name = title.replace(/\.(mkv|mp4|avi|m4v|ts|mov|webm)$/i, '');

  // Check (EXXXX) absolute episode annotation FIRST — e.g. S23E01 (E1156)
  // This appears in re-numbered series where S23E01 is actually absolute episode 1156.
  const subEp = name.match(/\(E(\d{1,4})\)/i);
  if (subEp) {
    return { season: null, episodeNumber: parseInt(subEp[1], 10), episodeEnd: null, isBatch: false };
  }

  // SxxExx — e.g. S01E1160 or S1E12
  const sxe = name.match(/\bS(\d{1,2})[\s._-]*E(\d{1,4})(?:[\s._-]*-?[\s._-]*E?(\d{1,4}))?\b/i);
  if (sxe) {
    return {
      season: parseInt(sxe[1], 10),
      episodeNumber: parseInt(sxe[2], 10),
      episodeEnd: sxe[3] ? parseInt(sxe[3], 10) : null,
      isBatch: !!sxe[3],
    };
  }

  // Episode range — e.g. "01-12", "01~24"
  const range = name.match(/\b(\d{2,3})\s*[-~]\s*(\d{2,3})\b/);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (b > a && b - a < 500) {
      return { episodeNumber: a, episodeEnd: b, season: null, isBatch: true };
    }
  }

  // SubsPlease / Erai style: "Title - 001 (1080p)" or "Title - 001v2 ("
  const dashEp = name.match(/-\s*(\d{1,4})(?:[A-Za-z])?(?:v\d)?(?:\s*\(|\s*\[|\s*$)/);
  if (dashEp) {
    return { episodeNumber: parseInt(dashEp[1], 10), episodeEnd: null, season: null, isBatch: false };
  }

  // Episode keyword: "Episode 5", "Ep.5", "E05", "Ep 05"
  const keyword = name.match(/\b(?:Episode|Ep\.?|E)[\s._-]*(\d{1,4})\b/i);
  if (keyword) {
    return { episodeNumber: parseInt(keyword[1], 10), episodeEnd: null, season: null, isBatch: false };
  }

  // Standalone episode number after stripping release tags/brackets:
  // e.g. "[HatSubs] One Piece 1172 (WEB 1080p)" -> "One Piece 1172"
  // Normalize underscores to spaces first so _1173_ becomes 1173 at end
  const cleanTitle = name
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*p?\)/gi, ' ')
    .replace(/[_]/g, ' ')
    .trim();
  const standalone = cleanTitle.match(/(?:^|\s)-?\s*(\d{1,4})\s*$/);
  if (standalone) {
    return { episodeNumber: parseInt(standalone[1], 10), episodeEnd: null, season: null, isBatch: false };
  }

  return { episodeNumber: null, episodeEnd: null, season: null, isBatch: false };
}

/**
 * Returns true if this title is definitely a batch/season pack.
 */
export function isBatchTitle(title: string): boolean {
  if (/\bbatch\b/i.test(title)) return true;
  if (/\bcomplete\b/i.test(title)) return true;
  if (/\bseries\b/i.test(title)) return true;
  if (/\bseason\s*\d+\s*[-~]\s*\d+/i.test(title)) return true;
  // Large episode range (50+ eps)
  const range = title.match(/\b(\d{2,3})\s*[-~]\s*(\d{2,3})\b/);
  if (range) {
    const diff = parseInt(range[2], 10) - parseInt(range[1], 10);
    if (diff >= 5) return true;  // 5+ ep range = batch
  }
  return false;
}

// ── Title similarity scoring ─────────────────────────────────────────────────

/** Normalize a title for comparison — lowercase, strip punctuation/tags */
function normalizeForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')   // remove [groups/tags]
    .replace(/\([^)]*\)/g, ' ')    // remove (metadata)
    .replace(/[._:!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract meaningful words (3+ chars, not stopwords or metadata) */
const SKIP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'arc', 'saga', 'season', 'part',
  'log', 'special', 'ova', 'ona', 'movie', 'film',
  '480p', '720p', '1080p', '2160p', 'hevc', 'x264', 'x265',
  'aac', 'flac', 'ac3', 'dts', 'opus',
  'webrip', 'webdl', 'web', 'bluray', 'bdremux', 'hdtv',
  'multi', 'dual', 'sub', 'subs', 'subbed', 'dubbed', 'dub',
]);

function titleWords(title: string): string[] {
  return normalizeForMatch(title)
    .split(/\s+/)
    .filter(w => w.length >= 2 && !SKIP_WORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Score how well a torrent title matches the target anime title.
 * Returns 0–100 where 100 = perfect match.
 */
export function scoreTitleMatch(torrentTitle: string, animeTitle: string): number {
  if (!torrentTitle || !animeTitle) return 0;

  const tWords = titleWords(torrentTitle);
  const aWords = titleWords(animeTitle);

  if (aWords.length === 0) return 50; // no reference — neutral
  if (tWords.length === 0) return 0;

  // Count how many anime title words appear in the torrent title
  let hits = 0;
  for (const aw of aWords) {
    if (tWords.some(tw => tw.includes(aw) || aw.includes(tw))) hits++;
  }

  const baseScore = (hits / aWords.length) * 100;

  // Bonus: torrent title starts with or contains the exact anime title
  const normTorrent = normalizeForMatch(torrentTitle);
  const normAnime = normalizeForMatch(animeTitle);
  if (normTorrent.includes(normAnime)) return Math.min(100, baseScore + 20);

  return Math.round(baseScore);
}

// ── Episode match scoring ────────────────────────────────────────────────────

/**
 * Check if a torrent title matches the requested episode number.
 * Returns a confidence 0–100:
 *   100 = exact episode match (SxExx or "- 001")
 *   80  = episode within a batch range
 *   0   = episode mismatch or undetectable
 */
export function scoreEpisodeMatch(torrentTitle: string, targetEp: number): number {
  if (!targetEp || targetEp <= 0) return 100; // no filter requested

  const info = parseEpisodeFromTitle(torrentTitle);

  if (info.isBatch && info.episodeNumber != null && info.episodeEnd != null) {
    if (targetEp >= info.episodeNumber && targetEp <= info.episodeEnd) return 80;
    return 0; // batch that doesn't contain target ep
  }

  if (info.episodeNumber !== null) {
    return info.episodeNumber === targetEp ? 100 : 0;
  }

  // If episodeNumber couldn't be parsed directly, check if ANY number in the title matches targetEp
  const epPad2 = String(targetEp).padStart(2, '0');
  const epPad3 = String(targetEp).padStart(3, '0');
  const exactNumPattern = new RegExp(`(?:^|\\s|_|-|\\[|\\()(?:0*${targetEp}|${epPad2}|${epPad3})(?:\\s|_|-|\\]|\\)|v\\d+|$)`, 'i');
  if (exactNumPattern.test(torrentTitle)) {
    return 90;
  }

  // If title has numbers (using separator-aware extraction) and none match targetEp, reject!
  // Use separator chars including underscores since many torrent titles use _
  const sepPattern = /(?:^|[\s_\[\(\-])(?!(?:1080|720|480|2160|264|265|360)(?:[\s_\]\)\-]|$))(\d{1,4})(?=[\s_\[\(\]\)\-]|v\d|$)/g;
  const sepNumbers: number[] = [];
  let m: RegExpExecArray | null;
  const titleForNums = torrentTitle.replace(/\.(mkv|mp4|avi)$/i, '');
  while ((m = sepPattern.exec(titleForNums)) !== null) {
    const val = parseInt(m[1], 10);
    if (![1080, 720, 480, 2160, 264, 265, 360].includes(val)) {
      sepNumbers.push(val);
    }
  }
  if (sepNumbers.length > 0 && sepNumbers.every(n => n !== targetEp)) {
    return 0;
  }

  return 30; // unknown/fallback
}

// ── Combined torrent scoring ─────────────────────────────────────────────────

/**
 * Combined relevance score for a torrent result (0–100).
 * Used to rank results and decide whether to include them at all.
 *
 * titleMatch: 0-100, episodeMatch: 0-100
 * Combined = titleMatch * 0.4 + episodeMatch * 0.5 + seederBonus * 0.1
 */
export function scoreTorrentResult(
  torrentTitle: string,
  animeTitle: string,
  targetEp: number,
  seeders = 0,
): number {
  const titleScore = scoreTitleMatch(torrentTitle, animeTitle);
  const epScore = scoreEpisodeMatch(torrentTitle, targetEp);

  // If episode is clearly wrong, reject outright
  if (targetEp > 0 && epScore === 0 && !isBatchTitle(torrentTitle)) return 0;

  const seederBonus = Math.min(10, (seeders / 100) * 10);
  const combined = titleScore * 0.4 + epScore * 0.5 + seederBonus * 0.1;
  return Math.round(Math.min(100, combined));
}
