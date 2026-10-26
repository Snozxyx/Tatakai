import { lazy } from 'react';
import { defaultSekaiConfig, hasCustomProfileAccess, readSekaiConfig, type ThemePreferences } from '@/lib/profileThemes';
import type { ProfileThemeDefinition } from './types';
import type { StaffRoleSource } from '@/lib/roles';
import { SekaiProfileLoading } from './sekaipop/SekaiProfileLoading';
import { defaultEmpressConfig, readEmpressConfig } from './gothic-empress/config';
import { EmpressLoading } from './gothic-empress/EmpressLoading';
const loadSekaiProfile = () => import('./sekaipop/SekaiProfile');
const loadEmpressProfile = () => import('./gothic-empress/EmpressProfile');

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
];
export function resolveProfileTheme(preferences: ThemePreferences, owner: StaffRoleSource | null | undefined, badges: readonly { key: string }[], verified: boolean) {
  const theme = PROFILE_THEMES.find(t => t.id === preferences.selected);
  if (!verified || !theme || !theme.entitled(owner, badges)) return PROFILE_THEMES[0];
  if (theme.id !== 'default' && !theme.parse(preferences.configurations[theme.id])) return PROFILE_THEMES[0];
  return theme;
}
