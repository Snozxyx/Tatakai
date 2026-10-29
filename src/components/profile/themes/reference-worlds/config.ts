import { safeProfileAudio } from '@/lib/profileThemeMusic';
export interface ReferenceWorldConfig {
  version: 1; headline: string; note: string; personality: string; role: string;
  birthday: string; musicUrl: string; musicTitle: string; musicArtist: string;
}
export const defaultReferenceWorld = (): ReferenceWorldConfig => ({ version: 1,
  headline: "let’s be friends", note: 'A little corner for the stories I love.',
  personality: 'Curious, kind, a little dreamy', role: 'Story collector', birthday: '',
  musicUrl: '', musicTitle: '', musicArtist: '' });
export function readReferenceWorld(value: unknown): ReferenceWorldConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { version?: unknown }).version !== 1) return null;
  const v = value as Record<string, unknown>; const defaults = defaultReferenceWorld();
  for (const key of ['headline','note','personality','role','birthday','musicUrl','musicTitle','musicArtist'] as const)
    if (typeof v[key] === 'string') defaults[key] = (v[key] as string).slice(0, key === 'musicUrl' ? 2048 : key === 'note' ? 1000 : 150);
  defaults.musicUrl = safeProfileAudio(defaults.musicUrl);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(defaults.birthday)) defaults.birthday = '';
  return defaults;
}
