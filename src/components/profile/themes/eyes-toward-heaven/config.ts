export interface HeavenConfig {
  version: 1; motion: boolean; palette: 'sky' | 'lavender' | 'sage';
  surface: 'glass' | 'solid'; dim: number; scenePosition: number;
}
export const heavenDefaults = (): HeavenConfig => ({ version: 1, motion: true, palette: 'sky', surface: 'glass', dim: .12, scenePosition: 64 });
export function readHeavenConfig(value: unknown): HeavenConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { version?: unknown }).version !== 1) return null;
  const v = value as Record<string,unknown>; const c = heavenDefaults();
  c.motion = v.motion !== false;
  if (v.palette === 'sky' || v.palette === 'lavender' || v.palette === 'sage') c.palette = v.palette;
  if (v.surface === 'solid') c.surface = 'solid';
  if (typeof v.dim === 'number' && Number.isFinite(v.dim)) c.dim = Math.max(0,Math.min(.6,v.dim));
  if (typeof v.scenePosition === 'number' && Number.isFinite(v.scenePosition)) c.scenePosition = Math.max(0,Math.min(100,v.scenePosition));
  return c;
}
export const HEAVEN_POSTER = '/assets/profile-themes/eyes-toward-heaven/poster.webp';
export const HEAVEN_VIDEO = '/assets/profile-themes/eyes-toward-heaven/scene.mp4';
