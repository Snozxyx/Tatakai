import type { LucideIcon } from 'lucide-react';
import { Ban, Flower2, CloudRain, CircleDot, Moon, CloudSun } from 'lucide-react';

/**
 * Per-profile customization (ambient accent color + animated background effect).
 *
 * These live inside the existing `profiles.app_settings` jsonb column rather than
 * dedicated columns: `app_settings` is already in the column-level `GRANT UPDATE`
 * list and profiles have a public `USING (true)` SELECT policy, so the owner can
 * write it and any viewer reads it back automatically via `usePublicProfile`'s
 * `select('*')` — no migration required, and customization is visible to other
 * users viewing the profile.
 */

export type BackgroundEffectKey = 'none' | 'sakura' | 'rain' | 'blackhole' | 'pitch' | 'sky';

export interface ProfileAppSettings {
  profile?: {
    /** HSL triplet string, e.g. "262 83% 58%", consumed via hsl(var(--profile-accent)). */
    ambientColor?: string;
    backgroundEffect?: BackgroundEffectKey;
  };
  // Other feature areas may add their own keys under app_settings; we only own `profile`.
  [key: string]: unknown;
}

export interface ProfileCustomization {
  /** HSL triplet or null when the user hasn't picked one (falls back to --primary). */
  ambientColor: string | null;
  backgroundEffect: BackgroundEffectKey;
}

const VALID_EFFECTS: BackgroundEffectKey[] = ['none', 'sakura', 'rain', 'blackhole', 'pitch', 'sky'];

/**
 * Parse customization from any profile row (own or public). Tolerant of missing
 * or malformed `app_settings`.
 */
export function readProfileCustomization(profile: any): ProfileCustomization {
  const settings = (profile?.app_settings ?? {}) as ProfileAppSettings;
  const p = settings.profile ?? {};
  const ambient = typeof p.ambientColor === 'string' ? normalizeAccent(p.ambientColor) : null;
  const effect = VALID_EFFECTS.includes(p.backgroundEffect as BackgroundEffectKey)
    ? (p.backgroundEffect as BackgroundEffectKey)
    : 'none';
  return { ambientColor: ambient, backgroundEffect: effect };
}

/**
 * Accept either an HSL triplet ("262 83% 58%") or a hex string and normalize to a
 * triplet suitable for `hsl(var(--profile-accent))`. Returns null for unusable input.
 */
export function normalizeAccent(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  // Already an HSL triplet like "262 83% 58%".
  if (/^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(v)) return clampTripletLightness(v);
  // Hex → triplet.
  if (/^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(v)) return toHslTriplet(v);
  return null;
}

/** Convert a hex color ("#a855f7" / "a855f7" / "#abc") to an HSL triplet "H S% L%". */
export function toHslTriplet(hex: string): string {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return 'var(--primary)' as unknown as string; // guard; caller falls back
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const light = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    sat = light > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4; break;
    }
    hue /= 6;
  }

  const H = Math.round(hue * 360);
  const S = Math.round(sat * 100);
  // Clamp lightness into a legible band so a user can't pick near-black/near-white
  // that washes out the glow layers or hurts contrast.
  const L = Math.min(72, Math.max(40, Math.round(light * 100)));
  return `${H} ${S}% ${L}%`;
}

/** Re-clamp an existing triplet's lightness to the legible band. */
function clampTripletLightness(triplet: string): string {
  const m = triplet.match(/^(\d{1,3})\s+(\d{1,3})%\s+(\d{1,3})%$/);
  if (!m) return triplet;
  const L = Math.min(72, Math.max(40, Number(m[3])));
  return `${m[1]} ${m[2]}% ${L}%`;
}

/** Curated accent presets (stored/applied as HSL triplets). */
export interface AmbientPreset {
  name: string;
  triplet: string;
}

export const AMBIENT_PRESETS: AmbientPreset[] = [
  { name: 'Violet', triplet: '262 83% 58%' }, // default (--primary)
  { name: 'Indigo', triplet: '243 75% 59%' },
  { name: 'Sky', triplet: '199 89% 55%' },
  { name: 'Cyan', triplet: '187 85% 53%' },
  { name: 'Emerald', triplet: '158 74% 48%' },
  { name: 'Lime', triplet: '95 65% 52%' },
  { name: 'Amber', triplet: '38 92% 55%' },
  { name: 'Orange', triplet: '25 95% 58%' },
  { name: 'Rose', triplet: '347 89% 62%' },
  { name: 'Pink', triplet: '322 85% 62%' },
  { name: 'Fuchsia', triplet: '292 84% 61%' },
  { name: 'Crimson', triplet: '352 80% 55%' },
];

/** Metadata for the background-effect picker. */
export interface EffectOption {
  key: BackgroundEffectKey;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const EFFECT_OPTIONS: EffectOption[] = [
  { key: 'none', label: 'None', icon: Ban, description: 'Default background' },
  { key: 'sakura', label: 'Sakura', icon: Flower2, description: 'Falling petals' },
  { key: 'rain', label: 'Rain', icon: CloudRain, description: 'Gentle rainfall' },
  { key: 'blackhole', label: 'Blackhole', icon: CircleDot, description: 'Swirling void' },
  { key: 'pitch', label: 'Dark Pitch', icon: Moon, description: 'Deep OLED black' },
  { key: 'sky', label: 'Sky', icon: CloudSun, description: 'Drifting gradient' },
];

/** Build the inline style that scopes --profile-accent to the profile subtree. */
export function ambientAccentStyle(ambientColor: string | null): React.CSSProperties | undefined {
  if (!ambientColor) return undefined;
  return { ['--profile-accent' as any]: ambientColor };
}
