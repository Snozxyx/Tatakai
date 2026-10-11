import { deriveIsAdmin, type StaffRoleSource } from '@/lib/roles';

export const PREMIUM_BADGE_KEYS = ['premium-go', 'premium-pro', 'premium-ultra'] as const;

/** Entitlement belongs to the profile owner, never the person viewing it. */
export function hasPremiumCosmetics(
  profile: StaffRoleSource | null | undefined,
  badges: readonly { key: string }[] = [],
): boolean {
  return deriveIsAdmin(profile) || badges.some(badge => PREMIUM_BADGE_KEYS.some(key => key === badge.key));
}

export const AVATAR_DECORATIONS = [
  { key: 'none', label: 'None', description: 'Your original avatar', colors: ['#94a3b8', '#e2e8f0'] },
  { key: 'celestial', label: 'Celestial', description: 'Moon silver and tiny constellations', colors: ['#93b7ef', '#e7efff'] },
  { key: 'sakura-wreath', label: 'Sakura Wreath', description: 'Blush blossoms on delicate branches', colors: ['#ed8bb8', '#ffe0eb'] },
  { key: 'imperial', label: 'Imperial', description: 'Champagne gold and a jeweled crown', colors: ['#ce9e50', '#fff0bc'] },
  { key: 'crystal', label: 'Crystal Bloom', description: 'Iridescent facets and pale aqua', colors: ['#7de2dc', '#c9b5ff'] },
  { key: 'seraph', label: 'Seraph', description: 'Pearl wings and a fine gold halo', colors: ['#d8ba83', '#fff3da'] },
  { key: 'lotus', label: 'Jade Lotus', description: 'Sculpted petals in soft jade', colors: ['#7cba9b', '#dbefbc'] },
  { key: 'eclipse', label: 'Eclipse', description: 'Violet orbit with an amber crescent', colors: ['#a58be1', '#ffd4a0'] },
  { key: 'starlight', label: 'Starlight', description: 'A constellation of diamond stars', colors: ['#b0c5f3', '#f7e2fa'] },
] as const;

export type AvatarDecorationKey = typeof AVATAR_DECORATIONS[number]['key'];

export const PROFILE_COSMETIC_EFFECTS = [
  { key: 'none', label: 'None', description: 'Keep your profile clear' },
  { key: 'constellation', label: 'Constellation', description: 'Silver stars along the profile edges' },
  { key: 'blossom', label: 'Blossom Veil', description: 'Soft pink petals around the frame' },
  { key: 'spirit', label: 'Spirit Flame', description: 'Amber lights and a gilded edge' },
  { key: 'hologram', label: 'Hologram', description: 'Opal facets and iridescent corners' },
] as const;
export type ProfileCosmeticEffectKey = typeof PROFILE_COSMETIC_EFFECTS[number]['key'];

export const PROFILE_NAMEPLATES = [
  { key: 'none', label: 'None', colors: ['transparent', 'transparent'], accent: '#94a3b8' },
  { key: 'moonstone', label: 'Moonstone', colors: ['#13213c', '#293458'], accent: '#b9d4ff' },
  { key: 'rose-quartz', label: 'Rose Quartz', colors: ['#321826', '#4a293d'], accent: '#ffc4df' },
  { key: 'gilded', label: 'Gilded', colors: ['#2d2416', '#42361f'], accent: '#f4d99b' },
  { key: 'opal', label: 'Opal', colors: ['#133233', '#302744'], accent: '#bbf4e5' },
] as const;
export type ProfileNameplateKey = typeof PROFILE_NAMEPLATES[number]['key'];

export function readProfileCosmeticEffect(value: unknown, entitled: boolean): ProfileCosmeticEffectKey {
  return entitled && PROFILE_COSMETIC_EFFECTS.some(effect => effect.key === value) ? value as ProfileCosmeticEffectKey : 'none';
}

export function readProfileNameplate(value: unknown, entitled: boolean): ProfileNameplateKey {
  return entitled && PROFILE_NAMEPLATES.some(plate => plate.key === value) ? value as ProfileNameplateKey : 'none';
}

export function readAvatarDecoration(value: unknown, entitled: boolean): AvatarDecorationKey {
  return entitled && AVATAR_DECORATIONS.some(decoration => decoration.key === value)
    ? value as AvatarDecorationKey
    : 'none';
}
