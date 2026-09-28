/**
 * Renderer module loader (code-driven contributions).
 *
 * Trust model — READ THIS BEFORE TOUCHING:
 * A renderer contribution is arbitrary JavaScript that runs in the app's OWN
 * realm (same window, same React runtime, same DOM). `import(blobURL)` is NOT a
 * sandbox — the loaded module can do anything the app can. The ONLY security
 * boundary is the trust gate: the bundle is fetched over an IPC that main-side
 * refuses unless the extension is `sideloaded === true` OR carries a signature.
 * Untrusted store extensions never reach this loader (they stay data-only).
 *
 * The extension exports an ESM `renderer.js` whose default export is
 * `activate(ctx: ExtensionContext)`. It contributes React pages/slots, code
 * analytics providers, services, and platform modules through `ctx.registry`.
 */

import React from 'react';
import { extensionRegistry } from './ExtensionRegistry';
import { analytics } from '@/core/analytics/AnalyticsService';

/** Capability context handed to an extension's `activate(ctx)`. */
export interface ExtensionContext {
  /** The shared contribution registry (pages, slots, themes, services, modules…). */
  registry: typeof extensionRegistry;
  /** Analytics singleton — an extension may `registerProvider` a code sink. */
  analytics: typeof analytics;
  /** Programmatic navigation (wired to the router at boot). */
  navigate: (path: string) => void;
  /** Namespaced localStorage, keys auto-prefixed with the extension id. */
  storage: ScopedStorage;
  /** `fetch`, passed through as-is (network permissions are enforced main-side). */
  fetch: typeof fetch;
  /** Namespaced console logger. */
  log: (...args: unknown[]) => void;
  /** The owning extension id (so contributions can namespace their own ids). */
  extensionId: string;
  /**
   * The app's OWN React instance. A renderer bundle MUST build any contributed
   * component with this (never bundle its own copy) — hooks and context are
   * module-scoped, so a second React instance breaks them. Contributed pages/
   * slots then share the app's render tree, dispatcher, and reusable UI.
   */
  React: typeof React;
}

export interface ScopedStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Minimal manifest shape the loader needs (mirrors ExtensionManifest). */
export interface LoadableExtension {
  id: string;
  sideloaded?: boolean;
  signature?: string | null;
  contributes?: { rendererEntry?: string } | null;
}

type LoadedContribution = {
  blobUrl: string;
  dispose?: () => void;
};

const loaded = new Map<string, LoadedContribution>();

function isTrusted(ext: LoadableExtension): boolean {
  return ext.sideloaded === true || (typeof ext.signature === 'string' && ext.signature.length > 0);
}

function scopedStorage(extensionId: string): ScopedStorage {
  const prefix = `ext:${extensionId}:`;
  return {
    get: (key) => {
      try {
        return localStorage.getItem(prefix + key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(prefix + key, value);
      } catch {
        /* quota / unavailable — ignore */
      }
    },
    remove: (key) => {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        /* ignore */
      }
    },
  };
}

function makeContext(extensionId: string, navigate: (p: string) => void): ExtensionContext {
  return {
    registry: extensionRegistry,
    analytics,
    navigate,
    storage: scopedStorage(extensionId),
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    log: (...args: unknown[]) => console.log(`[ext:${extensionId}]`, ...args),
    extensionId,
    React,
  };
}

type RendererBundleApi = {
  getRendererBundle?: (extensionId: string) => Promise<{ success: boolean; source?: string; error?: string }>;
};

function getBundleApi(): RendererBundleApi | null {
  const w = window as unknown as { electron?: RendererBundleApi };
  return w.electron && typeof w.electron.getRendererBundle === 'function' ? w.electron : null;
}

/**
 * Load and activate an extension's renderer contribution.
 *
 * No-ops (returns false) when: the extension is untrusted, declares no renderer
 * entry, the runtime bridge is unavailable (web build), the fetch fails, or the
 * contribution is already loaded.
 */
export async function loadRendererContribution(
  ext: LoadableExtension,
  navigate: (path: string) => void,
): Promise<boolean> {
  if (loaded.has(ext.id)) return false;
  if (!ext.contributes?.rendererEntry) return false;

  // Trust gate (belt-and-suspenders — main-side also enforces it).
  if (!isTrusted(ext)) {
    console.warn(`[rendererLoader] refusing untrusted extension: ${ext.id}`);
    return false;
  }

  const api = getBundleApi();
  if (!api?.getRendererBundle) return false;

  let source: string;
  try {
    const res = await api.getRendererBundle(ext.id);
    if (!res?.success || !res.source) {
      console.warn(`[rendererLoader] bundle fetch failed for ${ext.id}: ${res?.error || 'unknown'}`);
      return false;
    }
    source = res.source;
  } catch (e) {
    console.warn(`[rendererLoader] bundle fetch threw for ${ext.id}`, e);
    return false;
  }

  const blob = new Blob([source], { type: 'text/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  // Belt-and-suspenders: some bundles reference a bare `React`/`window.React`
  // global instead of taking `ctx.React`. Publish the app's instance so both
  // styles resolve to the SAME React (a second copy would break hooks).
  try {
    const g = window as unknown as { React?: typeof React };
    if (!g.React) g.React = React;
  } catch {
    /* ignore */
  }

  try {
    // @vite-ignore — dynamic runtime import of a trusted extension bundle.
    const mod = (await import(/* @vite-ignore */ blobUrl)) as {
      activate?: (ctx: ExtensionContext) => void | Promise<void> | (() => void);
      default?: (ctx: ExtensionContext) => void | Promise<void> | (() => void);
    };
    const activate = mod.activate || mod.default;
    if (typeof activate !== 'function') {
      console.warn(`[rendererLoader] ${ext.id} exports no activate()`);
      URL.revokeObjectURL(blobUrl);
      return false;
    }

    const ctx = makeContext(ext.id, navigate);
    const maybeDispose = await activate(ctx);
    loaded.set(ext.id, {
      blobUrl,
      dispose: typeof maybeDispose === 'function' ? (maybeDispose as () => void) : undefined,
    });
    console.log(`[rendererLoader] activated ${ext.id}`);
    return true;
  } catch (e) {
    console.error(`[rendererLoader] activation failed for ${ext.id}`, e);
    URL.revokeObjectURL(blobUrl);
    return false;
  }
}

/** Tear down a loaded contribution: run its dispose, unregister, revoke the blob. */
export function unloadRendererContribution(extensionId: string): void {
  const rec = loaded.get(extensionId);
  if (!rec) return;
  try {
    rec.dispose?.();
  } catch (e) {
    console.warn(`[rendererLoader] dispose threw for ${extensionId}`, e);
  }
  extensionRegistry.unregisterAll(extensionId);
  URL.revokeObjectURL(rec.blobUrl);
  loaded.delete(extensionId);
}

export function isRendererContributionLoaded(extensionId: string): boolean {
  return loaded.has(extensionId);
}
