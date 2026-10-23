import { detectPostLanguage } from '@/lib/community/detectLanguage';
import { translateOnDevice } from '@/lib/community/onDeviceTranslation';
import {
  getTranslationConfig,
  resolveTargetLanguage,
  type TranslationProviderId,
} from './config';
import {
  azure,
  deepl,
  deeplx,
  edgeFreeAPI,
  google,
  gtxFreeAPI,
  openaiCompat,
  type TranslationService,
} from './providers';

/**
 * Provider-agnostic translation orchestrator.
 *
 * Adds what the raw services lack: result caching, bounded concurrency, a
 * shared 429 cooldown, per-request timeouts, line-count verification with a
 * per-line fallback, and the 'auto' provider chain (free endpoints first,
 * on-device engine as the last resort).
 */

const SERVICES: Partial<Record<TranslationProviderId, TranslationService>> = {
  gtx: gtxFreeAPI,
  edge: edgeFreeAPI,
  google,
  deepl,
  deeplx,
  azure,
  openai: openaiCompat,
};

export const CLOUD_PROVIDERS: ReadonlyArray<{ id: TranslationProviderId; label: string }> = [
  { id: 'gtx', label: 'Google (Free)' },
  { id: 'edge', label: 'Edge (Free)' },
  { id: 'google', label: 'Google Cloud' },
  { id: 'deepl', label: 'DeepL' },
  { id: 'deeplx', label: 'DeepLX' },
  { id: 'azure', label: 'Azure' },
  { id: 'openai', label: 'Custom LLM (OpenAI-compatible)' },
];

// ─── cache ───────────────────────────────────────────────────────────────────

const CACHE_STORAGE_KEY = 'tatakai:translation-cache';
const CACHE_MAX_ENTRIES = 400;
const memoryCache = new Map<string, string[]>();
let persistTimer: number | null = null;

// FNV-1a — short stable key; the full text lives in the value only.
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ':' + text.length.toString(36);
}

function loadPersistedCache() {
  if (typeof window === 'undefined' || memoryCache.size) return;
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Array<[string, string[]]>;
    for (const [key, value] of entries.slice(-CACHE_MAX_ENTRIES)) {
      if (Array.isArray(value)) memoryCache.set(key, value);
    }
  } catch {
    /* corrupted cache is as good as none */
  }
}

function persistCache() {
  if (typeof window === 'undefined') return;
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      while (memoryCache.size > CACHE_MAX_ENTRIES) {
        memoryCache.delete(memoryCache.keys().next().value as string);
      }
      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify([...memoryCache]));
    } catch {
      /* quota — memory cache still works */
    }
  }, 2000);
}

export function clearTranslationCache() {
  memoryCache.clear();
  try {
    window.localStorage.removeItem(CACHE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ─── concurrency + rate-limit gates ─────────────────────────────────────────

const MAX_INFLIGHT = 3;
let inflight = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return () => {
      inflight--;
      waiters.shift()?.();
    };
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      const index = waiters.indexOf(resolve);
      if (index >= 0) waiters.splice(index, 1);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    waiters.push(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    });
  });
  inflight++;
  return () => {
    inflight--;
    waiters.shift()?.();
  };
}

let cooldownUntil = 0;

async function withCooldownGate(signal?: AbortSignal) {
  const wait = cooldownUntil - Date.now();
  if (wait > 0 && !signal?.aborted) await new Promise((r) => setTimeout(r, Math.min(wait, 30_000)));
}

function noteRateLimit(error: unknown) {
  const retryAfterMs = (error as { retryAfterMs?: number })?.retryAfterMs;
  cooldownUntil = Date.now() + Math.min(retryAfterMs ?? 8_000, 30_000);
}

const isRetryable = (error: unknown) => {
  const status = (error as { status?: number })?.status;
  if (status) return status === 429 || status >= 500;
  // Network failures (TypeError: failed to fetch) carry no status.
  return error instanceof TypeError;
};

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

// ─── provider resolution ─────────────────────────────────────────────────────

function resolveChain(provider: TranslationProviderId): TranslationProviderId[] {
  if (provider !== 'auto') return [provider];
  const chain: TranslationProviderId[] = ['gtx', 'edge'];
  const config = getTranslationConfig();
  if (config.apiKey) chain.push('google');
  return chain;
}

async function translateWithProvider(
  provider: TranslationProviderId,
  texts: string[],
  source: string,
  target: string,
  options: { signal?: AbortSignal; timeoutMs: number; userGesture?: boolean },
): Promise<string[]> {
  if (provider === 'on-device') {
    const result = await translateOnDevice(texts, target, {
      signal: options.signal,
      userGesture: options.userGesture,
    });
    return result.texts;
  }
  const service = SERVICES[provider];
  if (!service) throw new Error('translation-provider-unavailable');
  const config = getTranslationConfig();
  const { signal, cancel } = withTimeout(options.signal, options.timeoutMs);
  const release = await acquireSlot(signal);
  try {
    await withCooldownGate(signal);
    const joined = texts.join('\n');
    let output: string;
    try {
      output = await service({
        text: joined,
        sourceLanguage: source,
        targetLanguage: target,
        url: config.url,
        apiKey: config.apiKey,
        model: config.model,
        region: config.region,
        signal,
      });
    } catch (error) {
      if (isRetryable(error) && !signal.aborted) {
        if ((error as { status?: number })?.status === 429) noteRateLimit(error);
        await new Promise((r) => setTimeout(r, (error as { retryAfterMs?: number })?.retryAfterMs ?? 800));
        output = await service({
          text: joined,
          sourceLanguage: source,
          targetLanguage: target,
          url: config.url,
          apiKey: config.apiKey,
          model: config.model,
          region: config.region,
          signal,
        });
      } else {
        throw error;
      }
    }
    const lines = output.split('\n');
    // Engines occasionally merge/drop lines; re-run stragglers one-by-one so
    // the 1:1 slot mapping the renderers depend on can never break.
    if (lines.length !== texts.length) {
      const translated: string[] = [];
      for (const text of texts) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        if (!text.trim()) {
          translated.push(text);
          continue;
        }
        translated.push(
          await service({
            text,
            sourceLanguage: source,
            targetLanguage: target,
            url: config.url,
            apiKey: config.apiKey,
            model: config.model,
            region: config.region,
            signal,
          }),
        );
      }
      return translated;
    }
    return lines;
  } finally {
    cancel();
    release();
  }
}

export type TranslateTextsResult = {
  texts: string[];
  sourceLanguage: string;
  engine: TranslationProviderId;
};

export class TranslationUnavailableError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

/**
 * Translate an array of text slots 1:1. Throws TranslationUnavailableError
 * when no provider in the chain can serve (so callers keep the original text).
 */
export async function translateTexts(
  texts: string[],
  options: {
    target?: string;
    provider?: TranslationProviderId;
    signal?: AbortSignal;
    /** Per-request timeout. Free endpoints are slow under load — 30s default. */
    timeoutMs?: number;
    userGesture?: boolean;
    /** Skip the cache (retry after a failure). */
    fresh?: boolean;
  } = {},
): Promise<TranslateTextsResult> {
  const config = getTranslationConfig();
  if (!config.enabled && (options.provider ?? config.provider) !== 'on-device')
    throw new TranslationUnavailableError('translation-disabled');
  if (!texts.length) return { texts, sourceLanguage: 'und', engine: 'gtx' };

  const target = resolveTargetLanguage(options.target);
  const provider = options.provider ?? config.provider;
  const sample = texts.join('\n').slice(0, 2000);
  const source = detectPostLanguage(sample) || 'auto';

  if (source === target) return { texts, sourceLanguage: source, engine: provider };

  // Cache lookup: one key per text slot, hit when every slot is cached.
  const engine = provider === 'auto' ? 'gtx' : provider;
  const keys = texts.map((text) => `${engine}|${target}|${hashText(text)}`);
  loadPersistedCache();
  if (!options.fresh) {
    const cached = keys.map((key) => memoryCache.get(key));
    if (cached.every((value) => value !== undefined)) {
      return { texts: cached as string[], sourceLanguage: source, engine };
    }
  }

  const chain = resolveChain(provider);
  const failures: string[] = [];
  for (const candidate of chain) {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    // The on-device fallback only runs when the user opted into it.
    if (candidate === 'on-device') {
      if (!getDeviceEnabled()) {
        failures.push('on-device:disabled');
        continue;
      }
    }
    try {
      const translated = await translateWithProvider(candidate, texts, source, target, {
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? 30_000,
        userGesture: options.userGesture,
      });
      translated.forEach((value, index) => memoryCache.set(keys[index], value === undefined ? texts[index] : value));
      persistCache();
      return { texts: translated, sourceLanguage: source, engine: candidate };
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || (error as Error)?.name === 'TimeoutError') throw error;
      if (error instanceof TranslationUnavailableError) throw error;
      failures.push(`${candidate}:${(error as Error)?.message || 'failed'}`);
      if (candidate === 'on-device') break; // last chain link
    }
  }
  throw new TranslationUnavailableError(failures.join('; ') || 'translation-failed');
}

function getDeviceEnabled(): boolean {
  try {
    return window.localStorage.getItem('tatakai:community-translation') === 'on';
  } catch {
    return false;
  }
}

/** Does any configured engine exist? Used to decide whether UI offers translation. */
export function hasUsableEngine(): boolean {
  const config = getTranslationConfig();
  return config.provider !== 'on-device' || getDeviceEnabled();
}
