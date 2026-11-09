import { readableMutedColor } from './themeContrast';
export type RGB = [number, number, number];
export function colorRGB(value?: string): RGB | null {
  if (!value) return null;
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) { const full = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]; return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as RGB; }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number) as RGB;
  const channels = value.replace(/^hsla?\(/i, '').replace(/\)$/, '').match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!channels) return null;
  const [h, s0, l0] = channels.slice(1).map(Number), s = s0 / 100, l = l0 / 100, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }) as RGB;
}
export function mixRGB(top: RGB, bottom: RGB, alpha: number): RGB { return top.map((v, i) => v * alpha + bottom[i] * (1 - alpha)) as RGB; }
export function luminance(rgb: RGB): number { const v = rgb.map(channel => { const s = channel / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; }
export function contrastRGB(a: RGB, b: RGB): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function rgbHSL(rgb: RGB): string {
  const [r, g, b] = rgb.map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return `${h.toFixed(2)} ${(d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)) * 100).toFixed(2)}% ${(l * 100).toFixed(2)}%`;
}
export function adaptiveCanvasColors(surface: RGB, palette: { foreground: string; mutedForeground: string; primary: string }) {
  const black: RGB = [0, 0, 0], white: RGB = [255, 255, 255], original = colorRGB(palette.foreground) || white;
  const foreground = contrastRGB(original, surface) >= 4.5 ? original : contrastRGB(black, surface) >= contrastRGB(white, surface) ? black : white;
  const background = rgbHSL(surface);
  return { foreground: rgbHSL(foreground), muted: readableMutedColor(palette.mutedForeground, [background]), primary: readableMutedColor(palette.primary, [background]), amber: readableMutedColor('40 95% 50%', [background]), darkText: luminance(foreground) < .2 };
}
