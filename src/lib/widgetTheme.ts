import type { CSSProperties } from 'react';
import { readableMutedColor } from './themeContrast';

type Color = [number, number, number];
type Paint = [number, number, number, number];
const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, value));

function paint(value: unknown): Paint | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return [0, 0, 0, 0];
  if (text === 'white') return [255, 255, 255, 1];
  if (text === 'black') return [0, 0, 0, 1];
  const hex = text.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    const digits = hex[1].length < 5 ? [...hex[1]].map(digit => digit + digit).join('') : hex[1];
    return [...[0, 2, 4].map(index => parseInt(digits.slice(index, index + 2), 16)), digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1] as Paint;
  }
  const functional = text.match(/^(rgb|rgba|hsl|hsla|color)\(([^)]+)\)$/);
  const channelsOnly = text.match(/^[\d.+-]+\s+[\d.]+%\s+[\d.]+%$/);
  if (!functional && !channelsOnly) return null;
  const type = functional?.[1] ?? 'hsl';
  const parts = (functional?.[2] ?? text).replace(/^srgb\s+/, '').split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const values = parts.map(part => parseFloat(part));
  if (!values.every(Number.isFinite)) return null;
  const alpha = parts[3] ? clamp(values[3] / (parts[3].endsWith('%') ? 100 : 1)) : 1;
  if (type.startsWith('hsl')) {
    if (!parts[1].endsWith('%') || !parts[2].endsWith('%')) return null;
    const unit = parts[0].replace(/^[\d.+-]+/, '');
    const h = ((values[0] * (unit === 'turn' ? 360 : unit === 'rad' ? 180 / Math.PI : unit === 'grad' ? .9 : 1)) % 360 + 360) % 360;
    const s = clamp(values[1] / 100), l = clamp(values[2] / 100), a = s * Math.min(l, 1 - l);
    const channel = (n: number) => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [channel(0), channel(8), channel(4), alpha];
  }
  if (type === 'color' && !functional?.[2].startsWith('srgb ')) return null;
  return [...values.slice(0, 3).map((number, index) => clamp(number * (parts[index].endsWith('%') ? 2.55 : type === 'color' ? 255 : 1), 255)), alpha] as Paint;
}

function composite(top: Paint, bottom: Color): Color {
  return top.slice(0, 3).map((value, index) => value * top[3] + bottom[index] * (1 - top[3])) as Color;
}

function channels(color: Color): string {
  const [r, g, b] = color.map(value => value / 255);
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  const lightness = (high + low) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  let hue = !delta ? 0 : high === r ? ((g - b) / delta) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return `${hue.toFixed(1)} ${(saturation * 100).toFixed(1)}% ${(lightness * 100).toFixed(1)}%`;
}

const mix = (a: Color, b: Color, amount: number): Color => a.map((value, index) => value * amount + b[index] * (1 - amount)) as Color;

export interface WidgetColors { background: string; foreground: string; border?: string; primary?: string; fontFamily?: string }

/** Only parsed colors cross the iframe boundary; author CSS never reaches the parent. */
export function widgetThemeFromColors(colors: WidgetColors): CSSProperties {
  const back = paint(colors?.background), front = paint(colors?.foreground);
  if (!back || !front || !back[3]) return {};
  const background = composite(back, [23, 23, 25]);
  const foreground = composite(front, background);
  const bg = channels(background);
  const fg = readableMutedColor(channels(foreground), [bg]);
  const muted = readableMutedColor(channels(mix(foreground, background, .7)), [bg]);
  const borderPaint = paint(colors.border);
  const border = channels(borderPaint?.[3] ? composite(borderPaint, background) : mix(foreground, background, .18));
  const primaryPaint = paint(colors.primary);
  const primary = primaryPaint?.[3] ? composite(primaryPaint, background) : null;
  return {
    '--background': bg, '--card': bg, '--card-foreground': fg,
    '--popover': bg, '--popover-foreground': fg, '--foreground': fg,
    '--muted': channels(mix(foreground, background, .1)), '--muted-foreground': muted,
    '--secondary': channels(mix(foreground, background, .12)), '--secondary-foreground': fg,
    '--border': border, '--input': border,
    ...(primary ? { '--primary': channels(primary), '--primary-foreground': readableMutedColor(fg, [channels(primary)]), '--ring': channels(primary) } : {}),
    ...(typeof colors.fontFamily === 'string' && colors.fontFamily.length <= 256 ? { fontFamily: colors.fontFamily } : {}),
    colorScheme: background.reduce((sum, value) => sum + value, 0) > 420 ? 'light' : 'dark',
  } as CSSProperties;
}

/** Capture the actual themed surface before rendering its widget in a body portal. */
export function widgetThemeFromElement(element: Element): CSSProperties {
  const origin = getComputedStyle(element);
  const themed = paint(origin.getPropertyValue('--pt-panel'));
  const layers: Paint[] = [];
  if (themed?.[3] === 1) layers.push(themed);
  else {
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const color = paint(getComputedStyle(parent).backgroundColor);
      if (color?.[3]) layers.push(color);
      if (color?.[3] === 1) break;
    }
  }
  const background = layers.reverse().reduce<Color>((color, layer) => composite(layer, color), [23, 23, 25]);
  return widgetThemeFromColors({ background: `rgb(${background.join(',')})`, foreground: origin.getPropertyValue('--pt-ink').trim() || origin.color,
    border: origin.getPropertyValue('--pt-border').trim(), primary: origin.getPropertyValue('--pt-primary').trim() || origin.getPropertyValue('--primary').trim(), fontFamily: origin.fontFamily });
}
