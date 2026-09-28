/**
 * src/lib/memoryReclaim.ts
 * ------------------------------------------------------------------------------
 * The renderer half of "Free memory now" (and the idle-reclaim provider). Sheds
 * the in-memory caches the app can cheaply rebuild, drops inactive React Query
 * data, and asks the main process to close idle Cloudflare Chromium contexts +
 * force a GC.
 *
 * Everything here is best-effort and non-fatal: a cache that fails to clear must
 * never break playback or reading. Durable stores (Dexie, localStorage) are left
 * untouched — this only reclaims volatile RAM.
 */

import type { QueryClient } from "@tanstack/react-query";
import { clearMappingCache, sweepMappingCache } from "@/lib/mapping/client";
import { clearAllCombinedSources } from "@/lib/watch/sourceIntelligence";
import { clearExtensionResultMem, sweepExtensionResultMem } from "@/lib/cache/extensionResultCache";

export interface ReclaimResult {
  main?: { success: boolean; contextsClosed?: number; gcRan?: boolean };
}

/**
 * Full reclaim (the "Free memory now" button). Clears the renderer caches
 * outright and drops inactive queries, then triggers the main-side reclaim.
 */
export async function reclaimRendererMemory(queryClient?: QueryClient): Promise<ReclaimResult> {
  try {
    clearMappingCache();
  } catch {
    /* non-fatal */
  }
  try {
    clearAllCombinedSources();
  } catch {
    /* non-fatal */
  }
  try {
    clearExtensionResultMem();
  } catch {
    /* non-fatal */
  }
  // Drop cached data for queries with no active observers; anything on screen is
  // refetched on demand. `removeQueries` with `type: 'inactive'` never touches a
  // mounted query, so the current view is undisturbed.
  try {
    queryClient?.removeQueries({ type: "inactive" });
  } catch {
    /* non-fatal */
  }

  const result: ReclaimResult = {};
  try {
    const bridge = (window as any)?.electron;
    if (bridge?.reclaimMemory) {
      result.main = await bridge.reclaimMemory();
    }
  } catch {
    /* not desktop, or bridge not ready */
  }
  return result;
}

/**
 * Light reclaim for the idle timer: only sweep *expired* cache entries (don't
 * blow away live caches a returning user will immediately need), then ask main
 * to close idle CF contexts. Cheaper and less disruptive than a full reclaim.
 */
export async function reclaimIdleMemory(): Promise<void> {
  try {
    sweepMappingCache();
  } catch {
    /* non-fatal */
  }
  try {
    sweepExtensionResultMem();
  } catch {
    /* non-fatal */
  }
  try {
    const bridge = (window as any)?.electron;
    if (bridge?.reclaimMemory) await bridge.reclaimMemory();
  } catch {
    /* non-fatal */
  }
}
