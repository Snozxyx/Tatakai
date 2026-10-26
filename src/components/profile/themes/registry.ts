import { lazy } from 'react';
import { defaultSekaiConfig, hasCustomProfileAccess, readSekaiConfig, type ThemePreferences } from '@/lib/profileThemes';
import type { ProfileThemeDefinition } from './types';
import type { StaffRoleSource } from '@/lib/roles';
import { SekaiProfileLoading } from './sekaipop/SekaiProfileLoading';
import { defaultEmpressConfig, readEmpressConfig } from './gothic-empress/config';
import { EmpressLoading } from './gothic-empress/EmpressLoading';
import { defaultMidnightLofiConfig, readMidnightLofiConfig } from './midnight-lofi/config';
import { MidnightLofiLoading } from './midnight-lofi/MidnightLofiLoading';
const loadSekaiProfile = () => import('./sekaipop/SekaiProfile');
const loadEmpressProfile = () => import('./gothic-empress/EmpressProfile');
const loadMidnightLofiProfile = () => import('./midnight-lofi/MidnightLofiProfile');

/** Add new themes here; the resolver, selector and persistence use this contract. */
export const PROFILE_THEMES: readonly ProfileThemeDefinition[] = [
  { id: 'default', label: 'Default', description: 'The original Tatakai profile.', version: 1,
    entitled: () => true, defaults: () => ({}), parse: () => ({}) },
  { id: 'gothic-empress', label: 'Gothic Empress', description: 'An obsidian court, a crimson gaze. A live wallpaper, interactive Three.js sigil, and a collection made for your reign.', version: 1,
    accessBadges: ['booster', 'premium-pro', 'premium-ultra', 'admin'],
    entitled: hasCustomProfileAccess, defaults: defaultEmpressConfig, parse: readEmpressConfig,
    Loading: EmpressLoading, preload: loadEmpressProfile,
    Renderer: lazy(loadEmpressProfile),
    Preview: lazy(() => import('./gothic-empress/EmpressProfilePreview')),
    Editor: lazy(() => import('./gothic-empress/EmpressEditor')) },
  { id: 'uchiha', label: 'Uchiha', description: 'Itachi, ravens, and a quiet charcoal layout. A dark profile with its own character.', version: 1,
    accessBadges: ['booster', 'premium-pro', 'premium-ultra', 'admin'],
    entitled: hasCustomProfileAccess, defaults: () => ({ version: 1 }),
    parse: value => value && typeof value === 'object' && !Array.isArray(value) && (value as { version?: unknown }).version === 1 ? { version: 1 } : null,
    Preview: lazy(() => import('./uchiha/UchihaProfilePreview')) },
  { id: 'sekaipop', label: 'SekaiPop', description: 'Your own little world. Arrange a scrapbook of everything you love.', version: 1,
    accessBadges: ['booster', 'premium-pro', 'premium-ultra', 'admin'],
    entitled: hasCustomProfileAccess, defaults: defaultSekaiConfig, parse: readSekaiConfig,
    Loading: SekaiProfileLoading,
    arrivalMs: 1000,
    preload: loadSekaiProfile,
    Renderer: lazy(loadSekaiProfile),
    Preview: lazy(() => import('./sekaipop/SekaiProfilePreview')),
    Editor: lazy(() => import('./sekaipop/SekaiEditor')) },
  { id: 'komorebi', label: 'Komorebi', description: 'Sunlight through the leaves. Ivory glass, honey gold, and a Japanese garden for the stories you love.', version: 1,
    accessBadges: ['booster', 'premium-pro', 'premium-ultra', 'admin'], entitled: hasCustomProfileAccess,
    defaults: () => ({ version: 1 }), parse: value => value && typeof value === 'object' && !Array.isArray(value) && (value as { version?: unknown }).version === 1 ? { version: 1 } : null,
    Renderer: lazy(() => import('./komorebi/KomorebiProfile')), Preview: lazy(() => import('./komorebi/KomorebiPreview')) },
  { id: 'midnight-lofi', label: 'Midnight Lo-Fi', description: 'A cozy midnight anime bedroom bathed in monitor glow, vertical Japanese script, and frosted glass cards.', version: 1,
    accessBadges: ['booster', 'premium-pro', 'premium-ultra', 'admin'],
    entitled: hasCustomProfileAccess, defaults: defaultMidnightLofiConfig, parse: readMidnightLofiConfig,
    Loading: MidnightLofiLoading,
    preload: loadMidnightLofiProfile,
    Renderer: lazy(loadMidnightLofiProfile),
    Preview: lazy(() => import('./midnight-lofi/MidnightLofiProfilePreview')),
    Editor: lazy(() => import('./midnight-lofi/MidnightLofiEditor')) },
];
export function resolveProfileTheme(preferences: ThemePreferences, owner: StaffRoleSource | null | undefined, badges: readonly { key: string }[], verified: boolean, ownedThemes: readonly string[] = []) {
  const theme = PROFILE_THEMES.find(t => t.id === preferences.selected);
  if (!verified || !theme || !canUseProfileTheme(theme, owner, badges, ownedThemes)) return PROFILE_THEMES[0];
  if (theme.id !== 'default' && !theme.parse(preferences.configurations[theme.id])) return PROFILE_THEMES[0];
  return theme;
}

/** Ownership unlocks only the granted theme, without granting premium status. */
export function canUseProfileTheme(theme: ProfileThemeDefinition, owner: StaffRoleSource | null | undefined, badges: readonly { key: string }[] = [], ownedThemes: readonly string[] = []): boolean {
  return theme.entitled(owner, badges) || ownedThemes.includes(theme.id);
}
