import { BADGE_EARN_RULES } from './badgeEarnRules';
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
  | 'novel_chapters'
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
  { key: 'beta-tester', family: 'collectible', label: 'Beta Tester', rarity: 'rare', image: '/assets/badge/beta-tester.svg', award: 'auto', description: 'Help shape the next Tatakai release.', rule: 'Opt into beta updates while signed in' },
  {
    key: 'og',
    family: 'collectible',
    label: 'OG',
    rarity: 'mythic',
    image: chikra('og'),
    award: 'auto',
    description: 'Here for the 1,000-member milestone.',
    rule: 'Granted to all existing members at the 1,000-member celebration',
  },
  {
    key: 'centurion',
    family: 'collectible',
    label: 'Centurion',
    rarity: 'rare',
    image: chikra('centurion'),
    award: 'auto',
    description: 'Watched 100+ episodes.',
    rule: "Auto: 100+ episodes",
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
    rule: "Auto: 1000+ episodes",
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
    rule: "Auto: 50+ distinct anime",
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
    award: 'auto',
    description: 'Earn appreciation for your comments and community posts.',
    rule: "Auto: 20+ community likes",
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
    award: 'auto',
    description: 'Devoted to the harem genre.',
    rule: "Auto: 5+ harem across anime, manga and novels",
  },
  {
    key: 'action',
    family: 'collectible',
    label: 'Action Junkie',
    rarity: 'rare',
    image: chikra('action'),
    award: 'auto',
    description: 'Lives for action-packed shows.',
    rule: "Auto: 5+ action across anime, manga and novels",
  },
  {
    key: 'isekai',
    family: 'collectible',
    label: 'Isekai Voyager',
    rarity: 'rare',
    image: chikra('isekai'),
    award: 'auto',
    description: 'Reincarnated one too many times.',
    rule: "Auto: 5+ isekai across anime, manga and novels",
  },
  {
    key: 'romance',
    family: 'collectible',
    label: 'Hopeless Romantic',
    rarity: 'rare',
    image: chikra('romance'),
    award: 'auto',
    description: 'Here for the romance.',
    rule: "Auto: 5+ romance across anime, manga and novels",
  },
  {
    key: 'omniscient',
    family: 'collectible',
    label: 'Omniscient',
    rarity: 'mythic',
    image: chikra('omniscient'),
    award: 'auto',
    description: 'Watches across every genre.',
    animated: true,
    rule: "Auto: 10+ genres",
  },
  {
    key: 'night-owl',
    family: 'collectible',
    label: 'Night Owl',
    rarity: 'common',
    image: chikra('night-owl'),
    award: 'auto',
    description: 'Watches deep into the night.',
    rule: "Auto: 20+ night episodes",
  },
  {
    key: 'binge-lord',
    family: 'collectible',
    label: 'Binge Lord',
    rarity: 'epic',
    image: chikra('binge-lord'),
    award: 'auto',
    description: 'Watch six episodes in one day (Asia/Kolkata).',
    rule: "Auto: 6+ daily episodes",
  },
  {
    key: 'critic',
    family: 'collectible',
    label: 'Critic',
    rarity: 'rare',
    image: chikra('critic'),
    award: 'auto',
    description: 'Rates everything they watch.',
    rule: "Auto: 50+ ratings",
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
    award: 'auto',
    description: 'A pillar of the comment section.',
    rule: "Auto: 25+ comments",
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
    award: 'auto',
    description: 'Publish five public tier lists for the community.',
    rule: "Auto: 5+ published tierlists",
  },
  {
    key: 'manga-sage',
    family: 'collectible',
    label: 'Manga Sage',
    rarity: 'epic',
    image: chikra('manga-sage'),
    award: 'auto',
    description: 'Read 500+ manga chapters.',
    rule: "Auto: 500+ manga chapters",
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
    award: 'auto',
    description: 'Read titles that end badly for everyone.',
    rule: "Auto: 5+ dark titles across anime, manga and novels",

  },
  {
    key: 'completionist',
    family: 'collectible',
    label: 'Completionist',
    rarity: 'legendary',
    image: chikra('completionist'),
    award: 'auto',
    description: 'Finishes what they start.',
    animated: true,
    rule: "Auto: 25+ completed titles",
  },
  {
    key: 'trendsetter',
    family: 'collectible',
    label: 'Trendsetter',
    rarity: 'epic',
    image: chikra('trendsetter'),
    award: 'auto',
    description: "Explore five titles released this year or last year.",
    rule: "Auto: 5+ recent titles",
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
    award: 'auto',
    description: 'A valued guild member.',
    rule: "Auto: 10+ posts",
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
    award: 'auto',
    description: 'Chasing the dream.',
    rule: "Auto: 25+ planned titles",
  },
  {
    key: 'lucky-medal',
    family: 'collectible',
    label: 'Lucky Medal',
    rarity: 'common',
    image: chikra('luckyMedal'),
    award: 'auto',
    description: 'Return to watch or read on seven different days.',
    rule: "Auto: 7+ active days",
  },
  {
    key: 'challenger-coin',
    family: 'collectible',
    label: 'Challenger Coin',
    rarity: 'rare',
    image: chikra('challengerCoin'),
    award: 'auto',
    description: 'Watch or read on thirty different days.',
    rule: "Auto: 30+ active days",
  },
  {
    key: 'gold-sheaf-ticket',
    family: 'collectible',
    label: 'Gold Sheaf Ticket',
    rarity: 'rare',
    image: chikra('goldSheafTicket'),
    award: 'auto',
    description: 'Rate one hundred titles.',
    rule: "Auto: 100+ ratings",
  },
  {
    key: 'labyrinth-token',
    family: 'collectible',
    label: 'Labyrinth Token',
    rarity: 'epic',
    image: chikra('labyrinthToken'),
    award: 'auto',
    description: 'Explore one hundred catalog titles.',
    rule: "Auto: 100+ distinct titles",
  },
  {
    key: 'tide-shells',
    family: 'collectible',
    label: 'Tide Shells',
    rarity: 'common',
    image: chikra('tideShells'),
    award: 'auto',
    description: 'Watch or read in three different calendar months.',
    rule: "Auto: 3+ active months",
  },
  {
    key: 'dragonbone-stamps',
    family: 'collectible',
    label: 'Dragonbone Stamps',
    rarity: 'epic',
    image: chikra('dragonboneStamps'),
    award: 'auto',
    description: 'Explore two hundred and fifty catalog titles.',
    rule: "Auto: 250+ distinct titles",
  },
  {
    key: 'dragon-crystal-abyssal',
    family: 'collectible',
    label: 'Dragon Crystal: Abyssal',
    rarity: 'legendary',
    image: chikra('dragonCrystalAbyssal'),
    award: 'auto',
    animated: true,
    description: 'Watch two thousand and five hundred episodes.',
    rule: "Auto: 2500+ episodes",
  },
  {
    key: 'bound-dragon-crystal-abyssal',
    family: 'collectible',
    label: 'Bound Dragon Crystal: Abyssal',
    rarity: 'mythic',
    image: chikra('boundDragonCrystalAbyssal'),
    award: 'auto',
    animated: true,
    description: 'Watch five thousand episodes.',
    rule: "Auto: 5000+ episodes",
  },
  {
    key: 'badge-of-valor-temporal-rift',
    family: 'collectible',
    label: 'Badge of Valor: Temporal Rift',
    rarity: 'legendary',
    image: chikra('badgeOfValorTemporalRift'),
    award: 'auto',
    animated: true,
    description: 'Watch or read on three hundred and sixty-five days.',
    rule: "Auto: 365+ active days",
  },
    { key: "first-episode", family: 'collectible', label: "First Spark", rarity: 'common', image: "/assets/badge/stars/122514-shinystar.png", award: 'auto', description: "Complete your first qualifying episode.", rule: "Auto: 1+ episodes" },
  { key: "first-manga", family: 'collectible', label: "Manga Spark", rarity: 'common', image: "/assets/badge/stars/130474-shinystar.png", award: 'auto', description: "Reach your first manga chapter.", rule: "Auto: 1+ manga chapters" },
  { key: "first-novel", family: 'collectible', label: "Novel Spark", rarity: 'common', image: "/assets/badge/stars/165532-shinystar.png", award: 'auto', description: "Reach your first novel chapter.", rule: "Auto: 1+ novel chapters" },
  { key: "genre-star", family: 'collectible', label: "Genre Constellation", rarity: 'rare', image: "/assets/badge/stars/179510-shinystar.png", award: 'auto', description: "Earned through 5 genres.", rule: "Auto: 5+ genres" },
  { key: "discussion-star", family: 'collectible', label: "Community Star", rarity: 'rare', image: "/assets/badge/stars/201179-shinystar.png", award: 'auto', description: "Earned through 100 comments.", rule: "Auto: 100+ comments" },
  { key: "watch-star", family: 'collectible', label: "Shooting Star", rarity: 'epic', image: "/assets/badge/stars/344966-shinystar.png", award: 'auto', description: "Earned through 500 episodes.", rule: "Auto: 500+ episodes" },
  { key: "reading-star", family: 'collectible', label: "Reading Supernova", rarity: 'legendary', image: "/assets/badge/stars/622341-shinystar.png", award: 'auto', description: "Earned through 1000 reading chapters.", rule: "Auto: 1000+ reading chapters" },
  { key: "catalog-star", family: 'collectible', label: "Catalog Constellation", rarity: 'mythic', image: "/assets/badge/stars/660953-shinystar.png", award: 'auto', description: "Earned through 500 distinct titles.", rule: "Auto: 500+ distinct titles" },
  // ── Novel pilgrimage (tiered reading ladder, ranked Chikra art) ──────────
  {
    key: 'chapter-pilgrim',
    family: 'collectible',
    label: 'Chapter Pilgrim',
    rarity: 'common',
    image: chikra('74488-ranked-bronze'),
    award: 'auto',
    description: 'Read your first novel chapters.',
    rule: "Auto: 10+ novel chapters",
    metricKey: 'novel_chapters',
    tiers: [
      { name: 'First Page', threshold: 0, description: 'The pilgrimage begins.' },
      { name: 'Pilgrim', threshold: 10, description: 'Read 10 novel chapters.' },
      { name: 'Wayfarer', threshold: 50, description: 'Read 50 novel chapters.', effectClass: 'rn-3' },
      { name: 'Pathfinder', threshold: 150, description: 'Read 150 novel chapters.', effectClass: 'rn-6' },
    ],
  },
  {
    key: 'scroll-keeper',
    family: 'collectible',
    label: 'Scroll Keeper',
    rarity: 'rare',
    image: chikra('11539-ranked-silver'),
    award: 'auto',
    description: 'Keeps every scroll within reach.',
    rule: "Auto: 50+ novel chapters",
    metricKey: 'novel_chapters',
    tiers: [
      { name: 'Apprentice', threshold: 0, description: 'Learning the shelves.' },
      { name: 'Keeper', threshold: 50, description: 'Read 50 novel chapters.' },
      { name: 'Curator', threshold: 200, description: 'Read 200 novel chapters.', effectClass: 'rn-5' },
      { name: 'Archivist', threshold: 400, description: 'Read 400 novel chapters.', effectClass: 'rn-8' },
    ],
  },
  {
    key: 'inkbound-scholar',
    family: 'collectible',
    label: 'Inkbound Scholar',
    rarity: 'epic',
    image: chikra('42769-ranked-gold'),
    award: 'auto',
    description: 'Bound to ink and endless nights.',
    rule: "Auto: 100+ novel chapters",
    metricKey: 'novel_chapters',
    tiers: [
      { name: 'Reader', threshold: 0, description: 'Ink on fingers.' },
      { name: 'Scholar', threshold: 100, description: 'Read 100 novel chapters.' },
      { name: 'Savant', threshold: 300, description: 'Read 300 novel chapters.', effectClass: 'rn-6' },
      { name: 'Luminary', threshold: 600, description: 'Read 600 novel chapters.', effectClass: 'rn-10' },
    ],
  },
  {
    key: 'grand-archivist',
    family: 'collectible',
    label: 'Grand Archivist',
    rarity: 'legendary',
    image: chikra('37118-ranked-grandmaster'),
    award: 'auto',
    description: 'The archive bends to your memory.',
    rule: "Auto: 250+ novel chapters",
    metricKey: 'novel_chapters',
    tiers: [
      { name: 'Attendant', threshold: 0, description: 'Among the stacks.' },
      { name: 'Archivist', threshold: 250, description: 'Read 250 novel chapters.' },
      { name: 'Grand Archivist', threshold: 500, description: 'Read 500 novel chapters.', effectClass: 'rn-10' },
      { name: 'Eternal Record', threshold: 1000, description: 'Read 1000 novel chapters.', effectClass: 'rn-14' },
    ],
  },
  {
    key: 'celestial-scribe',
    family: 'collectible',
    label: 'Celestial Scribe',
    rarity: 'mythic',
    image: chikra('94048-ranked-celestial'),
    award: 'auto',
    animated: true,
    description: 'Writes among the stars.',
    rule: "Auto: 500+ novel chapters",
    metricKey: 'novel_chapters',
    tiers: [
      { name: 'Stargazer', threshold: 0, description: 'Looking up.' },
      { name: 'Scribe', threshold: 500, description: 'Read 500 novel chapters.', effectClass: 'rn-12' },
      { name: 'Celestial', threshold: 1000, description: 'Read 1000 novel chapters.', effectClass: 'rn-15' },
      { name: 'Transcendent', threshold: 2000, description: 'Read 2000 novel chapters.', effectClass: 'rn-16' },
    ],
  },
];

// Flat badges show their earned title; only real tracked metrics have progress ladders.
for (const badge of COLLECTIBLE_BADGES) {
  if (badge.key in BADGE_EARN_RULES) badge.award = 'auto';
  if (!badge.tiers) badge.tiers = [{ name: badge.label, threshold: 0, description: badge.description }];
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
