import { useSyncExternalStore } from 'react';
import {
  getPreferredTitleLanguage,
  subscribeTitleLanguage,
} from '@/lib/titleLanguage';

export function usePreferredTitleLanguage() {
  return useSyncExternalStore(
    subscribeTitleLanguage,
    getPreferredTitleLanguage,
    () => 'romaji' as const
  );
}
