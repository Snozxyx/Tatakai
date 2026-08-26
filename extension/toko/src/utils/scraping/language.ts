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
  arabic: { name: 'Arabic', code: 'ar', isDub: true },
  ar: { name: 'Arabic', code: 'ar', isDub: true },
  ara: { name: 'Arabic', code: 'ar', isDub: true },
  french: { name: 'French', code: 'fr', isDub: true },
  fr: { name: 'French', code: 'fr', isDub: true },
  fra: { name: 'French', code: 'fr', isDub: true },
  german: { name: 'German', code: 'de', isDub: true },
  de: { name: 'German', code: 'de', isDub: true },
  ger: { name: 'German', code: 'de', isDub: true },
  polish: { name: 'Polish', code: 'pl', isDub: true },
  pl: { name: 'Polish', code: 'pl', isDub: true },
  pol: { name: 'Polish', code: 'pl', isDub: true },
  sub: { name: 'Japanese', code: 'ja', isDub: false },
  dub: { name: 'English', code: 'en', isDub: true },
  hardsub: { name: 'Japanese', code: 'ja', isDub: false },
  softsub: { name: 'Japanese', code: 'ja', isDub: false },
};

/**
 * Per-provider default language when a source has no explicit audioLanguage.
 * Providers that exclusively serve one language are listed here.
 */
const PROVIDER_LANGUAGE_DEFAULTS: Record<string, NormalisedLanguage> = {
  // Indian-language providers
  desidub:      { name: 'Hindi', code: 'hi', isDub: true },
  // German provider
  aniworld:     { name: 'German', code: 'de', isDub: true },
  // Japanese-sub-focused providers
  animepahe:    { name: 'Japanese', code: 'ja', isDub: false },
  nyaa:         { name: 'Japanese', code: 'ja', isDub: false },
  acgrip:       { name: 'Japanese', code: 'ja', isDub: false },
  animetosho:   { name: 'Japanese', code: 'ja', isDub: false },
  subplease:    { name: 'Japanese', code: 'ja', isDub: false },
  seadex:       { name: 'Japanese', code: 'ja', isDub: false },
  nekobt:       { name: 'Japanese', code: 'ja', isDub: false },
  // English-dub providers
  toonstream:   { name: 'English', code: 'en', isDub: true },
  fouranime:    { name: 'English', code: 'en', isDub: true },
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
  if (key && key.length > 1) {
    for (const [mapKey, lang] of Object.entries(LANGUAGE_MAP)) {
      if (key.includes(mapKey) || (mapKey.length > 2 && mapKey.includes(key))) return lang;
    }
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
  if (lc.includes('HIN') || lc.includes('HINDI') || lc.includes('MULTI')) return { name: 'Hindi', code: 'hi', isDub: true };
  if (lc.includes('ENG') || lc.includes('EN')) return { name: 'English', code: 'en', isDub: true };
  if (lc.includes('JAP') || lc.includes('JPN') || lc === 'JA' || lc === 'JP') return { name: 'Japanese', code: 'ja', isDub: false };
  if (lc.includes('KOR') || lc === 'KO') return { name: 'Korean', code: 'ko', isDub: true };
  if (lc.includes('CHI') || lc === 'ZH') return { name: 'Chinese', code: 'zh', isDub: true };
  if (lc.includes('BEN') || lc === 'BN') return { name: 'Bengali', code: 'bn', isDub: true };
  if (lc.includes('ARA') || lc === 'AR') return { name: 'Arabic', code: 'ar', isDub: true };
  if (lc.includes('FRE') || lc.includes('FRA') || lc === 'FR') return { name: 'French', code: 'fr', isDub: true };
  if (lc.includes('GER') || lc.includes('DEU') || lc === 'DE') return { name: 'German', code: 'de', isDub: true };

  return normalizeLanguage(langCode);
}

/**
 * Get a BCP-47 language tag from a provider language string.
 */
export function getLanguageCode(raw: string | null | undefined): string {
  return normalizeLanguage(raw).code;
}

/**
 * Infer language from the provider name, source field, or URL when no explicit
 * audioLanguage is set by the provider.
 *
 * Priority:
 *  1. Explicit provider defaults (static known mapping)
 *  2. Source field keyword scan (e.g. "animeya-vidnest-dub" → en)
 *  3. URL keyword scan (e.g. ".../hindi/..." → hi)
 *  4. Fallback: Japanese (most anime providers are sub by default)
 */
export function inferLanguageFromProvider(
  providerName: string,
  source: string,
  url: string,
): NormalisedLanguage {
  // 1. Static provider defaults
  const providerKey = providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (PROVIDER_LANGUAGE_DEFAULTS[providerKey]) {
    return PROVIDER_LANGUAGE_DEFAULTS[providerKey];
  }

  // 2. Source field scan
  const srcLower = (source || '').toLowerCase();
  if (/\bdub\b/.test(srcLower)) return { name: 'English Dub', code: 'en', isDub: true };
  if (/\bsub\b/.test(srcLower)) return { name: 'Japanese', code: 'ja', isDub: false };
  if (/\bhindi\b/.test(srcLower)) return { name: 'Hindi', code: 'hi', isDub: true };
  if (/\btamil\b/.test(srcLower)) return { name: 'Tamil', code: 'ta', isDub: true };
  if (/\btelugu\b/.test(srcLower)) return { name: 'Telugu', code: 'te', isDub: true };
  if (/\barabic\b/.test(srcLower)) return { name: 'Arabic', code: 'ar', isDub: true };
  if (/\bfrench\b/.test(srcLower)) return { name: 'French', code: 'fr', isDub: true };
  if (/\bgerman\b/.test(srcLower)) return { name: 'German', code: 'de', isDub: true };

  // 3. URL keyword scan
  const urlLower = (url || '').toLowerCase();
  if (/\/hindi\/|[_-]hindi[_-]/.test(urlLower)) return { name: 'Hindi', code: 'hi', isDub: true };
  if (/\/tamil\/|[_-]tamil[_-]/.test(urlLower)) return { name: 'Tamil', code: 'ta', isDub: true };
  if (/\/telugu\/|[_-]telugu[_-]/.test(urlLower)) return { name: 'Telugu', code: 'te', isDub: true };
  if (/\/arabic\/|[_-]arabic[_-]/.test(urlLower)) return { name: 'Arabic', code: 'ar', isDub: true };
  if (/\/french\/|[_-]french[_-]/.test(urlLower)) return { name: 'French', code: 'fr', isDub: true };
  if (/\/german\/|[_-]german[_-]/.test(urlLower)) return { name: 'German', code: 'de', isDub: true };

  // 4. Default: Japanese sub
  return { name: 'Japanese', code: 'ja', isDub: false };
}
