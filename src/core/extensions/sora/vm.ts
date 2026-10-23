import { throwCompatibilityAbort } from '../compatibility/abort';
import type { QuickJSWASMModule, QuickJSDeferredPromise } from 'quickjs-emscripten';

export interface SoraHttpRequest { url: string; headers?: Record<string, string>; method?: string; body?: string | null }
export interface SoraHttpResponse { status: number; headers: Record<string, string>; body: string }
export type SoraMethod = 'probe' | 'searchResults' | 'extractDetails' | 'extractEpisodes' | 'extractStreamUrl' | 'extractChapters' | 'extractImages';
const methods = ['searchResults', 'extractDetails', 'extractEpisodes', 'extractStreamUrl', 'extractChapters', 'extractImages'];
export interface ScriptVMHost {
  methods: readonly string[];
  setup: string;
  filename: string;
  expression(method: string, args: unknown[]): string;
  synchronous?(request: unknown): unknown;
}

/** Original source runs inside a bounded interpreter, with serialized HTTP as its only host capability. */
export async function evaluateSora(quickjs: QuickJSWASMModule, code: string, method: SoraMethod, args: unknown[], http: (request: SoraHttpRequest) => Promise<SoraHttpResponse>, signal?: AbortSignal, host?: ScriptVMHost) {
  if (code.length > 2 * 1024 * 1024 || (method !== 'probe' && !(host?.methods || methods).includes(method))) throw Error('Invalid local script request');
  throwCompatibilityAbort(signal);
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024); runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 25000;
  runtime.setInterruptHandler(() => !!signal?.aborted || Date.now() > deadline);
  const vm = runtime.newContext();
  const promises = new Set<QuickJSDeferredPromise>();
  let requests = 0;
  const pump = () => { if (vm.alive) { const jobs = runtime.executePendingJobs(1000); if (jobs.error) { const error = vm.dump(jobs.error); jobs.error.dispose(); throw Error(error?.message || 'Sora promise failed'); } } };
  try {
    if (host?.synchronous) {
      let synchronousCalls = 0;
      const callback = vm.newFunction('__nativeHost', payload => {
        if (++synchronousCalls > 20000) throw Error('Source exceeded its host operation limit');
        const text = vm.getString(payload);
        if (text.length > 2 * 1024 * 1024) throw Error('Host request exceeded 2 MB');
        const result = JSON.stringify(host.synchronous!(JSON.parse(text)) ?? null);
        if (result.length > 4 * 1024 * 1024) throw Error('Host result exceeded 4 MB');
        return vm.newString(result);
      });
      vm.setProp(vm.global, '__nativeHost', callback); callback.dispose();
    }
    for (const [name, operation] of [['atob', atob], ['btoa', btoa]] as const) {
      const fn = vm.newFunction(name, input => { const value = vm.getString(input); if (value.length > 2 * 1024 * 1024) throw Error('Base64 input exceeded 2 MB'); return vm.newString(operation(value)); });
      vm.setProp(vm.global, name, fn); fn.dispose();
    }
    const fetch = vm.newFunction('__nativeFetch', payload => {
      if (++requests > 64) throw Error('Sora module exceeded its network request limit');
      const request = JSON.parse(vm.getString(payload)) as SoraHttpRequest;
      const deferred = vm.newPromise(); promises.add(deferred);
      void http(request).then(response => {
        if (!vm.alive) return;
        const value = vm.newString(JSON.stringify(response)); deferred.resolve(value); value.dispose(); pump();
      }).catch(error => {
        if (!vm.alive) return;
        const value = vm.newError(String(error?.message || 'Source request failed')); deferred.reject(value); value.dispose();
        try { pump(); } catch { /* The worker's wall timeout also bounds failed guest jobs. */ }
      });
      return deferred.handle;
    });
    vm.setProp(vm.global, '__nativeFetch', fetch); fetch.dispose();
    const setup = vm.evalCode(`
      const console = Object.freeze({log(){},warn(){},error(){},debug(){}});
      async function fetchv2(url, headers = {}, method = 'GET', body = null) {
        if(headers && (headers.headers || headers.method || headers.body)) { const options=headers;headers=options.headers||{};method=options.method||'GET';body=options.body??null; }
        const data = JSON.parse(await __nativeFetch(JSON.stringify({url,headers,method,body})));
        return {status:data.status,ok:data.status>=200&&data.status<300,headers:data.headers,
          text:async()=>data.body,json:async()=>JSON.parse(data.body)};
      }
      const fetch = fetchv2;
      ${host?.setup || ''}
    `, 'sora-host.js');
    vm.unwrapResult(setup).dispose();
    vm.unwrapResult(vm.evalCode(code, host?.filename || 'original-sora-module.js')).dispose();
    const expression = host ? host.expression(method, args) : method === 'probe'
      ? `JSON.stringify({${methods.map(name => `${name}: typeof ${name} === 'function'`).join(',')}})`
      : `(async()=>JSON.stringify(await ${method}(...${JSON.stringify(args)})))()`;
    const result = vm.unwrapResult(vm.evalCode(expression, 'sora-call.js'));
    try {
      const settled = vm.resolvePromise(result); pump();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: (() => void) | undefined;
      const stopped = new Promise<never>((_, reject) => {
        abort = () => reject(signal?.reason || new Error('Source was cancelled'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        timer = setTimeout(() => reject(new Error('Source timed out')), Math.max(1, deadline - Date.now()));
      });
      let resolved: Awaited<typeof settled>;
      try { resolved = await Promise.race([settled, stopped]); }
      finally { if (timer) clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
      const handle = vm.unwrapResult(resolved);
      try { throwCompatibilityAbort(signal); const text = vm.getString(handle); if (text.length > 8 * 1024 * 1024) throw Error('Sora result exceeded 8 MB'); return text ? JSON.parse(text) : null; }
      finally { handle.dispose(); }
    } finally { result.dispose(); }
  } finally { for (const promise of promises) promise.dispose(); vm.dispose(); runtime.dispose(); }
}
