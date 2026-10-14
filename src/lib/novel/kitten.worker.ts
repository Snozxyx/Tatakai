import { KittenTTS } from '@biwills/kittentts';
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };
let engine: KittenTTS | null = null;
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    const { id, modelId, text, voice, speed } = data;
    try {
      if (engine?.model !== modelId) {
        await engine?.dispose();
        engine = null;
        engine = await KittenTTS.create({
          model: modelId, transport: 'direct', executionMode: 'wasm', numThreads: 1,
          ortModuleLoader: async () => ort,
          onProgress: progress => self.postMessage({ id, type: 'progress', modelId, ...progress }),
        } as Parameters<typeof KittenTTS.create>[0] & { ortModuleLoader: () => Promise<typeof ort> });
      }
      if (text === undefined) {
        self.postMessage({ id, type: 'ready', modelId });
      } else {
        const audio = await engine.generate(text, { voice, speed });
        const wav = audio.wavData();
        self.postMessage({ id, type: 'audio', modelId, wav }, { transfer: [wav.buffer] });
      }
    } catch (error) {
      self.postMessage({ id, type: 'error', modelId, error: (error as Error).message });
    }
  });
};
