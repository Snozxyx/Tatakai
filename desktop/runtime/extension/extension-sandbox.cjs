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
