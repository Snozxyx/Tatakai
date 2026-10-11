/**
 * Color-grouped manga cover pools for the discovery bento cards.
 *
 * Each pool holds verified AniList CDN covers whose dominant tint matches the
 * card accent/glow family, so a rose-accented card never renders behind a blue
 * cover (and vice versa). Pools were classified once, offline, by mean color
 * over saturated pixels (the cover's accent, not its backdrop) — see
 * `scripts/__build-pools.tmp.mjs` for the throwaway classifier.
 *
 * Safety: pools contain mainstream SFW titles only. Adult content is NEVER
 * dealt from here — the 18+ card keeps its own fixed poster.
 */
export type CoverPoolKey = 'red' | 'warm' | 'green' | 'blue' | 'purple' | 'mono';

const RED = [
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx101517-H3TdM3g5ZUe9.jpg', // Jujutsu Kaisen
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx86635-EdaLQmsn86Fy.png', // Kaguya-sama: Love is War
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx202995-GhEoJXvK8voZ.png', // Code Geass
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx183285-ZfemXvC1AHGk.jpg', // Absolute Reign
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx163536-v7YMGxY4AVIx.jpg', // The Devil Never Cries
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx132144-i5B4VnG9sRgh.png', // Return of the Blossoming Blade
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/b86964-vTdn1Esqw3va.jpg', // Bastard
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/b119174-nFMZSHbrDDbt.png', // The Boxer
];

const WARM = [
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30013-BeslEMqiPhlk.jpg', // One Piece
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105778-euxXZEIfDY2u.png', // Chainsaw Man
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx53390-1RsuABC34P9D.jpg', // Attack on Titan
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx85486-INqnYx8gL3eX.jpg', // My Hero Academia
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx87216-c9bSNVD10UuD.png', // Demon Slayer
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx74347-sZpmNJ5xLwRK.jpg', // One-Punch Man
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx34632-5xMDkx3pXsEh.png', // Goodnight Punpun
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx144957-h0qIwRwxOEdg.jpg', // The World After the Fall
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx123573-LKoCKwRouEMW.png', // Lout of Count's Family
];

const GREEN = [
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx106130-yPNeuSu75ey1.jpg', // Blue Lock
];

const BLUE = [
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx106929-flAUvHZDUz5v.jpg', // Eleceed
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx159441-9W8201jAT9Yv.jpg', // Pick Me Up
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx168468-FEo5x1ZZyWj4.png', // Boruto: Two Blue Vortex
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx180891-ZBbyOWSYI41R.jpg', // Absolute Regression
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx170400-yMIuOIboWuoO.jpg', // The Stellar Swordmaster
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx137280-juUL79K7f9s7.png', // I'm the Max-Level Newbie
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx109957-EgJWdR7l9TBG.jpg', // Second Life Ranker
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx182139-2skHo9YMWUk0.jpg', // My Avatars' Path to Greatness
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx159930-qK1P4BNQL0zG.jpg', // The Infinite Mage
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx179445-ho0nb7baJ1a5.jpg', // Solo Leveling: Ragnarok
];

const PURPLE = [
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx195334-AoDunvin8J2G.jpg', // The Apocalypse-Level Death Knight Returns
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx205175-GlxEj6PYf4r6.png', // Shadow System
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/b188155-IcDNFLauYlWs.jpg', // The Genius Swordsman of Mount Hua
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx139741-mdZXMdlObZFy.png', // I'm Really Not the Devil's Lackey
];

const MONO = [
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30002-Cul4OeN7bYtn.jpg', // Berserk
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx63327-glC9cDxYBja9.png', // Tokyo Ghoul
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30656-9mW113O7rDnA.png', // Vagabond
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30012-1epmVfTSv2rr.png', // Bleach
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx119257-Pi21aq3ey9GG.jpg', // Omniscient Reader
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx85143-23oup3ETbFJk.jpg', // Tower of God
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx85141-qHR957V3FVco.png', // The God of High School
  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx120980-RZ9WLd0o9hyo.jpg', // Nano Machine
];

export const COVER_POOLS: Record<CoverPoolKey, string[]> = {
  red: RED,
  warm: WARM,
  green: GREEN,
  blue: BLUE,
  purple: PURPLE,
  mono: MONO,
};

/** Nearest-neighbour spillover for thin pools (green has a single cover). */
const POOL_FALLBACKS: Record<CoverPoolKey, CoverPoolKey[]> = {
  red: ['purple', 'warm'],
  warm: ['red', 'mono'],
  green: ['blue', 'mono'],
  blue: ['purple', 'green'],
  purple: ['blue', 'red'],
  mono: ['warm', 'blue'],
};

/**
 * Deal one random cover per request, no repeats within the same pool until it
 * is exhausted (then it reshuffles). `null` requests pass through as null so
 * callers with fixed art (e.g. the 18+ card) keep it.
 */
export function dealCovers(requests: (CoverPoolKey | null)[]): (string | null)[] {
  const used = new Map<CoverPoolKey, Set<string>>();
  const takeFresh = (pool: string[], seen: Set<string>): string | null => {
    const fresh = pool.filter((u) => !seen.has(u));
    const source = fresh.length > 0 ? fresh : pool;
    if (source.length === 0) return null;
    const pick = source[Math.floor(Math.random() * source.length)];
    seen.add(pick);
    return pick;
  };

  return requests.map((key) => {
    if (!key) return null;
    const seen = used.get(key) ?? new Set<string>();
    used.set(key, seen);
    const direct = takeFresh(COVER_POOLS[key] ?? [], seen);
    if (direct) return direct;
    for (const fallback of POOL_FALLBACKS[key] ?? []) {
      const seenFb = used.get(fallback) ?? new Set<string>();
      used.set(fallback, seenFb);
      const pick = takeFresh(COVER_POOLS[fallback] ?? [], seenFb);
      if (pick) return pick;
    }
    return null;
  });
}
