import { THEME_COLORS, THEME_INFO, type Theme } from "@/hooks/ui/useTheme";
import type { CSSProperties } from "react";

export const DEFAULT_TV_THEME = "cherry-blossom";
export const TV_THEMES = ["cherry-blossom", "midnight", "neon-tokyo", "deep-ocean", "blood-moon", "amoled"] as const satisfies readonly Theme[];
export type TVTheme = typeof TV_THEMES[number];
export function resolveTVTheme(value: unknown): TVTheme {
  return TV_THEMES.includes(value as TVTheme) ? value as TVTheme : DEFAULT_TV_THEME;
}
export function tvThemeInfo(theme: TVTheme) {
  return { ...THEME_INFO[theme], colors: THEME_COLORS[theme] };
}
function rgbChannels(hsl: string): string {
  const [h, s, l] = hsl.split(/\s+/).map(Number.parseFloat);
  const saturation = s / 100, lightness = l / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  return [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  }).join(',');
}
/** Scope TV colors to its shell, leaving the account's desktop theme untouched. */
export function tvThemeStyle(theme: TVTheme): CSSProperties {
  const colors = THEME_COLORS[theme];
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === "string") tokens[`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`] = value;
  }
  return {
    ...tokens,
    '--ring': colors.primary,
    '--tv-accent': rgbChannels(colors.primary),
    '--tv-glass': rgbChannels(colors.card),
    '--tv-ink': rgbChannels(colors.background),
    backgroundColor: `hsl(${colors.background})`,
  } as CSSProperties;
}
