/** Avoid matching volume/year numbers as chapters on Tatakai's main pages. */
export function mangayomiEntryNumber(label: string, explicit?: unknown): number | undefined {
  if ((typeof explicit === 'number' || typeof explicit === 'string') && String(explicit).trim() && /^\d+(?:\.\d+)?$/.test(String(explicit))) return Number(explicit);
  const matches = [...label.matchAll(/(?:\b(?:chapter|ch|episode|ep)\.?\s*|第\s*)(\d+(?:\.\d+)?)/gi)].map(match => Number(match[1]));
  const unique = [...new Set(matches)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return undefined;
  const numbers = label.match(/\d+(?:\.\d+)?/g);
  return numbers?.length === 1 && !/\b(?:volume|vol|season|year)\b/i.test(label) ? Number(numbers[0]) : undefined;
}
