import { useSyncExternalStore } from 'react';
import {
  getTranslationConfig,
  subscribeTranslationConfig,
  type TranslationEngineConfig,
} from '@/lib/translation/config';

export function useTranslationConfig(): TranslationEngineConfig {
  return useSyncExternalStore(subscribeTranslationConfig, getTranslationConfig, getTranslationConfig);
}
