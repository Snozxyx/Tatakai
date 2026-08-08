/**
 * Dub-language metadata for the multilingual (i18n) Toko providers.
 *
 * Each entry maps a BCP 47 tag to the human-readable label and the language
 * names that providers use in their UI/URLs. The tags line up with Tatakai's
 * `language-resolver` aliases (ja/en/hi/fr/de/zh/ar/pl/...) so sources flow
 * straight into the Watch page's SourceLanguageTabs and the auto-download
 * engine.
 */

export interface DubLanguage {
  /** BCP 47 / ISO 639-1 code used throughout Tatakai. */
  code: string;
  /** English label, e.g. "French". */
  label: string;
  /** Native label shown in the language tab. */
  nativeLabel: string;
  /** Tokens a provider might use for this language (matched case-insensitively). */
  aliases: string[];
  /** Whether the language is a dub track vs. subtitles-only. */
  isDub: boolean;
}

export const DUB_LANGUAGES: Record<string, DubLanguage> = {
  ja: { code: 'ja', label: 'Japanese', nativeLabel: '日本語', aliases: ['japanese', 'jap', 'jpn', 'ja', 'sub', 'vostfr', 'vost'], isDub: false },
  en: { code: 'en', label: 'English', nativeLabel: 'English', aliases: ['english', 'eng', 'en', 'dub', 'vf', 'vostfr-anglais'], isDub: true },
  ar: { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', aliases: ['arabic', 'ar', 'عربي', 'مترجم', 'blkom', 'animeblkom'], isDub: true },
  fr: { code: 'fr', label: 'French', nativeLabel: 'Français', aliases: ['french', 'fr', 'français', 'francais', 'vf', 'vff', 'vfi', 'vfq', 'vostfr'], isDub: true },
  de: { code: 'de', label: 'German', nativeLabel: 'Deutsch', aliases: ['german', 'de', 'ger', 'deutsch', 'gerdub', 'gersub'], isDub: true },
  pl: { code: 'pl', label: 'Polish', nativeLabel: 'Polski', aliases: ['polish', 'pl', 'pol', 'polski', 'pl-dub', 'pl-sub'], isDub: true },
  zh: { code: 'zh', label: 'Chinese', nativeLabel: '中文', aliases: ['chinese', 'zh', 'chi', 'zho', '中文', '国语', '粵語', 'mandarin', 'cantonese'], isDub: true },
  es: { code: 'es', label: 'Spanish', nativeLabel: 'Español', aliases: ['spanish', 'es', 'spa', 'español', 'esp'], isDub: true },
  pt: { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', aliases: ['portuguese', 'pt', 'por', 'português'], isDub: true },
  it: { code: 'it', label: 'Italian', nativeLabel: 'Italiano', aliases: ['italian', 'it', 'ita', 'italiano'], isDub: true },
  ko: { code: 'ko', label: 'Korean', nativeLabel: '한국어', aliases: ['korean', 'ko', 'kor', '한국어'], isDub: true },
  hi: { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', aliases: ['hindi', 'hi', 'hin', 'हिन्दी'], isDub: true },
  ta: { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', aliases: ['tamil', 'ta', 'tam', 'தமிழ்'], isDub: true },
  te: { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', aliases: ['telugu', 'te', 'tel', 'తెలుగు'], isDub: true },
};

/**
 * Normalize a raw provider language string to a DubLanguage entry.
 * Returns null when nothing matches (caller may treat the source as unknown).
 */
export function resolveDubLanguage(raw: string | null | undefined): DubLanguage | null {
  if (!raw) return null;
  const needle = raw.toLowerCase().trim();
  // Exact code match first.
  if (DUB_LANGUAGES[needle]) return DUB_LANGUAGES[needle];
  for (const lang of Object.values(DUB_LANGUAGES)) {
    if (lang.aliases.some(a => needle.includes(a.toLowerCase()))) return lang;
  }
  return null;
}

/**
 * Map a DubLanguage (or raw string) to the BCP 47 tag stored on
 * SourceResult.audioLanguage. Falls back to the lowercased raw token.
 */
export function toAudioLanguageCode(raw: string | null | undefined): string {
  const resolved = resolveDubLanguage(raw);
  if (resolved) return resolved.code;
  const v = (raw || '').trim();
  return v ? v.toLowerCase().slice(0, 3) : 'und';
}
