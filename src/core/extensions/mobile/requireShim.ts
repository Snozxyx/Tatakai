/**
 * requireShim.ts — a CommonJS `require` for the in-WebView extension runtime.
 *
 * Extension worker bundles are built `platform: 'node', format: 'cjs'` with the
 * Node built-ins `node:*, fs, path, os, crypto, url, util, http, https` left
 * external (see docs/extension/build-your-first-extension.md). esbuild therefore
 * emits bare `require("crypto")`-style calls and, like Node's own module
 * wrapper, expects an ambient CommonJS `require`. `platform: 'node'` also marks
 * EVERY other Node built-in external (events, stream, buffer, …), so the shim
 * must answer for any of them a dependency might pull in.
 *
 * On desktop the bundle runs in a Node `worker_threads` Worker, so that ambient
 * `require` is real. In the WebView there is none, so the first externalized
 * `require(...)` threw `ReferenceError: require is not defined` and the whole
 * install failed (the user-visible "requires not found"). This provides a
 * browser-safe `require` so the same bundle loads unchanged.
 *
 * Philosophy: never throw at *load*. A bundle that only `require`s a built-in
 * for an optional path must still register. Browser-equivalent built-ins (url,
 * util, path, querystring, events) get real implementations; host-only ones
 * (fs, http servers) get stubs whose *methods* throw only when actually called,
 * so the common scraping path — which goes through the injected
 * `__tatakai_fetch__` / `__tatakai_parse_html__` globals, not these — works and
 * only genuinely-unsupported calls surface an error.
 */

// Browser Buffer polyfill (feross/buffer). Node bundles reference a global
// `Buffer` and `require('buffer').Buffer`; the WebView has neither, so we back
// both with this and inject it as a bundle-scoped param (see
// createMobileNodeGlobals). undici/cheerio touch `Buffer.alloc` at load.
import { Buffer as BufferPolyfill } from 'buffer';

/** Minimal Node-compatible EventEmitter (deps pull `events` in transitively). */
class MiniEventEmitter {
  private _l: Record<string, Array<(...a: unknown[]) => void>> = {};
  on(e: string, fn: (...a: unknown[]) => void) { (this._l[e] ||= []).push(fn); return this; }
  once(e: string, fn: (...a: unknown[]) => void) {
    const w = (...a: unknown[]) => { this.off(e, w); fn(...a); };
    return this.on(e, w);
  }
  off(e: string, fn: (...a: unknown[]) => void) {
    this._l[e] = (this._l[e] || []).filter((f) => f !== fn); return this;
  }
  removeListener(e: string, fn: (...a: unknown[]) => void) { return this.off(e, fn); }
  removeAllListeners(e?: string) { if (e) delete this._l[e]; else this._l = {}; return this; }
  emit(e: string, ...a: unknown[]) {
    const ls = this._l[e] || []; ls.forEach((f) => f(...a)); return ls.length > 0;
  }
  addListener(e: string, fn: (...a: unknown[]) => void) { return this.on(e, fn); }
  listeners(e: string) { return [...(this._l[e] || [])]; }
}

/** Posix-only path helpers — enough for id/url manipulation in scrapers. */
const pathShim = (() => {
  const normalizeArr = (parts: string[]) => {
    const out: string[] = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return out;
  };
  const join = (...segs: string[]) => {
    const joined = segs.filter(Boolean).join('/');
    const abs = joined.startsWith('/');
    const res = normalizeArr(joined.split('/')).join('/');
    return (abs ? '/' : '') + res || (abs ? '/' : '.');
  };
  return {
    sep: '/',
    delimiter: ':',
    join,
    resolve: (...segs: string[]) => join('/', ...segs),
    normalize: (p: string) => join(p),
    basename: (p: string, ext?: string) => {
      const b = p.split('/').filter(Boolean).pop() || '';
      return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
    },
    dirname: (p: string) => {
      const parts = p.split('/'); parts.pop();
      return parts.join('/') || (p.startsWith('/') ? '/' : '.');
    },
    extname: (p: string) => {
      const b = p.split('/').pop() || ''; const i = b.lastIndexOf('.');
      return i > 0 ? b.slice(i) : '';
    },
    isAbsolute: (p: string) => p.startsWith('/'),
    parse: (p: string) => ({
      root: p.startsWith('/') ? '/' : '',
      dir: pathShim.dirname(p),
      base: pathShim.basename(p),
      ext: pathShim.extname(p),
      name: pathShim.basename(p, pathShim.extname(p)),
    }),
  } as Record<string, unknown>;
})();

/** A module stub whose property access is load-safe but calls throw clearly. */
function unavailableModule(name: string): unknown {
  // NB: a *regular* function (not arrow) — it must have a real `.prototype`
  // object and be a constructor so `class X extends require('fs').Thing {}`
  // and `util.inherits(x, require('fs').Thing)` don't throw at load.
  function thrower(): never {
    throw new Error(`Node module "${name}" is not available in the mobile extension runtime`);
  }
  return new Proxy(thrower, {
    get: (_t, prop) => (prop === 'default' ? undefined : prop === 'prototype' ? thrower.prototype : thrower),
    apply: () => thrower(),
    construct: () => thrower(),
  });
}

/**
 * Wrap a real module object so reading a member we DON'T implement yields a
 * lazy-throwing function instead of `undefined`. Bundles built for Node often do
 * `class X extends mod.Base {}`, `util.inherits(X, mod.Base)`, or touch
 * `mod.Base.prototype` at load for a member of an otherwise-present module; if
 * that member is `undefined` the load crashes with "cannot read properties of
 * undefined (reading 'prototype')". A function keeps `.prototype` / `extends`
 * load-safe and only throws if the member is actually called. Defined members
 * (including `default`) pass through unchanged.
 */
function wrapModule(name: string, target: Record<string, unknown>): Record<string, unknown> {
  // NB: a *regular* function (not arrow) so it has a real `.prototype` object
  // and is a constructor — `class X extends require('crypto').Hash {}` then does
  // `Object.setPrototypeOf(X.prototype, miss.prototype)` which an arrow fn's
  // `undefined` prototype would reject with "object prototype may only be an
  // object or null".
  function miss(): never {
    throw new Error(`"${name}" member is not available in the mobile extension runtime`);
  }
  // CJS/ESM interop: `require('x').default` should resolve to the module itself.
  if (!target.default) { try { target.default = target; } catch { /* frozen */ } }
  return new Proxy(target, {
    get(t, prop, recv) {
      if (prop in t) return Reflect.get(t, prop, recv);
      // Keep the object a plain, non-thenable, non-iterable value for interop.
      if (typeof prop === 'symbol' || prop === 'then' || prop === '__esModule') return undefined;
      return miss;
    },
  }) as unknown as Record<string, unknown>;
}

/** Build the module table lazily (Web Crypto / Buffer may differ per host). */
function buildModules(): Record<string, unknown> {
  const g = globalThis as unknown as Record<string, unknown>;

  const urlMod = {
    URL,
    URLSearchParams,
    parse: (u: string) => { try { return new URL(u); } catch { return {}; } },
    format: (u: unknown) => (u instanceof URL ? u.toString() : String(u)),
    fileURLToPath: (u: string) => (u.startsWith('file://') ? u.slice(7) : u),
    pathToFileURL: (p: string) => new URL(`file://${p}`),
  } as Record<string, unknown>;

  const utilMod = {
    TextEncoder, TextDecoder,
    promisify: <A extends unknown[], R>(fn: (...a: [...A, (e: unknown, v: R) => void]) => void) =>
      (...args: A) => new Promise<R>((res, rej) =>
        fn(...args, (e: unknown, v: R) => (e ? rej(e) : res(v)))),
    callbackify: <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
      (...args: [...A, (e: unknown, v?: R) => void]) => {
        const cb = args.pop() as (e: unknown, v?: R) => void;
        fn(...(args as unknown as A)).then((v) => cb(null, v), (e) => cb(e));
      },
    inspect: (v: unknown) => { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return String(v); } },
    format: (...a: unknown[]) => a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '),
    formatWithOptions: (_opts: unknown, ...a: unknown[]) => a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '),
    // Node debug loggers: a disabled no-op logger (deps like undici call this at load).
    debuglog: (_section?: string) => Object.assign((..._a: unknown[]) => {}, { enabled: false }),
    debug: (_section?: string) => (..._a: unknown[]) => {},
    toUSVString: (v: unknown) => String(v),
    stripVTControlCharacters: (v: unknown) => String(v),
    getSystemErrorName: (n: unknown) => `Error ${String(n)}`,
    aborted: (signal: { aborted?: boolean } | undefined) => !!(signal && signal.aborted),
    addAbortListener: (signal: AbortSignal | undefined, cb: () => void) => {
      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', cb, { once: true });
        return { [Symbol.dispose]: () => signal.removeEventListener('abort', cb) };
      }
      return { [Symbol.dispose]: () => {} };
    },
    deprecate: <T>(fn: T) => fn,
    inherits: (ctor: { prototype: object; super_?: unknown }, sup: { prototype: object } | undefined) => {
      // Node throws when superCtor is undefined; degrade instead so a bundle
      // whose superclass resolved to an unimplemented member still loads.
      ctor.super_ = sup;
      const proto = sup && (typeof sup === 'object' || typeof sup === 'function')
        ? (sup as { prototype?: object }).prototype
        : undefined;
      if (proto) Object.setPrototypeOf(ctor.prototype, proto);
    },
    types: {
      isDate: (v: unknown) => v instanceof Date,
      isRegExp: (v: unknown) => v instanceof RegExp,
      isPromise: (v: unknown) => !!v && typeof (v as { then?: unknown }).then === 'function',
      isMap: (v: unknown) => v instanceof Map,
      isSet: (v: unknown) => v instanceof Set,
      isArrayBuffer: (v: unknown) => v instanceof ArrayBuffer,
      isTypedArray: (v: unknown) => ArrayBuffer.isView(v) && !(v instanceof DataView),
      isUint8Array: (v: unknown) => v instanceof Uint8Array,
      isAnyArrayBuffer: (v: unknown) =>
        v instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && v instanceof SharedArrayBuffer),
    },
    isArray: Array.isArray,
  } as Record<string, unknown>;

  const randomBytes = (n: number) => {
    const b = new Uint8Array(n);
    (g.crypto as Crypto | undefined)?.getRandomValues?.(b);
    return b;
  };
  const randomUUID = () => {
    const native = (g.crypto as (Crypto & { randomUUID?: () => string }) | undefined)?.randomUUID;
    if (native) return native.call(g.crypto);
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
  };
  const cryptoMod = {
    webcrypto: g.crypto,
    subtle: (g.crypto as Crypto | undefined)?.subtle,
    getRandomValues: (a: Uint8Array) => (g.crypto as Crypto).getRandomValues(a),
    randomUUID,
    randomBytes,
    // undici probes `crypto.getHashes()` at load to decide SRI support; an empty
    // list cleanly disables SRI (we don't verify integrity in the WebView).
    getHashes: () => [] as string[],
    constants: {},
    createHash: () => { throw new Error('crypto.createHash is not available in the mobile extension runtime'); },
    createHmac: () => { throw new Error('crypto.createHmac is not available in the mobile extension runtime'); },
    hash: () => { throw new Error('crypto.hash is not available in the mobile extension runtime'); },
  } as Record<string, unknown>;

  const osMod = {
    platform: () => 'android', type: () => 'Linux', arch: () => 'arm64',
    release: () => '0.0.0', EOL: '\n', tmpdir: () => '/tmp', homedir: () => '/',
    hostname: () => 'mobile', cpus: () => [], totalmem: () => 0, freemem: () => 0,
  } as Record<string, unknown>;

  const qsMod = {
    parse: (s: string) => Object.fromEntries(new URLSearchParams(s)),
    stringify: (o: Record<string, string>) => new URLSearchParams(o).toString(),
    escape: encodeURIComponent, unescape: decodeURIComponent,
  } as Record<string, unknown>;

  const streamStub = unavailableModule('stream');
  // `require('buffer').Buffer` is undefined in the WebView (no global Buffer),
  // so back it with the polyfill — undici/cheerio call `Buffer.alloc` at load.
  // Prefer a real host Buffer if one exists, else the polyfill.
  const BufferImpl = (g.Buffer as typeof BufferPolyfill | undefined) || BufferPolyfill;
  const bufferMod: Record<string, unknown> = {
    Buffer: BufferImpl,
    SlowBuffer: BufferImpl,
    INSPECT_MAX_BYTES: 50,
    kMaxLength: 0x7fffffff,
    constants: { MAX_LENGTH: 0x7fffffff, MAX_STRING_LENGTH: 0x1fffffe8 },
  };
  const stringDecoderMod: Record<string, unknown> = {
    StringDecoder: class { write(b: BufferSource) { return new TextDecoder().decode(b); } end() { return ''; } },
  };

  // `require('node:util/types')` — type predicates heavy deps (undici) probe.
  const utilTypesMod = {
    isDate: (v: unknown) => v instanceof Date,
    isRegExp: (v: unknown) => v instanceof RegExp,
    isPromise: (v: unknown) => !!v && typeof (v as { then?: unknown }).then === 'function',
    isMap: (v: unknown) => v instanceof Map,
    isSet: (v: unknown) => v instanceof Set,
    isArrayBuffer: (v: unknown) => v instanceof ArrayBuffer,
    isTypedArray: (v: unknown) => ArrayBuffer.isView(v) && !(v instanceof DataView),
    isUint8Array: (v: unknown) => v instanceof Uint8Array,
    isAnyArrayBuffer: (v: unknown) =>
      v instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && v instanceof SharedArrayBuffer),
    isAsyncFunction: (v: unknown) =>
      typeof v === 'function' && (v as { constructor?: { name?: string } }).constructor?.name === 'AsyncFunction',
  } as Record<string, unknown>;

  // `require('node:timers')` — map to the WebView's own timers.
  const timersMod = {
    setTimeout: g.setTimeout, clearTimeout: g.clearTimeout,
    setInterval: g.setInterval, clearInterval: g.clearInterval,
    setImmediate: (cb: (...a: unknown[]) => void, ...a: unknown[]) => (g.setTimeout as typeof setTimeout)(() => cb(...a), 0),
    clearImmediate: (h: unknown) => (g.clearTimeout as typeof clearTimeout)(h as ReturnType<typeof setTimeout>),
  } as Record<string, unknown>;

  // `require('node:async_hooks')` — a no-op AsyncResource that runs callbacks
  // synchronously, enough for libraries (undici) that `extends AsyncResource`.
  class AsyncResource {
    constructor(_type?: string) { /* no async context tracking in the WebView */ }
    runInAsyncScope<T>(fn: (...a: unknown[]) => T, thisArg?: unknown, ...args: unknown[]): T {
      return fn.apply(thisArg, args);
    }
    bind<T extends (...a: unknown[]) => unknown>(fn: T): T { return fn; }
    emitDestroy() { return this; }
    asyncId() { return 0; }
    triggerAsyncId() { return 0; }
    static bind<T extends (...a: unknown[]) => unknown>(fn: T): T { return fn; }
  }
  const asyncHooksMod = {
    AsyncResource,
    executionAsyncId: () => 0, triggerAsyncId: () => 0,
    createHook: () => ({ enable() { return this; }, disable() { return this; } }),
    AsyncLocalStorage: class {
      private _s: unknown;
      run<T>(store: unknown, cb: (...a: unknown[]) => T, ...a: unknown[]): T { const p = this._s; this._s = store; try { return cb(...a); } finally { this._s = p; } }
      getStore() { return this._s; }
      enterWith(store: unknown) { this._s = store; }
      exit<T>(cb: (...a: unknown[]) => T, ...a: unknown[]): T { const p = this._s; this._s = undefined; try { return cb(...a); } finally { this._s = p; } }
      disable() {}
    },
  } as Record<string, unknown>;

  // `require('node:diagnostics_channel')` — inert channels (no subscribers).
  const dcMod = {
    channel: (_name: string) => ({ hasSubscribers: false, publish() {}, subscribe() {}, unsubscribe() {} }),
    hasSubscribers: () => false, subscribe() {}, unsubscribe() {},
    tracingChannel: () => ({ subscribe() {}, unsubscribe() {}, traceSync: (fn: (...a: unknown[]) => unknown, ctx: unknown, ...a: unknown[]) => fn(...a) }),
  } as Record<string, unknown>;

  // `require('node:perf_hooks')` — defer to the WebView `performance`.
  const perfMod = {
    performance: g.performance,
    PerformanceObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  } as Record<string, unknown>;

  // `require('node:worker_threads')` — the WebView is single-threaded. undici's
  // CacheStorage calls `markAsUncloneable` at load; make the structured-clone
  // markers no-ops and expose main-thread defaults so the module loads. An
  // actual `new Worker()` still throws (genuinely unsupported).
  const workerThreadsMod = {
    isMainThread: true,
    threadId: 0,
    parentPort: null,
    workerData: null,
    markAsUncloneable: (v: unknown) => v,
    markAsUntransferable: (v: unknown) => v,
    isMarkedAsUntransferable: () => false,
    receiveMessageOnPort: () => undefined,
    Worker: class { constructor() { throw new Error('worker_threads.Worker is not available in the mobile extension runtime'); } },
    MessageChannel: (g.MessageChannel as unknown) || class {},
    MessagePort: (g.MessagePort as unknown) || class {},
    BroadcastChannel: (g.BroadcastChannel as unknown) || class {},
  } as Record<string, unknown>;

  const mods: Record<string, unknown> = {
    url: wrapModule('url', urlMod),
    util: wrapModule('util', utilMod),
    'util/types': wrapModule('util/types', utilTypesMod),
    path: wrapModule('path', pathShim as Record<string, unknown>),
    crypto: wrapModule('crypto', cryptoMod),
    os: wrapModule('os', osMod),
    querystring: wrapModule('querystring', qsMod),
    events: MiniEventEmitter,
    timers: wrapModule('timers', timersMod),
    'timers/promises': wrapModule('timers/promises', {
      setTimeout: (ms: number, val?: unknown) => new Promise((r) => (g.setTimeout as typeof setTimeout)(() => r(val), ms)),
    }),
    async_hooks: wrapModule('async_hooks', asyncHooksMod),
    diagnostics_channel: wrapModule('diagnostics_channel', dcMod),
    perf_hooks: wrapModule('perf_hooks', perfMod),
    console: (g.console as Record<string, unknown>) ?? {},
    buffer: wrapModule('buffer', bufferMod),
    assert: (c: unknown, m?: string) => { if (!c) throw new Error(m || 'assert'); },
    fs: unavailableModule('fs'), http: unavailableModule('http'),
    https: unavailableModule('https'), net: unavailableModule('net'),
    tls: unavailableModule('tls'), dns: unavailableModule('dns'),
    zlib: unavailableModule('zlib'), child_process: unavailableModule('child_process'),
    worker_threads: wrapModule('worker_threads', workerThreadsMod), stream: streamStub,
    string_decoder: wrapModule('string_decoder', stringDecoderMod),
  };
  // Node `events` exposes the class as both the module and `.EventEmitter`.
  (MiniEventEmitter as unknown as Record<string, unknown>).EventEmitter = MiniEventEmitter;
  // CJS/ESM interop: `require('x').default` should resolve to the module itself.
  for (const k of Object.keys(mods)) {
    const m = mods[k];
    if (m && typeof m === 'object' && !(m as Record<string, unknown>).default) {
      try { (m as Record<string, unknown>).default = m; } catch { /* frozen */ }
    }
  }
  return mods;
}

let MODULES: Record<string, unknown> | null = null;

/**
 * Returns a CommonJS `require` for the WebView extension sandbox. Strips an
 * optional `node:` prefix, serves a browser-safe module when we have one, and
 * for any other Node built-in returns a load-safe stub that throws only if a
 * method is actually called — so bundles register and only unsupported runtime
 * calls fail, with a clear message instead of `require is not defined`.
 */
export function createMobileRequire(): (name: string) => unknown {
  if (!MODULES) MODULES = buildModules();
  const modules = MODULES;
  return function require(name: string): unknown {
    const key = typeof name === 'string' && name.startsWith('node:') ? name.slice(5) : name;
    if (Object.prototype.hasOwnProperty.call(modules, key)) return modules[key];
    return unavailableModule(name);
  };
}

/**
 * Node globals a desktop worker bundle assumes but the WebView realm lacks:
 * `process`, `global`, `setImmediate`/`clearImmediate`. These are injected as
 * bundle-scoped parameters (not real globals) so a `process.versions.node` read
 * at load — e.g. undici bundled transitively — doesn't throw
 * `Cannot read properties of undefined (reading 'versions')`. Values are inert
 * stubs: enough to load, since real network goes through `__tatakai_fetch__`.
 */
export function createMobileNodeGlobals(): {
  process: unknown;
  global: unknown;
  Buffer: unknown;
  setImmediate: (cb: (...a: unknown[]) => void, ...a: unknown[]) => unknown;
  clearImmediate: (h: unknown) => void;
} {
  const g = globalThis as unknown as Record<string, unknown>;
  const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const hrtime: ((prev?: [number, number]) => [number, number]) & { bigint?: () => bigint } = (
    prev?: [number, number],
  ) => {
    const ns = Math.round(perfNow() * 1e6);
    let s = Math.floor(ns / 1e9);
    let n = ns % 1e9;
    if (prev) { s -= prev[0]; n -= prev[1]; if (n < 0) { s -= 1; n += 1e9; } }
    return [s, n];
  };
  hrtime.bigint = () => BigInt(Math.round(perfNow() * 1e6));

  const noopStream = { write: () => true, on: () => {}, once: () => {}, end: () => {} };
  const proc: Record<string, unknown> = {
    platform: 'android', arch: 'arm64',
    version: 'v20.11.0',
    versions: { node: '20.11.0', v8: '11.3.244', uv: '1.46.0', modules: '115', openssl: '3.0.0' },
    env: { NODE_ENV: 'production' },
    argv: ['node', 'extension'], argv0: 'node', execPath: '/', execArgv: [],
    pid: 1, ppid: 0, title: 'tatakai', browser: true,
    nextTick: (cb: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => cb(...a)),
    cwd: () => '/', chdir: () => {}, umask: () => 0,
    hrtime,
    emitWarning: () => {}, exit: () => {}, kill: () => {},
    stdout: noopStream, stderr: noopStream, stdin: { on: () => {}, once: () => {}, resume: () => {}, pause: () => {} },
    features: {}, config: {}, release: { name: 'node' },
    memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
    uptime: () => perfNow() / 1000,
    getuid: () => 0, getgid: () => 0,
    binding: () => { throw new Error('process.binding is not available in the mobile extension runtime'); },
  };
  // Event-emitter surface (`process.on('uncaughtException', …)`), chainable.
  for (const m of ['on', 'once', 'off', 'addListener', 'removeListener', 'removeAllListeners', 'prependListener']) {
    proc[m] = () => proc;
  }
  proc.emit = () => false;
  proc.listeners = () => [];

  return {
    process: proc,
    global: g,
    Buffer: (g.Buffer as unknown) || BufferPolyfill,
    setImmediate: (cb: (...a: unknown[]) => void, ...a: unknown[]) => (g.setTimeout as typeof setTimeout)(() => cb(...a), 0),
    clearImmediate: (h: unknown) => (g.clearTimeout as typeof clearTimeout)(h as ReturnType<typeof setTimeout>),
  };
}

