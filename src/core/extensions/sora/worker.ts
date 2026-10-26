import { newQuickJSWASMModule, newVariant, RELEASE_SYNC } from 'quickjs-emscripten';
import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { evaluateSora, type SoraHttpResponse } from './vm';

const pending = new Map<number, { resolve(value: SoraHttpResponse): void; reject(error: Error): void }>();
let next = 0, running = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'http') {
    const call = pending.get(data.id); if (!call) return;
    pending.delete(data.id); data.error ? call.reject(Error(data.error)) : call.resolve(data.result); return;
  }
  if (running || data.type !== 'run') return;
  running = true;
  try {
    const engine = await newQuickJSWASMModule(newVariant(RELEASE_SYNC, { wasmLocation: wasmUrl }));
    if (data.method === '__runtime_probe') {
      const context = engine.newContext();
      try {
        const handle = context.unwrapResult(context.evalCode('6 * 7'));
        const value = context.dump(handle); handle.dispose();
        if (value !== 42) throw Error('Local JavaScript runtime returned an invalid result');
        self.postMessage({ type: 'result', result: { ready: true } }); return;
      } finally { context.dispose(); }
    }
    const http: Parameters<typeof evaluateSora>[4] = request => new Promise((resolve, reject) => {
      const id = ++next; pending.set(id, { resolve, reject }); self.postMessage({ type: 'http', id, request });
    });
    const result = data.profile?.family === 'mangayomi'
      ? await (await import('../mangayomi/vm')).evaluateMangayomi(engine, data.code, data.method, data.args, data.profile.context, http, (await import('../mangayomi/dom')).createMangayomiDom())
      : await evaluateSora(engine, data.code, data.method, data.args, http);
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Sora execution failed' }); }
};
