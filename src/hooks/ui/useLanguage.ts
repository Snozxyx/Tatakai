import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { isSupportedLanguageCode, supportedLanguages } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';
import {
  readGuestSettingsFromCookie,
  readProfileAppSettings,
  saveAccountSettingsPatch,
  writeGuestSettingsCookie,
} from '@/lib/appSettingsPersistence';
import { APP_LANGUAGE_STORAGE_KEY, normalizeLanguageCode } from '@/lib/api/localeHeaders';

export type { SupportedLanguageCode } from '@/lib/i18n';
export { supportedLanguages };

const UPDATE_EVENT = 'tatakai-language-changed';

function readStoredLanguage(): string {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
      if (raw) return normalizeLanguageCode(raw) || 'en';
    } catch {
      /* ignore */
    }
    const cookieLocale = readGuestSettingsFromCookie().locale;
    if (cookieLocale) return normalizeLanguageCode(cookieLocale) || 'en';
  }
  return normalizeLanguageCode(i18n.language) || 'en';
}

/**
 * App interface language: `tatakai:lang` (localStorage, via the i18next
 * explicit choice) → account `app_settings.locale` → `navigator.language`.
 *
 * `language` is the resolved base code (`en` | `es` | `ja`); `preference`
 * additionally tracks the explicit `auto` choice (follow device).
 */
export function useAppLanguage() {
  const { t, i18n: reactI18n } = useTranslation();
  const { user, profile } = useAuth();
  const [preference, setPreferenceState] = useState<string>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      const raw = window.localStorage.getItem(`${APP_LANGUAGE_STORAGE_KEY}:preference`);
      if (raw === 'auto' || isSupportedLanguageCode(raw)) return raw;
      const legacy = normalizeLanguageCode(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY));
      if (isSupportedLanguageCode(legacy)) return legacy;
    } catch {
      /* ignore */
    }
    // No explicit choice yet → follow the device (detector result).
    return 'auto';
  });
  const [, forceTick] = useState(0);
  const seededAccountRef = useRef<string | null>(null);

  const language = useMemo(() => {
    const current = normalizeLanguageCode(reactI18n.language) || 'en';
    return isSupportedLanguageCode(current) ? current : 'en';
  }, [reactI18n.language]);

  useEffect(() => {
    const rerender = () => forceTick((v) => v + 1);
    window.addEventListener(UPDATE_EVENT, rerender);
    i18n.on('languageChanged', rerender);
    return () => {
      window.removeEventListener(UPDATE_EVENT, rerender);
      i18n.off('languageChanged', rerender);
    };
  }, []);

  const accountLocale = useMemo(
    () => readProfileAppSettings(profile).locale,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.app_settings],
  );

  // Adopt the account locale on sign-in when there is no explicit device choice.
  useEffect(() => {
    if (!user?.id) return;
    const normalized = normalizeLanguageCode(accountLocale);
    if (!isSupportedLanguageCode(normalized)) return;
    try {
      const explicit = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
      const devicePreference = window.localStorage.getItem(`${APP_LANGUAGE_STORAGE_KEY}:preference`);
      if (explicit || devicePreference === 'auto') return; // device choice wins
    } catch {
      /* fall through */
    }
    if (normalizeLanguageCode(i18n.language) !== normalized) {
      void i18n.changeLanguage(normalized);
    }
    setPreferenceState(normalized);
  }, [user?.id, accountLocale]);

  // Seed a fresh account's locale from the device on first sign-in.
  useEffect(() => {
    if (!user?.id) {
      seededAccountRef.current = null;
      return;
    }
    if (accountLocale) {
      seededAccountRef.current = user.id;
      return;
    }
    if (seededAccountRef.current === user.id) return;
    seededAccountRef.current = user.id;
    void saveAccountSettingsPatch(user.id, { locale: language }).catch(() => {
      seededAccountRef.current = null;
    });
  }, [user?.id, accountLocale, language]);

  const setLanguage = useCallback(
    (next: string) => {
      const target = next === 'auto' ? '' : normalizeLanguageCode(next);
      const deviceLang =
        typeof navigator !== 'undefined' ? normalizeLanguageCode(navigator.language) : '';
      const resolved = target === '' ? deviceLang || 'en' : target;

      const finalLang = isSupportedLanguageCode(resolved) ? resolved : 'en';
      const prefToStore = next === 'auto' || target === '' ? 'auto' : finalLang;

      setPreferenceState(prefToStore);
      try {
        if (prefToStore === 'auto') {
          window.localStorage.removeItem(APP_LANGUAGE_STORAGE_KEY);
          window.localStorage.setItem(`${APP_LANGUAGE_STORAGE_KEY}:preference`, 'auto');
        } else {
          window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, finalLang);
          window.localStorage.setItem(`${APP_LANGUAGE_STORAGE_KEY}:preference`, finalLang);
        }
      } catch {
        /* ignore */
      }
      writeGuestSettingsCookie({ locale: prefToStore === 'auto' ? undefined : finalLang });
      void i18n.changeLanguage(finalLang);
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT));

      if (user?.id) {
        void saveAccountSettingsPatch(user.id, {
          locale: prefToStore === 'auto' ? undefined : finalLang,
        }).catch(() => undefined);
      }
      return finalLang;
    },
    [user?.id],
  );

  useEffect(() => {
    if (preference !== 'auto') return;
    const followDevice = () => setLanguage('auto');
    window.addEventListener('languagechange', followDevice);
    return () => window.removeEventListener('languagechange', followDevice);
  }, [preference, setLanguage]);

  const languageLabel = useMemo(() => {
    if (preference === 'auto') return t('display.appLanguage.options.auto');
    return supportedLanguages.find((l) => l.code === language)?.label ?? language;
  }, [preference, language, t]);

  return {
    language,
    preference,
    setLanguage,
    languageLabel,
    supportedLanguages,
    storedLanguage: readStoredLanguage(),
  };
}
