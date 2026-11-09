import type { ThemeSelection } from './customization';

export type ResolvedThemeSelection = Required<ThemeSelection>;
export const DEFAULT_THEME_SELECTION: ResolvedThemeSelection = Object.freeze({
  mode: 'manual', theme: 'cherry-blossom', lightTheme: 'light-minimal', darkTheme: 'cherry-blossom',
});

export function normalizeThemeSelection(value: Partial<ThemeSelection> | null | undefined, fallback = DEFAULT_THEME_SELECTION): ResolvedThemeSelection {
  const validId = (id: unknown, defaultId: string) => typeof id === 'string' && id.trim() ? id.trim() : defaultId;
  return {
    mode: value?.mode === 'system' ? 'system' : 'manual',
    theme: validId(value?.theme, fallback.theme),
    lightTheme: validId(value?.lightTheme, fallback.lightTheme),
    darkTheme: validId(value?.darkTheme, fallback.darkTheme),
  };
}

export function resolveThemeSelection(selection: ThemeSelection, systemDark: boolean): string {
  const normalized = normalizeThemeSelection(selection);
  return normalized.mode === 'system' ? (systemDark ? normalized.darkTheme : normalized.lightTheme) : normalized.theme;
}
