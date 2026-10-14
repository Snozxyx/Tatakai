/** On-device browser KittenTTS. Runs in web, Electron and Capacitor. */
export const KITTEN_VOICES = ['Luna', 'Bella', 'Bruno', 'Jasper', 'Rosie', 'Hugo', 'Kiki', 'Leo'];
const models = [
  { id: 'nano-int8', label: 'Nano (fast)', description: 'About 28 MB. Recommended for phones and quick playback.', approxBytes: 28_000_000 },
  { id: 'mini', label: 'Mini (balanced)', description: 'About 82 MB. Uses more memory and takes longer to generate.', approxBytes: 82_000_000 },
];
export interface KittenLocalStatus {
  ready: boolean; activeModel: string | null; voices: string[];
  models: Array<typeof models[number] & { downloaded: boolean; downloading: boolean }>;
}
export interface KittenProgress { modelId: string; phase: string; progress?: number; error?: string; }
let worker: Worker | null = null;
let sequence = 0;
let activeModel: string | null = null;
const prepared = new Set<string>();
const listeners = new Set<(progress: KittenProgress) => void>();
const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
export const isKittenLocalAvailable = () => typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
export const onKittenProgress = (listener: (progress: KittenProgress) => void) => {
  listeners.add(listener); return () => { listeners.delete(listener); };
};
const emit = (progress: KittenProgress) => listeners.forEach(listener => listener(progress));
function resetWorker(error: Error) {
  worker?.terminate(); worker = null; activeModel = null;
  pending.forEach(request => request.reject(error)); pending.clear();
}
function getWorker() {
  if (!isKittenLocalAvailable()) throw new Error('KittenTTS needs a browser with WebAssembly and Web Workers. Update your browser and retry.');
  if (!worker) {
    worker = new Worker(new URL('./kitten.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { emit(data); return; }
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.type === 'error') {
        emit({ modelId: data.modelId, phase: 'error', error: data.error });
        request.reject(new Error(data.error || 'KittenTTS could not generate audio. Retry the model download.'));
      } else {
        activeModel = data.modelId; prepared.add(data.modelId);
        emit({ modelId: data.modelId, phase: 'ready' }); request.resolve(data);
      }
    };
    worker.onerror = () => resetWorker(new Error('KittenTTS worker failed. Reload the app and retry.'));
  }
  return worker;
}
// Older settings may select the Python-only KittenTTS 2 model.
export const browserKittenModel = (id?: string) => id === 'mini' ? 'mini' : 'nano-int8';
async function request(payload: { modelId: string; text?: string; voice?: string; speed?: number }, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const runtime = getWorker();
  const id = ++sequence;
  const abort = () => resetWorker(new DOMException('Stopped', 'AbortError'));
  const timer = window.setTimeout(() => resetWorker(new Error('KittenTTS timed out. Retry Nano or check your connection.')), 180_000);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await new Promise<any>((resolve, reject) => {
      pending.set(id, { resolve, reject }); runtime.postMessage({ id, ...payload });
    });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
export async function getKittenLocalStatus(): Promise<KittenLocalStatus> {
  return { ready: activeModel !== null, activeModel, voices: KITTEN_VOICES,
    models: models.map(model => ({ ...model, downloaded: prepared.has(model.id), downloading: false })) };
}
export async function prepareKittenModel(modelId: string) {
  await request({ modelId: browserKittenModel(modelId) });
}
export async function synthesizeKittenLocal(text: string, options: { modelId?: string; voice?: string; speed?: number }, signal?: AbortSignal) {
  const modelId = browserKittenModel(options.modelId);
  const result = await request({ text, modelId, voice: KITTEN_VOICES.includes(options.voice || '') ? options.voice : 'Luna', speed: options.speed }, signal);
  signal?.throwIfAborted();
  const url = URL.createObjectURL(new Blob([result.wav], { type: 'audio/wav' }));
  return { url, model: modelId, release: () => URL.revokeObjectURL(url) };
}
