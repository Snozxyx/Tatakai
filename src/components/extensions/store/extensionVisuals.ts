/**
 * Shared visual vocabulary for the extension store.
 *
 * The store shows the same extension in five places (hero, shelf row, grid tile,
 * detail header, install button), and each of those needs the same three things:
 * a colour for its type, an icon for its type, and something to draw when
 * `icon_url` does not resolve. Keeping them here is what stops the pages from
 * drifting apart the way the old hub and detail page did — each had its own
 * `TYPE_COLORS` map, and both used Tailwind literals (`orange-500`, `blue-500`)
 * that generate no CSS in this project because `tailwind.config.ts` replaces the
 * whole `orange` scale with a single themed value.
 *
 * Every colour below is a theme token from `src/index.css`.
 */
import { Globe, Puzzle, Zap, type LucideIcon } from 'lucide-react';
import type { StoreExtensionType } from '@/core/extensions/store-api';

export interface ExtensionTypeVisual {
  label: string;
  /** Short form for chips where the full label would wrap. */
  short: string;
  icon: LucideIcon;
  /** Chip: background + text + border, all token-based. */
  chipClass: string;
  /** Icon tile behind a lettermark or type glyph. */
  tileClass: string;
  /** Hero / banner wash. */
  glowClass: string;
  /** Solid text colour, for meta lines. */
  textClass: string;
}

export const EXTENSION_TYPE_VISUALS: Record<StoreExtensionType, ExtensionTypeVisual> = {
  onlinestream: {
    label: 'Streaming source',
    short: 'Streaming',
    icon: Globe,
    chipClass: 'bg-primary/15 text-primary border-primary/30',
    tileClass: 'from-primary/30 to-secondary/20',
    glowClass: 'from-primary/25 via-secondary/10 to-transparent',
    textClass: 'text-primary',
  },
  torrent: {
    label: 'Torrent provider',
    short: 'Torrent',
    icon: Zap,
    chipClass: 'bg-orange/15 text-orange border-orange/30',
    tileClass: 'from-orange/30 to-amber/20',
    glowClass: 'from-orange/25 via-amber/10 to-transparent',
    textClass: 'text-orange',
  },
  custom: {
    label: 'Utility',
    short: 'Utility',
    icon: Puzzle,
    chipClass: 'bg-secondary/20 text-secondary border-secondary/30',
    tileClass: 'from-secondary/30 to-accent/20',
    glowClass: 'from-secondary/25 via-accent/10 to-transparent',
    textClass: 'text-secondary',
  },
};

export function typeVisual(type?: string | null): ExtensionTypeVisual {
  const key = String(type ?? '').toLowerCase() as StoreExtensionType;
  return EXTENSION_TYPE_VISUALS[key] ?? EXTENSION_TYPE_VISUALS.custom;
}

/**
 * Two-letter mark for extensions with no usable icon, and for one that has an
 * icon URL the browser cannot load. The service signs its asset URLs against a
 * private bucket, so a signature that has expired 400s — `ExtensionIcon` renders
 * this mark underneath the `<img>` and the image hides itself `onError`, which is
 * why an expired icon degrades to a lettermark instead of to `alt` text.
 */
export function lettermark(name: string): string {
  const words = String(name ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/** `12400` → `12.4K`, matching how the Store renders install counts. */
export function formatCompact(value?: number | null): string {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** `health_score` arrives as 0–1; the UI shows whole percent. */
export function formatHealth(score?: number | null): string | undefined {
  if (typeof score !== 'number' || Number.isNaN(score)) return undefined;
  const normalized = score > 1 ? score : score * 100;
  return `${Math.round(normalized)}%`;
}

export function formatBytes(bytes?: number | null): string | undefined {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Absolute dates read as noise in a card; "3 days ago" is what the Store shows. */
export function formatRelative(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return undefined;

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';

  const steps: Array<[number, string]> = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
    [4.35, 'month'],
    [12, 'year'],
  ];

  let amount = seconds;
  let unit = 'second';
  for (const [factor, nextUnit] of steps) {
    if (amount < factor) break;
    amount /= factor;
    unit = nextUnit;
  }

  const rounded = Math.max(1, Math.round(amount));
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`;
}
