/**
 * mobileExtensionHost.ts — in-WebView extension runtime for Capacitor.
 *
 * This is the mobile counterpart to `desktop/runtime/extension-api-host` +
 * `extension-worker-pool`. Instead of running the extension `bundle.js` in a
 * Node worker behind a loopback HTTP server, it evaluates the same bundle in the
 * WebView and answers the SAME logical routes as in-process function calls:
 *
 *   sources / stream / torrent      -> bundle.sourcesAll / streamAll / torrentAll
 *   providers, providers/:name      -> bundle.listProviders / runProvider
 *   manga/chapters, manga/pages     -> bundle.getMangaChapters / getMangaPages
 *   custom/*                        -> bundle.customHome/Search/Info/Watch/Read
 *
 * Network goes through `createNativeFetch` (CapacitorHttp — no CORS, real
 * headers) and HTML parsing through the DOMParser adapter, so a bundle built for
 * desktop runs unchanged. The dispatch surface is exposed on
 * `window.tatakaiMobileExtensions` so `resolveExtensionApiBase()` and the manga
 * runtime can route to it without a real server.
 *
 * SECURITY: like the desktop renderer loader, there is NO sandbox — the bundle
 * runs in the app realm. Only load bundles the user trusts (signed marketplace
 * bundles, or explicit sideloads). The manifest's `network:domain:*` permissions
 * still gate every request via `createNativeFetch`.
 */

import type { ExtensionManifest } from '@/core/extensions/sdk/types';
import type { NamespaceInfo } from '@/hooks/media/useExtensionSourceStream';
import { createNativeFetch } from './nativeHttp';
import { parseHtml } from './parseHtml';
import { createMobileRequire, createMobileNodeGlobals } from './requireShim';
import { enrichOptionsWithTitles } from './anilistTitles';
import { isCapacitor } from '@/lib/platform/platform';
import {
  applyMobileProxyToPages,
  applyMobileProxyToSource,
} from './mobileProxy';

/** A loaded, instantiated extension bundle. */
interface LoadedExtension {
  manifest: ExtensionManifest;
  namespace: string;
  instance: Record<string, unknown>;
}

/**
 * Anitomy (anime release-name parser) is only used by torrent-oriented
 * providers. It isn't bundled into the renderer (it's a heavy Node/WASM dep on
 * desktop), so on mobile we look for an optionally-injected global
 * (`window.tatakaiAnitomy`) and otherwise return an empty parse — non-fatal, so
 * a provider that opportunistically parses filenames degrades gracefully
 * instead of failing the whole request. A future step can inject a real
 * browser-compatible anitomy here without touching bundles.
 */
async function makeAnitomy() {
  return async function anitomy(filename: string): Promise<unknown> {
    if (typeof filename !== 'string' || !filename) {
      const err = new Error('InvalidInputError: filename must be a non-empty string');
      err.name = 'InvalidInputError';
      throw err;
    }
    const injected = (globalThis as any).tatakaiAnitomy;
    if (typeof injected === 'function') {
      try {
        return await injected(filename);
      } catch {
        return {};
      }
    }
    return {};
  };
}

const registry = new Map<string, LoadedExtension>();

/**
 * Evaluate an extension bundle (CommonJS text) and instantiate it, exactly like
 * the desktop worker bootstrap: `module.exports.default || module.exports`, and
 * if that's a constructor, `new` it.
 */
async function evaluateBundle(
  code: string,
  manifest: ExtensionManifest,
): Promise<Record<string, unknown>> {
  const allowedDomains = (manifest.permissions || [])
    .map((p) => {
      const parts = String(p).split(':');
      return parts.length === 3 && parts[0] === 'network' && parts[1] === 'domain'
        ? parts[2].trim()
        : '';
    })
    .filter(Boolean);

  const fetchShim = createNativeFetch(allowedDomains);
  const anitomy = await makeAnitomy();
  // Bundles are esbuild `platform:'node', format:'cjs'`, so Node built-ins are
  // left external and emitted as bare `require(...)`. Desktop runs them in a
  // Node worker where `require` is ambient; the WebView has none, so without
  // this shim the first `require('crypto')`-style call throws "require is not
  // defined" and the install fails. See requireShim.ts.
  const requireShim = createMobileRequire();
  // Bundles also reference Node globals that are ambient in a Node worker but
  // absent in the WebView: `process` (undici reads `process.versions.node` at
  // load), `Buffer` (undici/cheerio call `Buffer.alloc` at load), `global`, and
  // `setImmediate`/`clearImmediate`. Inject them as bundle-scoped params rather
  // than polluting the real `window`. See createMobileNodeGlobals.
  const nodeGlobals = createMobileNodeGlobals();

  // Toko's shared HTTP helpers (`src/utils/http/fetch.ts`) read the native fetch
  // shim off `globalThis` — `const sandboxFetch = globalThis.__tatakai_fetch__`,
  // captured once at module load — NOT off the bare identifier. The legacy Node
  // worker satisfied that by injecting it onto the worker global; the desktop API
  // host runs in Node where no shim is needed at all. Passing it only as a
  // `new Function` parameter (below) covers the few providers that call the bare
  // `__tatakai_fetch__` identifier (animeblkom, flixcloud, i18n), but leaves
  // `fetch.ts`'s `sandboxFetch` undefined — so every provider that goes through
  // `fetchResponse`/`fetchText`/`fetchJson`/`loadHtml` (nebula and nearly all
  // stream + manga providers) fell back to the WebView's own `fetch`, which is
  // CORS/forbidden-header blocked and 403s header-gated upstreams. Confirmed live:
  // `window.__tatakai_fetch__` was undefined, native `fetch` to justanime → 403,
  // CapacitorHttp → 200. That is the entire desktop/mobile provider gap: "only
  // embed sources show", nebula missing, manga empty.
  //
  // Expose ONLY the fetch shim on the realm so that at-load capture picks up
  // CapacitorHttp. The assignment must happen BEFORE `fn()` runs the bundle's
  // synchronous top-level module init (where the capture occurs). Left set
  // afterwards (not restored): the only consumer captures at load, so a stale
  // value is never read, and per-extension domain gating stays correct because
  // each bundle captures its own `fetchShim` during its own synchronous eval.
  //
  // Deliberately NOT setting `__tatakai_parse_html__`: with it undefined,
  // `fetch.ts`'s `loadHtml` uses its own bundled cheerio (the desktop/API-
  // identical path, pure JS, already proven), rather than switching HTML parsing
  // to the DOMParser adapter as a side effect of this fetch fix.
  (globalThis as any).__tatakai_fetch__ = fetchShim;

  const module = { exports: {} as any };
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'module',
    'exports',
    'require',
    '__tatakai_fetch__',
    '__tatakai_anitomy__',
    '__tatakai_parse_html__',
    'Buffer',
    'process',
    'global',
    'setImmediate',
    'clearImmediate',
    code,
  );
  fn(
    module,
    module.exports,
    requireShim,
    fetchShim,
    anitomy,
    parseHtml,
    nodeGlobals.Buffer,
    nodeGlobals.process,
    nodeGlobals.global,
    nodeGlobals.setImmediate,
    nodeGlobals.clearImmediate,
  );

  const exported = module.exports?.default || module.exports;
  const instance = typeof exported === 'function' ? new exported() : exported;
  if (!instance || typeof instance !== 'object') {
    throw new Error(`Extension bundle "${manifest.id}" produced no usable export`);
  }
  return instance as Record<string, unknown>;
}

/**
 * Register (load) a bundle under its manifest namespace. Idempotent per
 * namespace — re-registering replaces the instance (e.g. after an update).
 */
export async function registerMobileExtension(
  manifest: ExtensionManifest,
  bundleCode: string,
): Promise<{ ok: true; namespace: string } | { ok: false; error: string }> {
  try {
    const namespace = manifest.apiServer?.namespace || manifest.id;
    const instance = await evaluateBundle(bundleCode, manifest);
    registry.set(namespace, { manifest, namespace, instance });
    return { ok: true, namespace };
  } catch (err) {
    // Surface the full stack (with the offending bundle line) to logcat; the
    // caller only propagates `err.message` to a toast.
    console.error('[mobileExtensionHost] bundle evaluation failed', manifest?.id, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function unregisterMobileExtension(namespace: string): void {
  registry.delete(namespace);
}

/** Namespaces currently mounted, in the shape `resolveExtensionApiBase` reports. */
export function listMobileNamespaces(): NamespaceInfo[] {
  return [...registry.values()].map(({ manifest, namespace, instance }) => ({
    namespace,
    extensionId: manifest.id,
    contract: manifest.apiServer?.contract ?? null,
    routes: manifest.apiServer?.routes ?? inferRoutes(instance),
    capabilities: manifest.capabilities as string[] | undefined,
    customSources: manifest.customSources,
  }));
}

/** Fallback route inference when a manifest omits `apiServer.routes`. */
function inferRoutes(instance: Record<string, unknown>): string[] {
  const routes: string[] = [];
  if (typeof instance.sourcesAll === 'function') routes.push('sources');
  if (typeof instance.streamAll === 'function') routes.push('stream');
  if (typeof instance.torrentAll === 'function') routes.push('torrent');
  if (typeof instance.listProviders === 'function') routes.push('providers');
  if (typeof instance.getMangaChapters === 'function') routes.push('manga/chapters');
  if (typeof instance.getMangaPages === 'function') routes.push('manga/pages');
  return routes;
}

async function callMethod(
  namespace: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const ext = registry.get(namespace);
  if (!ext) throw new Error(`namespace not mounted: ${namespace}`);
  const fn = ext.instance[method];
  if (typeof fn !== 'function') {
    const err = new Error(`method not implemented: ${namespace}.${method}`);
    err.name = 'NotImplementedError';
    throw err;
  }
  return (fn as (...a: unknown[]) => unknown).apply(ext.instance, args);
}

/**
 * The public dispatch surface, mirroring the host router's route families.
 * Each returns the same JSON body the HTTP host would, so client callers only
 * swap transport (EventSource/fetch → these calls), not parsing.
 */
export const mobileExtensionDispatch = {
  isMounted: (namespace: string) => registry.has(namespace),
  listNamespaces: listMobileNamespaces,

  /**
   * `/api/v3/<ns>/sources|stream|torrent` — resolve anime sources.
   *
   * When `onChunk` is supplied this drives the SAME progressive
   * `bundle.sourcesAll(opts, onChunk)` contract the desktop host uses: each
   * provider's results surface the instant that provider finishes, instead of
   * the caller awaiting the whole ~100-provider batch (the dominant parity gap
   * with desktop SSE). Without `onChunk` it keeps the batched return for
   * one-shot callers.
   */
  async resolveSources(
    namespace: string,
    route: 'sources' | 'stream' | 'torrent',
    options: Record<string, unknown>,
    onChunk?: (chunk: { results?: any[]; diagnostic?: any }) => void,
  ): Promise<any[]> {
    const method =
      route === 'stream' ? 'streamAll' : route === 'torrent' ? 'torrentAll' : 'sourcesAll';

    // Parity with the desktop host: enrich the single caller title with the
    // show's AniList english/romaji/native titles + filtered synonyms, so
    // name-searching providers find as many servers as they do on desktop.
    const enriched = await enrichOptionsWithTitles(options);

    // Accumulate whatever the progressive callback delivers. A bundle that
    // ignores the second arg (older build) leaves `streamed` false, so we fall
    // back to the awaited return value.
    const collected: any[] = [];
    let streamed = false;
    const relay =
      typeof onChunk === 'function'
        ? (chunk: { results?: any[]; diagnostic?: any }) => {
            streamed = true;
            const results = Array.isArray(chunk?.results) ? chunk.results : [];
            // Register every mobile source locally. Current Android and iOS
            // shells expose the desktop-shaped loopback path; older shells use
            // the CapacitorHttp token loader without a hosted round-trip.
            const proxied = results.map((r) => applyMobileProxyToSource(r));
            for (const r of proxied) collected.push(r);
            // A throwing consumer must never abort the in-flight scrape.
            try {
              onChunk({ ...chunk, results: proxied });
            } catch (err) {
              console.warn('[mobileExtensionHost] onChunk consumer threw', err);
            }
          }
        : undefined;

    const out = await callMethod(namespace, method, relay ? [enriched, relay] : [enriched]);
    if (streamed) return collected;

    const rawArr = Array.isArray(out) ? out : (out as any)?.sources ?? [];
    const arr = Array.isArray(rawArr) ? rawArr.map((r) => applyMobileProxyToSource(r)) : [];
    // Non-progressive bundle but a progressive caller: hand it one synthetic
    // chunk so its render path stays uniform. The hook dedupes by
    // `providerKey::url`, so this never double-counts.
    if (typeof onChunk === 'function' && arr.length) {
      try {
        onChunk({
          results: arr,
          diagnostic: { provider: 'batch', status: 'ok', resultCount: arr.length, durationMs: 0, attempts: 1 },
        });
      } catch (err) {
        console.warn('[mobileExtensionHost] onChunk consumer threw', err);
      }
    }
    return arr;
  },

  /** `/api/v3/<ns>/manga/chapters`. */
  async mangaChapters(namespace: string, params: Record<string, unknown>): Promise<any> {
    return callMethod(namespace, 'getMangaChapters', [params]);
  },

  /**
   * `/api/v3/<ns>/manga/pages` — header-gated page images are registered with
   * the in-app proxy (desktop `manga/pages` parity: many manga CDNs 403 an
   * unproxied request, which is the broken-pages reader bug). Accepts both the
   * desktop `{ pages }` wrapper and the mobile bundle's bare array.
   */
  async mangaPages(namespace: string, params: Record<string, unknown>): Promise<any> {
    const out = await callMethod(namespace, 'getMangaPages', [params]);
    const rawPages = Array.isArray(out)
      ? out
      : Array.isArray((out as any)?.pages)
        ? (out as any).pages
        : null;
    if (!rawPages) return out;
    const proxied = applyMobileProxyToPages(rawPages);
    if (Array.isArray(out)) return proxied;
    return { ...(out as any), pages: proxied, count: proxied.length };
  },

  /** `/api/v3/<ns>/providers` + `/providers/:name`. */
  async listProviders(namespace: string): Promise<any[]> {
    const out = await callMethod(namespace, 'listProviders', []);
    return Array.isArray(out) ? out : (out as any)?.providers ?? [];
  },
  async runProvider(
    namespace: string,
    provider: string,
    options: Record<string, unknown>,
  ): Promise<any> {
    const out = await callMethod(namespace, 'runProvider', [provider, options]);
    if (out && typeof out === 'object' && Array.isArray((out as any).sources)) {
      return {
        ...(out as any),
        sources: (out as any).sources.map((s: any) => applyMobileProxyToSource(s)),
      };
    }
    return out;
  },

  /**
   * `/x/<ns>/<sourceId>/…` custom-source content. Watch sources and read pages
   * go through the same in-app proxy as the anime/manga paths (desktop
   * `custom/watch` + `custom/read` parity).
   */
  async custom(
    namespace: string,
    op: 'Home' | 'Search' | 'Info' | 'Watch' | 'Read',
    args: unknown[],
  ): Promise<any> {
    const out = await callMethod(namespace, `custom${op}`, args);
    if (out && typeof out === 'object') {
      if (Array.isArray((out as any).sources)) {
        return {
          ...(out as any),
          sources: (out as any).sources.map((s: any) => applyMobileProxyToSource(s)),
        };
      }
      if (Array.isArray((out as any).pages)) {
        const pages = applyMobileProxyToPages((out as any).pages);
        return { ...(out as any), pages, count: pages.length };
      }
    }
    return out;
  },
};

export type MobileExtensionDispatch = typeof mobileExtensionDispatch;

/**
 * Install the dispatch surface on `window` so lower-level modules
 * (`resolveExtensionApiBase`, manga runtime) can find it without importing this
 * module directly (avoids a load-order cycle). No-ops off Capacitor.
 */
export function installMobileExtensionHost(): void {
  if (!isCapacitor() || typeof window === 'undefined') return;
  (window as any).tatakaiMobileExtensions = mobileExtensionDispatch;

  // Store and other renderer clients intentionally consume one runtime contract
  // on every platform. Electron supplies this from preload; mobile supplies the
  // equivalent bridge here so installed bundles are immediately recognised as
  // loaded instead of falling through to the browser-only `not_loaded` state.
  const runtime = ((window as any).tatakaiRuntime ||= {});
  runtime.health = async () => ({
    ok: true,
    loadedExtensions: [...registry.values()].map(({ manifest }) => manifest.id),
    namespaces: listMobileNamespaces(),
  });
  runtime.loadKaiExtension = async (buffer: ArrayBuffer) => {
    const { installMobileKaiExtension } = await import('./mobileExtensionInstaller');
    return installMobileKaiExtension(buffer);
  };
  runtime.unloadExtension = async (id: string) => {
    const { uninstallMobileExtension } = await import('./mobileExtensionInstaller');
    await uninstallMobileExtension(id);
    return { success: true };
  };
}
