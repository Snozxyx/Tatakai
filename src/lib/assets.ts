// Marketing demos stay on the website; native features keep their offline media.
export const BRAND_ASSET_BASE = import.meta.env.VITE_PACKAGED_BUILD === 'true'
  ? 'https://tatakai.me/assets/brand'
  : `${import.meta.env.BASE_URL}assets/brand`;

const compactBackgrounds: Record<string, string> = {
  '1.mp4': 'crimson.mp4', '2.webm': 'storm.mp4', '3.mp4': 'flame.mp4',
  '5.mp4': 'neon.mp4', '6.mp4': 'ember.mp4', 'bg-hero.mp4': 'sakura.mp4',
};

export function backgroundVideo(file: string): string {
  const compact = compactBackgrounds[file];
  return `${import.meta.env.BASE_URL}assets/${compact ? 'tv/wallpapers' : 'video'}/${compact ?? file}`;
}
