import type { BackgroundConfig, ThemeCustomization } from './customization';

/** A dedicated background wins; an explicit palette canvas color applies globally too. */
export function appThemeBackground(theme: ThemeCustomization, resolvedBackground: string): BackgroundConfig | undefined {
  if (theme.background) return theme.background;
  const color = theme.palette?.background;
  if (typeof color === 'string' && /^\s*-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%\s*$/.test(color)) return { type: 'solid', color: `hsl(${resolvedBackground})` };
  return undefined;
}
