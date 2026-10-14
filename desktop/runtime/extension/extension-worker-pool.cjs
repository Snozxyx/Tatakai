'use strict';

/**
 * ExtensionWorkerPool
 *
 * Manages a pool of Node.js worker_threads Workers for sandboxed extension execution.
 * Each extension gets at most one Worker at a time; Workers are spawned lazily on first
 * invocation and reused across calls within a session.
 *
 * Requirements: 9.1, 9.3, 9.4
 */

const { Worker } = require('worker_threads');
const { SeanimeBrowserHost } = require('./seanime-browser-host.cjs');
const { extractAllowedDomains } = require('./extension-sandbox.cjs');

// Per-call timeout: 30 seconds (Requirement 9.3)
const CALL_TIMEOUT_MS = 30_000;

/**
 * Inline worker bootstrap script.
 *
 * The worker receives messages of the form { __msgId, method, args } and replies
 * with { __msgId, result } or { __msgId, error }.
 *
 * The extension code is passed via workerData.extensionCode and evaluated with
 * the Function constructor so that the extension's top-level exports are available.
 * Dangerous globals (document, window, localStorage, indexedDB, XMLHttpRequest)
 * are shadowed to undefined before the extension code runs.
 */
const WORKER_BOOTSTRAP = `
'use strict';
const { workerData, parentPort } = require('worker_threads');

// ── Sandbox: block browser-only globals ──────────────────────────────────────
const document    = undefined;
const window      = undefined;
const localStorage  = undefined;
const indexedDB   = undefined;
const XMLHttpRequest = undefined;

// ── Inject runtime helpers from workerData.helperCode ────────────────────────
// The allowed-domains array must be defined before eval-ing helperCode because
// TATAKAI_FETCH_HELPER_CODE closes over __tatakai_allowedDomains__.
const __tatakai_allowedDomains__ = workerData.allowedDomains || [];
const TATAKAI_API_BASE_URL = workerData.tatakaiApiBaseUrl || undefined;
const TATAKAI_PROXY_URL = workerData.tatakaiProxyBaseUrl || undefined;
// This must be a direct eval: TATAKAI_FETCH_HELPER_CODE closes over the
// per-worker allowlist and proxy endpoint declared above. Each helper also
// promotes itself to globalThis for the extension bundle's free variables.
eval(workerData.helperCode);
globalThis.TATAKAI_API_BASE_URL = TATAKAI_API_BASE_URL;
globalThis.TATAKAI_PROXY_URL = TATAKAI_PROXY_URL;

// Browser RPC stays inside this worker; only the scoped Electron host handles requests.
const browserRequests = new Map();
let browserRequestId = 0;
parentPort.on('message', msg => {
  if (!msg.__browserReply) return;
  const pending = browserRequests.get(msg.id);
  if (!pending) return;
  clearTimeout(pending.timer); browserRequests.delete(msg.id);
  if (msg.error) pending.reject(new Error(msg.error)); else pending.resolve(msg.result);
});
const browserCall = (method, session, args) => new Promise((resolve, reject) => {
  const id = ++browserRequestId;
  const timer = setTimeout(() => { browserRequests.delete(id); reject(new Error('ChromeDP host timed out')); }, 35000);
  browserRequests.set(id, { resolve, reject, timer });
  parentPort.postMessage({ __browserRequest: true, id, method, session, args });
});
const __tatakai_chromedp__ = { newBrowser: async options => {
  const id = await browserCall('newBrowser', null, [options]);
  const browser = {};
  for (const method of ['navigate', 'evaluate', 'executeCDP', 'sleep', 'close']) browser[method] = (...args) => browserCall(method, id, args);
  return browser;
} };

// ── Load extension code ───────────────────────────────────────────────────────
let _extensionInstance = null;
try {
  // Wrap in an IIFE so the extension can use module-level return values.
  // The extension is expected to assign its class/object to module.exports or
  // to expose a default export.  We capture whatever it exports.
  const _mod = { exports: {} };
  const _fn = new Function('module', 'exports', '__tatakai_fetch__', '__tatakai_anitomy__', '__tatakai_parse_html__', '__tatakai_chromedp__',
    workerData.extensionCode
  );
  _fn(_mod, _mod.exports, __tatakai_fetch__, __tatakai_anitomy__, __tatakai_parse_html__, __tatakai_chromedp__);
  const _export = _mod.exports.default || _mod.exports;
  // If the export is a class/constructor (has a prototype with methods), instantiate it.
  // If it is already an object instance, use it directly.
  if (typeof _export === 'function') {
    _extensionInstance = new _export();
  } else {
    _extensionInstance = _export;
  }
} catch (bootErr) {
  parentPort.postMessage({ __boot_error: bootErr.message });
}

// ── Message handler ───────────────────────────────────────────────────────────
parentPort.on('message', async (message) => {
  if (message.__browserReply) return;
  const { __msgId, method, args } = message;
  if (!_extensionInstance) {
    parentPort.postMessage({ __msgId, error: 'Extension failed to initialise' });
    return;
  }
  try {
    const fn = typeof _extensionInstance[method] === 'function'
      ? _extensionInstance[method].bind(_extensionInstance)
      : null;
    if (!fn) {
      parentPort.postMessage({ __msgId, error: \`Method not found: \${method}\` });
      return;
    }
    const result = await fn(...(Array.isArray(args) ? args : [args]));
    parentPort.postMessage({ __msgId, result });
  } catch (err) {
    parentPort.postMessage({ __msgId, error: err && err.message ? err.message : String(err) });
  }
});
`;

class ExtensionWorkerPool {
  /**
   * @param {object} [registry] - Optional ExtensionRegistry reference (used for suspension callbacks).
   * @param {object} [options]
   * @param {Function} [options.onSuspend] - Called with (extensionId) when cumulative timeout fires.
   */
  constructor(registry = null, options = {}) {
    /**
     * Map<extensionId, { worker: Worker, cumulativeMs: number, lastActivity: number, pending: Map }>
     */
    this._workers = new Map();
    this._registry = registry;
    this._onSuspend = options.onSuspend || null;
    // Set by the desktop runtime after its loopback proxy has started. Workers
    // receive this concrete, dynamic address at spawn time rather than relying
    // on the obsolete localhost:9001 default.
    this._fetchProxyBaseUrl = null;
  }

  /**
   * Sets the loopback proxy used by extension-scoped fetch requests.
   * Existing workers are respawned lazily if the endpoint changes.
   *
   * @param {string} proxyBaseUrl
   */
  setFetchProxyBaseUrl(proxyBaseUrl) {
    let parsed;
    try {
      parsed = new URL(proxyBaseUrl);
    } catch (_) {
      throw new TypeError('proxyBaseUrl must be a valid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new TypeError('proxyBaseUrl must use http or https');
    }
    this._fetchProxyBaseUrl = parsed.origin;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Returns an existing worker for the extension, or spawns a new one.
   *
   * @param {string} extensionId
   * @param {string} extensionCode  - Raw JS source of the extension bundle.
   * @param {object} manifest       - ExtensionManifest (used for permission injection).
   * @returns {Promise<Worker>}
   */
  async getOrSpawn(extensionId, extensionCode, manifest) {
    if (this._workers.has(extensionId)) {
      const entry = this._workers.get(extensionId);
      // Respawn if proxy endpoint changed OR if bundle code has changed
      const codeHash = require('crypto').createHash('sha1').update(extensionCode).digest('hex').slice(0, 16);
      if (entry.fetchProxyBaseUrl !== this._fetchProxyBaseUrl || entry.codeHash !== codeHash) {
        console.log(`[Worker] Bundle changed for ${extensionId} (${entry.codeHash} → ${codeHash}), respawning`);
        this.terminate(extensionId);
      } else {
        entry.lastActivity = Date.now();
        return entry.worker;
      }
    }

    // Log worker spawn details for debugging
    console.log(`[Worker] Spawning worker for extension: ${extensionId}`);
    console.log(`[Worker] Proxy base URL: ${this._fetchProxyBaseUrl || 'NOT SET - will use fallback'}`);
    
    if (!this._fetchProxyBaseUrl) {
      console.warn(`[Worker] WARNING: Proxy base URL not set! Extension requests may fail.`);
    }

    const worker = new Worker(WORKER_BOOTSTRAP, {
      eval: true,
      workerData: {
        extensionId,
        extensionCode,
        cheerioModulePath: require.resolve('cheerio'),
        manifest,
        allowedDomains: extractAllowedDomains(Array.isArray(manifest && manifest.permissions) ? manifest.permissions : []),
        tatakaiApiBaseUrl: (process.env.VITE_BACKEND_ORIGIN || 'http://localhost:4001') + '/api/v3',
        tatakaiProxyBaseUrl: this._fetchProxyBaseUrl,
        helperCode: [TATAKAI_FETCH_HELPER_CODE, TATAKAI_PARSE_HTML_HELPER_CODE, TATAKAI_ANITOMY_HELPER_CODE].join('\n'),
      },
    });

    const networkDomains = extractAllowedDomains(manifest?.permissions || []);
    const browserHost = new SeanimeBrowserHost((manifest?.browserDomains || []).filter(domain => networkDomains.some(allowed => allowed === '*' || domain === allowed || domain.endsWith('.' + allowed))));
    const entry = {
      worker,
      browserHost,
      browserWaitMs: 0,
      callTimeoutMs: browserHost.domains.length && /ChromeDP/.test(extensionCode) ? 180_000 : CALL_TIMEOUT_MS,
      cumulativeMs: 0,
      lastActivity: Date.now(),
      fetchProxyBaseUrl: this._fetchProxyBaseUrl,
      codeHash: require('crypto').createHash('sha1').update(extensionCode).digest('hex').slice(0, 16),
      /** Map<msgId, { resolve, reject, timer, startedAt }> */
      pending: new Map(),
    };

    this._workers.set(extensionId, entry);

    // ── Wire up worker message / error / exit handlers ──────────────────────
    worker.on('message', async (msg) => {
      if (msg.__browserRequest) {
        const started = Date.now();
        let result, error;
        try { result = await entry.browserHost.call(msg.method, msg.session, msg.args); }
        catch (err) { error = err.message; }
        entry.browserWaitMs += Date.now() - started;
        if (this._workers.get(extensionId) === entry) worker.postMessage({ __browserReply: true, id: msg.id, result, error });
        return;
      }
      if (msg.__boot_error) {
        // Worker failed to boot — reject all pending calls
        for (const [, { reject, timer }] of entry.pending) {
          clearTimeout(timer);
          reject(new Error(`Extension boot error: ${msg.__boot_error}`));
        }
        entry.pending.clear();
        this._removeWorker(extensionId, entry);
        return;
      }

      const { __msgId, result, error } = msg;
      const pending = entry.pending.get(__msgId);
      if (!pending) return;

      const { resolve, reject, timer, startedAt, browserWaitAtStart } = pending;
      clearTimeout(timer);
      entry.pending.delete(__msgId);

      // Accumulate elapsed time
      const elapsed = Math.max(0, Date.now() - startedAt - (entry.browserWaitMs - browserWaitAtStart));
      entry.cumulativeMs += elapsed;

      // This is telemetry, not a lifetime execution budget. Successful network
      // calls eventually exceed two minutes during ordinary browsing. The
      // per-call timer below still terminates a worker that stops responding.

      if (error !== undefined) {
        reject(new Error(error));
      } else {
        resolve(result);
      }
    });

    worker.on('error', (err) => {
      // Reject all pending calls on unhandled worker error
      for (const [, { reject, timer }] of entry.pending) {
        clearTimeout(timer);
        reject(err);
      }
      entry.pending.clear();
      this._removeWorker(extensionId, entry);
    });

    worker.on('exit', (code) => {
      entry.browserHost.closeAll();
      if (code !== 0) {
        for (const [, { reject, timer }] of entry.pending) {
          clearTimeout(timer);
          reject(new Error(`Worker exited with code ${code}`));
        }
      }
      entry.pending.clear();
      if (this._workers.get(extensionId) === entry) this._workers.delete(extensionId);
    });

    return worker;
  }

  /**
   * Posts a method call to the extension's worker and returns a Promise for the result.
   * Enforces the 30-second per-call timeout (Requirement 9.3).
   *
   * @param {string} extensionId
   * @param {string} method
   * @param {any[]}  args
   * @returns {Promise<any>}
   */
  async invoke(extensionId, method, args) {
    const entry = this._workers.get(extensionId);
    if (!entry) {
      throw new Error(`No worker running for extension: ${extensionId}`);
    }

    const msgId = `${extensionId}:${method}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const browserWaitAtStart = entry.browserWaitMs;
      const timeoutMs = entry.callTimeoutMs;

      // Per-call timeout guard (Requirement 9.3)
      const timer = setTimeout(() => {
        entry.pending.delete(msgId);
        // Terminate the worker on timeout
        this.terminate(extensionId);
        reject(new Error(`Extension invocation timed out after ${timeoutMs / 1000}s (${extensionId}.${method})`));
      }, timeoutMs);

      entry.pending.set(msgId, { resolve, reject, timer, startedAt, browserWaitAtStart });
      entry.worker.postMessage({ __msgId: msgId, method, args });
      entry.lastActivity = Date.now();
    });
  }

  /**
   * Terminates the worker for the given extension and removes it from the pool.
   *
   * @param {string} extensionId
   */
  getCallTimeoutMs(extensionId) { return this._workers.get(extensionId)?.callTimeoutMs || CALL_TIMEOUT_MS; }
  getBrowserWaitMs(extensionId) { return this._workers.get(extensionId)?.browserWaitMs || 0; }

  terminate(extensionId) {
    const entry = this._workers.get(extensionId);
    if (!entry) return;

    // Reject any still-pending calls
    for (const [, { reject, timer }] of entry.pending) {
      clearTimeout(timer);
      reject(new Error(`Worker terminated for extension: ${extensionId}`));
    }
    entry.pending.clear();
    entry.browserHost.closeAll();

    try {
      entry.worker.terminate();
    } catch (_) {
      // Ignore errors during forced termination
    }

    this._workers.delete(extensionId);
  }

  /**
   * Terminates all workers in the pool.
   */
  terminateAll() {
    for (const extensionId of [...this._workers.keys()]) {
      this.terminate(extensionId);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Terminates the worker and marks the extension as suspended.
   * Fires the onSuspend callback if provided.
   *
   * @param {string} extensionId
   */
  _suspendExtension(extensionId) {
    this.terminate(extensionId);
    if (this._onSuspend) {
      try {
        this._onSuspend(extensionId);
      } catch (_) {
        // Callbacks must not crash the pool
      }
    }
  }

  /**
   * Removes a worker entry without calling terminate() (used when the worker
   * has already exited or errored on its own).
   *
   * @param {string} extensionId
   */
  _removeWorker(extensionId, entry = this._workers.get(extensionId)) {
    entry?.browserHost.closeAll();
    if (this._workers.get(extensionId) === entry) this._workers.delete(extensionId);
  }
}

// ── Worker helper string (serialised for workerData.helperCode) ──────────────
//
// Each of the three helpers is also stored as a self-contained string that can
// be concatenated and eval'd inside the worker bootstrap (Task 2.4). This lets
// the helpers share the worker's Node.js `require` context rather than being
// transferred as structured objects.
//
// IMPORTANT: these strings capture the FULL function body including the `const`
// declaration so that eval() defines the name in the worker's scope.

/**
 * Serialised source for `__tatakai_fetch__`.
 * Injected into the worker via workerData.helperCode (wired up in Task 2.4).
 *
 * The function takes two arguments: (url, init).  The allowed-domains set is
 * closed over from a `__tatakai_allowedDomains__` const that the bootstrap
 * must define before eval-ing this string (also part of Task 2.4).
 *
 * Requirements: 1.1, 1.4, 1.6, 1.7
 */
const TATAKAI_FETCH_HELPER_CODE = `
// ── __tatakai_fetch__ ─────────────────────────────────────────────────────────
// Domain-gated HTTP helper injected into every extension worker.
// __tatakai_allowedDomains__ must be defined in the surrounding scope before
// this code is eval'd (it is set from workerData.allowedDomains in Task 2.4).
const __tatakai_fetch__ = async function __tatakai_fetch__(url, init) {
  init = init || {};

  // 1. Domain allowlist check (Req 1.4)
  let __hostname__;
  try {
    __hostname__ = new URL(url).hostname;
  } catch (_) {
    const __err__ = new Error('PermissionDeniedError: invalid URL "' + url + '"');
    __err__.name = 'PermissionDeniedError';
    throw __err__;
  }

  if (!__tatakai_allowedDomains__.includes("*") && !__tatakai_allowedDomains__.includes(__hostname__)) {
    const __err__ = new Error(
      'PermissionDeniedError: hostname "' + __hostname__ + '" is not in the extension\\'s allowed domain list'
    );
    __err__.name = 'PermissionDeniedError';
    throw __err__;
  }

  // 2. Forward caller-supplied headers only (Req 1.6)
  // Normalise to lowercase for lookup; emit with canonical casing.
  const __callerHeaders__ = init.headers || {};
  const __headerMap__ = {};
  for (const __key__ of Object.keys(__callerHeaders__)) {
    __headerMap__[__key__.toLowerCase()] = { originalKey: __key__, value: __callerHeaders__[__key__] };
  }

  const __forwardedHeaders__ = {};
  if (__headerMap__['referer']) {
    __forwardedHeaders__['Referer'] = __headerMap__['referer'].value;
  }
  if (__headerMap__['user-agent']) {
    __forwardedHeaders__['User-Agent'] = __headerMap__['user-agent'].value;
  }
  // Forward remaining caller-supplied headers unchanged
  for (const __lk__ of Object.keys(__headerMap__)) {
    if (__lk__ !== 'referer' && __lk__ !== 'user-agent') {
      __forwardedHeaders__[__headerMap__[__lk__].originalKey] = __headerMap__[__lk__].value;
    }
  }

  // 3. AbortController with 30-second timeout (Req 1.1)
  const __controller__ = new AbortController();
  const __timeoutHandle__ = setTimeout(function() { __controller__.abort(); }, 30000);

  // 4. Build proxy URL (Req 1.7)
  const __proxyBase__ = (typeof TATAKAI_PROXY_URL !== 'undefined' && TATAKAI_PROXY_URL)
    ? TATAKAI_PROXY_URL
    : (typeof process !== 'undefined' && process.env && process.env.TATAKAI_PROXY_URL)
    ? process.env.TATAKAI_PROXY_URL
    : 'http://localhost:9001';
  
  // Debug logging
  const __proxyUrl__ = new URL('/proxy', __proxyBase__);
  __proxyUrl__.searchParams.set('url', url);

  // 5. Execute the proxied request
  try {
        const __response__ = await fetch(__proxyUrl__.toString(), {
      method: init.method || 'GET',
      headers: __forwardedHeaders__,
      body: init.body !== undefined ? init.body : undefined,
      signal: __controller__.signal,
    });
        return {
      ok: __response__.ok, status: __response__.status, statusText: __response__.statusText, url: __response__.url,
      headers: __response__.headers,
      rawHeaders: Object.fromEntries(Array.from(__response__.headers.entries()).map(([k,v]) => [k,[v]])),
      cookies: Object.fromEntries((__response__.headers.getSetCookie ? __response__.headers.getSetCookie() : []).map(v => { const pair = v.split(';')[0]; const i = pair.indexOf('='); return [pair.slice(0,i), pair.slice(i+1)]; })),
      text: () => __response__.text(), json: () => __response__.json(), arrayBuffer: () => __response__.arrayBuffer()
    };
  } catch (__err__) {
    console.error('[__tatakai_fetch__] Request failed');
    // Timeout fired (Req 1.1)
    if (__err__ && __err__.name === 'AbortError') {
      const __te__ = new Error('FetchTimeoutError: request timed out after 30000 ms');
      __te__.name = 'FetchTimeoutError';
      throw __te__;
    }
    // Proxy unreachable (Req 1.7)
    const __code__ =
      (__err__ && __err__.cause && __err__.cause.code) ||
      (__err__ && __err__.code) ||
      '';
    if (__code__ === 'ECONNREFUSED' || __code__ === 'ENOTFOUND') {
      const __pe__ = new Error(
        'ProxyUnavailableError: local proxy at "' + __proxyBase__ + '" is unreachable (' + __code__ + ')'
      );
      __pe__.name = 'ProxyUnavailableError';
      throw __pe__;
    }
    throw __err__;
  } finally {
    clearTimeout(__timeoutHandle__);
  }
};
// Promote to globalThis so free-variable references in the extension bundle resolve.
globalThis.__tatakai_fetch__ = __tatakai_fetch__;
`;

// ── Worker helper: __tatakai_parse_html__ ────────────────────────────────────

/**
 * Parses an HTML string using cheerio and returns a `CheerioLikeAPI` adapter
 * that supports `find`, `first`, `attr`, `text`, `html`, and `each` — mirroring
 * the jQuery-like API expected by Extension provider adapters.
 *
 * Requirements: 1.2
 *
 * @param {string} html - Non-empty HTML string to parse.
 * @returns {CheerioLikeAPI} Chainable wrapper around a cheerio selection.
 * @throws {InvalidInputError} If `html` is not a non-empty string.
 */
function __tatakai_parse_html__(html) {
  if (typeof html !== 'string' || html.length === 0) {
    const err = new Error('InvalidInputError: html must be a non-empty string');
    err.name = 'InvalidInputError';
    throw err;
  }

  const cheerio = require('cheerio');
  const $ = cheerio.load(html);

  /**
   * Wraps a cheerio selection in the CheerioLikeAPI interface.
   *
   * @param {import('cheerio').Cheerio} selection
   * @returns {CheerioLikeAPI}
   */
  function wrap(selection) {
    return {
      length: selection.length, eq: i => wrap(selection.eq(i)), last: () => wrap(selection.last()),
      parent: () => wrap(selection.parent()), children: s => wrap(selection.children(s)), next: () => wrap(selection.next()), prev: () => wrap(selection.prev()),
      /**
       * Find descendants matching `selector` within the current selection.
       * @param {string} selector
       * @returns {CheerioLikeAPI}
       */
      find(selector) {
        return wrap(selection.find(selector));
      },

      /**
       * Reduce the selection to the first matched element.
       * @returns {CheerioLikeAPI}
       */
      first() {
        return wrap(selection.first());
      },

      /**
       * Get the value of the named attribute on the first element, or undefined.
       * @param {string} name
       * @returns {string | undefined}
       */
      attr(name) {
        return selection.attr(name);
      },

      /**
       * Get the combined text contents of each element in the selection.
       * @returns {string}
       */
      text() {
        return selection.text();
      },

      /**
       * Get the inner HTML of the first element, or null if the selection is empty.
       * @returns {string | null}
       */
      html() {
        return selection.html();
      },

      /**
       * Iterate over each matched element. The callback receives (index, element).
       * `element` is a raw DOM node — wrap with `$(element)` inside the callback
       * to get a new CheerioLikeAPI.
       *
       * @param {function(number, any): void} callback
       * @returns {CheerioLikeAPI} The original selection (for chaining).
       */
      each(callback) {
        selection.each((i, el) => callback(i, wrap($(el))));
        return wrap(selection);
      },
    };
  }

  // Return a root-level wrapper using the document root as the starting selection.
  return wrap($.root());
}

/**
 * Serialised source for `__tatakai_parse_html__`.
 * Injected into the worker via workerData.helperCode (wired up in Task 2.4).
 * Requirements: 1.2
 */
const TATAKAI_PARSE_HTML_HELPER_CODE = `
// ── __tatakai_parse_html__ ────────────────────────────────────────────────────
const __tatakai_parse_html__ = function __tatakai_parse_html__(html) {
  if (typeof html !== 'string' || html.length === 0) {
    const __err__ = new Error('InvalidInputError: html must be a non-empty string');
    __err__.name = 'InvalidInputError';
    throw __err__;
  }
  const cheerio = require(workerData.cheerioModulePath);
  const $ = cheerio.load(html);
  function wrap(sel) {
    return {
      length: sel.length,
      eq: function(i) { return wrap(sel.eq(i)); },
      last: function() { return wrap(sel.last()); },
      parent: function() { return wrap(sel.parent()); },
      children: function(s) { return wrap(sel.children(s)); },
      next: function() { return wrap(sel.next()); },
      prev: function() { return wrap(sel.prev()); },
      find: function(selector) { return wrap(sel.find(selector)); },
      first: function() { return wrap(sel.first()); },
      attr: function(name) { return sel.attr(name); },
      text: function() { return sel.text(); },
      html: function() { return sel.html(); },
      each: function(cb) { sel.each(function(i, el) { cb(i, wrap($(el))); }); return wrap(sel); },
    };
  }
  return wrap($.root());
};
globalThis.__tatakai_parse_html__ = __tatakai_parse_html__;
`;

// ── Worker helper: __tatakai_anitomy__ ───────────────────────────────────────

/**
 * Parses an anime release filename using anitomyscript and returns structured
 * metadata (title, episode number, release group, quality, etc.).
 *
 * Requirements: 1.3
 *
 * @param {string} filename - Non-empty release filename to parse.
 * @returns {Promise<object>} ParsedReleaseMetadata object from anitomyscript.
 * @throws {InvalidInputError} If `filename` is not a non-empty string.
 */
async function __tatakai_anitomy__(filename) {
  if (typeof filename !== 'string' || filename.length === 0) {
    const err = new Error('InvalidInputError: filename must be a non-empty string');
    err.name = 'InvalidInputError';
    throw err;
  }
  const anitomyscript = require('anitomyscript');
  return anitomyscript(filename);
}

/**
 * Serialised source for `__tatakai_anitomy__`.
 * Injected into the worker via workerData.helperCode (wired up in Task 2.4).
 * Requirements: 1.3
 */
const TATAKAI_ANITOMY_HELPER_CODE = `
// ── __tatakai_anitomy__ ───────────────────────────────────────────────────────
const __tatakai_anitomy__ = async function __tatakai_anitomy__(filename) {
  if (typeof filename !== 'string' || filename.length === 0) {
    const __err__ = new Error('InvalidInputError: filename must be a non-empty string');
    __err__.name = 'InvalidInputError';
    throw __err__;
  }
  const anitomyscript = require('anitomyscript');
  return anitomyscript(filename);
};
globalThis.__tatakai_anitomy__ = __tatakai_anitomy__;
`;

// ── Worker helper: __tatakai_fetch__ ─────────────────────────────────────────

/**
 * Forwards an HTTP request through the local Tatakai proxy with domain-allowlist
 * enforcement, a hard 30-second per-request timeout, and selective header forwarding.
 *
 * Design (from design.md section 1):
 *   allowedDomains  = extractAllowedDomains(manifest.permissions)
 *   proxyBaseUrl    = process.env.TATAKAI_PROXY_URL || 'http://localhost:9001'
 *
 *   __tatakai_fetch__(url, init):
 *     hostname = new URL(url).hostname
 *     if hostname not in allowedDomains -> throw PermissionDeniedError
 *     AbortController with 30 s timeout
 *     forward init.headers (Referer, User-Agent) unchanged
 *     on ECONNREFUSED/ENOTFOUND to proxy -> throw ProxyUnavailableError
 *     on timeout -> throw FetchTimeoutError
 *
 * Requirements: 1.1, 1.4, 1.6, 1.7
 *
 * @param {string[]} allowedDomains - Pre-built list of allowed hostnames (from manifest.permissions).
 * @param {string}   url            - The target URL to fetch.
 * @param {object}   [init]         - Optional fetch init (method, headers, body, etc.).
 * @returns {Promise<Response>}     The Response from the proxy.
 * @throws {PermissionDeniedError}  If the URL hostname is not in allowedDomains.
 * @throws {FetchTimeoutError}      If the request does not complete within 30 000 ms.
 * @throws {ProxyUnavailableError}  If the proxy is unreachable (ECONNREFUSED / ENOTFOUND).
 */
async function __tatakai_fetch__(allowedDomains, url, init = {}) {
  // ── 1. Domain allowlist check (Req 1.4) ──────────────────────────────────
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch (_) {
    const err = new Error(`PermissionDeniedError: invalid URL "${url}"`);
    err.name = 'PermissionDeniedError';
    throw err;
  }

  if (!allowedDomains.includes("*") && !allowedDomains.includes(hostname)) {
    const err = new Error(
      `PermissionDeniedError: hostname "${hostname}" is not in the extension's allowed domain list`
    );
    err.name = 'PermissionDeniedError';
    throw err;
  }

  // ── 2. Build forwarded headers (Req 1.6) ─────────────────────────────────
  // Only forward headers explicitly supplied by the caller; never substitute defaults.
  const forwardedHeaders = {};
  const callerHeaders = init.headers || {};

  // Normalise header names to lowercase for lookup, then re-emit with canonical casing.
  const headerMap = {};
  for (const [key, value] of Object.entries(callerHeaders)) {
    headerMap[key.toLowerCase()] = { originalKey: key, value };
  }

  if (headerMap['referer']) {
    forwardedHeaders['Referer'] = headerMap['referer'].value;
  }
  if (headerMap['user-agent']) {
    forwardedHeaders['User-Agent'] = headerMap['user-agent'].value;
  }

  // Forward any other caller-supplied headers as-is (omit nothing the caller sent).
  for (const [lowerKey, { originalKey, value }] of Object.entries(headerMap)) {
    if (lowerKey !== 'referer' && lowerKey !== 'user-agent') {
      forwardedHeaders[originalKey] = value;
    }
  }

  // ── 3. AbortController for 30-second timeout (Req 1.1) ───────────────────
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 30_000);

  // ── 4. Build the proxied request URL (Req 1.7) ───────────────────────────
  const proxyBaseUrl = process.env.TATAKAI_PROXY_URL || 'http://localhost:9001';

  // The proxy expects the target URL as a query parameter.
  const proxyUrl = new URL('/proxy', proxyBaseUrl);
  proxyUrl.searchParams.set('url', url);

  // ── 5. Execute the request ────────────────────────────────────────────────
  try {
    const response = await fetch(proxyUrl.toString(), {
      method: init.method || 'GET',
      headers: forwardedHeaders,
      body: init.body !== undefined ? init.body : undefined,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    // Timeout (AbortController fired) -- Req 1.1
    if (err && err.name === 'AbortError') {
      const timeoutErr = new Error(
        `FetchTimeoutError: request to "${url}" timed out after 30000 ms`
      );
      timeoutErr.name = 'FetchTimeoutError';
      throw timeoutErr;
    }

    // Proxy unreachable -- Req 1.7
    // Node's undici/fetch surfaces ECONNREFUSED / ENOTFOUND in err.cause.code
    const causeCode =
      (err && err.cause && err.cause.code) ||
      (err && err.code) ||
      '';

    if (causeCode === 'ECONNREFUSED' || causeCode === 'ENOTFOUND') {
      const proxyErr = new Error(
        `ProxyUnavailableError: local proxy at "${proxyBaseUrl}" is unreachable (${causeCode})`
      );
      proxyErr.name = 'ProxyUnavailableError';
      throw proxyErr;
    }

    // Re-throw anything else unchanged.
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Creates a bound __tatakai_fetch__ for a specific extension manifest.
 * The returned function has the signature `(url, init?)` expected by extension code.
 *
 * @param {object} manifest - Extension manifest containing the `permissions` array.
 * @returns {Function}      Bound fetch helper scoped to that manifest's allowed domains.
 */
function createTatakaiFetch(manifest) {
  const allowedDomains = extractAllowedDomains(
    Array.isArray(manifest && manifest.permissions) ? manifest.permissions : []
  );
  return (url, init = {}) => __tatakai_fetch__(allowedDomains, url, init);
}

module.exports = {
  ExtensionWorkerPool,
  __tatakai_anitomy__,
  __tatakai_fetch__,
  __tatakai_parse_html__,
  createTatakaiFetch,
  // Serialised helper strings for workerData.helperCode injection (Task 2.4)
  TATAKAI_FETCH_HELPER_CODE,
  TATAKAI_PARSE_HTML_HELPER_CODE,
  TATAKAI_ANITOMY_HELPER_CODE,
};
