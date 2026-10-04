/**
 * mobileExtensionInstaller.ts — obtains extension bundles for the in-WebView
 * runtime from the Tatakai marketplace.
 *
 * Flow (mobile only):
 *   1. hydrate() — register any bundles already cached in Dexie. Instant + works
 *      offline; run on launch before any source/manga resolution.
 *   2. refresh() — fetch the marketplace manifest list, download + unzip each
 *      signed `.kai`, register into the host, and cache the manifest + bundle
 *      code in Dexie for next launch. Network-first for freshness/updates.
 *
 * `.kai` bundles are ZIPs containing `manifest.json` + `dist/bundle.js` (the
 * same two files desktop ships as extraResources). Marketplace bundles are
 * curated + signed, so they satisfy the trust gate; we register them enabled.
 */

import JSZip from 'jszip';
import { isCapacitor } from '@/lib/platform/platform';
import { db, type MobileExtensionBundle } from '@/core/db/tatakai-db';
import {
  fetchMarketplaceExtensions,
  downloadExtensionKai,
  type MarketplaceExtension,
} from '@/core/extensions/marketplace-client';
import { registerMobileExtension } from './mobileExtensionHost';
import type { ExtensionManifest } from '@/core/extensions/sdk/types';

let initInFlight: Promise<void> | null = null;
let initialized = false;
let backgroundRefreshStarted = false;

function notifyExtensionsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tatakai-extensions-changed'));
}

export type MobileKaiInstallResult =
  | { success: true; extensionId: string; namespace: string; manifest: ExtensionManifest; hasIcon: boolean }
  | { success: false; error: string };

/** Extract `{ manifest, bundleCode, hasIcon }` from a `.kai` ArrayBuffer. */
async function unpackKai(
  buf: ArrayBuffer,
): Promise<{ manifest: ExtensionManifest; bundleCode: string; hasIcon: boolean } | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    // Manifest: prefer a top-level `manifest.json`, else the first match anywhere.
    const manifestFile =
      zip.file('manifest.json') ||
      zip.file(/(^|\/)manifest\.json$/i)?.[0] ||
      null;
    // Bundle: `dist/bundle.js`, else the first `*bundle.js`.
    const bundleFile =
      zip.file('dist/bundle.js') ||
      zip.file(/(^|\/)bundle\.js$/i)?.[0] ||
      null;
    if (!manifestFile || !bundleFile) return null;

    const manifest = JSON.parse(await manifestFile.async('string')) as ExtensionManifest;
    const bundleCode = await bundleFile.async('string');
    const hasIcon = Boolean(zip.file('icon.png') || zip.file(/(^|\/)icon\.png$/i)?.[0]);
    return { manifest, bundleCode, hasIcon };
  } catch {
    return null;
  }
}

/**
 * Install one `.kai` payload into the mobile runtime and durable cache.
 *
 * This is intentionally public: the Extensions Store still talks to the
 * common `tatakaiRuntime.loadKaiExtension()` contract, and the mobile host
 * adapts that call to this function. Keeping extraction and persistence here
 * prevents the Store and marketplace-refresh paths from drifting apart.
 */
export async function installMobileKaiExtension(
  buf: ArrayBuffer,
  marketplace?: Pick<MarketplaceExtension, 'signature' | 'signedBy' | 'permissions'>,
): Promise<MobileKaiInstallResult> {
  if (!isCapacitor()) return { success: false, error: 'Mobile runtime unavailable' };

  const unpacked = await unpackKai(buf);
  if (!unpacked) return { success: false, error: 'Invalid extension package' };

  const { manifest, bundleCode, hasIcon } = unpacked;
  const merged: ExtensionManifest = {
    ...manifest,
    signature: manifest.signature ?? marketplace?.signature ?? undefined,
    signedBy: manifest.signedBy ?? marketplace?.signedBy ?? undefined,
    permissions: manifest.permissions?.length ? manifest.permissions : marketplace?.permissions ?? [],
  };

  const registered = await registerMobileExtension(merged, bundleCode);
  if (!registered.ok) {
    return {
      success: false,
      error: 'error' in registered ? registered.error : 'Unable to register extension',
    };
  }

  try {
    const row: MobileExtensionBundle = {
      id: merged.id,
      namespace: registered.namespace,
      version: merged.version,
      manifest: merged,
      bundleCode,
      enabled: true,
      updatedAt: new Date().toISOString(),
    };
    await db.mobileExtensionBundles.put(row);
  } catch (error) {
    // The loaded bundle is still usable for this session; report the cache
    // problem only if the caller needs a durable install.
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to save extension',
    };
  }

  return {
    success: true,
    extensionId: merged.id,
    namespace: registered.namespace,
    manifest: merged,
    hasIcon,
  };
}

/** Remove an installed mobile extension from both memory and durable storage. */
export async function uninstallMobileExtension(id: string): Promise<void> {
  const normalized = String(id || '').trim().toLowerCase();
  if (!normalized) return;

  const { unregisterMobileExtension, listMobileNamespaces } = await import('./mobileExtensionHost');
  for (const namespace of listMobileNamespaces()) {
    if (
      String(namespace.extensionId || '').toLowerCase() === normalized ||
      String(namespace.namespace || '').toLowerCase() === normalized
    ) {
      unregisterMobileExtension(namespace.namespace);
    }
  }
  await db.mobileExtensionBundles.delete(id);
}

/** Register every cached bundle into the runtime. Returns how many registered. */
export async function hydrateMobileExtensions(): Promise<number> {
  if (!isCapacitor()) return 0;
  let count = 0;
  try {
    const rows = await db.mobileExtensionBundles.filter((r) => r.enabled !== false).toArray();
    for (const row of rows) {
      const res = await registerMobileExtension(
        row.manifest as ExtensionManifest,
        row.bundleCode,
      );
      if (res.ok) count++;
    }
    if (count > 0) notifyExtensionsChanged();
  } catch {
    /* cache read is best-effort */
  }
  return count;
}

/** One marketplace extension → download, unpack, register, cache. */
async function installOne(ext: MarketplaceExtension): Promise<boolean> {
  try {
    const buf = await downloadExtensionKai(ext.mainUrl);
    return (await installMobileKaiExtension(buf, ext)).success;
  } catch {
    return false;
  }
}

/** Fetch the marketplace list and (re)install any new/updated bundles. */
export async function refreshMobileExtensions(): Promise<number> {
  if (!isCapacitor()) return 0;
  let installed = 0;
  try {
    const list = await fetchMarketplaceExtensions();
    const cached = await db.mobileExtensionBundles.toArray();
    const cachedById = new Map(cached.map((r) => [r.id, r]));

    for (const ext of list) {
      const prior = cachedById.get(ext.id);
      // Skip re-download when the cached version already matches.
      if (prior && prior.version === ext.version) continue;
      if (await installOne(ext)) installed++;
    }
    if (installed > 0) notifyExtensionsChanged();
  } catch {
    /* offline / marketplace down — the hydrate() pass already registered cache */
  }
  return installed;
}

/**
 * Launch entry point: register cached bundles immediately, then refresh from the
 * marketplace in the background. Deduped so multiple callers share one run.
 */
export function initMobileExtensions(): Promise<void> {
  if (!isCapacitor()) return Promise.resolve();
  if (initialized) return Promise.resolve();
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    await hydrateMobileExtensions();
    initialized = true;
    // Background refresh — do not block first paint / first resolution on it.
    if (!backgroundRefreshStarted) {
      backgroundRefreshStarted = true;
      void refreshMobileExtensions();
    }
  })().finally(() => {
    initInFlight = null;
  });

  return initInFlight;
}
