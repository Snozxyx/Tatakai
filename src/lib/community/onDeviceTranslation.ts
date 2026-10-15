import { detectPostLanguage } from './detectLanguage';

const STORAGE_KEY = 'tatakai:community-translation';
export type TranslationStatus = 'idle' | 'loading' | 'ready' | 'error';
export type DeviceTranslationState = {
  enabled: boolean;
  status: TranslationStatus;
  progress: number | null;
};
export type DeviceTranslationResult = {
  texts: string[];
  sourceLanguage: string;
  targetLanguage: string;
  engine: 'native' | 'offline';
};
type NativeTranslator = {
  translate(text: string): Promise<string>;
  destroy?: () => void;
};
type Availability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';
type NativeFactory = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<Availability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<NativeTranslator>;
};
type NativeDetector = {
  availability(): Promise<Availability>;
  create(): Promise<{
    detect(
      text: string
    ): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
    destroy?: () => void;
  }>;
};

function readEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}
let state: DeviceTranslationState = {
  enabled: readEnabled(),
  status: 'idle',
  progress: null,
};
const serverState: DeviceTranslationState = {
  enabled: false,
  status: 'idle',
  progress: null,
};
const listeners = new Set<() => void>();
const nativeTranslators = new Map<string, Promise<NativeTranslator>>();
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (texts: string[]) => void; reject: (error: Error) => void }
>();
const downloads = new Map<string, { loaded: number; total: number }>();

function update(patch: Partial<DeviceTranslationState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
export function subscribeDeviceTranslation(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getDeviceTranslationState() {
  return state;
}
export function getServerTranslationState() {
  return serverState;
}

export function setDeviceTranslationEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* Session-only preferences still work. */
  }
  update({
    enabled,
    ...(!enabled ? { status: 'idle' as const, progress: null } : {}),
  });
  if (!enabled) {
    worker?.terminate();
    worker = null;
    downloads.clear();
    pending.forEach((request) =>
      request.reject(new DOMException('Translation disabled', 'AbortError'))
    );
    pending.clear();
    nativeTranslators.forEach((promise) => {
      void promise.then((engine) => engine.destroy?.()).catch(() => {});
    });
    nativeTranslators.clear();
  }
}

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') throw new Error('device-unavailable');
  worker = new Worker(new URL('./translation.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      const p = data.progress;
      if (
        p.status === 'progress' &&
        typeof p.loaded === 'number' &&
        typeof p.total === 'number'
      )
        downloads.set(p.file, { loaded: p.loaded, total: p.total });
      const files = [...downloads.values()];
      const total = Math.max(
        650 * 1024 * 1024,
        files.reduce((n, f) => n + f.total, 0)
      );
      const progress = Math.min(
        99,
        Math.round((files.reduce((n, f) => n + f.loaded, 0) / total) * 100)
      );
      update({
        status: 'loading',
        progress: Math.max(state.progress ?? 0, progress),
      });
      return;
    }
    if (data.type === 'ready') {
      update({ status: 'ready', progress: 100 });
      return;
    }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.type === 'result') request.resolve(data.texts);
    else {
      update({ status: 'error' });
      request.reject(new Error('translation-failed'));
    }
  };
  worker.onerror = () => {
    pending.forEach((request) =>
      request.reject(new Error('device-unavailable'))
    );
    pending.clear();
    worker?.terminate();
    worker = null;
    update({ status: 'error' });
  };
  return worker;
}

async function translateOffline(
  texts: string[],
  source: string,
  target: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const engine = getWorker();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      engine.postMessage({ type: 'cancel', id });
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    pending.set(id, {
      resolve: (value) => {
        signal?.removeEventListener('abort', abort);
        resolve(value);
      },
      reject: (error) => {
        signal?.removeEventListener('abort', abort);
        reject(error);
      },
    });
    signal?.addEventListener('abort', abort, { once: true });
    engine.postMessage({ type: 'translate', id, texts, source, target });
  });
}

export async function translateOnDevice(
  texts: string[],
  target: string,
  options: { signal?: AbortSignal; userGesture?: boolean } = {}
): Promise<DeviceTranslationResult> {
  if (!state.enabled) throw new Error('translation-disabled');
  if (
    !['en', 'es', 'ja'].includes(target) ||
    texts.length > 120 ||
    texts.reduce((n, t) => n + t.length, 0) > 12000
  )
    throw new Error('translation-limit');
  if (options.signal?.aborted)
    throw new DOMException('Cancelled', 'AbortError');
  const globals = globalThis as typeof globalThis & {
    Translator?: NativeFactory;
    LanguageDetector?: NativeDetector;
  };
  const sample = texts.join('\n');
  let source: string | null = null;
  if (globals.LanguageDetector) {
    try {
      const availability = await globals.LanguageDetector.availability();
      if (
        availability === 'available' ||
        (availability === 'downloadable' && options.userGesture)
      ) {
        const detector = await globals.LanguageDetector.create();
        try {
          const result = await detector.detect(sample);
          if (result[0]?.confidence >= 0.5)
            source = result[0].detectedLanguage.split('-')[0];
        } finally {
          detector.destroy?.();
        }
      }
    } catch {
      /* Statistical detection requires no model download. */
    }
  }
  source ??= detectPostLanguage(sample);
  if (!source) throw new Error('language-unknown');
  if (source === target)
    return {
      texts,
      sourceLanguage: source,
      targetLanguage: target,
      engine: 'native',
    };
  if (globals.Translator) {
    try {
      const parameters = { sourceLanguage: source, targetLanguage: target };
      const availability = await globals.Translator.availability(parameters);
      if (availability !== 'unavailable') {
        if (availability === 'downloadable' && !options.userGesture)
          throw new Error('language-pack-required');
        const key = `${source}:${target}`;
        let promise = nativeTranslators.get(key);
        if (!promise) {
          promise = globals.Translator.create(parameters);
          nativeTranslators.set(key, promise);
          promise.catch(() => nativeTranslators.delete(key));
        }
        const translator = await promise;
        const translated = [];
        for (const text of texts) {
          if (options.signal?.aborted)
            throw new DOMException('Cancelled', 'AbortError');
          translated.push(await translator.translate(text));
        }
        return {
          texts: translated,
          sourceLanguage: source,
          targetLanguage: target,
          engine: 'native',
        };
      }
    } catch (error) {
      if (
        (error as Error)?.message === 'language-pack-required' ||
        (error as Error)?.name === 'AbortError'
      )
        throw error;
      // A browser policy or unsupported language pair can block the native API.
      // The explicitly enabled local worker remains usable in that runtime.
    }
  }
  const memory = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { deviceMemory?: number })
    | undefined;
  if (memory?.deviceMemory !== undefined && memory.deviceMemory < 4)
    throw new Error('device-memory');
  const translated = await translateOffline(
    texts,
    source,
    target,
    options.signal
  );
  return {
    texts: translated,
    sourceLanguage: source,
    targetLanguage: target,
    engine: 'offline',
  };
}
