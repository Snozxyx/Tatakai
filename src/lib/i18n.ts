/**
 * src/lib/i18n.ts
 * i18next configuration for Tatakai.
 *
 * Import this file once in main.tsx to initialise i18n before React renders.
 * Components use the `useTranslation` hook from react-i18next.
 *
 * Adding a new language:
 *   1. Create `src/locales/<code>.json` (copy en.json as template)
 *   2. Add a dynamic import in localeBackend.ts and a supportedLanguages entry
 *   3. That's it — the language picker will surface it automatically
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '@/locales/en.json';
import { localeBackend } from './localeBackend';
import { installLocaleFetchPatch, setActiveAppLanguage } from '@/lib/api/localeHeaders';

export const supportedLanguages = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
] as const;

export type SupportedLanguageCode = (typeof supportedLanguages)[number]['code'];

export const SUPPORTED_LANGUAGE_CODES: readonly string[] = supportedLanguages.map((l) => l.code);

export function isSupportedLanguageCode(value: unknown): value is SupportedLanguageCode {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(value)
  );
}

export const i18nReady = i18n
  .use(localeBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    partialBundledLanguages: true,
    supportedLngs: ['en', 'es', 'ja'],
    // `es-419` (Latin-American Spanish, the Chromium/Electron default in much
    // of LATAM) has no dedicated catalog — map it (and any other regional
    // variant) onto its base language instead of falling through to English.
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // Order matters — first match wins
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'tatakai:lang',
      // Manual choices are persisted by useAppLanguage. Caching detector results
      // would turn “follow device” into a fixed language on the next launch.
      caches: [],
    },
  });

// Keep <html lang> in sync for screen readers, spellcheck, and formatters.
const syncDocumentLanguage = (lng: string) => {
  const base = String(lng || 'en').split('-')[0].toLowerCase() || 'en';
  setActiveAppLanguage(base);
  if (typeof document === 'undefined') return;
  document.documentElement?.setAttribute?.('lang', base);
};

if (typeof window !== 'undefined') {
  syncDocumentLanguage(i18n.language || 'en');
  i18n.on('languageChanged', syncDocumentLanguage);
  installLocaleFetchPatch();
}

export default i18n;
