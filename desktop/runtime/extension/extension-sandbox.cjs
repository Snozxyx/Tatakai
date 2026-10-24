'use strict';

/**
 * ExtensionSandbox - Wraps extension code for safe execution in a Web Worker.
 *
 * Responsibilities:
 *  - Inject runtime API aliases (fetch, anitomyscript, parseHtml) from self globals
 *  - Block dangerous browser globals (document, window, localStorage, indexedDB, XMLHttpRequest)
 *  - Wrap the extension code in 'use strict' mode
 *
 * Validates: Requirements 9.1
 * Property 11: Web Worker sandbox isolation
 */

/**
 * Parses a permission string like "network:domain:nyaa.si" and returns the domain.
 * Only "network:domain:<hostname>" entries are extracted; other permission types are ignored.
 *
 * @param {string[]} permissions - Array of permission strings from the extension manifest.
 * @returns {string[]} Array of allowed domain strings.
 */
function extractAllowedDomains(permissions) {
  if (!Array.isArray(permissions)) {
    return [];
  }

  const domains = [];
  for (const permission of permissions) {
    if (typeof permission !== 'string') {
      continue;
    }
    // Expected format: "network:domain:<hostname>"
    const parts = permission.split(':');
    if (parts.length === 3 && parts[0] === 'network' && parts[1] === 'domain') {
      const domain = parts[2].trim();
      if (domain.length > 0) {
        domains.push(domain);
      }
    }
  }
  return domains;
}

/**
 * Wraps extension code with:
 *  - 'use strict' header
 *  - Injected runtime API aliases from self globals
 *  - Blocked browser globals (document, window, localStorage, indexedDB, XMLHttpRequest)
 *  - The extension code itself
 *
 * The resulting string is intended to be used as the body of a Blob URL
 * passed to `new Worker(blobUrl)`.
 *
 * @param {string} extensionCode - The raw JavaScript source of the extension.
 * @param {object} manifest - The extension manifest (used to extract allowed domains).
 * @returns {string} The wrapped extension code ready for use in a Web Worker Blob URL.
 */
function wrapExtensionCode(extensionCode, manifest) {
  if (typeof extensionCode !== 'string') {
    throw new TypeError('extensionCode must be a string');
  }
  if (!manifest || typeof manifest !== 'object') {
    throw new TypeError('manifest must be an object');
  }

  const allowedDomains = extractAllowedDomains(manifest.permissions || []);
  const allowedDomainsJson = JSON.stringify(allowedDomains);

  return `'use strict';

// ── Injected runtime APIs ────────────────────────────────────────────────────
// These are provided by the Tatakai main process via the Worker's global scope.
const fetch = self.__tatakai_fetch__;
const anitomyscript = self.__tatakai_anitomy__;
const parseHtml = self.__tatakai_parse_html__;

// ── Allowed domains (from manifest permissions) ──────────────────────────────
// Available for extension introspection; enforcement is done by __tatakai_fetch__.
const __allowedDomains__ = ${allowedDomainsJson};

// ── Blocked globals (Web Worker sandbox isolation) ───────────────────────────
// These are explicitly shadowed to undefined so that any extension code that
// attempts to access them receives undefined rather than the real global.
// In a Web Worker context most of these are already unavailable, but we
// defensively re-declare them to prevent any future environment changes from
// accidentally exposing them.
const document = undefined;
const window = undefined;
const localStorage = undefined;
const indexedDB = undefined;
const XMLHttpRequest = undefined;

// ── Extension code ───────────────────────────────────────────────────────────
${extensionCode}
`;
}

module.exports = { wrapExtensionCode, extractAllowedDomains };

// ─────────────────────────────────────────────────────────────────────────────
// Hardening layer 2 — OS/process-level isolation for extension workers
// ─────────────────────────────────────────────────────────────────────────────
//
// The shadowed globals above are cosmetic: extension code runs through
// `new Function`, which does not even see those `const` bindings (it is created
// in the worker's *global* scope, not the module scope). What it does see is the
// real `process` global, and `process` is enough to leave the worker entirely:
//
//     process.getBuiltinModule('child_process').execSync('id')
//     process.binding('fs').open(...)
//
// That was verified against this runtime (Node 22) and reproduced from inside an
// extension worker, so a malicious `.kai` bundle had full arbitrary code
// execution with the user's privileges — no sandbox at all.
//
// Layer 2 therefore puts the worker under Node's permission model, which is
// enforced in C++ below the JS layer, so `process.binding`, `getBuiltinModule`,
// `require` tricks and `import()` all hit ERR_ACCESS_DENIED. The worker gets:
//   read  → the app directory (JS modules only: cheerio / anitomyscript)
//   write → nothing
//   child processes / worker threads / WASI / native addons → denied
//
// Network access is deliberately NOT denied: extensions exist to fetch remote
// pages, and every sanctioned request already goes through the domain-gated
// `__tatakai_fetch__` helper. Node's permission model has no network scope, so
// raw network egress by a hostile extension remains possible and is documented
// in docs/security/SECURITY_AUDIT.md (finding EXT-2).

/** Name of the permission-model flag this Node build understands, if any. */
function permissionModelFlag() {
  try {
    const flags = process.allowedNodeEnvironmentFlags;
    if (flags.has('--permission')) return '--permission';
    if (flags.has('--experimental-permission')) return '--experimental-permission';
  } catch (_) {
    /* not a Node with the permission model */
  }
  return null;
}

/** True when extension workers can be run under the Node permission model. */
function isProcessIsolationAvailable() {
  return permissionModelFlag() !== null;
}

/**
 * Build the `execArgv` that sandboxes an extension worker.
 *
 * Returns `null` when the runtime has no permission model (older Node/Electron),
 * in which case the caller must treat isolation as degraded — never as granted.
 *
 * @param {object}   options
 * @param {string[]} [options.readPaths]  directories the worker may read
 * @param {string[]} [options.writePaths] directories the worker may write
 * @returns {string[]|null}
 */
function buildPermissionExecArgv({ readPaths = [], writePaths = [] } = {}) {
  const flag = permissionModelFlag();
  if (!flag) return null;

  const normalize = (paths) =>
    Array.from(
      new Set(
        (Array.isArray(paths) ? paths : [])
          .filter((p) => typeof p === 'string' && p.trim() !== '')
          .map((p) => p.trim())
      )
    );

  const args = [flag];
  for (const p of normalize(readPaths)) args.push(`--allow-fs-read=${p}`);
  for (const p of normalize(writePaths)) args.push(`--allow-fs-write=${p}`);
  // Deliberately absent: --allow-child-process, --allow-worker, --allow-wasi,
  // --allow-addons. All four stay denied.
  return args;
}

/**
 * Source injected into the worker bootstrap *before* any extension code runs.
 *
 * This is defence in depth for the case where the permission model is missing
 * (unsupported runtime): it removes the documented handles a `new Function`
 * body can reach from the `process` global.
 */
const WORKER_GLOBAL_HARDENING_SOURCE = `
// ── Remove Node builtin escape hatches ───────────────────────────────────────
// new Function bodies see the real global scope, so process is reachable.
// These members are the documented way out of a worker-thread "sandbox".
try { delete process.getBuiltinModule; } catch (_) {}
try { Object.defineProperty(process, 'getBuiltinModule', { value: undefined, writable: false, configurable: false }); } catch (_) {}
try { delete process.binding; } catch (_) {}
try { delete process._linkedBinding; } catch (_) {}
try { delete process.dlopen; } catch (_) {}
try { delete process.mainModule; } catch (_) {}
try { delete process.embedderHostFunctions; } catch (_) {}
// Environment variables are readable (extensions need TATAKAI_PROXY_URL) but must
// not carry the parent's secrets forward into a hostile script's reach.
try { delete process.env.NODE_OPTIONS; } catch (_) {}
try { delete process.env.ELECTRON_RUN_AS_NODE; } catch (_) {}
`;

module.exports = Object.assign(module.exports, {
  buildPermissionExecArgv,
  isProcessIsolationAvailable,
  permissionModelFlag,
  WORKER_GLOBAL_HARDENING_SOURCE,
});
