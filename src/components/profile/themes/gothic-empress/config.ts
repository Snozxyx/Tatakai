export const EMPRESS_ASSETS = '/assets/profile-themes/gothic-empress/';
export const EMPRESS_POSTER = `${EMPRESS_ASSETS}empress-poster.jpg`;
export interface EmpressConfig { version: 1; motion: boolean; embers: number }
export const defaultEmpressConfig = (): EmpressConfig => ({ version: 1, motion: true, embers: 0.6 });
export function readEmpressConfig(value: unknown): EmpressConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (c.version !== 1) return null;
  return { version: 1, motion: c.motion !== false, embers: typeof c.embers === 'number' && Number.isFinite(c.embers) ? Math.max(0, Math.min(1, c.embers)) : 0.6 };
}
