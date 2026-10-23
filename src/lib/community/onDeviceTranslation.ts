import { detectPostLanguage } from './detectLanguage';

const STORAGE_KEY = 'tatakai:community-translation';
export type TranslationStatus = 'idle' | 'loading' | 'ready' | 'error';
export type DeviceTranslationState = {
  enabled: boolean;
  status: TranslationStatus;
  progress: number | null;
  mode?: 'auto' | 'browser';
  engine?: 'native' | 'offline' | null;
  cached?: boolean;
  downloadedBytes?: number;
  nativeAvailable?: boolean;
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
  mode: (() => {
    try {
      return localStorage.getItem('tatakai:translation-mode') === 'browser'
        ? 'browser'
        : 'auto';
    } catch {
      return 'auto';
    }
  })(),
  engine: null,
  cached: false,
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
let translationEpoch = 0;
const pending = new Map<
  number,
  { resolve: (texts: string[]) => void; reject: (error: Error) => void }
>();
const downloads = new Map<string, { loaded: number; total: number }>();

export function setDeviceTranslationMode(mode: 'auto' | 'browser') {
  const enabled = state.enabled;
  setDeviceTranslationEnabled(false);
  try {
    localStorage.setItem('tatakai:translation-mode', mode);
  } catch {
    /* session only */
  }
  update({ mode, engine: null });
  setDeviceTranslationEnabled(enabled);
}

/** Inspect persistent model files without reading their large bodies into memory. */
export async function inspectDeviceTranslation() {
  let cached = false;
  try {
    const files: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (request.url.includes('Xenova/m2m100_418M/'))
          files.push(request.url);
      }
    }
    cached = [
      'encoder_model_quantized.onnx',
      'decoder_model_merged_quantized.onnx',
    ].every((file) => files.some((url) => url.endsWith(file)));
  } catch {
    /* Cache API may be disabled. */
  }
  update({
    cached,
    nativeAvailable: typeof (globalThis as any).Translator !== 'undefined',
  });
}

export async function prepareDeviceTranslation(target: string) {
  if (!state.enabled) setDeviceTranslationEnabled(true);
  const epoch = translationEpoch;
  if (
    state.mode === 'browser' ||
    typeof (globalThis as any).Translator !== 'undefined'
  ) {
    const factory = (globalThis as any).Translator as NativeFactory | undefined;
    if (!factory) {
      update({ status: 'error', engine: 'native' });
      throw new Error('browser-unavailable');
    }
    update({ status: 'loading', engine: 'native', progress: null });
    try {
      const source = target === 'en' ? 'es' : 'en';
      const parameters = { sourceLanguage: source, targetLanguage: target };
      if ((await factory.availability(parameters)) === 'unavailable')
        throw new Error('browser-unavailable');
      const translator = await factory.create(parameters);
      if (!state.enabled || epoch !== translationEpoch) {
        translator.destroy?.();
        throw new DOMException('Cancelled', 'AbortError');
      }
      nativeTranslators.set(`${source}:${target}`, Promise.resolve(translator));
      update({ status: 'ready', engine: 'native', progress: 100 });
      return;
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      if (state.mode === 'browser') {
        update({ status: 'error' });
        throw error;
      }
    }
  }
  if ((navigator as Navigator & { deviceMemory?: number }).deviceMemory! < 4) {
    update({ status: 'error' });
    throw new Error('device-memory');
  }
  update({ status: 'loading', engine: 'offline', progress: 0 });
  await translateOffline([], 'en', target);
  void inspectDeviceTranslation();
}

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
    translationEpoch++;
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
    lastWorkerActivity = Date.now();
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
        engine: 'offline',
        downloadedBytes: files.reduce((n, f) => n + f.loaded, 0),
        progress: Math.max(state.progress ?? 0, progress),
      });
      return;
    }
    if (data.type === 'ready') {
      update({ status: 'ready', progress: 100, engine: 'offline' });
      void inspectDeviceTranslation();
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

const REQUEST_WATCHDOG_MS = 150_000;
// The watchdog only fires after a quiet stretch: a healthy model download
// streams progress messages that keep pushing this timestamp forward.
let lastWorkerActivity = Date.now();

async function translateOffline(
  texts: string[],
  source: string,
  target: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const engine = getWorker();
  const id = ++nextId;
  let watchdog: number | undefined;
  return new Promise<string[]>((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      engine.postMessage({ type: 'cancel', id });
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const armWatchdog = () => {
      watchdog = window.setTimeout(() => {
        if (Date.now() - lastWorkerActivity < REQUEST_WATCHDOG_MS) {
          // Still streaming model chunks — re-arm and wait for the worker.
          armWatchdog();
          return;
        }
        // The worker went quiet mid-request — usually a stalled 650 MB model
        // download that blocks the serialized queue behind it. Terminate and
        // start fresh so pending posts fail over instead of spinning forever.
        worker?.terminate();
        worker = null;
        pending.forEach((entry) =>
          entry.reject(new Error('translation-timeout'))
        );
        pending.clear();
        update({ status: 'error' });
      }, REQUEST_WATCHDOG_MS);
    };
    armWatchdog();
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
  }).finally(() => {
    if (watchdog !== undefined) window.clearTimeout(watchdog);
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
        update({ status: 'ready', engine: 'native', progress: 100 });
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
  if (state.mode === 'browser') throw new Error('browser-unavailable');
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
