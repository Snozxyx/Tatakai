'use strict';

/**
 * desktop/runtime/extension-registry.cjs
 *
 * In-memory registry of loaded extensions for the Tatakai Electron main process.
 *
 * Each entry tracks the extension manifest, bundle path, load timestamp,
 * an optional worker reference, cumulative execution time, and suspension state.
 *
 * Requirements: 10.1, 10.5
 */

/**
 * @typedef {Object} RegistryEntry
 * @property {import('../../src/core/extensions/sdk/types').ExtensionManifest} manifest
 * @property {string} bundlePath - Absolute path to the extension bundle on disk.
 * @property {number} loadedAt   - Unix timestamp (ms) when the extension was registered.
 * @property {Worker|null} workerRef - Reference to the running Web Worker, or null.
 * @property {number} cumulativeMs  - Total milliseconds of execution time this session.
 * @property {number|null} suspendedAt - Unix timestamp (ms) when the extension was suspended, or null.
 */

class ExtensionRegistry {
  constructor() {
    /** @type {Map<string, RegistryEntry>} */
    this._registry = new Map();

    /** @type {Set<string>} Extension IDs blocked by the admin kill-switch. */
    this._killSwitches = new Set();
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register an extension in the in-memory registry.
   *
   * If an entry with the same `extensionId` already exists it is overwritten,
   * which allows a reload without an explicit unregister first.
   *
   * @param {string} extensionId  - Unique extension identifier.
   * @param {object} manifest     - Parsed extension manifest object.
   * @param {string} bundlePath   - Absolute path to the extension bundle file.
   * @returns {RegistryEntry} The newly created registry entry.
   */
  register(extensionId, manifest, bundlePath) {
    if (!extensionId || typeof extensionId !== 'string') {
      throw new TypeError('extensionId must be a non-empty string');
    }
    if (!manifest || typeof manifest !== 'object') {
      throw new TypeError('manifest must be an object');
    }
    if (!bundlePath || typeof bundlePath !== 'string') {
      throw new TypeError('bundlePath must be a non-empty string');
    }

    /** @type {RegistryEntry} */
    const entry = {
      manifest,
      bundlePath,
      loadedAt: Date.now(),
      workerRef: null,
      cumulativeMs: 0,
      suspendedAt: null,
    };

    this._registry.set(extensionId, entry);
    return entry;
  }

  // ---------------------------------------------------------------------------
  // Removal
  // ---------------------------------------------------------------------------

  /**
   * Remove an extension from the registry.
   *
   * Does NOT terminate any running worker — callers are responsible for
   * terminating the worker before or after calling this method.
   *
   * @param {string} extensionId
   * @returns {boolean} `true` if the entry existed and was removed, `false` otherwise.
   */
  unregister(extensionId) {
    return this._registry.delete(extensionId);
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  /**
   * Retrieve the registry entry for an extension.
   *
   * @param {string} extensionId
   * @returns {RegistryEntry|undefined} The entry, or `undefined` if not registered.
   */
  lookup(extensionId) {
    return this._registry.get(extensionId);
  }

  // ---------------------------------------------------------------------------
  // Kill-switch
  // ---------------------------------------------------------------------------

  /**
   * Check whether an extension is currently blocked by the admin kill-switch.
   *
   * @param {string} extensionId
   * @returns {boolean}
   */
  isKillSwitched(extensionId) {
    return this._killSwitches.has(extensionId);
  }

  /**
   * Set or clear the kill-switch flag for an extension.
   *
   * Setting `blocked = true` adds the extension to the kill-switch set.
   * Setting `blocked = false` removes it, allowing the extension to be
   * re-registered on the next load attempt.
   *
   * @param {string} extensionId
   * @param {boolean} blocked
   */
  setKillSwitch(extensionId, blocked) {
    if (blocked) {
      this._killSwitches.add(extensionId);
    } else {
      this._killSwitches.delete(extensionId);
    }
  }

  // ---------------------------------------------------------------------------
  // Listing
  // ---------------------------------------------------------------------------

  /**
   * Return the IDs of all currently active (non-suspended, non-kill-switched)
   * extensions.
   *
   * This is the list returned by the `runtime:health` IPC handler as
   * `loadedExtensions`.
   *
   * Property 15: For any set of loaded extensions, `runtime:health` must return
   * a `loadedExtensions` array that contains exactly the IDs of all currently
   * registered (non-suspended, non-kill-switched) extensions — no more, no fewer.
   *
   * @returns {string[]} Sorted array of active extension IDs.
   */
  listLoaded() {
    const active = [];
    for (const [id, entry] of this._registry) {
      if (entry.suspendedAt !== null) continue;   // suspended
      if (this._killSwitches.has(id)) continue;   // kill-switched
      active.push(id);
    }
    return active.sort();
  }
}

module.exports = { ExtensionRegistry };
