export const TV_WALLPAPERS = [
  { id: 'sakura', name: 'Sakura night', src: '/assets/tv/wallpapers/sakura.mp4', legacySrc: '/assets/video/bg-hero.mp4', poster: '/assets/tv/wallpapers/bg-hero.png', color: [235, 157, 187] },
  { id: 'crimson', name: 'Crimson gaze', src: '/assets/tv/wallpapers/crimson.mp4', legacySrc: '/assets/video/1.mp4', poster: '/assets/tv/wallpapers/1.png', color: [225, 77, 95] },
  { id: 'storm', name: 'Storm dragon', src: '/assets/tv/wallpapers/storm.mp4', legacySrc: '/assets/video/2.webm', poster: '/assets/tv/wallpapers/2.png', color: [173, 191, 198] },
  { id: 'flame', name: 'Blue flame', src: '/assets/tv/wallpapers/flame.mp4', legacySrc: '/assets/video/3.mp4', poster: '/assets/tv/wallpapers/3.png', color: [67, 188, 235] },
  { id: 'neon', name: 'Neon city', src: '/assets/tv/wallpapers/neon.mp4', legacySrc: '/assets/video/5.mp4', poster: '/assets/tv/wallpapers/5.png', color: [202, 125, 238] },
  { id: 'ember', name: 'Ember ring', src: '/assets/tv/wallpapers/ember.mp4', legacySrc: '/assets/video/6.mp4', poster: '/assets/tv/wallpapers/6.png', color: [239, 138, 57] },
] as const;

export function validTVWallpaper(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (TV_WALLPAPERS.some(preset => preset.src === value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function resolveTVWallpaper(value: unknown): string {
  const legacy = TV_WALLPAPERS.find(item => item.legacySrc === value);
  if (legacy) return legacy.src;
  if (typeof value === 'string' && value.includes('bg-hero-0BnFGdr81Ifnj3WbBZoNt1KE4D5DMT.mp4')) return TV_WALLPAPERS[0].src;
  return validTVWallpaper(value) ? value : TV_WALLPAPERS[0].src;
}

export function wallpaperTheme(color: readonly number[]) {
  const channels = [0, 1, 2].map(i => Math.max(0, Math.min(255, Number.isFinite(color[i]) ? color[i] : 180)));
  return {
    '--tv-accent': channels.map(value => Math.round(value * .7 + 255 * .3)).join(','),
    '--tv-glass': channels.map(value => Math.round(value * .12 + 18)).join(','),
    '--tv-ink': channels.map(value => Math.round(value * .025 + 9)).join(','),
  };
}

