/**
 * Badge registry — single source of truth for both badge families.
 *
 * Two families share one `user_badges` table (see 20260922130000_user_badges.sql):
 *   - `role`        : entitlement/staff badges. Images in /assets/badge.
 *                     admin & mod are DERIVED from profiles.is_admin/is_moderator
 *                     (never stored); the rest are admin-granted.
 *   - `collectible` : achievement/analytics cards. Images reuse the Chikra rank
 *                     art (/assets/rank/Chikra/rank (N).png). Auto-computed where
 *                     data exists (source='auto'), otherwise admin-granted.
 *
 * Rarity is a FIXED tier per badge, shown as a colored frame + label on hover.
 * `rule` is human-readable award criteria for the tooltip / admin UI; the actual
 * auto-award logic lives in recompute_user_badges().
 */

export type BadgeFamily = 'role' | 'collectible';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface BadgeDef {
  key: string;
  family: BadgeFamily;
  label: string;
  description: string;
  image: string;
  rarity: BadgeRarity;
  /** Animated badges get the `.badge-animated` shimmer (index.css). */
  animated?: boolean;
  /** How it's earned — shown in tooltip/admin. */
  rule?: string;
  /** collectible only: 'auto' when recompute_user_badges can award it. */
  award?: 'auto' | 'manual';
}

/** Chikra art path (space + parens in the filename must be URL-encoded). */
const chikra = (n: number) => `/assets/rank/Chikra/rank%20(${n}).png`;
/** Role badge art path. */
const roleImg = (key: string) => `/assets/badge/${key}.png`;

// ── Role / entitlement family (9 PNGs in /assets/badge) ─────────────────────
const ROLE_BADGES: BadgeDef[] = [
  { key: 'owner',         family: 'role', label: 'Owner',        rarity: 'mythic',    image: roleImg('owner'),         description: 'Founder & owner of Tatakai.',                     rule: 'Admin-granted' },
  { key: 'admin',         family: 'role', label: 'Admin',        rarity: 'legendary', image: roleImg('admin'),         description: 'Platform administrator.',                          rule: 'Derived from profiles.is_admin' },
  { key: 'mod',           family: 'role', label: 'Moderator',    rarity: 'epic',      image: roleImg('mod'),           description: 'Community moderator.',                             rule: 'Derived from profiles.is_moderator' },
  { key: 'developer',     family: 'role', label: 'Developer',    rarity: 'legendary', image: roleImg('developer'),     description: 'Builds & maintains Tatakai.',                      rule: 'Admin-granted' },
  { key: 'partner',       family: 'role', label: 'Partner',      rarity: 'epic',      image: roleImg('partner'),       description: 'Official Tatakai partner.',                        rule: 'Admin-granted' },
  { key: 'booster',       family: 'role', label: 'Booster',      rarity: 'rare',      image: roleImg('booster'),       description: 'Supports Tatakai with a boost.',    animated: true, rule: 'Admin-granted' },
  { key: 'premium-go',    family: 'role', label: 'Premium Go',   rarity: 'rare',      image: roleImg('premium-go'),    description: 'Premium Go supporter.',                            rule: 'Admin-granted' },
  { key: 'premium-pro',   family: 'role', label: 'Premium Pro',  rarity: 'epic',      image: roleImg('premium-pro'),   description: 'Premium Pro supporter.',            animated: true, rule: 'Admin-granted' },
  { key: 'premium-ultra', family: 'role', label: 'Premium Ultra',rarity: 'legendary', image: roleImg('premium-ultra'), description: 'Premium Ultra supporter.',          animated: true, rule: 'Admin-granted' },
];

// ── Collectible family (18 Chikra cards) ────────────────────────────────────
// Extensible: edit freely. `award: 'auto'` keys must be handled in
// recompute_user_badges() to actually be granted automatically.
const COLLECTIBLE_BADGES: BadgeDef[] = [
  { key: 'og',           family: 'collectible', label: 'OG',            rarity: 'mythic',    image: chikra(1),  award: 'auto',   description: 'One of the first 100 members.',                         rule: 'Auto: among the first 100 signups' },
  { key: 'centurion',    family: 'collectible', label: 'Centurion',     rarity: 'rare',      image: chikra(2),  award: 'auto',   description: 'Watched 100+ episodes.',                                rule: 'Auto: 100+ episodes watched' },
  { key: 'millennium',   family: 'collectible', label: 'Millennium',    rarity: 'legendary', image: chikra(3),  award: 'auto',   description: 'Watched 1000+ episodes.',                animated: true, rule: 'Auto: 1000+ episodes watched' },
  { key: 'explorer',     family: 'collectible', label: 'Explorer',      rarity: 'epic',      image: chikra(4),  award: 'auto',   description: 'Explored 50+ different series.',                        rule: 'Auto: 50+ distinct anime' },
  { key: 'harem',        family: 'collectible', label: 'Harem King',    rarity: 'rare',      image: chikra(5),  award: 'manual', description: 'Devoted to the harem genre.',                           rule: 'Analytics: top genre = Harem' },
  { key: 'action',       family: 'collectible', label: 'Action Junkie', rarity: 'rare',      image: chikra(6),  award: 'manual', description: 'Lives for action-packed shows.',                        rule: 'Analytics: top genre = Action' },
  { key: 'isekai',       family: 'collectible', label: 'Isekai Voyager',rarity: 'rare',      image: chikra(7),  award: 'manual', description: 'Reincarnated one too many times.',                      rule: 'Analytics: top genre = Isekai' },
  { key: 'romance',      family: 'collectible', label: 'Hopeless Romantic', rarity: 'rare',  image: chikra(8),  award: 'manual', description: 'Here for the romance.',                                 rule: 'Analytics: top genre = Romance' },
  { key: 'omniscient',   family: 'collectible', label: 'Omniscient',    rarity: 'mythic',    image: chikra(9),  award: 'manual', description: 'Watches across every genre.',            animated: true, rule: 'Analytics: broad genre coverage' },
  { key: 'night-owl',    family: 'collectible', label: 'Night Owl',     rarity: 'common',    image: chikra(10), award: 'manual', description: 'Watches deep into the night.',                          rule: 'Analytics: late-night viewing' },
  { key: 'binge-lord',   family: 'collectible', label: 'Binge Lord',    rarity: 'epic',      image: chikra(11), award: 'manual', description: 'Marathons entire seasons at once.',                     rule: 'Analytics: long sessions' },
  { key: 'critic',       family: 'collectible', label: 'Critic',        rarity: 'rare',      image: chikra(12), award: 'manual', description: 'Rates everything they watch.',                          rule: 'Analytics: many ratings' },
  { key: 'commentator',  family: 'collectible', label: 'Commentator',   rarity: 'common',    image: chikra(13), award: 'manual', description: 'A pillar of the comment section.',                      rule: 'Analytics: many comments' },
  { key: 'tastemaker',   family: 'collectible', label: 'Tastemaker',    rarity: 'epic',      image: chikra(14), award: 'manual', description: 'Their tier lists shape opinions.',                      rule: 'Analytics: popular tier lists' },
  { key: 'manga-sage',   family: 'collectible', label: 'Manga Sage',    rarity: 'epic',      image: chikra(15), award: 'manual', description: 'Read 500+ manga chapters.',                             rule: 'Analytics: 500+ chapters read' },
  { key: 'completionist',family: 'collectible', label: 'Completionist', rarity: 'legendary', image: chikra(16), award: 'manual', description: 'Finishes what they start.',              animated: true, rule: 'Analytics: high completion rate' },
  { key: 'trendsetter',  family: 'collectible', label: 'Trendsetter',   rarity: 'epic',      image: chikra(17), award: 'manual', description: 'First to watch the season’s hits.',                rule: 'Analytics: early adopter' },
  { key: 'legend',       family: 'collectible', label: 'Living Legend', rarity: 'mythic',    image: chikra(18), award: 'manual', description: 'A legend of the community.',             animated: true, rule: 'Admin-granted honor' },
];

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
  /** Frame ring color for the badge chip. */
  ring: string;
  /** Rarity label text color. */
  text: string;
  label: string;
  /** Hover glow shadow for the badge chip (unique per rarity). */
  glow: string;
  /** Border color for the hover tooltip. */
  tooltip: string;
  /** Small rarity pill inside the tooltip. */
  chip: string;
  /** CSS background for the animated ambient behind the tooltip. */
  ambient: string;
  /** legendary/mythic spin their conic ambient; the rest gently pulse a radial. */
  animatedAmbient: boolean;
}

/** Tailwind/CSS per rarity for the badge frame, hover glow, and tooltip ambient. */
export const RARITY_STYLES: Record<BadgeRarity, RarityStyle> = {
  common: {
    ring: 'ring-zinc-400/40', text: 'text-zinc-300', label: 'Common',
    glow: 'group-hover/badge:shadow-[0_0_10px_-2px_rgba(161,161,170,0.55)]',
    tooltip: 'border-zinc-400/25',
    chip: 'bg-zinc-400/15 text-zinc-300',
    ambient: 'radial-gradient(circle at 50% 40%, rgba(161,161,170,0.35), transparent 70%)',
    animatedAmbient: false,
  },
  rare: {
    ring: 'ring-sky-400/50', text: 'text-sky-300', label: 'Rare',
    glow: 'group-hover/badge:shadow-[0_0_12px_-1px_rgba(56,189,248,0.6)]',
    tooltip: 'border-sky-400/30',
    chip: 'bg-sky-400/15 text-sky-300',
    ambient: 'radial-gradient(circle at 50% 40%, rgba(56,189,248,0.4), transparent 70%)',
    animatedAmbient: false,
  },
  epic: {
    ring: 'ring-violet-400/50', text: 'text-violet-300', label: 'Epic',
    glow: 'group-hover/badge:shadow-[0_0_12px_-1px_rgba(167,139,250,0.6)]',
    tooltip: 'border-violet-400/30',
    chip: 'bg-violet-400/15 text-violet-300',
    ambient: 'radial-gradient(circle at 50% 40%, rgba(167,139,250,0.45), transparent 70%)',
    animatedAmbient: false,
  },
  legendary: {
    ring: 'ring-amber-400/60', text: 'text-amber-300', label: 'Legendary',
    glow: 'group-hover/badge:shadow-[0_0_16px_0_rgba(251,191,36,0.75)]',
    tooltip: 'border-amber-400/40',
    chip: 'bg-amber-400/20 text-amber-300',
    ambient: 'conic-gradient(from 0deg, rgba(251,191,36,0.55), rgba(251,146,60,0.2), rgba(251,191,36,0.55))',
    animatedAmbient: true,
  },
  mythic: {
    ring: 'ring-rose-400/60', text: 'text-rose-300', label: 'Mythic',
    glow: 'group-hover/badge:shadow-[0_0_16px_0_rgba(251,113,133,0.75)]',
    tooltip: 'border-rose-400/40',
    chip: 'bg-rose-400/20 text-rose-300',
    ambient: 'conic-gradient(from 0deg, rgba(244,63,94,0.55), rgba(217,70,239,0.3), rgba(244,63,94,0.55))',
    animatedAmbient: true,
  },
};

/** Sort order so higher rarity renders first. */
const RARITY_ORDER: Record<BadgeRarity, number> = {
  mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4,
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
  // A moderator who isn't an admin gets the mod badge.
  if (roleFlags?.isModerator && !roleFlags?.isAdmin) keys.add('mod');

  return [...keys]
    .map((k) => BADGE_MAP[k])
    .filter((b): b is BadgeDef => !!b)
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
}
