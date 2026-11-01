import { normalizeSettings, type ReaderSettings } from './settings';
export interface ReaderPreset { id: string; name: string; settings: ReaderSettings }
export interface ReaderPresets { active: string; items: ReaderPreset[]; updatedAt: number }
export function normalizeReaderPresets(value: unknown): ReaderPresets {
  const raw = value as Partial<ReaderPresets> | null;
  const seen = new Set(['default']);
  const items = (Array.isArray(raw?.items) ? raw.items : []).filter(item => {
    if (!item || typeof item.id !== 'string' || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) return false;
    seen.add(item.id); return true;
  }).map(item => ({ id: item.id, name: item.name.trim().slice(0, 80), settings: normalizeSettings(item.settings) }));
  return { active: seen.has(raw?.active || '') ? raw!.active! : 'default', items, updatedAt: Number(raw?.updatedAt) || 0 };
}
