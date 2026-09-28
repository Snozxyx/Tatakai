/**
 * Rank system utility — ONE unified rank per user.
 *
 * A user has a single rank. Progress toward it is a combined "rank score" (RP)
 * that pools every medium — anime episodes, manga / manhwa chapters, comic
 * issues — but each medium contributes at a different difficulty weight, because
 * a manga chapter is quicker to finish than an anime episode. There is no
 * separate anime rank vs manga rank; the medium only changes how fast the shared
 * rank climbs.
 *
 * Each rank number has its OWN text effect (`rn-1`..`rn-16` in index.css).
 */

/** Media whose consumption feeds the shared rank score. */
export type MediaKind = 'anime' | 'manga' | 'manhwa' | 'comic';
/** @deprecated kept as an alias; ranks are no longer per-track. */
export type RankTrack = MediaKind;

export interface RankTier {
  rank: number;
  name: string;
  minScore: number; // rank-point threshold
  color: string;
}

const RANK_NAMES = [
  'Filler Watcher', 'Genin', 'Chunin', 'Jonin', 'Plus Ultra', 'Pro Hero',
  'Soul Reaper', 'Bankai', 'Survey Corps', 'Titan Shifter', 'Demon Slayer',
  'Hashira', 'Sage Mode', 'Dragon Slayer', 'Super Saiyan', 'One Punch',
];

const RANK_COLORS = [
  'text-gray-400', 'text-gray-300', 'text-green-400', 'text-green-500',
  'text-teal-400', 'text-cyan-400', 'text-blue-400', 'text-blue-500',
  'text-indigo-400', 'text-purple-400', 'text-purple-500', 'text-pink-400',
  'text-pink-500', 'text-rose-400', 'text-amber-400', 'text-yellow-400',
];

/**
 * Difficulty weight — rank points earned per unit consumed, per medium.
 * Anime episodes are the base (1.0). Reading units are quicker to clear, so they
 * are worth less; comics (denser issues) sit between reading and anime. Tune
 * these to rebalance how each medium contributes to the shared rank.
 */
export const MEDIA_WEIGHT: Record<MediaKind, number> = {
  anime: 1,     // per episode watched
  manga: 0.35,  // per chapter read
  manhwa: 0.5,  // per chapter read
  comic: 0.65,  // per issue read
};

export const MEDIA_LABEL: Record<MediaKind, string> = {
  anime: 'Anime',
  manga: 'Manga',
  manhwa: 'Manhwa',
  comic: 'Comic',
};

export const MEDIA_UNIT: Record<MediaKind, string> = {
  anime: 'episodes',
  manga: 'chapters',
  manhwa: 'chapters',
  comic: 'issues',
};

/** Raw units consumed per medium. */
export interface RankUnits {
  episodes?: number;
  manga?: number;
  manhwa?: number;
  comic?: number;
}

/** Combined, difficulty-weighted rank score across every medium. */
export function computeRankScore(u: RankUnits): number {
  const score =
    (u.episodes ?? 0) * MEDIA_WEIGHT.anime +
    (u.manga ?? 0) * MEDIA_WEIGHT.manga +
    (u.manhwa ?? 0) * MEDIA_WEIGHT.manhwa +
    (u.comic ?? 0) * MEDIA_WEIGHT.comic;
  return Math.floor(score);
}

/** Per-medium rank-point contribution, for showing a breakdown. */
export function rankScoreBreakdown(u: RankUnits): { kind: MediaKind; units: number; points: number }[] {
  const rows: { kind: MediaKind; units: number; points: number }[] = [
    { kind: 'anime', units: u.episodes ?? 0, points: Math.floor((u.episodes ?? 0) * MEDIA_WEIGHT.anime) },
    { kind: 'manga', units: u.manga ?? 0, points: Math.floor((u.manga ?? 0) * MEDIA_WEIGHT.manga) },
    { kind: 'manhwa', units: u.manhwa ?? 0, points: Math.floor((u.manhwa ?? 0) * MEDIA_WEIGHT.manhwa) },
    { kind: 'comic', units: u.comic ?? 0, points: Math.floor((u.comic ?? 0) * MEDIA_WEIGHT.comic) },
  ];
  return rows.filter((r) => r.units > 0);
}

/** The single shared rank ladder (RP thresholds). */
const RANK_THRESHOLDS = [0, 5, 10, 20, 35, 50, 75, 100, 150, 250, 400, 600, 900, 1200, 1800, 2500];

export const RANK_TIERS: RankTier[] = RANK_THRESHOLDS.map((minScore, i) => ({
  rank: i + 1,
  name: RANK_NAMES[i],
  minScore,
  color: RANK_COLORS[i],
}));

/**
 * Classify a written work's reading medium from external metadata ONLY —
 * AniList `format` / `countryOfOrigin` or MAL `media_type`. Never infer from
 * chapter/volume counts (ids collide across types; project memory
 * `tatakai-manga-mapping-cross-type-id-collisions`). Manhua maps to 'manhwa';
 * OEL/comic maps to 'comic'.
 */
export function classifyReadingFormat(meta?: {
  format?: string | null;
  countryOfOrigin?: string | null;
  mediaType?: string | null;
}): 'manga' | 'manhwa' | 'comic' | 'unknown' {
  const fmt = String(meta?.format || meta?.mediaType || '').trim().toUpperCase();
  const country = String(meta?.countryOfOrigin || '').trim().toUpperCase();

  if (country === 'KR' || fmt === 'MANHWA') return 'manhwa';
  if (country === 'CN' || country === 'TW' || fmt === 'MANHUA') return 'manhwa';
  if (fmt === 'OEL' || fmt === 'COMIC' || fmt === 'COMICS') return 'comic';
  if (fmt === 'MANGA' || fmt === 'ONE_SHOT' || fmt === 'MANGA_ONE_SHOT' || country === 'JP') return 'manga';
  return 'unknown';
}

/** Highest tier whose threshold the rank score meets. */
export function getRankTier(score: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (score >= t.minScore) tier = t;
  }
  return tier;
}

/** Rank image URL (Mitsu set). */
export function getRankImageUrl(rankNumber: number): string {
  const n = Math.max(1, Math.min(16, rankNumber));
  return `/assets/rank/Mitsu/rank-${n}.png`;
}

/** Next-rank progress info from the current rank score. */
export function getNextRankTier(
  score: number,
): { tier: RankTier; progress: number; needed: number } | null {
  const current = getRankTier(score);
  const nextIndex = RANK_TIERS.findIndex((t) => t.rank === current.rank) + 1;
  if (nextIndex >= RANK_TIERS.length) return null;

  const next = RANK_TIERS[nextIndex];
  const progress = score - current.minScore;
  const needed = next.minScore - score;
  return { tier: next, progress, needed };
}

export interface RankNameStyle {
  className: string;
  style: Record<string, string>;
}

/** Per-rank text-effect class (rn-1..rn-16 in index.css). */
export function getRankClassForRank(rank: number): string {
  const n = Math.max(1, Math.min(16, rank));
  return `rn-${n}`;
}

/** Per-rank badge hover-animation class (bh-1..bh-16 in index.css). */
export function getBadgeHoverClass(rank: number): string {
  const n = Math.max(1, Math.min(16, rank));
  return `bh-${n}`;
}

const RANK_DESCRIPTIONS = [
  'Where every legend begins',
  'The journey begins — 5 RP',
  'Find your footing — 10 RP',
  'Prove your resolve — 20 RP',
  'Go beyond — 35 RP',
  'A true hero — 50 RP',
  'Cross into the beyond — 75 RP',
  'Unleash your full power — 100 RP',
  'Join the elite — 150 RP',
  'Shift the tide — 250 RP',
  'Slay your limits — 400 RP',
  'Stand as a Pillar — 600 RP',
  'Attain wisdom — 900 RP',
  'Command the flame — 1,200 RP',
  'Ascend beyond legend — 1,800 RP',
  'One and only — 2,500 RP',
];

export interface RankBadgeInfo {
  rank: number;
  name: string;
  description: string;
  minScore: number;
  unlocked: boolean;
}

/**
 * The 16 rank tiers as unlockable badges, keyed to a rank score. One badge per
 * rank — this is the single source of truth for every "badges / milestones"
 * grid, so their count and lock state always match the rank ladder.
 */
export function getRankBadges(score: number): RankBadgeInfo[] {
  return RANK_TIERS.map((t, i) => ({
    rank: t.rank,
    name: t.name,
    description: RANK_DESCRIPTIONS[i],
    minScore: t.minScore,
    unlocked: score >= t.minScore,
  }));
}

/** Text-effect style for a rank NUMBER directly (1..16). */
export function getRankNameStyleForRank(rank: number): RankNameStyle {
  return { className: getRankClassForRank(rank), style: {} };
}

/** Text-effect style for a rank score. */
export function getRankNameStyle(score: number): RankNameStyle {
  const { rank } = getRankTier(score);
  return getRankNameStyleForRank(rank);
}
