import i18n from '@/lib/i18n';

/**
 * App-wide translation engine configuration.
 *
 * One source of truth for every translation surface (community posts, comments,
 * subtitles, novels). Stored in localStorage and mirrored through a tiny
 * external store so any component can subscribe via `useTranslationConfig()`.
 *
 * Providers are ported from the subtitle-translator reference project:
 * free zero-config endpoints (Google translate-pa, Edge) plus keyed services
 * (Google Cloud, DeepL, DeepLX, Azure) and any OpenAI-compatible API.
 */

export type TranslationProviderId =
  | 'auto' // free endpoints first, on-device fallback
  | 'gtx' // Google translate-pa (free, no key)
  | 'edge' // Microsoft Edge free backend (free, no key)
  | 'google' // Google Cloud Translation (key)
  | 'deepl' // DeepL API (key)
  | 'deeplx' // DeepLX self-hosted / community (url)
  | 'azure' // Azure Translator (key + region)
  | 'openai' // any OpenAI-compatible chat completions endpoint
  | 'on-device'; // existing browser / offline engine

export interface TranslationEngineConfig {
  /** Master switch — off hides every translate affordance app-wide. */
  enabled: boolean;
  provider: TranslationProviderId;
  /** OpenAI-compatible / DeepL / DeepLX endpoint override. */
  url: string;
  apiKey: string;
  /** Model for the OpenAI-compatible provider. */
  model: string;
  /** Azure region (required by regional resources, harmless for global ones). */
  region: string;
  /** 'auto' follows the app interface language. */
  targetLanguage: string;
  /** Community posts translate as they scroll into view. */
  autoTranslatePosts: boolean;
  /** Show the per-comment translate control. */
  translateComments: boolean;
  /** Translate subtitles during playback (video settings mirror this). */
  subtitleTranslate: boolean;
  /** Pre-translate every line of the selected track, in chunks, so cues render translated instantly. */
  subtitlePretranslate: boolean;
  /** Subtitle target override; empty = targetLanguage. */
  subtitleTargetLanguage: string;
  /** Translate novel chapter text in the reader. */
  translateNovels: boolean;
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationEngineConfig = {
  enabled: true,
  provider: 'auto',
  url: '',
  apiKey: '',
  model: '',
  region: '',
  targetLanguage: 'auto',
  // Off by default: auto-translating every visible post is what produced the
  // endless "Translating on this device…" spinners. Opt-in, and the loop fix.
  autoTranslatePosts: false,
  translateComments: true,
  subtitleTranslate: false,
  subtitlePretranslate: true,
  subtitleTargetLanguage: '',
  translateNovels: false,
};

const STORAGE_KEY = 'tatakai:translation-config';
const UPDATE_EVENT = 'tatakai-translation-config-updated';

const PROVIDER_IDS = new Set<TranslationProviderId>([
  'auto',
  'gtx',
  'edge',
  'google',
  'deepl',
  'deeplx',
  'azure',
  'openai',
  'on-device',
]);

const asBool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

const asCode = (value: unknown, fallback: string) => {
  const code = String(value ?? '').trim().toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code) ? code : fallback;
};

export function normalizeTranslationConfig(
  raw: Partial<TranslationEngineConfig> | null | undefined,
): TranslationEngineConfig {
  return {
    enabled: asBool(raw?.enabled, DEFAULT_TRANSLATION_CONFIG.enabled),
    provider: PROVIDER_IDS.has(raw?.provider as TranslationProviderId)
      ? (raw?.provider as TranslationProviderId)
      : DEFAULT_TRANSLATION_CONFIG.provider,
    url: typeof raw?.url === 'string' ? raw.url.trim().slice(0, 500) : '',
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey.trim().slice(0, 300) : '',
    model: typeof raw?.model === 'string' ? raw.model.trim().slice(0, 200) : '',
    region: typeof raw?.region === 'string' ? raw.region.trim().slice(0, 60) : '',
    targetLanguage: raw?.targetLanguage === 'auto' ? 'auto' : asCode(raw?.targetLanguage, 'auto'),
    autoTranslatePosts: asBool(raw?.autoTranslatePosts, DEFAULT_TRANSLATION_CONFIG.autoTranslatePosts),
    translateComments: asBool(raw?.translateComments, DEFAULT_TRANSLATION_CONFIG.translateComments),
    subtitleTranslate: asBool(raw?.subtitleTranslate, DEFAULT_TRANSLATION_CONFIG.subtitleTranslate),
    subtitlePretranslate: asBool(raw?.subtitlePretranslate, DEFAULT_TRANSLATION_CONFIG.subtitlePretranslate),
    subtitleTargetLanguage: asCode(raw?.subtitleTargetLanguage, ''),
    translateNovels: asBool(raw?.translateNovels, DEFAULT_TRANSLATION_CONFIG.translateNovels),
  };
}

let cachedConfig: TranslationEngineConfig | null = null;

function readConfig(): TranslationEngineConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_TRANSLATION_CONFIG };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_TRANSLATION_CONFIG };
    return normalizeTranslationConfig(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_TRANSLATION_CONFIG };
  }
}

export function getTranslationConfig(): TranslationEngineConfig {
  if (!cachedConfig) cachedConfig = readConfig();
  return cachedConfig;
}

export function setTranslationConfig(patch: Partial<TranslationEngineConfig>) {
  const next = normalizeTranslationConfig({ ...getTranslationConfig(), ...patch });
  cachedConfig = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Private mode: session-only config still works. */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
  return next;
}

const listeners = new Set<() => void>();

export function subscribeTranslationConfig(listener: () => void) {
  listeners.add(listener);
  if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      cachedConfig = readConfig();
      listener();
    };
    const onUpdate = () => listener();
    window.addEventListener('storage', onStorage);
    window.addEventListener(UPDATE_EVENT, onUpdate);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(UPDATE_EVENT, onUpdate);
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Target language code for a surface, resolving 'auto' to the app language. */
export function resolveTargetLanguage(override?: string): string {
  const requested = (override || getTranslationConfig().targetLanguage || 'auto').trim().toLowerCase();
  if (requested && requested !== 'auto') return requested.split('-')[0];
  return (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
}
