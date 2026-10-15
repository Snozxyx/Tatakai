import { env, pipeline } from '@huggingface/transformers';
import wasmUrl from '@translation-ort-assets/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from '@translation-ort-assets/ort-wasm-simd-threaded.mjs?url';

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };
}

type LocalPipeline = (
  texts: string,
  options: Record<string, unknown>
) => Promise<Array<{ translation_text: string }>>;
let translator: Promise<LocalPipeline> | null = null;
let queue = Promise.resolve();
const cancelled = new Set<number>();

self.onmessage = ({ data }) => {
  if (data.type === 'cancel') {
    cancelled.add(data.id);
    return;
  }
  queue = queue.then(async () => {
    const { id, texts, source, target } = data as {
      id: number;
      texts: string[];
      source: string;
      target: string;
    };
    if (cancelled.delete(id)) return;
    try {
      if (!translator) {
        translator = pipeline('translation', 'Xenova/m2m100_418M', {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: (progress) =>
            self.postMessage({ type: 'progress', progress }),
        })
          .then((value) => value as unknown as LocalPipeline)
          .catch((error) => {
            translator = null;
            throw error;
          });
      }
      const engine = await translator;
      self.postMessage({ type: 'ready' });
      const translated: string[] = [];
      for (const text of texts) {
        if (cancelled.has(id)) break;
        const result = await engine(text, {
          src_lang: source,
          tgt_lang: target,
          max_new_tokens: 256,
          num_beams: 1,
        });
        if (typeof result[0]?.translation_text !== 'string')
          throw new Error('Invalid model result');
        translated.push(result[0].translation_text);
      }
      if (!cancelled.delete(id))
        self.postMessage({ type: 'result', id, texts: translated });
    } catch {
      cancelled.delete(id);
      self.postMessage({ type: 'error', id });
    }
  });
};
