import type { CSSProperties } from 'react';
import type { BackgroundConfig } from './customization';

export function safeAppearanceColor(value?: string, fallback = 'transparent'): string {
  if (!value || value.length > 200 || /[;{}]|url\(|expression\(/i.test(value)) return fallback;
  return /^(#[\da-f]{3,8}|(?:rgb|hsl)a?\([^;{}]+\)|var\(--[a-z\d-]+\)|transparent|black|white)$/i.test(value) ? value : fallback;
}
export function appearanceBackgroundStyle(background?: BackgroundConfig | null, imageUrl?: string | null): CSSProperties {
  if (!background) return {};
  const result: CSSProperties = { backgroundColor: safeAppearanceColor(background.color) };
  const radius = typeof background.blur === 'number' && Number.isFinite(background.blur) ? Math.max(0, Math.min(64, background.blur)) : 0;
  if (radius > 0 && (background.type === 'image' || background.type === 'gradient')) {
    result.filter = `blur(${radius}px)`;
    result.inset = `-${Math.ceil(radius * 2)}px`;
  }
  if (background.type === 'gradient' && background.gradient && background.gradient.length <= 600 && /^(linear|radial)-gradient\(/i.test(background.gradient) && !/[;{}]|url\(|expression\(/i.test(background.gradient)) result.backgroundImage = background.gradient;
  if (background.type === 'image' && imageUrl && /^(blob:|https?:\/\/)/i.test(imageUrl)) {
    result.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
    result.backgroundSize = background.fit === 'tile' ? 'auto' : background.fit ?? 'cover';
    result.backgroundRepeat = background.fit === 'tile' ? 'repeat' : 'no-repeat';
    result.backgroundPosition = /^[a-z\d\s.%+-]{1,60}$/i.test(background.position ?? '') ? background.position : 'center';
  }
  return result;
}
