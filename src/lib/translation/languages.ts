/**
 * Translation target languages. Compact on purpose: codes used across the
 * engines we ship (Google / DeepL / Azure / Edge / m2m100 all accept ISO-639-1
 * for this set), with English display names for prompts and pickers.
 */
export const TRANSLATION_LANGUAGES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'ja', name: 'Japanese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ru', name: 'Russian' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'zh-hant', name: 'Chinese (Traditional)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ur', name: 'Urdu' },
  { code: 'id', name: 'Indonesian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'cs', name: 'Czech' },
  { code: 'sk', name: 'Slovak' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'fa', name: 'Persian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'tl', name: 'Filipino (Tagalog)' },
  { code: 'ms', name: 'Malay' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'sw', name: 'Swahili' },
  { code: 'af', name: 'Afrikaans' },
];

const LANGUAGE_INDEX = new Map(TRANSLATION_LANGUAGES.map((l) => [l.code, l]));

export function getTranslationLanguageName(code: string): string {
  return LANGUAGE_INDEX.get(code.toLowerCase())?.name ?? code.toUpperCase();
}

export function isKnownTranslationLanguage(code: string): boolean {
  return LANGUAGE_INDEX.has(code.toLowerCase());
}

/** Codes a specific engine cannot accept; callers fall back or error. */
export const UNSUPPORTED: Record<string, ReadonlySet<string>> = {
  deepl: new Set([
    'bn', 'ur', 'id', 'vi', 'th', 'sw', 'af', 'ta', 'te', 'ml', 'tl', 'ms', 'fa', 'he', 'uk', 'bg', 'sr', 'hr', 'ca', 'no', 'sk',
  ]),
  'zh-hant': new Set([]),
};
