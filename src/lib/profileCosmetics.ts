import { deriveIsAdmin, type StaffRoleSource } from "@/lib/roles";

export const PREMIUM_BADGE_KEYS = [
  "premium-go",
  "premium-pro",
  "premium-ultra",
] as const;

/** Entitlement belongs to the profile owner, never the person viewing it. */
export function hasPremiumCosmetics(
  profile: StaffRoleSource | null | undefined,
  badges: readonly { key: string }[] = []
): boolean {
  return (
    deriveIsAdmin(profile) ||
    badges.some((badge) => PREMIUM_BADGE_KEYS.some((key) => key === badge.key))
  );
}

export const AVATAR_DECORATIONS = [
  {
    key: "none",
    label: "None",
    description: "Your original avatar",
    colors: ["#94a3b8", "#e2e8f0"],
  },
  {
    key: "enso",
    label: "Ensō",
    description: "An open ink circle · Free",
    colors: ["#a5bbc9", "#e4eef2"],
  },
  {
    key: "kumihimo",
    label: "Kumihimo",
    description: "Braided plum and cream · Free",
    colors: ["#bb8caa", "#f1dfca"],
  },
  {
    key: "kintsugi",
    label: "Kintsugi",
    description: "Porcelain repaired with gold",
    colors: ["#b79146", "#fff0c6"],
  },
  {
    key: "tsukimi",
    label: "Tsukimi",
    description: "Moon and silver pampas grass",
    colors: ["#98b1df", "#f7e5b5"],
  },
  {
    key: "mizuhiki",
    label: "Mizuhiki",
    description: "A ceremonial champagne knot",
    colors: ["#bf934e", "#fff0bd"],
  },
  {
    key: "shizuku",
    label: "Shizuku",
    description: "Silver raindrops on a fine blue ring · Free",
    colors: ["#82b8dc", "#e0f5ff"],
  },
  {
    key: "bamboo",
    label: "Bamboo",
    description: "Slender jade leaves and quiet balance · Free",
    colors: ["#71ad8d", "#d7edc5"],
  },
  {
    key: "momiji",
    label: "Momiji",
    description: "Autumn maple leaves in copper and vermilion",
    colors: ["#d78a56", "#ffdeac"],
  },
  {
    key: "kitsune",
    label: "Kitsune",
    description: "Ivory fox ears and vermilion tassels",
    colors: ["#d97065", "#fff2d7"],
  },
  {
    key: "pearl-tide",
    label: "Pearl Tide",
    description: "Ocean pearls and a scalloped silver edge",
    colors: ["#95c7ca", "#f5f6e7"],
  },
  {
    key: "crimson-thorns",
    label: "Crimson Thorns",
    description: "Blackened silver branches with ruby drops",
    colors: ["#ae6079", "#e0b3c3"],
  },
  {
    key: "celestial",
    label: "Celestial",
    description: "Moon silver and tiny constellations",
    colors: ["#93b7ef", "#e7efff"],
  },
  {
    key: "sakura-wreath",
    label: "Sakura Wreath",
    description: "Blush blossoms on delicate branches",
    colors: ["#ed8bb8", "#ffe0eb"],
  },
  {
    key: "imperial",
    label: "Imperial",
    description: "Champagne gold and a jeweled crown",
    colors: ["#ce9e50", "#fff0bc"],
  },
  {
    key: "crystal",
    label: "Crystal Bloom",
    description: "Iridescent facets and pale aqua",
    colors: ["#7de2dc", "#c9b5ff"],
  },
  {
    key: "seraph",
    label: "Seraph",
    description: "Pearl wings and a fine gold halo",
    colors: ["#d8ba83", "#fff3da"],
  },
  {
    key: "lotus",
    label: "Jade Lotus",
    description: "Sculpted petals in soft jade",
    colors: ["#7cba9b", "#dbefbc"],
  },
  {
    key: "eclipse",
    label: "Eclipse",
    description: "Violet orbit with an amber crescent",
    colors: ["#a58be1", "#ffd4a0"],
  },
  {
    key: "starlight",
    label: "Starlight",
    description: "A constellation of diamond stars",
    colors: ["#b0c5f3", "#f7e2fa"],
  },
] as const;

export type AvatarDecorationKey = (typeof AVATAR_DECORATIONS)[number]["key"];

export const PROFILE_COSMETIC_EFFECTS = [
  { key: "none", label: "None", description: "Keep your profile clear" },
  {
    key: "constellation",
    label: "Constellation",
    description: "Silver stars along the profile edges",
  },
  {
    key: "blossom",
    label: "Blossom Veil",
    description: "Soft pink petals around the frame",
  },
  {
    key: "spirit",
    label: "Spirit Flame",
    description: "Amber lights and a gilded edge",
  },
  {
    key: "rainfall",
    label: "Rain on Glass",
    description: "Fine silver rain at the edges · Free",
  },
  {
    key: "firefly",
    label: "Firefly Garden",
    description: "Small lights in a midnight garden · Free",
  },
  {
    key: "ginkgo",
    label: "Ginkgo Fall",
    description: "Fan-shaped golden leaves",
  },
  {
    key: "aurora-silk",
    label: "Aurora Silk",
    description: "Flowing ribbons in mint and violet",
  },
  {
    key: "crimson-petals",
    label: "Crimson Petals",
    description: "Ruby petals in the evening air",
  },
  {
    key: "moon-ripple",
    label: "Moon Ripple",
    description: "Silver ripples across still water",
  },
  {
    key: "hologram",
    label: "Hologram",
    description: "Opal facets and iridescent corners",
  },
] as const;
export type ProfileCosmeticEffectKey =
  (typeof PROFILE_COSMETIC_EFFECTS)[number]["key"];

export const PROFILE_NAMEPLATES = [
  {
    key: "none",
    label: "None",
    colors: ["transparent", "transparent"],
    accent: "#94a3b8",
  },
  {
    key: "sumi",
    label: "Sumi",
    colors: ["#202831", "#293440"],
    accent: "#e0e9ef",
  },
  {
    key: "matcha",
    label: "Matcha",
    colors: ["#21362b", "#324c3a"],
    accent: "#d7edbf",
  },
  {
    key: "sakura-letter",
    label: "Sakura Letter",
    colors: ["#432638", "#583344"],
    accent: "#ffd5e3",
  },
  {
    key: "yoru",
    label: "Yoru",
    colors: ["#131e3c", "#263d62"],
    accent: "#c2ddff",
  },
  {
    key: "honey-silk",
    label: "Honey Silk",
    colors: ["#3b2c14", "#544021"],
    accent: "#ffe4a1",
  },
  {
    key: "wisteria",
    label: "Wisteria",
    colors: ["#302540", "#4a365d"],
    accent: "#e7d3ff",
  },
  {
    key: "hinoki",
    label: "Hinoki",
    colors: ["#302b21", "#433b2d"],
    accent: "#ede1bd",
  },
  {
    key: "seigaiha",
    label: "Seigaiha",
    colors: ["#142e41", "#20475d"],
    accent: "#c0e9f5",
  },
  {
    key: "akari",
    label: "Akari",
    colors: ["#42291f", "#5e3b25"],
    accent: "#ffda9f",
  },
  {
    key: "momiji-script",
    label: "Autumn Letter",
    colors: ["#422020", "#61352a"],
    accent: "#ffd1aa",
  },
  {
    key: "pearl",
    label: "Pearl Letter",
    colors: ["#303344", "#49465c"],
    accent: "#eee7ff",
  },
  {
    key: "obsidian",
    label: "Obsidian Court",
    colors: ["#201e27", "#38303d"],
    accent: "#e9c9dc",
  },
  {
    key: "aoi",
    label: "Aoi",
    colors: ["#172f35", "#285058"],
    accent: "#c3f6ec",
  },
  {
    key: "vermillion",
    label: "Vermilion Seal",
    colors: ["#48252b", "#6b3037"],
    accent: "#ffe0d4",
  },
  {
    key: "moonstone",
    label: "Moonstone",
    colors: ["#13213c", "#293458"],
    accent: "#b9d4ff",
  },
  {
    key: "rose-quartz",
    label: "Rose Quartz",
    colors: ["#321826", "#4a293d"],
    accent: "#ffc4df",
  },
  {
    key: "gilded",
    label: "Gilded",
    colors: ["#2d2416", "#42361f"],
    accent: "#f4d99b",
  },
  {
    key: "opal",
    label: "Opal",
    colors: ["#133233", "#302744"],
    accent: "#bbf4e5",
  },
] as const;
export type ProfileNameplateKey = (typeof PROFILE_NAMEPLATES)[number]["key"];

export function readProfileCosmeticEffect(
  value: unknown,
  entitled: boolean
): ProfileCosmeticEffectKey {
  return (entitled || isFreeCosmetic("profileEffect", value)) &&
    PROFILE_COSMETIC_EFFECTS.some((effect) => effect.key === value)
    ? (value as ProfileCosmeticEffectKey)
    : "none";
}

export function readProfileNameplate(
  value: unknown,
  entitled: boolean
): ProfileNameplateKey {
  return (entitled || isFreeCosmetic("nameplate", value)) &&
    PROFILE_NAMEPLATES.some((plate) => plate.key === value)
    ? (value as ProfileNameplateKey)
    : "none";
}

export function readAvatarDecoration(
  value: unknown,
  entitled: boolean
): AvatarDecorationKey {
  return (entitled || isFreeCosmetic("avatarDecoration", value)) &&
    AVATAR_DECORATIONS.some((decoration) => decoration.key === value)
    ? (value as AvatarDecorationKey)
    : "none";
}

/** Public equipment is allowlisted per category. */
export function isFreeCosmetic(
  kind: "avatarDecoration" | "profileEffect" | "nameplate",
  key: unknown
): boolean {
  return (
    key === "none" ||
    (kind === "profileEffect" &&
      ["rainfall", "firefly"].includes(key as string)) ||
    (kind === "avatarDecoration" &&
      ["enso", "kumihimo", "shizuku", "bamboo"].includes(key as string)) ||
    (kind === "nameplate" &&
      ["sumi", "matcha", "sakura-letter", "hinoki", "seigaiha"].includes(
        key as string
      ))
  );
}
