import { deriveIsAdmin, type StaffRoleSource } from './roles';
import { safeProfileAudio } from './profileThemeMusic';

export const WIDGET_KINDS = ['identity', 'stats', 'streaks', 'activity', 'favorites', 'library', 'badges', 'links', 'clock', 'calendar', 'note', 'image', 'overview', 'watchlist', 'manga-readlist', 'novel-readlist', 'history', 'vault'] as const;
export type WidgetKind = typeof WIDGET_KINDS[number];
export const SEKAI_DEFAULT_WALLPAPER = '/assets/profile-themes/sekaipop/default-wallpaper.png';
export const SEKAI_WALLPAPERS = [{ id: 'original', title: 'SekaiPop original', url: SEKAI_DEFAULT_WALLPAPER }] as const;
export const SEKAI_MASCOTS = [
  { key: 'yay', name: 'Yay!', file: 'Chibi Catgirl Yay Sticker.png' },
  { key: 'shy', name: 'Shy companion', file: 'Shy Pink Catgirl with Plush Companion.png' },
  { key: 'sleepy', name: 'Sleepy', file: 'Sleepy Catgirl Hugging Plush.png' },
  { key: 'sleeping', name: 'Dreaming', file: 'Sleeping Catgirl and Black Cat Plush.png' },
  { key: 'crying', name: 'Little fox', file: 'Crying Fox-Eared Chibi with Plush.png' },
  { key: 'angry', name: 'Not amused', file: 'Angry Chibi Catgirl Sticker.png' },
] as const;
export function sekaiMascotUrl(key: string) { return `/assets/mascots/${encodeURIComponent((SEKAI_MASCOTS.find(m => m.key === key) ?? SEKAI_MASCOTS[0]).file)}`; }
export interface ScrapWidget {
  id: string; kind: WidgetKind; x: number; y: number; w: number; h: number;
  z: number; rotation: number; visible: boolean; title: string; text: string; image: string;
}
export interface SekaiConfig {
  version: 1;
  palette: string; mode: 'light' | 'dark' | 'darker';
  colors: { ink: string; primary: string; secondary: string; paper: string };
  wallpaper: { url: string; x: number; y: number; dim: number; blur: number };
  radius: number; shadow: number; stickers: boolean; motion: boolean;
  music: { url: string; title: string; artist: string; lyrics: string; volume: number; autoplay: boolean };
  mascot: { enabled: boolean; key: string; size: number };
  widgets: ScrapWidget[];
  mobile: { id: string; width: 'full' | 'half' }[];
}
export interface ThemePreferences {
  version: 1; selected: string;
  configurations: Record<string, unknown>;
  presets: { id: string; name: string; theme: string; configuration: unknown }[];
}
export const SEKAI_PALETTES = {
  original: { name: 'SekaiPop original', ink: '#5b437d', primary: '#aea5d6', secondary: '#f8b6e6', paper: '#fffcf7' },
  tatakai: { name: 'Tatakai', ink: '#43285f', primary: '#c08cf2', secondary: '#f4b6da', paper: '#fbf7ff' },
  singer: { name: 'Virtual Singer', ink: '#555473', primary: '#04feee', secondary: '#00ffcb', paper: '#f3fbf9' },
  leoneed: { name: 'Leo/need', ink: '#2d3775', primary: '#8ea3ff', secondary: '#9fd8ff', paper: '#f3f8fb' },
  jump: { name: 'More More Jump!', ink: '#39662d', primary: '#a4ee55', secondary: '#7fe9a8', paper: '#f3fbf6' },
  vivid: { name: 'Vivid Bad Squad', ink: '#561938', primary: '#ff5c9a', secondary: '#ff96c0', paper: '#fbf3f6' },
  showtime: { name: 'Wonderlands × Showtime', ink: '#6a3c11', primary: '#ffa51f', secondary: '#ffd54a', paper: '#fbf9f3' },
  nightcord: { name: 'Nightcord at 25:00', ink: '#43285f', primary: '#c08cf2', secondary: '#e2b5ff', paper: '#f8f3fb' },
  mono: { name: 'Monochrome', ink: '#444444', primary: '#f4f4f4', secondary: '#bdbdbd', paper: '#f4f4f4' },
} as const;

export function hasCustomProfileAccess(profile: StaffRoleSource | null | undefined, badges: readonly { key: string }[] = []): boolean {
  return deriveIsAdmin(profile) || badges.some(b => ['booster', 'premium-pro', 'premium-ultra'].includes(b.key));
}
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
const str = (v: unknown, max = 200) => typeof v === 'string' ? v.slice(0, max) : '';
export function safeThemeImage(value: unknown): string {
  if (value === SEKAI_DEFAULT_WALLPAPER) return value;
  if (typeof value !== 'string' || value.length > 2048) return '';
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function makeWidget(kind: WidgetKind, index = 0): ScrapWidget {
  return { id: `${kind}-${index}`, kind, x: 32 + index % 3 * 360, y: 32 + Math.floor(index / 3) * 280,
    w: 320, h: kind === 'identity' ? 276 : 240, z: index, rotation: 0, visible: true, title: '', text: '', image: '' };
}
export function defaultSekaiConfig(): SekaiConfig {
  const widgets = [
    { ...makeWidget('identity'), x: 818, y: 20, w: 290, rotation: -2 },
    { ...makeWidget('stats', 1), x: 24, y: 40, w: 294, h: 230, rotation: -3 },
    { ...makeWidget('clock', 2), x: 818, y: 326, w: 290, h: 230, rotation: 2 },
    { ...makeWidget('calendar', 3), x: 35, y: 302, w: 280, h: 260, rotation: 2 },
    { ...makeWidget('note', 4), x: 350, y: 342, w: 230, h: 180, rotation: -5, title: 'A little note', text: 'Welcome to my little corner of Tatakai.' },
    { ...makeWidget('streaks', 5), x: 794, y: 602, w: 314, h: 200, rotation: 2 },
    { ...makeWidget('badges', 6), x: 25, y: 600, w: 296, h: 200, rotation: -2 },
    { ...makeWidget('library', 7), x: 342, y: 58, w: 230, h: 240, rotation: 3 },
    { ...makeWidget('activity', 8), x: 354, y: 594, w: 384, h: 210, rotation: -2 },
    { ...makeWidget('favorites', 9), x: 580, y: 38, w: 215, h: 245, rotation: -3 },
    { ...makeWidget('image', 10), x: 606, y: 330, w: 200, h: 218, rotation: 6, title: 'Pinned to my world' },
  ];
  const { ink, primary, secondary, paper } = SEKAI_PALETTES.original;
  return { version: 1, palette: 'original', mode: 'light', colors: { ink, primary, secondary, paper },
    wallpaper: { url: SEKAI_DEFAULT_WALLPAPER, x: 50, y: 50, dim: 0, blur: 0 }, radius: 13, shadow: 4,
    stickers: true, motion: true, widgets, mobile: [],
    music: { url: '', title: '', artist: '', lyrics: '', volume: 0.35, autoplay: false }, mascot: { enabled: true, key: 'yay', size: 130 } };
}
/** Rearrange the canvas without replacing a user's notes, media, or widgets. */
export function applyScrapbookLayout(config: SekaiConfig): SekaiConfig {
  const starter = defaultSekaiConfig().widgets;
  const used = new Set<WidgetKind>();
  const widgets = config.widgets.map(widget => {
    const slot = starter.find(w => w.kind === widget.kind);
    if (!slot || used.has(widget.kind)) return widget;
    used.add(widget.kind);
    return { ...widget, x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotation: slot.rotation, z: slot.z };
  });
  for (const slot of starter) {
    if (widgets.length >= 32) break;
    if (!config.widgets.some(w => w.kind === slot.kind) && !widgets.some(w => w.id === slot.id)) widgets.push(slot);
  }
  return { ...config, widgets };
}

/** Refresh only untouched old starter positions; never rearrange a custom canvas. */
function refreshStarterLayout(widgets: ScrapWidget[], starter: ScrapWidget[]): ScrapWidget[] {
  const old: Record<string, number[][]> = {
    'identity-0': [[792, 30, 320, 276, 0]], 'stats-1': [[32, 30, 320, 240, 0]],
    'clock-2': [[792, 330, 320, 240, 0]], 'calendar-3': [[32, 300, 320, 290, 0]], 'favorites-3': [[32, 300, 320, 290, 0]],
    'note-4': [[414, 330, 310, 220, -3], [555, 600, 200, 200, -3]], 'streaks-5': [[792, 600, 320, 220, 0]],
    'badges-6': [[32, 620, 320, 200, 0]], 'library-7': [[32, 858, 680, 290, 0]],
    'activity-8': [[752, 858, 360, 290, 0]], 'favorites-9': [[32, 1190, 680, 270, 0]], 'image-10': [[385, 610, 200, 180, 2]],
  };
  if (widgets.length < 8 || !widgets.every(w => w.visible && old[w.id]?.some(([x,y,width,height,rotation]) => w.x === x && w.y === y && w.w === width && w.h === height && w.rotation === rotation))) return widgets;
  return starter.map(template => {
    const saved = widgets.find(w => w.kind === template.kind);
    return saved ? { ...template, ...saved, x: template.x, y: template.y, w: template.w, h: template.h, z: template.z, rotation: template.rotation, title: saved.title || template.title } : template;
  });
}

export function readSekaiConfig(value: unknown): SekaiConfig | null {
  const p = record(value); if (p.version !== 1 || !Array.isArray(p.widgets) || p.widgets.length > 32) return null;
  const defaults = defaultSekaiConfig(); const colors = record(p.colors); const wall = record(p.wallpaper);
  const music = record(p.music); const mascot = record(p.mascot);
  const ids = new Set<string>(); const singleton = new Set<string>();
  const widgets: ScrapWidget[] = [];
  for (const raw of p.widgets) {
    const w = record(raw); if (!WIDGET_KINDS.includes(w.kind as WidgetKind) || typeof w.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(w.id) || ids.has(w.id)) return null;
    if (w.kind !== 'note' && w.kind !== 'image' && singleton.has(w.kind as string)) return null;
    ids.add(w.id); singleton.add(w.kind as string);
    const width = num(w.w, 320, 200, 900); const height = num(w.h, 240, 160, 900);
    widgets.push({ id: w.id, kind: w.kind as WidgetKind, w: width, h: height,
      x: num(w.x, 32, 0, 1144 - width), y: num(w.y, 32, 0, 4000 - height), z: num(w.z, 0, 0, 100),
      rotation: num(w.rotation, 0, -12, 12), visible: w.kind === 'identity' || w.visible !== false,
      title: str(w.title, 60), text: str(w.text, 2000), image: safeThemeImage(w.image) });
  }
  if (!singleton.has('identity')) return null;
  const mobileIds = new Set<string>();
  const mobile = (Array.isArray(p.mobile) ? p.mobile : []).slice(0, 32).flatMap(raw => {
    const m = record(raw); if (typeof m.id !== 'string' || !ids.has(m.id) || mobileIds.has(m.id)) return [];
    mobileIds.add(m.id); return [{ id: m.id, width: m.width === 'half' ? 'half' as const : 'full' as const }];
  });
  return { ...defaults, widgets: refreshStarterLayout(widgets, defaults.widgets), mobile, palette: str(p.palette, 30) || 'tatakai',
    mode: p.mode === 'dark' || p.mode === 'darker' ? p.mode : 'light',
    colors: Object.fromEntries(Object.entries(defaults.colors).filter(([key]) => key !== 'name').map(([key, fallback]) => [key, typeof colors[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(colors[key] as string) ? colors[key] : fallback])) as SekaiConfig['colors'],
    wallpaper: { url: safeThemeImage(wall.url), x: num(wall.x, 50, 0, 100), y: num(wall.y, 50, 0, 100), dim: num(wall.dim, 0, 0, 80), blur: num(wall.blur, 0, 0, 20) },
    radius: num(p.radius, 13, 4, 28), shadow: num(p.shadow, 4, 0, 10), stickers: p.stickers !== false, motion: p.motion !== false,
    music: { url: safeProfileAudio(music.url), title: str(music.title, 100), artist: str(music.artist, 100), lyrics: str(music.lyrics, 20000), volume: num(music.volume, 0.35, 0, 1), autoplay: music.autoplay === true },
    mascot: { enabled: mascot.enabled !== false, key: SEKAI_MASCOTS.some(m => m.key === mascot.key) ? mascot.key as string : 'yay', size: num(mascot.size, 130, 60, 220) } };
}
export function readThemePreferences(settings: unknown): ThemePreferences {
  const p = record(record(settings).profileThemes);
  if (p.version !== 1) return { version: 1, selected: 'default', configurations: {}, presets: [] };
  return { version: 1, selected: str(p.selected, 40) || 'default', configurations: record(p.configurations),
    presets: (Array.isArray(p.presets) ? p.presets : []).slice(0, 8).flatMap(raw => {
      const r = record(raw); return typeof r.id === 'string' && typeof r.name === 'string' && typeof r.theme === 'string'
        ? [{ id: str(r.id, 64), name: str(r.name, 40), theme: str(r.theme, 40), configuration: r.configuration }] : [];
    }) };
}
export function mobileWidgets(config: SekaiConfig): ScrapWidget[] {
  const order = config.mobile.map(w => w.id);
  const sorted = [...config.widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  return [...order.flatMap(id => sorted.filter(w => w.id === id)), ...sorted.filter(w => !order.includes(w.id))];
}
export function moveMobileWidget(config: SekaiConfig, id: string, direction: -1 | 1): SekaiConfig {
  const items = mobileWidgets(config).map(w => config.mobile.find(m => m.id === w.id) ?? { id: w.id, width: 'full' as const });
  const index = items.findIndex(w => w.id === id); const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return config;
  [items[index], items[next]] = [items[next], items[index]]; return { ...config, mobile: items };
}
