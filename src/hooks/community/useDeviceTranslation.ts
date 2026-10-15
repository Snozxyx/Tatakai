import { useSyncExternalStore } from 'react';
import {
  getDeviceTranslationState,
  getServerTranslationState,
  subscribeDeviceTranslation,
} from '@/lib/community/onDeviceTranslation';

export function useDeviceTranslation() {
  return useSyncExternalStore(
    subscribeDeviceTranslation,
    getDeviceTranslationState,
    getServerTranslationState
  );
}
