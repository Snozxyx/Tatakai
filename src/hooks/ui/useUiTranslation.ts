import { useTranslation as useI18nTranslation } from 'react-i18next';
import { usePreferredTitleLanguage } from './useTitleLanguage';

/** Subscribe memoized views to both interface copy and the independent title preference. */
export function useUiTranslation() {
  const translation = useI18nTranslation();
  usePreferredTitleLanguage();
  return translation;
}
