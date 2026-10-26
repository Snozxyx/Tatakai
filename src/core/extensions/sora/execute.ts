import { compatibilityAny, throwCompatibilityAbort } from '../compatibility/abort';
import { extensionFetch } from '../remote/transport';
import type { SoraHttpRequest, SoraMethod } from './vm';
import type { MangayomiContext, MangayomiMethod } from '../mangayomi/vm';
import { localScriptConcurrency, recordLocalScriptRuntimeResult } from './runtime';

export async function prepareLocalScriptRuntime(signal?: AbortSignal) {
  try { await executeLocalScript('', '__runtime_probe', [], signal); recordLocalScriptRuntimeResult(); return { ready: true }; }
  catch (error) { if (!signal?.aborted) recordLocalScriptRuntimeResult(error instanceof Error ? error.message : 'The local runtime could not start'); throw error; }
}

let active = 0;
const waiting = new Set<() => void>();
async function acquire(signal?: AbortSignal) {
  throwCompatibilityAbort(signal);
  return new Promise<() => void>((resolve, reject) => {
    const ready = () => {
      cleanup(); active++;
      let released = false;
      resolve(() => { if (released) return; released = true; active--; waiting.values().next().value?.(); });
    };
    const abort = () => { cleanup(); reject(signal?.reason || new DOMException('Aborted', 'AbortError')); };
    const cleanup = () => { waiting.delete(ready); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else if (active < localScriptConcurrency()) ready(); else waiting.add(ready);
  });
}
export async function executeSora(code: string, method: SoraMethod, args: unknown[], signal?: AbortSignal): Promise<any> {
  return executeLocalScript(code, method, args, signal);
}
export async function executeMangayomi(code: string, method: MangayomiMethod, args: unknown[], context: MangayomiContext, signal?: AbortSignal): Promise<{ value: any; preferences: Record<string, unknown> }> {
  return executeLocalScript(code, method, args, signal, { family: 'mangayomi', context });
}
async function executeLocalScript(code: string, method: string, args: unknown[], signal?: AbortSignal, profile?: { family: 'mangayomi'; context: MangayomiContext }) {
  const release = await acquire(signal);
  const controller = new AbortController();
  const combined = signal ? compatibilityAny([signal, controller.signal]) : controller.signal;
  let worker: Worker | undefined;
  try {
    throwCompatibilityAbort(combined);
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return await new Promise<any>((resolve, reject) => {
      let inFlight = 0;
      const abort = () => finish(combined.reason || new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => controller.abort(new Error('Sora module timed out')), 30000);
      const finish = (error?: unknown, result?: unknown) => { clearTimeout(timer); combined.removeEventListener('abort', abort); error ? reject(error) : resolve(result); };
      combined.addEventListener('abort', abort, { once: true });
      worker!.onerror = () => finish(Error('Sora worker stopped'));
      worker!.onmessage = async ({ data }) => {
        if (combined.aborted) return;
        if (data.type === 'result') { recordLocalScriptRuntimeResult(); return finish(undefined, data.result); }
        if (data.type === 'error') return finish(Error(data.error));
        if (data.type !== 'http' || !Number.isSafeInteger(data.id)) return;
        try {
          if (++inFlight > 8) throw Error('Too many concurrent Sora HTTP requests');
          const request = data.request as SoraHttpRequest;
          const url = new URL(request.url);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid source request URL');
          const method = String(request.method || 'GET').toUpperCase();
          if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) throw Error('Unsupported source request method');
          if (request.body != null && (typeof request.body !== 'string' || request.body.length > 1024 * 1024)) throw Error('Source request body exceeded 1 MB');
          const headers = new Headers(request.headers || {});
          if (JSON.stringify([...headers]).length > 16384) throw Error('Source headers exceeded 16 KB');
          const response = await extensionFetch(url.href, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : request.body, signal: combined });
          const result = { status: response.status, headers: Object.fromEntries(Object.entries(response.rawHeaders).map(([name, values]) => [name, values.join(', ')])), body: await response.text() };
          if (result.body.length > 8 * 1024 * 1024) throw Error('Source HTTP response exceeded 8 MB');
          if (!combined.aborted) worker!.postMessage({ type: 'http', id: data.id, result });
        } catch (error) { if (!combined.aborted) worker!.postMessage({ type: 'http', id: data.id, error: error instanceof Error ? error.message : 'Source request failed' }); }
        finally { inFlight--; }
      };
      worker!.postMessage({ type: 'run', code, method, args, profile });
    });
  } finally { controller.abort(); worker?.terminate(); release(); }
}
