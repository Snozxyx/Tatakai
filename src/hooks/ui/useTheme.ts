import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { normalizeThemeSelection, resolveThemeSelection, type ResolvedThemeSelection } from '@/lib/themeSelection';
import type { ThemeSelection, CustomThemeDefinitions } from '@/lib/customization';
import { getCustomThemeDefinitions, getCustomThemeOverrides, getCustomThemeSnapshot, subscribeCustomThemes } from '@/lib/customThemeRegistry';
export type { ThemeSelection } from '@/lib/customization';
import { readableMutedColor } from '@/lib/themeContrast';
import { extensionRegistry, type RegisteredTheme } from '@/core/extensions/ExtensionRegistry';
import {
  readGuestSettingsFromCookie,
  writeGuestSettingsCookie,
} from '@/lib/appSettingsPersistence';

export type Theme =
  | 'midnight'
  | 'cherry-blossom'
  | 'neon-tokyo'
  | 'aurora-borealis'
  | 'deep-ocean'
  | 'cyberpunk'
  | 'zen-garden'
  | 'light-minimal'
  | 'light-sakura'
  | 'brutalism-dark'
  | 'obsidian'
  | 'solar'
  | 'caffeine'
  | 'brutalism-plus'
  | 'dark-matter'
  | 'royal-gold'
  | 'emerald-forest'
  | 'blood-moon'
  | 'frostbite'
  | 'synthwave'
  | 'vampire'
  | 'matcha-light'
  | 'ocean-breeze'
  | 'brutalist-concrete'
  | 'dark-lite'
  | 'ultra-lite'
  | 'lite'
  | 'amoled';

interface ThemeColors {
  primary: string;
  primaryForeground?: string;
  secondary: string;
  secondaryForeground?: string;
  accent: string;
  accentForeground?: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  glass: string;
  glowPrimary: string;
  glowSecondary: string;
  surface: string;
  surfaceHover: string;
  sidebarBackground: string;
  sidebarBorder: string;
  isLight?: boolean;
  isBrutalism?: boolean;
  isUltraLite?: boolean;
  reduceMotion?: boolean;
  highContrast?: boolean;
}

export const THEME_COLORS: Record<Theme, ThemeColors> = {
  'midnight': {
    primary: '239 84% 67%',
    primaryForeground: '0 0% 100%',
    secondary: '270 60% 50%',
    secondaryForeground: '0 0% 100%',
    accent: '280 70% 55%',
    background: '240 10% 4%',
    foreground: '0 0% 98%',
    card: '240 8% 7%',
    cardForeground: '0 0% 98%',
    muted: '240 6% 12%',
    mutedForeground: '240 5% 65%',
    border: '240 6% 18%',
    glass: '240 10% 8%',
    glowPrimary: '340 82% 65%',
    glowSecondary: '270 60% 50%',
    surface: '240 8% 5%',
    surfaceHover: '240 8% 10%',
    sidebarBackground: '240 10% 3%',
    sidebarBorder: '240 6% 15%',
  },
  'cherry-blossom': {
    primary: '340 82% 65%',
    secondary: '320 70% 55%',
    accent: '350 90% 70%',
    background: '340 15% 5%',
    foreground: '340 5% 95%',
    card: '340 12% 8%',
    cardForeground: '340 5% 95%',
    muted: '340 10% 15%',
    mutedForeground: '340 10% 60%',
    border: '340 10% 20%',
    glass: '340 12% 10%',
    glowPrimary: '340 82% 65%',
    glowSecondary: '320 70% 55%',
    surface: '340 12% 6%',
    surfaceHover: '340 12% 12%',
    sidebarBackground: '340 15% 4%',
    sidebarBorder: '340 10% 15%',
  },
  'neon-tokyo': {
    primary: '280 100% 60%',
    secondary: '180 100% 50%',
    accent: '320 100% 55%',
    background: '260 20% 3%',
    foreground: '0 0% 100%',
    card: '260 18% 6%',
    cardForeground: '0 0% 100%',
    muted: '260 15% 12%',
    mutedForeground: '260 10% 60%',
    border: '260 20% 18%',
    glass: '260 18% 8%',
    glowPrimary: '280 100% 60%',
    glowSecondary: '180 100% 50%',
    surface: '260 18% 4%',
    surfaceHover: '260 18% 10%',
    sidebarBackground: '260 20% 2%',
    sidebarBorder: '260 15% 15%',
  },
  'aurora-borealis': {
    primary: '160 80% 50%',
    secondary: '200 85% 55%',
    accent: '280 70% 60%',
    background: '200 25% 4%',
    foreground: '160 10% 95%',
    card: '200 20% 7%',
    cardForeground: '160 10% 95%',
    muted: '200 15% 13%',
    mutedForeground: '200 10% 60%',
    border: '200 15% 18%',
    glass: '200 18% 9%',
    glowPrimary: '160 80% 50%',
    glowSecondary: '200 85% 55%',
    surface: '200 20% 5%',
    surfaceHover: '200 20% 11%',
    sidebarBackground: '200 25% 3%',
    sidebarBorder: '200 15% 14%',
  },
  'deep-ocean': {
    primary: '200 90% 55%',
    secondary: '220 85% 50%',
    accent: '175 85% 45%',
    background: '210 35% 3%',
    foreground: '200 5% 96%',
    card: '210 30% 6%',
    cardForeground: '200 5% 96%',
    muted: '210 20% 12%',
    mutedForeground: '210 15% 55%',
    border: '210 20% 16%',
    glass: '210 25% 8%',
    glowPrimary: '200 90% 55%',
    glowSecondary: '220 85% 50%',
    surface: '210 30% 4%',
    surfaceHover: '210 30% 10%',
    sidebarBackground: '210 35% 2%',
    sidebarBorder: '210 18% 12%',
  },
  'cyberpunk': {
    primary: '55 100% 50%',
    secondary: '180 100% 40%',
    accent: '320 100% 55%',
    background: '240 15% 3%',
    foreground: '55 100% 95%',
    card: '240 12% 6%',
    cardForeground: '55 100% 95%',
    muted: '240 10% 12%',
    mutedForeground: '240 8% 55%',
    border: '240 12% 18%',
    glass: '240 12% 8%',
    glowPrimary: '55 100% 50%',
    glowSecondary: '180 100% 40%',
    surface: '240 12% 4%',
    surfaceHover: '240 12% 10%',
    sidebarBackground: '240 15% 2%',
    sidebarBorder: '240 10% 14%',
  },
  'zen-garden': {
    primary: '145 40% 50%',
    secondary: '35 60% 45%',
    accent: '160 45% 40%',
    background: '90 10% 5%',
    foreground: '90 5% 92%',
    card: '90 8% 8%',
    cardForeground: '90 5% 92%',
    muted: '90 6% 14%',
    mutedForeground: '90 5% 55%',
    border: '90 8% 18%',
    glass: '90 8% 10%',
    glowPrimary: '145 40% 50%',
    glowSecondary: '35 60% 45%',
    surface: '90 8% 6%',
    surfaceHover: '90 8% 12%',
    sidebarBackground: '90 10% 4%',
    sidebarBorder: '90 6% 14%',
  },
  // Light Themes
  'light-minimal': {
    primary: '220 90% 50%',
    secondary: '260 80% 55%',
    accent: '200 95% 45%',
    background: '0 0% 98%',
    foreground: '220 15% 10%',
    card: '0 0% 100%',
    cardForeground: '220 15% 10%',
    muted: '220 10% 92%',
    mutedForeground: '220 10% 40%',
    border: '220 10% 88%',
    glass: '0 0% 100%',
    glowPrimary: '220 90% 50%',
    glowSecondary: '260 80% 55%',
    surface: '220 10% 96%',
    surfaceHover: '220 10% 93%',
    sidebarBackground: '220 15% 97%',
    sidebarBorder: '220 10% 90%',
    isLight: true,
  },
  'light-sakura': {
    primary: '340 75% 55%',
    secondary: '320 65% 50%',
    accent: '350 85% 60%',
    background: '340 30% 97%',
    foreground: '340 30% 15%',
    card: '340 25% 100%',
    cardForeground: '340 30% 15%',
    muted: '340 15% 92%',
    mutedForeground: '340 15% 45%',
    border: '340 15% 88%',
    glass: '340 20% 98%',
    glowPrimary: '340 75% 55%',
    glowSecondary: '320 65% 50%',
    surface: '340 20% 95%',
    surfaceHover: '340 20% 92%',
    sidebarBackground: '340 25% 96%',
    sidebarBorder: '340 15% 90%',
    isLight: true,
  },
  'brutalism-dark': {
    primary: '55 100% 55%',
    secondary: '45 100% 50%',
    accent: '0 100% 55%',
    background: '0 0% 8%',
    foreground: '0 0% 98%',
    card: '0 0% 12%',
    cardForeground: '0 10% 98%',
    muted: '0 0% 18%',
    mutedForeground: '0 0% 65%',
    border: '55 100% 55%',
    glass: '0 0% 12%',
    glowPrimary: '55 100% 55%',
    glowSecondary: '0 100% 55%',
    surface: '0 0% 10%',
    surfaceHover: '0 0% 18%',
    sidebarBackground: '0 0% 5%',
    sidebarBorder: '55 100% 55%',
    isBrutalism: true,
  },
  'obsidian': {
    primary: '0 0% 70%',
    secondary: '0 0% 50%',
    accent: '0 0% 80%',
    background: '0 0% 3%',
    foreground: '0 0% 95%',
    card: '0 0% 6%',
    cardForeground: '0 0% 95%',
    muted: '0 0% 12%',
    mutedForeground: '0 0% 55%',
    border: '0 0% 18%',
    glass: '0 0% 8%',
    glowPrimary: '0 0% 70%',
    glowSecondary: '0 0% 50%',
    surface: '0 0% 4%',
    surfaceHover: '0 0% 10%',
    sidebarBackground: '0 0% 2%',
    sidebarBorder: '0 0% 14%',
  },
  'solar': {
    primary: '45 100% 55%',
    secondary: '30 95% 50%',
    accent: '60 100% 50%',
    background: '40 25% 4%',
    foreground: '45 10% 95%',
    card: '40 20% 7%',
    cardForeground: '45 10% 95%',
    muted: '40 15% 13%',
    mutedForeground: '40 10% 55%',
    border: '40 15% 18%',
    glass: '40 18% 9%',
    glowPrimary: '45 100% 55%',
    glowSecondary: '30 95% 50%',
    surface: '40 20% 5%',
    surfaceHover: '40 20% 11%',
    sidebarBackground: '40 25% 3%',
    sidebarBorder: '40 13% 14%',
  },
  'caffeine': {
    primary: '30 90% 55%',
    secondary: '20 85% 50%',
    accent: '40 95% 60%',
    background: '28 25% 5%',
    foreground: '30 10% 95%',
    card: '28 20% 8%',
    cardForeground: '30 10% 95%',
    muted: '28 15% 14%',
    mutedForeground: '28 10% 55%',
    border: '28 15% 20%',
    glass: '28 18% 10%',
    glowPrimary: '30 90% 55%',
    glowSecondary: '20 85% 50%',
    surface: '28 20% 6%',
    surfaceHover: '28 20% 12%',
    sidebarBackground: '28 25% 4%',
    sidebarBorder: '28 13% 16%',
  },
  'brutalism-plus': {
    primary: '0 0% 100%',
    secondary: '280 100% 60%',
    accent: '160 100% 50%',
    background: '0 0% 5%',
    foreground: '0 0% 100%',
    card: '0 0% 8%',
    cardForeground: '0 0% 100%',
    muted: '0 0% 15%',
    mutedForeground: '0 0% 70%',
    border: '0 0% 100%',
    glass: '0 0% 8%',
    glowPrimary: '280 100% 60%',
    glowSecondary: '160 100% 50%',
    surface: '0 0% 6%',
    surfaceHover: '0 0% 12%',
    sidebarBackground: '0 0% 3%',
    sidebarBorder: '0 0% 100%',
    isBrutalism: true,
  },
  'dark-matter': {
    primary: '270 100% 70%',
    secondary: '290 90% 65%',
    accent: '250 95% 75%',
    background: '260 30% 2%',
    foreground: '270 10% 98%',
    card: '260 25% 4%',
    cardForeground: '270 10% 98%',
    muted: '260 20% 8%',
    mutedForeground: '260 12% 60%',
    border: '260 25% 12%',
    glass: '260 22% 5%',
    glowPrimary: '270 100% 70%',
    glowSecondary: '290 90% 65%',
    surface: '260 25% 3%',
    surfaceHover: '260 25% 7%',
    sidebarBackground: '260 30% 1%',
    sidebarBorder: '260 20% 10%',
  },
  'royal-gold': {
    primary: '45 100% 60%',
    secondary: '220 50% 20%',
    accent: '45 80% 50%',
    background: '220 40% 4%',
    foreground: '45 10% 98%',
    card: '220 35% 7%',
    cardForeground: '45 10% 98%',
    muted: '220 30% 12%',
    mutedForeground: '220 10% 65%',
    border: '45 50% 30%',
    glass: '220 35% 10%',
    glowPrimary: '45 100% 60%',
    glowSecondary: '220 50% 40%',
    surface: '220 35% 5%',
    surfaceHover: '220 35% 10%',
    sidebarBackground: '220 40% 3%',
    sidebarBorder: '45 50% 25%',
  },
  'emerald-forest': {
    primary: '160 100% 45%',
    secondary: '140 50% 25%',
    accent: '150 70% 50%',
    background: '145 30% 4%',
    foreground: '160 10% 95%',
    card: '145 25% 7%',
    cardForeground: '160 10% 95%',
    muted: '145 20% 12%',
    mutedForeground: '145 10% 60%',
    border: '160 50% 25%',
    glass: '145 25% 10%',
    glowPrimary: '160 100% 45%',
    glowSecondary: '140 50% 40%',
    surface: '145 25% 5%',
    surfaceHover: '145 25% 10%',
    sidebarBackground: '145 30% 3%',
    sidebarBorder: '160 40% 20%',
  },
  'blood-moon': {
    primary: '0 100% 60%',
    secondary: '0 50% 20%',
    accent: '0 80% 40%',
    background: '0 10% 3%',
    foreground: '0 5% 98%',
    card: '0 10% 6%',
    cardForeground: '0 5% 98%',
    muted: '0 10% 12%',
    mutedForeground: '0 5% 65%',
    border: '0 80% 30%',
    glass: '0 10% 8%',
    glowPrimary: '0 100% 60%',
    glowSecondary: '0 60% 40%',
    surface: '0 10% 4%',
    surfaceHover: '0 10% 10%',
    sidebarBackground: '0 10% 2%',
    sidebarBorder: '0 60% 20%',
  },
  'frostbite': {
    primary: '190 100% 60%',
    secondary: '210 50% 20%',
    accent: '190 80% 70%',
    background: '210 40% 4%',
    foreground: '190 10% 98%',
    card: '210 35% 8%',
    cardForeground: '190 10% 98%',
    muted: '210 30% 14%',
    mutedForeground: '210 10% 65%',
    border: '190 80% 40%',
    glass: '210 35% 12%',
    glowPrimary: '190 100% 60%',
    glowSecondary: '210 60% 50%',
    surface: '210 35% 6%',
    surfaceHover: '210 35% 12%',
    sidebarBackground: '210 40% 3%',
    sidebarBorder: '190 60% 30%',
  },
  'synthwave': {
    primary: '320 100% 60%',
    secondary: '280 80% 30%',
    accent: '190 100% 50%',
    background: '260 40% 4%',
    foreground: '320 10% 98%',
    card: '260 30% 8%',
    cardForeground: '320 10% 98%',
    muted: '260 20% 15%',
    mutedForeground: '260 10% 65%',
    border: '320 100% 50%',
    glass: '260 30% 12%',
    glowPrimary: '320 100% 60%',
    glowSecondary: '280 100% 50%',
    surface: '260 30% 6%',
    surfaceHover: '260 30% 12%',
    sidebarBackground: '260 40% 3%',
    sidebarBorder: '320 80% 40%',
  },
  'vampire': {
    primary: '340 100% 50%',
    secondary: '250 40% 15%',
    accent: '350 100% 40%',
    background: '250 50% 3%',
    foreground: '340 10% 95%',
    card: '250 40% 6%',
    cardForeground: '340 10% 95%',
    muted: '250 30% 12%',
    mutedForeground: '250 10% 60%',
    border: '340 80% 30%',
    glass: '250 40% 8%',
    glowPrimary: '340 100% 50%',
    glowSecondary: '250 60% 30%',
    surface: '250 40% 4%',
    surfaceHover: '250 40% 10%',
    sidebarBackground: '250 50% 2%',
    sidebarBorder: '340 60% 20%',
  },
  'matcha-light': {
    primary: '140 50% 40%',
    primaryForeground: '0 0% 100%',
    secondary: '60 30% 90%',
    secondaryForeground: '140 50% 10%',
    accent: '140 60% 35%',
    background: '60 30% 97%',
    foreground: '140 20% 15%',
    card: '60 30% 100%',
    cardForeground: '140 20% 15%',
    muted: '140 10% 92%',
    mutedForeground: '140 10% 45%',
    border: '140 20% 85%',
    glass: '60 30% 98%',
    glowPrimary: '140 50% 40%',
    glowSecondary: '60 40% 80%',
    surface: '140 10% 95%',
    surfaceHover: '140 10% 90%',
    sidebarBackground: '60 30% 96%',
    sidebarBorder: '140 20% 88%',
    isLight: true,
  },
  'ocean-breeze': {
    primary: '200 80% 50%',
    primaryForeground: '0 0% 100%',
    secondary: '190 30% 90%',
    secondaryForeground: '200 30% 15%',
    accent: '210 90% 45%',
    background: '190 30% 98%',
    foreground: '200 30% 15%',
    card: '190 30% 100%',
    cardForeground: '200 30% 15%',
    muted: '200 10% 92%',
    mutedForeground: '200 15% 45%',
    border: '200 20% 88%',
    glass: '190 30% 98%',
    glowPrimary: '200 80% 50%',
    glowSecondary: '190 40% 80%',
    surface: '200 10% 95%',
    surfaceHover: '200 10% 90%',
    sidebarBackground: '190 30% 96%',
    sidebarBorder: '200 20% 90%',
    isLight: true,
  },
  'brutalist-concrete': {
    primary: '0 0% 5%',
    primaryForeground: '0 0% 98%',
    secondary: '0 0% 95%',
    secondaryForeground: '0 0% 8%',
    accent: '0 100% 47%',
    background: '0 0% 94%',
    foreground: '0 0% 4%',
    card: '0 0% 100%',
    cardForeground: '0 0% 4%',
    muted: '0 0% 88%',
    mutedForeground: '0 0% 18%',
    border: '0 0% 4%',
    glass: '0 0% 100%',
    glowPrimary: '0 0% 4%',
    glowSecondary: '0 100% 47%',
    surface: '0 0% 92%',
    surfaceHover: '0 0% 86%',
    sidebarBackground: '0 0% 96%',
    sidebarBorder: '0 0% 4%',
    isLight: true,
    isBrutalism: true,
    highContrast: true,
  },
  'dark-lite': {
    primary: '215 85% 65%', primaryForeground: '220 20% 8%',
    secondary: '220 12% 18%', secondaryForeground: '220 15% 94%',
    accent: '220 12% 22%', background: '220 15% 8%', foreground: '220 15% 94%',
    card: '220 14% 12%', cardForeground: '220 15% 94%',
    muted: '220 12% 17%', mutedForeground: '220 10% 72%', border: '220 10% 28%',
    glass: '220 14% 12%', glowPrimary: '220 15% 8%', glowSecondary: '220 15% 8%',
    surface: '220 14% 12%', surfaceHover: '220 12% 18%', sidebarBackground: '220 15% 10%', sidebarBorder: '220 10% 28%', isUltraLite: true,
  },
  'ultra-lite': {
    primary: '0 0% 0%',
    primaryForeground: '0 0% 100%',
    secondary: '0 0% 90%',
    secondaryForeground: '0 0% 0%',
    accent: '0 0% 10%',
    background: '0 0% 100%',
    foreground: '0 0% 0%',
    card: '0 0% 100%',
    cardForeground: '0 0% 0%',
    muted: '0 0% 96%',
    mutedForeground: '0 0% 40%',
    border: '0 0% 85%',
    glass: '0 0% 100%',
    glowPrimary: '0 0% 0%',
    glowSecondary: '0 0% 80%',
    surface: '0 0% 98%',
    surfaceHover: '0 0% 95%',
    sidebarBackground: '0 0% 100%',
    sidebarBorder: '0 0% 90%',
    isUltraLite: true,
    isLight: true,
  },
  'lite': {
    primary: '220 90% 50%',
    primaryForeground: '0 0% 100%',
    secondary: '220 10% 90%',
    secondaryForeground: '220 90% 10%',
    accent: '220 90% 40%',
    background: '0 0% 100%',
    foreground: '220 15% 10%',
    card: '0 0% 100%',
    cardForeground: '220 15% 10%',
    muted: '220 10% 96%',
    mutedForeground: '220 10% 45%',
    border: '220 10% 90%',
    glass: '0 0% 100%',
    glowPrimary: '220 90% 50%',
    glowSecondary: '220 10% 80%',
    surface: '220 10% 98%',
    surfaceHover: '220 10% 95%',
    sidebarBackground: '220 15% 98%',
    sidebarBorder: '220 10% 92%',
    isLight: true,
  },
  'amoled': {
    primary: '239 84% 67%',
    primaryForeground: '0 0% 100%',
    secondary: '270 60% 50%',
    secondaryForeground: '0 0% 100%',
    accent: '280 70% 55%',
    background: '0 0% 0%',
    foreground: '0 0% 98%',
    card: '0 0% 3%',
    cardForeground: '0 0% 98%',
    muted: '0 0% 6%',
    mutedForeground: '0 0% 55%',
    border: '0 0% 10%',
    glass: '0 0% 4%',
    glowPrimary: '239 84% 67%',
    glowSecondary: '270 60% 50%',
    surface: '0 0% 2%',
    surfaceHover: '0 0% 7%',
    sidebarBackground: '0 0% 0%',
    sidebarBorder: '0 0% 8%',
  },
};

export const THEME_INFO: Record<Theme, { name: string; gradient: string; description: string; icon: string; category: 'dark' | 'light' }> = {
  'midnight': {
    name: 'Midnight',
    gradient: 'from-indigo-600 via-purple-600 to-violet-700',
    get description() { return uiI18n.t('app.classic_dark_with_indigo_violet_accents_12a76d87'); },
    icon: '🌙',
    category: 'dark',
  },
  'cherry-blossom': {
    name: 'Cherry Blossom',
    gradient: 'from-pink-500 via-rose-500 to-fuchsia-600',
    get description() { return uiI18n.t('app.soft_pink_tones_inspired_by_sakura_b7eb5a71'); },
    icon: '🌸',
    category: 'dark',
  },
  'neon-tokyo': {
    name: 'Neon Tokyo',
    gradient: 'from-purple-500 via-fuchsia-500 to-cyan-400',
    get description() { return uiI18n.t('app.electric_neon_cyberpunk_vibes_5026a9eb'); },
    icon: '🗼',
    category: 'dark',
  },
  'aurora-borealis': {
    name: 'Aurora Borealis',
    gradient: 'from-emerald-500 via-teal-500 to-violet-500',
    get description() { return uiI18n.t('app.northern_lights_dancing_colors_99e83655'); },
    icon: '✨',
    category: 'dark',
  },
  'deep-ocean': {
    name: 'Deep Ocean',
    gradient: 'from-cyan-500 via-blue-600 to-indigo-700',
    get description() { return uiI18n.t('app.mysterious_underwater_depths_84497124'); },
    icon: '🌊',
    category: 'dark',
  },
  'cyberpunk': {
    name: 'Cyberpunk',
    gradient: 'from-yellow-400 via-lime-500 to-cyan-500',
    get description() { return uiI18n.t('app.futuristic_neon_yellow_cyan_ad2c1fe1'); },
    icon: '🤖',
    category: 'dark',
  },
  'zen-garden': {
    name: 'Zen Garden',
    gradient: 'from-green-600 via-emerald-600 to-teal-600',
    get description() { return uiI18n.t('app.calm_forest_tranquility_bafdd207'); },
    icon: '🌿',
    category: 'dark',
  },
  'light-minimal': {
    name: 'Light Minimal',
    gradient: 'from-blue-400 via-indigo-400 to-purple-400',
    get description() { return uiI18n.t('app.clean_bright_modern_design_4552d5ff'); },
    icon: '☀️',
    category: 'light',
  },
  'light-sakura': {
    name: 'Light Sakura',
    gradient: 'from-pink-300 via-rose-300 to-pink-400',
    get description() { return uiI18n.t('app.soft_pink_cherry_blossom_theme_91ce4bd9'); },
    icon: '🌷',
    category: 'light',
  },
  'brutalism-dark': {
    name: 'Brutalist Dark',
    gradient: 'from-gray-900 via-yellow-400 to-red-500',
    get description() { return uiI18n.t('app.dark_brutalist_aesthetic_95b96e7f'); },
    icon: '⬛',
    category: 'dark',
  },
  'obsidian': {
    name: 'Obsidian',
    gradient: 'from-gray-600 via-gray-700 to-gray-800',
    get description() { return uiI18n.t('app.pure_dark_monochrome_elegance_0f3e9b6b'); },
    icon: '🖤',
    category: 'dark',
  },
  'solar': {
    name: 'Solar',
    gradient: 'from-yellow-400 via-amber-500 to-orange-500',
    get description() { return uiI18n.t('app.bright_solar_energy_de2f165f'); },
    icon: '☀️',
    category: 'dark',
  },
  'caffeine': {
    name: 'Caffeine',
    gradient: 'from-orange-500 via-amber-600 to-yellow-600',
    get description() { return uiI18n.t('app.energizing_coffee_inspired_tones_f16b014d'); },
    icon: '☕',
    category: 'dark',
  },
  'brutalism-plus': {
    name: 'Brutalist Plus',
    gradient: 'from-gray-100 via-purple-500 to-teal-400',
    get description() { return uiI18n.t('app.enhanced_brutalist_with_vibrant_accents_213e8c48'); },
    icon: '⬜',
    category: 'dark',
  },
  'dark-matter': {
    name: 'Dark Matter',
    gradient: 'from-purple-600 via-violet-700 to-indigo-800',
    get description() { return uiI18n.t('app.deep_space_with_cosmic_purple_glow_4d12e375'); },
    icon: '🌌',
    category: 'dark',
  },
  'royal-gold': {
    name: 'Royal Gold',
    gradient: 'from-amber-400 via-amber-600 to-yellow-700',
    get description() { return uiI18n.t('app.premium_charcoal_gold_elegance_6d6366bd'); },
    icon: '👑',
    category: 'dark',
  },
  'emerald-forest': {
    name: 'Emerald Forest',
    gradient: 'from-emerald-500 via-green-600 to-emerald-800',
    get description() { return uiI18n.t('app.deep_forest_with_luminous_emerald_1d45a328'); },
    icon: '🌲',
    category: 'dark',
  },
  'blood-moon': {
    name: 'Blood Moon',
    gradient: 'from-red-600 via-rose-700 to-red-900',
    get description() { return uiI18n.t('app.dark_gothic_crimson_black_59939fee'); },
    icon: '🩸',
    category: 'dark',
  },
  'frostbite': {
    name: 'Frostbite',
    gradient: 'from-sky-400 via-blue-500 to-indigo-600',
    get description() { return uiI18n.t('app.icy_blue_crystalline_white_eb6c391d'); },
    icon: '❄️',
    category: 'dark',
  },
  'synthwave': {
    name: 'Synthwave',
    gradient: 'from-fuchsia-500 via-purple-600 to-cyan-500',
    get description() { return uiI18n.t('app.retro_80s_neon_purple_pink_d3c54546'); },
    icon: '📼',
    category: 'dark',
  },
  'vampire': {
    name: 'Vampire',
    gradient: 'from-red-700 via-red-800 to-slate-900',
    get description() { return uiI18n.t('app.bite_sized_dark_red_midnight_beddfcda'); },
    icon: '🧛',
    category: 'dark',
  },
  'matcha-light': {
    name: 'Matcha Light',
    gradient: 'from-green-200 via-emerald-300 to-green-400',
    get description() { return uiI18n.t('app.creamy_green_tea_inspired_light_theme_f6a87a86'); },
    icon: '🍵',
    category: 'light',
  },
  'ocean-breeze': {
    name: 'Ocean Breeze',
    gradient: 'from-blue-200 via-cyan-300 to-sky-400',
    get description() { return uiI18n.t('app.fresh_light_blue_airy_whites_654ddc88'); },
    icon: '🌬️',
    category: 'light',
  },
  'brutalist-concrete': {
    name: 'Brutalist Concrete',
    gradient: 'from-zinc-900 via-zinc-100 to-red-600',
    get description() { return uiI18n.t('app.raw_geometric_blocks_hard_borders_and_stark_cont_ef573537'); },
    icon: '🧱',
    category: 'light',
  },
  'dark-lite': {
    name: 'Dark Lite', gradient: 'from-slate-950 via-slate-900 to-gray-950',
    get description() { return uiI18n.t('feedback.darkLiteDescription'); }, icon: '🌘', category: 'dark',
  },
  'ultra-lite': {
    name: 'Ultra Lite',
    gradient: 'from-gray-900 via-gray-800 to-black',
    get description() { return uiI18n.t('app.minimal_resources_no_animations_max_speed_dc134a8d'); },
    icon: '⚡',
    category: 'light',
  },
  'lite': {
    name: 'Lite',
    gradient: 'from-blue-100 via-sky-100 to-indigo-50',
    get description() { return uiI18n.t('app.ultra_lightweight_theme_for_maximum_battery_savi_09c709b5'); },
    icon: '🔋',
    category: 'light',
  },
  'amoled': {
    name: 'AMOLED',
    gradient: 'from-black via-gray-950 to-black',
    get description() { return uiI18n.t('app.pure_black_background_saves_battery_on_oled_amol_9bc075a9'); },
    icon: '🖤',
    category: 'dark',
  },
};
const THEME_KEY = 'anime-theme';

/**
 * A theme id may be a built-in `Theme` OR an extension-contributed theme's
 * namespaced id (e.g. `aurora:midnight-aurora`). Persisted values and state
 * both use this widened type so custom themes survive reloads.
 */
export type ThemeId = Theme | string;

type ThemeInfoEntry = { name: string; gradient: string; description: string; icon: string; category: 'dark' | 'light' };

/** Strip a leading `--` and drop non-string values from an extension color map. */
function normalizeRegisteredColors(colors: Record<string, string>): ThemeColors {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) {
    if (typeof v !== 'string') continue;
    out[k.startsWith('--') ? k.slice(2) : k] = v;
  }
  return out as unknown as ThemeColors;
}

/** True if `id` names a built-in theme or a currently-registered extension theme. */
function isKnownTheme(id: string | null | undefined): boolean {
  if (!id) return false;
  if (Object.prototype.hasOwnProperty.call(THEME_COLORS, id)) return true;
  if (Object.prototype.hasOwnProperty.call(getCustomThemeDefinitions(), id) && getCustomThemeDefinitions()[id]) return true;
  return extensionRegistry.getThemes().some((t) => t.id === id);
}
export function resolveThemeId(id: ThemeId): ThemeId { return isKnownTheme(id) ? id : 'cherry-blossom'; }

/**
 * Resolve any theme id to a color palette. Built-ins win; then a registered
 * extension theme; else fall back to the default so `applyTheme` never no-ops
 * on an id whose extension has not registered yet.
 */
export function resolveColors(id: ThemeId, customThemes?: CustomThemeDefinitions): ThemeColors {
  return resolveBaseColors(id, customThemes ?? getCustomThemeDefinitions(), new Set(), customThemes === undefined);
}
function resolveBaseColors(id: ThemeId, definitions: CustomThemeDefinitions, visited: Set<string>, committed: boolean): ThemeColors {
  if (visited.has(id)) return THEME_COLORS['cherry-blossom'];
  const custom = Object.prototype.hasOwnProperty.call(definitions, id) ? definitions[id] : undefined;
  if (custom && typeof custom.baseTheme === 'string') {
    visited.add(id);
    const colors = resolveBaseColors(custom.baseTheme, definitions, visited, committed);
    return committed ? mergeThemePalette(colors, getCustomThemeOverrides()[id]) : colors;
  }
  const builtin = Object.prototype.hasOwnProperty.call(THEME_COLORS, id) ? (THEME_COLORS as Record<string, ThemeColors>)[id as string] : undefined;
  if (builtin) return builtin;
  const reg = extensionRegistry.getThemes().find((t) => t.id === id);
  if (reg) {
    const norm = normalizeRegisteredColors(reg.colors);
    if (reg.info?.category === 'light') (norm as ThemeColors).isLight = true;
    return norm;
  }
  return THEME_COLORS['cherry-blossom'];
}

/** Map a registered theme's metadata into the built-in `THEME_INFO` shape. */
function registeredInfoEntry(t: RegisteredTheme): ThemeInfoEntry {
  return {
    name: t.name || t.info?.label || t.id,
    gradient: t.info?.gradient || 'from-slate-500 via-slate-600 to-slate-700',
    description: t.info?.description || 'Extension theme',
    icon: t.info?.icon || '🧩',
    category: t.info?.category || 'dark',
  };
}

const SELECTION_KEY = 'tatakai-theme-selection';
type ThemeSnapshot = { selection: ResolvedThemeSelection; reduceMotion: boolean; highContrast: boolean };
function readThemeSnapshot(): ThemeSnapshot {
  const guest = readGuestSettingsFromCookie().theme || {};
  let selected: Partial<ThemeSelection> = guest;
  const read = (key: string) => { try { return typeof window !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; } };
  try { selected = JSON.parse(read(SELECTION_KEY) || 'null') || { ...guest, theme: read(THEME_KEY) || guest.theme }; } catch { /* fall back to guest */ }
  return {
    selection: normalizeThemeSelection(selected),
    reduceMotion: read('tatakai_reduce_motion') === null ? guest.reduceMotion === true : read('tatakai_reduce_motion') === 'true',
    highContrast: read('tatakai_high_contrast') === null ? guest.highContrast === true : read('tatakai_high_contrast') === 'true',
  };
}
let themeSnapshot = readThemeSnapshot();
const themeListeners = new Set<() => void>();
let extensionRevision = 0;
const extensionListeners = new Set<() => void>();
extensionRegistry.subscribe(() => { extensionRevision++; for (const listener of extensionListeners) listener(); });
function subscribeExtensions(listener: () => void) { extensionListeners.add(listener); return () => { extensionListeners.delete(listener); }; }
export function getCommittedThemeSelection() { return themeSnapshot.selection; }
function publishThemeSnapshot(next: ThemeSnapshot) {
  if (JSON.stringify(next) === JSON.stringify(themeSnapshot)) return;
  themeSnapshot = next;
  for (const listener of themeListeners) listener();
}
function subscribeTheme(listener: () => void) { themeListeners.add(listener); return () => { themeListeners.delete(listener); }; }
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if ([THEME_KEY, SELECTION_KEY, 'tatakai_reduce_motion', 'tatakai_high_contrast'].includes(event.key || '')) publishThemeSnapshot(readThemeSnapshot());
});
function storeThemeSnapshot(next: ThemeSnapshot) {
  const themeSettings = { ...next.selection, reduceMotion: next.reduceMotion, highContrast: next.highContrast };
  try {
    localStorage.setItem(THEME_KEY, next.selection.theme);
    localStorage.setItem(SELECTION_KEY, JSON.stringify(next.selection));
    localStorage.setItem('tatakai_reduce_motion', String(next.reduceMotion));
    localStorage.setItem('tatakai_high_contrast', String(next.highContrast));
  } catch { /* preferences remain available for this session */ }
  writeGuestSettingsCookie({ theme: themeSettings });
  publishThemeSnapshot(next);
}
function readSystemDark() { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches; }
function subscribeSystemDark(listener: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  if (media.addEventListener) { media.addEventListener('change', listener); return () => media.removeEventListener('change', listener); }
  media.addListener(listener); return () => media.removeListener(listener);
}
export function useSystemDark() { return useSyncExternalStore(subscribeSystemDark, readSystemDark, () => false); }

/** Custom palettes use the same HSL channel format as built-in palettes. */
export function resolveThemePalette(id: ThemeId, palette?: Record<string, string> | null, customThemes?: CustomThemeDefinitions): ThemeColors {
  return mergeThemePalette(resolveColors(id, customThemes), palette);
}
function mergeThemePalette(base: ThemeColors, palette?: Record<string, string> | null): ThemeColors {
  if (!palette) return base;
  const colors = { ...base };
  for (const [rawKey, value] of Object.entries(palette)) {
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (typeof (base as unknown as Record<string, unknown>)[key] !== 'string' || typeof value !== 'string') continue;
    if (/^\s*-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%\s*$/.test(value)) (colors as unknown as Record<string, string>)[key] = value.trim();
  }
  return colors;
}

/** The root runtime owns DOM writes; consumers only subscribe to committed state. */
export function applyThemePalette(themeName: ThemeId, colors: ThemeColors, reduceMotion: boolean, highContrast: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, value]) => {
    if (typeof value === 'string') root.style.setProperty(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value);
  });
  root.style.setProperty('--primary-foreground', colors.primaryForeground || readableMutedColor(colors.background, [colors.primary]));
  root.style.setProperty('--secondary-foreground', colors.secondaryForeground || readableMutedColor(colors.background, [colors.secondary]));
  root.style.setProperty('--ring', colors.primary);
  root.style.setProperty('--input', colors.border);
  root.style.setProperty('--popover', colors.card);
  root.style.setProperty('--popover-foreground', colors.cardForeground || colors.foreground);
  root.style.setProperty('--accent-foreground', readableMutedColor(colors.accentForeground || colors.foreground, [colors.accent]));
  root.style.colorScheme = colors.isLight ? 'light' : 'dark';
  if (colors.mutedForeground) root.style.setProperty('--muted-foreground', readableMutedColor(colors.mutedForeground, [colors.background, colors.card, colors.muted, colors.surface]));
  for (const [name, enabled] of Object.entries({ 'light-theme': colors.isLight, 'dark-theme': !colors.isLight, 'ultra-lite-theme': colors.isUltraLite, 'brutalism-theme': colors.isBrutalism, 'reduce-motion': reduceMotion, 'high-contrast': highContrast })) document.body.classList.toggle(name, !!enabled);
  document.body.setAttribute('data-theme', themeName);
}
export function useTheme() {
  useUiTranslation();
  const snapshot = useSyncExternalStore(subscribeTheme, () => themeSnapshot, () => themeSnapshot);
  const systemDark = useSystemDark();
  const themesVersion = useSyncExternalStore(subscribeExtensions, () => extensionRevision, () => 0);
  const custom = useSyncExternalStore(subscribeCustomThemes, getCustomThemeSnapshot, getCustomThemeSnapshot);
  const setSelection = useCallback((selection: ThemeSelection) => storeThemeSnapshot({ ...themeSnapshot, selection: normalizeThemeSelection(selection, themeSnapshot.selection) }), []);
  const setTheme = useCallback((theme: ThemeId) => setSelection({ ...themeSnapshot.selection, theme, mode: 'manual' }), [setSelection]);
  const setReduceMotion = useCallback((reduceMotion: boolean) => storeThemeSnapshot({ ...themeSnapshot, reduceMotion }), []);
  const setHighContrast = useCallback((highContrast: boolean) => storeThemeSnapshot({ ...themeSnapshot, highContrast }), []);
  const theme = resolveThemeId(resolveThemeSelection(snapshot.selection, systemDark));
  const themes = useMemo<ThemeId[]>(() => [...Object.keys(THEME_COLORS), ...extensionRegistry.getThemes().map(t => t.id), ...Object.keys(custom.definitions).filter(id => !!custom.definitions[id])], [themesVersion, custom]);
  const themeInfo = useMemo<Record<string, ThemeInfoEntry>>(() => {
    const merged = { ...THEME_INFO };
    for (const t of extensionRegistry.getThemes()) merged[t.id] = registeredInfoEntry(t);
    for (const [id, definition] of Object.entries(custom.definitions)) if (definition) {
      const colors = resolveColors(id);
      merged[id] = { name: definition.name, description: '', icon: '🎨', category: colors.isLight ? 'light' : 'dark', gradient: `linear-gradient(135deg,hsl(${colors.primary}),hsl(${colors.secondary}))` };
    }
    return merged;
  }, [themesVersion, custom]);
  return { theme, selection: snapshot.selection, setSelection, setTheme, reduceMotion: snapshot.reduceMotion, setReduceMotion, highContrast: snapshot.highContrast, setHighContrast, themes, themeInfo, isLightTheme: resolveColors(theme).isLight ?? false, isUltraLite: resolveColors(theme).isUltraLite ?? false };
}
