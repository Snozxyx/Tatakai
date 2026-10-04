/**
 * Badge registry v2 — now with per-badge leveling & named art.
 *
 * Two families share one `user_badges` table (see 20260922130000_user_badges.sql):
 *   - `role`        : entitlement/staff badges (no levels). Images in /assets/badge.
 *   - `collectible` : achievement badges with tiered progression. Images in /assets/rank/Chikra.
 *
 * **NEW: Per-badge tiers** — each collectible badge can have named levels (e.g. Rainy Day
 * → Melancholy → Jaded → Nihilist) with metric thresholds + unlock descriptions. A badge
 * with no `tiers` stays flat (held or not). The current tier is computed client-side from
 * the user's live stats, but only UNLOCKING the badge (tier 0+) writes a `user_badges` row.
 *
 * **Featured badge** — the rarest/highest badge auto-picked as "showcase" (displayed larger
 * next to the user's name). Stored in `profiles.featured_badge_key`. See `pickFeaturedBadge`.
 *
 * Rarity is FIXED per badge. `rule` is human-readable award criteria for the tooltip.
 */

export type BadgeFamily = 'role' | 'collectible';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type BadgeMetricKey =
  | 'episodes'
  | 'manga_chapters'
  | 'comments'
  | 'reputation'
  | 'ratings'
  | 'distinct_anime'
  | 'watch_time_hours';

/** A single tier within a badge (e.g. "Melancholy" = 35 titles read). */
export interface BadgeTier {
  /** Display name for this tier (e.g. "Rainy Day", "Melancholy"). */
  name: string;
  /** Metric threshold to unlock this tier (inclusive). Tier 0 is always 0 (badge unlocked). */
  threshold: number;
  /** Flavor text shown in the tooltip when you're at this tier. */
  description: string;
  /** Optional CSS text effect class (e.g. "rn-3" rank name style). */
  effectClass?: string;
}

export interface BadgeDef {
  key: string;
  family: BadgeFamily;
  label: string;
  description: string;
  image: string;
  rarity: BadgeRarity;
  /**
   * Legacy flag — kept for featured-badge ranking only.
   * No visual animation is applied (premium static style).
   */
  animated?: boolean;
  /** How the base badge is earned — shown in tooltip/admin. */
  rule?: string;
  /** collectible only: 'auto' when recompute_user_badges can award it. */
  award?: 'auto' | 'manual';
  /**
   * Per-badge progression ladder. Ordered ascending by threshold. Tier 0 (unlock) is always
   * `threshold: 0`. If omitted, the badge is flat (no levels). The `currentTier` function
   * finds the highest unlocked tier from live user stats.
   */
  tiers?: BadgeTier[];
  /** The metric key this badge tracks (for `currentTier` lookup). */
  metricKey?: BadgeMetricKey;
}

/** Chikra art path (named PNGs). */
const chikra = (name: string) => `/assets/rank/Chikra/${name}.png`;
/** Role badge art path. */
const roleImg = (key: string) => `/assets/badge/${key}.png`;

// ── Role / entitlement family (9 PNGs in /assets/badge) ─────────────────────
const ROLE_BADGES: BadgeDef[] = [
  { key: 'owner', family: 'role', label: 'Owner', rarity: 'mythic', image: roleImg('owner'), description: 'Founder & owner of Tatakai.', rule: 'Admin-granted' },
  { key: 'admin', family: 'role', label: 'Admin', rarity: 'legendary', image: roleImg('admin'), description: 'Platform administrator.', rule: 'Derived from profiles.is_admin' },
  { key: 'mod', family: 'role', label: 'Moderator', rarity: 'epic', image: roleImg('mod'), description: 'Community moderator.', rule: 'Derived from profiles.is_moderator' },
  { key: 'developer', family: 'role', label: 'Developer', rarity: 'legendary', image: roleImg('developer'), description: 'Builds & maintains Tatakai.', rule: 'Admin-granted' },
  { key: 'partner', family: 'role', label: 'Partner', rarity: 'epic', image: roleImg('partner'), description: 'Official Tatakai partner.', rule: 'Admin-granted' },
  { key: 'booster', family: 'role', label: 'Booster', rarity: 'rare', image: roleImg('booster'), description: 'Supports Tatakai with a boost.', animated: true, rule: 'Admin-granted' },
  { key: 'premium-go', family: 'role', label: 'Premium Go', rarity: 'rare', image: roleImg('premium-go'), description: 'Premium Go supporter.', rule: 'Admin-granted' },
  { key: 'premium-pro', family: 'role', label: 'Premium Pro', rarity: 'epic', image: roleImg('premium-pro'), description: 'Premium Pro supporter.', animated: true, rule: 'Admin-granted' },
  { key: 'premium-ultra', family: 'role', label: 'Premium Ultra', rarity: 'legendary', image: roleImg('premium-ultra'), description: 'Premium Ultra supporter.', animated: true, rule: 'Admin-granted' },
];

// ── Collectible family (tiered progression badges) ──────────────────────────
const COLLECTIBLE_BADGES: BadgeDef[] = [
  {
    key: 'og',
    family: 'collectible',
    label: 'OG',
    rarity: 'mythic',
    image: chikra('og'),
    award: 'auto',
    description: 'One of the first 100 members.',
    rule: 'Auto: among the first 100 signups',
  },
  {
    key: 'centurion',
    family: 'collectible',
    label: 'Centurion',
    rarity: 'rare',
    image: chikra('centurion'),
    award: 'auto',
    description: 'Watched 100+ episodes.',
    rule: 'Auto: 100+ episodes watched',
    metricKey: 'episodes',
    tiers: [
      { name: 'Initiate', threshold: 0, description: 'Your journey begins.' },
      { name: 'Centurion', threshold: 100, description: 'Watched 100 episodes.' },
      { name: 'Champion', threshold: 500, description: 'Watched 500 episodes.', effectClass: 'rn-3' },
      { name: 'Warlord', threshold: 1000, description: 'Watched 1000 episodes.', effectClass: 'rn-5' },
    ],
  },
  {
    key: 'millennium',
    family: 'collectible',
    label: 'Millennium',
    rarity: 'legendary',
    image: chikra('millennium'),
    award: 'auto',
    description: 'Watched 1000+ episodes.',
    animated: true,
    rule: 'Auto: 1000+ episodes watched',
    metricKey: 'episodes',
    tiers: [
      { name: 'Veteran', threshold: 0, description: 'A thousand episodes deep.' },
      { name: 'Millennium', threshold: 1000, description: 'Crossed the thousand mark.', effectClass: 'rn-6' },
      { name: 'Eternal', threshold: 2500, description: 'Watched 2500 episodes.', effectClass: 'rn-9' },
      { name: 'Legendary', threshold: 5000, description: 'Watched 5000 episodes.', effectClass: 'rn-12' },
    ],
  },
  {
    key: 'explorer',
    family: 'collectible',
    label: 'Explorer',
    rarity: 'epic',
    image: chikra('explorer'),
    award: 'auto',
    description: 'Explored 50+ different series.',
    rule: 'Auto: 50+ distinct anime',
    metricKey: 'distinct_anime',
    tiers: [
      { name: 'Wanderer', threshold: 0, description: 'Exploring new worlds.' },
      { name: 'Explorer', threshold: 50, description: 'Watched 50 different series.' },
      { name: 'Pathfinder', threshold: 100, description: 'Watched 100 different series.', effectClass: 'rn-4' },
      { name: 'Voyager', threshold: 250, description: 'Watched 250 different series.', effectClass: 'rn-7' },
    ],
  },
  {
    key: 'reputation',
    family: 'collectible',
    label: 'Reputation',
    rarity: 'epic',
    image: chikra('gold'),
    award: 'manual',
    description: 'Earn reputation with quality comments.',
    rule: 'Analytics: high reputation score',
    metricKey: 'reputation',
    tiers: [
      { name: 'Awakened', threshold: 0, description: 'Your voice is heard.' },
      { name: 'Ascended', threshold: 20, description: '20% reputation.', effectClass: 'rn-2' },
      { name: 'Transcended', threshold: 40, description: '40% reputation.', effectClass: 'rn-4' },
      { name: 'Mystic', threshold: 60, description: '60% reputation.', effectClass: 'rn-6' },
      { name: 'Celestial', threshold: 75, description: '75% reputation.', effectClass: 'rn-8' },
      { name: 'Eternal', threshold: 85, description: '85% reputation.', effectClass: 'rn-10' },
      { name: 'Omniscient', threshold: 93, description: '93% reputation.', effectClass: 'rn-12' },
      { name: 'Empyrean', threshold: 98, description: '98% reputation — legendary.', effectClass: 'rn-14' },
    ],
  },
  {
    key: 'harem',
    family: 'collectible',
    label: 'Harem King',
    rarity: 'rare',
    image: chikra('harem'),
    award: 'manual',
    description: 'Devoted to the harem genre.',
    rule: 'Analytics: top genre = Harem',
  },
  {
    key: 'action',
    family: 'collectible',
    label: 'Action Junkie',
    rarity: 'rare',
    image: chikra('action'),
    award: 'manual',
    description: 'Lives for action-packed shows.',
    rule: 'Analytics: top genre = Action',
  },
  {
    key: 'isekai',
    family: 'collectible',
    label: 'Isekai Voyager',
    rarity: 'rare',
    image: chikra('isekai'),
    award: 'manual',
    description: 'Reincarnated one too many times.',
    rule: 'Analytics: top genre = Isekai',
  },
  {
    key: 'romance',
    family: 'collectible',
    label: 'Hopeless Romantic',
    rarity: 'rare',
    image: chikra('romance'),
    award: 'manual',
    description: 'Here for the romance.',
    rule: 'Analytics: top genre = Romance',
  },
  {
    key: 'omniscient',
    family: 'collectible',
    label: 'Omniscient',
    rarity: 'mythic',
    image: chikra('omniscient'),
    award: 'manual',
    description: 'Watches across every genre.',
    animated: true,
    rule: 'Analytics: broad genre coverage',
  },
  {
    key: 'night-owl',
    family: 'collectible',
    label: 'Night Owl',
    rarity: 'common',
    image: chikra('night-owl'),
    award: 'manual',
    description: 'Watches deep into the night.',
    rule: 'Analytics: late-night viewing',
  },
  {
    key: 'binge-lord',
    family: 'collectible',
    label: 'Binge Lord',
    rarity: 'epic',
    image: chikra('binge-lord'),
    award: 'manual',
    description: 'Marathons entire seasons at once.',
    rule: 'Analytics: long sessions',
  },
  {
    key: 'critic',
    family: 'collectible',
    label: 'Critic',
    rarity: 'rare',
    image: chikra('critic'),
    award: 'manual',
    description: 'Rates everything they watch.',
    rule: 'Analytics: many ratings',
    metricKey: 'ratings',
    tiers: [
      { name: 'Reviewer', threshold: 0, description: 'You rate what you watch.' },
      { name: 'Critic', threshold: 50, description: 'Rated 50 titles.' },
      { name: 'Expert', threshold: 150, description: 'Rated 150 titles.', effectClass: 'rn-4' },
      { name: 'Authority', threshold: 500, description: 'Rated 500 titles.', effectClass: 'rn-7' },
    ],
  },
  {
    key: 'commentator',
    family: 'collectible',
    label: 'Commentator',
    rarity: 'common',
    image: chikra('commentator'),
    award: 'manual',
    description: 'A pillar of the comment section.',
    rule: 'Analytics: many comments',
    metricKey: 'comments',
    tiers: [
      { name: 'Lurker', threshold: 0, description: 'Starting to speak up.' },
      { name: 'Commentator', threshold: 25, description: 'Left 25 comments.' },
      { name: 'Voice', threshold: 100, description: 'Left 100 comments.', effectClass: 'rn-3' },
      { name: 'Pillar', threshold: 500, description: 'Left 500 comments.', effectClass: 'rn-6' },
    ],
  },
  {
    key: 'tastemaker',
    family: 'collectible',
    label: 'Tastemaker',
    rarity: 'epic',
    image: chikra('tastemaker'),
    award: 'manual',
    description: 'Their tier lists shape opinions.',
    rule: 'Analytics: popular tier lists',
  },
  {
    key: 'manga-sage',
    family: 'collectible',
    label: 'Manga Sage',
    rarity: 'epic',
    image: chikra('manga-sage'),
    award: 'manual',
    description: 'Read 500+ manga chapters.',
    rule: 'Analytics: 500+ chapters read',
    metricKey: 'manga_chapters',
    tiers: [
      { name: 'Reader', threshold: 0, description: 'Your manga journey begins.' },
      { name: 'Bookworm', threshold: 100, description: 'Read 100 chapters.' },
      { name: 'Scholar', threshold: 500, description: 'Read 500 chapters.', effectClass: 'rn-4' },
      { name: 'Sage', threshold: 1500, description: 'Read 1500 chapters.', effectClass: 'rn-7' },
      { name: 'Archivist', threshold: 5000, description: 'Read 5000 chapters.', effectClass: 'rn-10' },
    ],
  },
  {
    key: 'doomer',
    family: 'collectible',
    label: 'Doomer',
    rarity: 'rare',
    image: chikra('phosphorus'),
    award: 'manual',
    description: 'Read titles that end badly for everyone.',
    rule: 'Analytics: tragedy/dark-ending genre affinity',
    metricKey: 'manga_chapters',
    tiers: [
      { name: 'Rainy Day', threshold: 0, description: 'A bit gloomy.' },
      { name: 'Melancholy', threshold: 35, description: 'Read 35 dark titles.' },
      { name: 'Jaded', threshold: 75, description: 'Read 75 dark titles.', effectClass: 'rn-3' },
      { name: 'Nihilist', threshold: 170, description: 'Read 170 dark titles.', effectClass: 'rn-5' },
    ],
  },
  {
    key: 'completionist',
    family: 'collectible',
    label: 'Completionist',
    rarity: 'legendary',
    image: chikra('completionist'),
    award: 'manual',
    description: 'Finishes what they start.',
    animated: true,
    rule: 'Analytics: high completion rate',
  },
  {
    key: 'trendsetter',
    family: 'collectible',
    label: 'Trendsetter',
    rarity: 'epic',
    image: chikra('trendsetter'),
    award: 'manual',
    description: "First to watch the season's hits.",
    rule: 'Analytics: early adopter',
  },
  {
    key: 'legend',
    family: 'collectible',
    label: 'Living Legend',
    rarity: 'mythic',
    image: chikra('legend'),
    award: 'manual',
    description: 'A legend of the community.',
    animated: true,
    rule: 'Admin-granted honor',
  },
  // New badges from the extra art:
  {
    key: 'diamond',
    family: 'collectible',
    label: 'Diamond',
    rarity: 'legendary',
    image: chikra('diamond'),
    award: 'manual',
    description: 'Unbreakable dedication.',
    animated: true,
    rule: 'Admin-granted for exceptional contributions',
  },
  {
    key: 'mithril',
    family: 'collectible',
    label: 'Mithril',
    rarity: 'epic',
    image: chikra('mithril'),
    award: 'manual',
    description: 'Forged in the fires of the community.',
    rule: 'Admin-granted for sustained activity',
  },
  {
    key: 'guild-coin',
    family: 'collectible',
    label: 'Guild Coin',
    rarity: 'rare',
    image: chikra('guildCoin'),
    award: 'manual',
    description: 'A valued guild member.',
    rule: 'Participation in community events',
  },
  {
    key: 'hero-coin',
    family: 'collectible',
    label: 'Hero Coin',
    rarity: 'epic',
    image: chikra('heroCoin'),
    award: 'manual',
    description: 'Helped others in their journey.',
    rule: 'Admin-granted for community support',
  },
  {
    key: 'dream-token',
    family: 'collectible',
    label: 'Dream Token',
    rarity: 'rare',
    image: chikra('dreamToken'),
    award: 'manual',
    description: 'Chasing the dream.',
    rule: 'Analytics: aspirational viewing patterns',
  },
  {
    key: 'lucky-medal',
    family: 'collectible',
    label: 'Lucky Medal',
    rarity: 'common',
    image: chikra('luckyMedal'),
    award: 'manual',
    description: 'Fortune smiles upon you.',
    rule: 'Random event drops',
  },
  {
    key: 'challenger-coin',
    family: 'collectible',
    label: 'Challenger Coin',
    rarity: 'rare',
    image: chikra('challengerCoin'),
    award: 'manual',
    description: 'Completed a community challenge.',
    rule: 'Event participation',
  },
  {
    key: 'gold-sheaf-ticket',
    family: 'collectible',
    label: 'Gold Sheaf Ticket',
    rarity: 'rare',
    image: chikra('goldSheafTicket'),
    award: 'manual',
    description: 'Redeemed through a special Tatakai event.',
    rule: 'Event reward',
  },
  {
    key: 'labyrinth-token',
    family: 'collectible',
    label: 'Labyrinth Token',
    rarity: 'epic',
    image: chikra('labyrinthToken'),
    award: 'manual',
    description: 'Found a way through the deepest catalogue.',
    rule: 'Discovery event reward',
  },
  {
    key: 'tide-shells',
    family: 'collectible',
    label: 'Tide Shells',
    rarity: 'common',
    image: chikra('tideShells'),
    award: 'manual',
    description: 'A token from seasonal community events.',
    rule: 'Seasonal event reward',
  },
  {
    key: 'dragonbone-stamps',
    family: 'collectible',
    label: 'Dragonbone Stamps',
    rarity: 'epic',
    image: chikra('dragonboneStamps'),
    award: 'manual',
    description: 'A veteran collector’s proof of passage.',
    rule: 'Collection milestone',
  },
  {
    key: 'dragon-crystal-abyssal',
    family: 'collectible',
    label: 'Dragon Crystal: Abyssal',
    rarity: 'legendary',
    image: chikra('dragonCrystalAbyssal'),
    award: 'manual',
    animated: true,
    description: 'A crystal recovered from the abyss.',
    rule: 'Legendary event reward',
  },
  {
    key: 'bound-dragon-crystal-abyssal',
    family: 'collectible',
    label: 'Bound Dragon Crystal: Abyssal',
    rarity: 'mythic',
    image: chikra('boundDragonCrystalAbyssal'),
    award: 'manual',
    animated: true,
    description: 'The abyssal dragon’s power, bound to its bearer.',
    rule: 'Mythic event reward',
  },
  {
    key: 'badge-of-valor-temporal-rift',
    family: 'collectible',
    label: 'Badge of Valor: Temporal Rift',
    rarity: 'legendary',
    image: chikra('badgeOfValorTemporalRift'),
    award: 'manual',
    animated: true,
    description: 'Held steady when time itself fractured.',
    rule: 'Legendary event reward',
  },
];

// Every collectible participates in the same visual progression contract. A
// handful have bespoke metric ladders above (Reputation, reading, comments,
// ratings); honour, genre, and event badges use this four-stage track until a
// dedicated analytics signal is available. This avoids a mixed system where
// some earned badges feel unfinished while keeping the data model extensible.
const DEFAULT_COLLECTIBLE_TIERS: BadgeTier[] = [
  { name: 'Awakened', threshold: 0, description: 'The badge has been awakened.', effectClass: 'rn-1' },
  { name: 'Ascended', threshold: 1, description: 'Your achievement is recognized.', effectClass: 'rn-3' },
  { name: 'Transcended', threshold: 2, description: 'A rare mark of dedication.', effectClass: 'rn-6' },
  { name: 'Empyrean', threshold: 3, description: 'Its full effect is unlocked.', effectClass: 'rn-10' },
];

for (const badge of COLLECTIBLE_BADGES) {
  if (!badge.tiers) badge.tiers = DEFAULT_COLLECTIBLE_TIERS;
}

export const BADGES: BadgeDef[] = [...ROLE_BADGES, ...COLLECTIBLE_BADGES];

const BADGE_MAP: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map((b) => [b.key, b]),
);

export function getBadge(key: string): BadgeDef | undefined {
  return BADGE_MAP[key];
}

export const ROLE_BADGE_KEYS = ROLE_BADGES.map((b) => b.key);
export const COLLECTIBLE_BADGE_KEYS = COLLECTIBLE_BADGES.map((b) => b.key);

export interface RarityStyle {
  ring: string;
  text: string;
  label: string;
  glow: string;
  tooltip: string;
  chip: string;
  ambient: string;
  animatedAmbient: boolean;
}

export const RARITY_STYLES: Record<BadgeRarity, RarityStyle> = {
  common: {
    ring: 'ring-white/15',
    text: 'text-zinc-300',
    label: 'Common',
    glow: 'group-hover/badge:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.8)]',
    tooltip: 'border-white/10',
    chip: 'bg-white/[0.06] text-zinc-300 border border-white/10',
    ambient: 'radial-gradient(circle at 50% 35%, rgba(255,255,255,0.10), transparent 70%)',
    animatedAmbient: false,
  },
  rare: {
    ring: 'ring-sky-200/25',
    text: 'text-sky-200',
    label: 'Rare',
    glow: 'group-hover/badge:shadow-[0_2px_14px_-4px_rgba(56,189,248,0.35)]',
    tooltip: 'border-sky-200/20',
    chip: 'bg-sky-400/10 text-sky-200 border border-sky-200/20',
    ambient: 'radial-gradient(circle at 50% 35%, rgba(56,189,248,0.14), transparent 70%)',
    animatedAmbient: false,
  },
  epic: {
    ring: 'ring-violet-200/25',
    text: 'text-violet-200',
    label: 'Epic',
    glow: 'group-hover/badge:shadow-[0_2px_14px_-4px_rgba(167,139,250,0.35)]',
    tooltip: 'border-violet-200/20',
    chip: 'bg-violet-400/10 text-violet-200 border border-violet-200/20',
    ambient: 'radial-gradient(circle at 50% 35%, rgba(167,139,250,0.16), transparent 70%)',
    animatedAmbient: false,
  },
  legendary: {
    ring: 'ring-amber-100/30',
    text: 'text-amber-200',
    label: 'Legendary',
    glow: 'group-hover/badge:shadow-[0_2px_16px_-4px_rgba(251,191,36,0.35)]',
    tooltip: 'border-amber-100/25',
    chip: 'bg-amber-300/10 text-amber-200 border border-amber-100/25',
    ambient: 'radial-gradient(circle at 50% 35%, rgba(251,191,36,0.18), transparent 70%)',
    animatedAmbient: false,
  },
  mythic: {
    ring: 'ring-rose-100/30',
    text: 'text-rose-200',
    label: 'Mythic',
    glow: 'group-hover/badge:shadow-[0_2px_16px_-4px_rgba(251,113,133,0.35)]',
    tooltip: 'border-rose-100/25',
    chip: 'bg-rose-400/10 text-rose-200 border border-rose-100/25',
    ambient: 'radial-gradient(circle at 50% 35%, rgba(251,113,133,0.18), transparent 70%)',
    animatedAmbient: false,
  },
};

const RARITY_ORDER: Record<BadgeRarity, number> = {
  mythic: 0,
  legendary: 1,
  epic: 2,
  rare: 3,
  common: 4,
};

/**
 * Resolve a user's visible badges from stored grants + derived role flags.
 * `admin`/`mod` are injected from the role flags rather than the table.
 */
export function resolveBadges(
  storedKeys: string[],
  roleFlags?: { isAdmin?: boolean; isModerator?: boolean },
): BadgeDef[] {
  const keys = new Set(storedKeys);
  if (roleFlags?.isAdmin) keys.add('admin');
  if (roleFlags?.isModerator && !roleFlags?.isAdmin) keys.add('mod');

  return [...keys]
    .map((k) => BADGE_MAP[k])
    .filter((b): b is BadgeDef => !!b)
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
}

/**
 * Compute the current tier index for a badge given live user stats.
 * Returns the highest unlocked tier (0-based). Returns -1 when the badge has
 * no tiers or the metric is missing. Tier 0 (unlock) always has threshold 0.
 */
export function currentTier(badge: BadgeDef, stats: Partial<Record<BadgeMetricKey, number>>): number {
  if (!badge.tiers || !badge.metricKey) return -1;
  const value = stats[badge.metricKey];
  if (value == null) return -1;
  let tier = 0;
  for (let i = badge.tiers.length - 1; i >= 0; i--) {
    if (value >= badge.tiers[i].threshold) {
      tier = i;
      break;
    }
  }
  return tier;
}

/**
 * Auto-pick the user's "featured" badge — the rarest/highest one they have.
 * Used to populate `profiles.featured_badge_key` when it's null. Logic:
 *   1. Mythic > Legendary > Epic > Rare > Common (rarity first).
 *   2. Within a rarity, animated > non-animated.
 *   3. If still tied, alphabetical by key (stable).
 */
export function pickFeaturedBadge(badges: BadgeDef[]): string | null {
  if (badges.length === 0) return null;
  const sorted = [...badges].sort((a, b) => {
    const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
    if (rarityDiff !== 0) return rarityDiff;
    if (a.animated !== b.animated) return a.animated ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
  return sorted[0].key;
}
