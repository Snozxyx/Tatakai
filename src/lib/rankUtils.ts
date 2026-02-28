/**
 * Rank system utility
 * 16 rank tiers mapped to episode counts
 */

export interface RankTier {
  rank: number;
  name: string;
  minEpisodes: number;
  color: string;
}

export const RANK_TIERS: RankTier[] = [
  { rank: 1,  name: 'Filler Watcher', minEpisodes: 0,    color: 'text-gray-400' },
  { rank: 2,  name: 'Genin',          minEpisodes: 5,    color: 'text-gray-300' },
  { rank: 3,  name: 'Chunin',         minEpisodes: 10,   color: 'text-green-400' },
  { rank: 4,  name: 'Jonin',          minEpisodes: 20,   color: 'text-green-500' },
  { rank: 5,  name: 'Plus Ultra',     minEpisodes: 35,   color: 'text-teal-400' },
  { rank: 6,  name: 'Pro Hero',       minEpisodes: 50,   color: 'text-cyan-400' },
  { rank: 7,  name: 'Soul Reaper',    minEpisodes: 75,   color: 'text-blue-400' },
  { rank: 8,  name: 'Bankai',         minEpisodes: 100,  color: 'text-blue-500' },
  { rank: 9,  name: 'Survey Corps',   minEpisodes: 150,  color: 'text-indigo-400' },
  { rank: 10, name: 'Titan Shifter',  minEpisodes: 250,  color: 'text-purple-400' },
  { rank: 11, name: 'Demon Slayer',   minEpisodes: 400,  color: 'text-purple-500' },
  { rank: 12, name: 'Hashira',        minEpisodes: 600,  color: 'text-pink-400' },
  { rank: 13, name: 'Sage Mode',      minEpisodes: 900,  color: 'text-pink-500' },
  { rank: 14, name: 'Dragon Slayer',  minEpisodes: 1200, color: 'text-rose-400' },
  { rank: 15, name: 'Super Saiyan',   minEpisodes: 1800, color: 'text-amber-400' },
  { rank: 16, name: 'One Punch',      minEpisodes: 2500, color: 'text-yellow-400' },
];

/** Get rank tier based on total episodes watched */
export function getRankTier(episodeCount: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (episodeCount >= t.minEpisodes) tier = t;
  }
  return tier;
}

/** Get rank image URL from public folder */
export function getRankImageUrl(rankNumber: number): string {
  const n = Math.max(1, Math.min(16, rankNumber));
  return `/assets/rank/rank-${n}.png`;
}

/** Get next rank info for progress display */
export function getNextRankTier(episodeCount: number): { tier: RankTier; progress: number; needed: number } | null {
  const current = getRankTier(episodeCount);
  const nextIndex = RANK_TIERS.findIndex(t => t.rank === current.rank) + 1;
  if (nextIndex >= RANK_TIERS.length) return null;

  const next = RANK_TIERS[nextIndex];
  const progress = episodeCount - current.minEpisodes;
  const needed = next.minEpisodes - episodeCount;
  return { tier: next, progress, needed };
}

export interface RankNameStyle {
  className: string;
  style: Record<string, string>;
}

/** Returns a CSS animation class (defined in index.css) to decorate a display name by rank */
export function getRankNameStyle(episodeCount: number): RankNameStyle {
  const { rank } = getRankTier(episodeCount);
  if (rank === 1)  return { className: 'rn-gray',     style: {} };
  if (rank === 2)  return { className: 'rn-gray2',    style: {} };
  if (rank <= 4)   return { className: 'rn-nature',   style: {} };
  if (rank <= 6)   return { className: 'rn-frost',    style: {} };
  if (rank <= 8)   return { className: 'rn-spectral', style: {} };
  if (rank <= 10)  return { className: 'rn-electric', style: {} };
  if (rank === 11) return { className: 'rn-demon',    style: {} };
  if (rank <= 13)  return { className: 'rn-sakura',   style: {} };
  if (rank === 14) return { className: 'rn-fire',     style: {} };
  if (rank === 15) return { className: 'rn-saiyan',   style: {} };
  return             { className: 'rn-onepunch',  style: {} };
}
