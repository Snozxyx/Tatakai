import { useSyncExternalStore } from 'react';
import {
  getPreferredTitleLanguage,
  subscribeTitleLanguage,
  getPreferredReadingTitleLanguage,
  DEFAULT_READING_TITLE_LANGUAGE,
} from '@/lib/titleLanguage';

export function usePreferredTitleLanguage() {
  return useSyncExternalStore(
    subscribeTitleLanguage,
    getPreferredTitleLanguage,
    () => 'romaji' as const
  );
}

export function usePreferredReadingTitleLanguage() {
  return useSyncExternalStore(subscribeTitleLanguage, getPreferredReadingTitleLanguage, () => DEFAULT_READING_TITLE_LANGUAGE);
}
