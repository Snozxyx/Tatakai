export function normalizeReleaseNotes(notes: unknown): string {
  if (typeof notes === 'string') return notes.slice(0, 30_000);
  if (Array.isArray(notes)) return notes.map(item => typeof item === 'string' ? item : String(item?.note || '')).join('\n').slice(0, 30_000);
  return '';
}
export function normalizeRolloutPercentage(value: unknown): number | undefined {
  if (value == null || value === '' || typeof value === 'boolean') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : undefined;
}
