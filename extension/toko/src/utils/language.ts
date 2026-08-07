/**
 * Language normalisation utilities for Toko provider adapters.
 * Ported from A1 watchaw/animelok LANGUAGE_NAMES patterns.
 * Requirements: 2.10
 */

export interface NormalisedLanguage {
  name: string;
  code: string;
  isDub: boolean;
}

const LANGUAGE_MAP: Record<string, NormalisedLanguage> = {
  hindi: { name: 'Hindi', code: 'hi', isDub: true },
  hi: { name: 'Hindi', code: 'hi', isDub: true },
  hin: { name: 'Hindi', code: 'hi', isDub: true },
  tamil: { name: 'Tamil', code: 'ta', isDub: true },
  ta: { name: 'Tamil', code: 'ta', isDub: true },
  tam: { name: 'Tamil', code: 'ta', isDub: true },
  telugu: { name: 'Telugu', code: 'te', isDub: true },
  te: { name: 'Telugu', code: 'te', isDub: true },
  tel: { name: 'Telugu', code: 'te', isDub: true },
  malayalam: { name: 'Malayalam', code: 'ml', isDub: true },
  ml: { name: 'Malayalam', code: 'ml', isDub: true },
  mal: { name: 'Malayalam', code: 'ml', isDub: true },
  bengali: { name: 'Bengali', code: 'bn', isDub: true },
  bn: { name: 'Bengali', code: 'bn', isDub: true },
  marathi: { name: 'Marathi', code: 'mr', isDub: true },
  mr: { name: 'Marathi', code: 'mr', isDub: true },
  kannada: { name: 'Kannada', code: 'kn', isDub: true },
  kn: { name: 'Kannada', code: 'kn', isDub: true },
  kan: { name: 'Kannada', code: 'kn', isDub: true },
  english: { name: 'English', code: 'en', isDub: true },
  en: { name: 'English', code: 'en', isDub: true },
  eng: { name: 'English', code: 'en', isDub: true },
  japanese: { name: 'Japanese', code: 'ja', isDub: false },
  ja: { name: 'Japanese', code: 'ja', isDub: false },
  jp: { name: 'Japanese', code: 'ja', isDub: false },
  jpn: { name: 'Japanese', code: 'ja', isDub: false },
  korean: { name: 'Korean', code: 'ko', isDub: true },
  ko: { name: 'Korean', code: 'ko', isDub: true },
  kor: { name: 'Korean', code: 'ko', isDub: true },
  chinese: { name: 'Chinese', code: 'zh', isDub: true },
  zh: { name: 'Chinese', code: 'zh', isDub: true },
  chi: { name: 'Chinese', code: 'zh', isDub: true },
  sub: { name: 'Japanese', code: 'ja', isDub: false },
  dub: { name: 'English', code: 'en', isDub: true },
  hardsub: { name: 'Japanese', code: 'ja', isDub: false },
  softsub: { name: 'Japanese', code: 'ja', isDub: false },
};

/**
 * Normalise a raw language string from a provider to a structured language object.
 *
 * @param raw - Provider-supplied language string (e.g. "HINDI", "JAP", "English Dub").
 * @returns Normalised language object with `name`, `code`, and `isDub`.
 */
export function normalizeLanguage(raw: string | null | undefined): NormalisedLanguage {
  if (!raw) return { name: 'Unknown', code: 'und', isDub: false };

  const key = raw.toLowerCase().trim()
    .replace(/\s*dub\s*$/, '')
    .replace(/\s*sub\s*$/, '')
    .replace(/\s*dubbed\s*$/, '')
    .replace(/\s*subbed\s*$/, '')
    .trim();

  if (LANGUAGE_MAP[key]) return LANGUAGE_MAP[key];

  // Partial match — check if raw contains a known language key
  for (const [mapKey, lang] of Object.entries(LANGUAGE_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return lang;
  }

  // Check if "dub" is in the raw string
  const isDub = /\bdub\b/i.test(raw) || /\bdubbed\b/i.test(raw);

  return {
    name: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
    code: 'und',
    isDub,
  };
}

/**
 * Normalise a langCode string from the Animelok API (e.g. "HINDI", "TAM_DUB").
 * Handles the Animelok-specific prefix codes.
 */
export function normalizeLangCode(langCode: string | null | undefined): NormalisedLanguage {
  if (!langCode) return { name: 'Unknown', code: 'und', isDub: false };

  const lc = langCode.toUpperCase();
  if (lc.includes('TAM')) return { name: 'Tamil', code: 'ta', isDub: true };
  if (lc.includes('MAL') || lc.includes('KER')) return { name: 'Malayalam', code: 'ml', isDub: true };
  if (lc.includes('TEL')) return { name: 'Telugu', code: 'te', isDub: true };
  if (lc.includes('KAN')) return { name: 'Kannada', code: 'kn', isDub: true };
  if (lc.includes('HIN') || lc.includes('HINDI')) return { name: 'Hindi', code: 'hi', isDub: true };
  if (lc.includes('ENG') || lc.includes('EN')) return { name: 'English', code: 'en', isDub: true };
  if (lc.includes('JAP') || lc.includes('JPN') || lc === 'JA' || lc === 'JP') return { name: 'Japanese', code: 'ja', isDub: false };
  if (lc.includes('KOR') || lc === 'KO') return { name: 'Korean', code: 'ko', isDub: true };
  if (lc.includes('CHI') || lc === 'ZH') return { name: 'Chinese', code: 'zh', isDub: true };
  if (lc.includes('BEN') || lc === 'BN') return { name: 'Bengali', code: 'bn', isDub: true };

  return normalizeLanguage(langCode);
}

/**
 * Get a BCP-47 language tag from a provider language string.
 */
export function getLanguageCode(raw: string | null | undefined): string {
  return normalizeLanguage(raw).code;
}
