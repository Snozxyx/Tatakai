/**
 * src/lib/i18n.ts
 * i18next configuration for Tatakai.
 *
 * Import this file once in main.tsx to initialise i18n before React renders.
 * Components use the `useTranslation` hook from react-i18next.
 *
 * Adding a new language:
 *   1. Create `src/locales/<code>.json` (copy en.json as template)
 *   2. Add the import + resource entry below
 *   3. That's it — the language picker will surface it automatically
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '@/locales/en.json';
import ja from '@/locales/ja.json';

export const supportedLanguages = [
  { code: 'en', label: 'English' },
] as const;

export type SupportedLanguageCode = (typeof supportedLanguages)[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // Order matters — first match wins
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'tatakai:lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
