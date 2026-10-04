/**
 * Extension bootstrap — the wiring that turns installed manifests into live
 * renderer contributions. Runs once at app boot (from GlobalListeners).
 *
 * Two contribution classes:
 *   • Data-driven (no extension code): custom sources, themes-as-JSON,
 *     analytics-as-ingest-URL. Registered straight from the manifest.
 *   • Code-driven (trust-gated renderer bundle): pages/slots/services/modules
 *     and code analytics providers, handed to `loadRendererContribution`.
 *
 * Custom sources are registered here purely so the sidebar/registry knows they
 * exist; their content flows over the extension-API host (see
 * custom-source-runtime.ts) and NEVER touches the anime/manga watchlist.
 */

import { extensionRegistry, type RegisteredTheme, type AnalyticsProvider } from './ExtensionRegistry';
import { analytics } from '@/core/analytics/AnalyticsService';
import { loadRendererContribution } from './rendererLoader';
import type { CustomSourceDescriptor, ContributedTheme, ContributedAnalytics } from './sdk/types';

// Installed-extension row as returned by `electron.listInstalledExtensions`.
interface InstalledRow {
  id: string;
  name?: string | null;
  capabilities?: string[];
  apiServer?: { namespace?: string } | null;
  customSources?: CustomSourceDescriptor[];
  contributes?: { rendererEntry?: string; themes?: ContributedTheme[]; analytics?: ContributedAnalytics[] } | null;
  sideloaded?: boolean;
  signature?: string | null;
  priority?: number;
}

type BootRuntime = {
  electron?: { listInstalledExtensions?: () => Promise<InstalledRow[]> };
};

// Module-level guard so React StrictMode's double-invoke can't double-boot.
let booted = false;

/** Build an ingest-URL POST provider from a data-driven analytics contribution. */
function makeIngestProvider(extensionId: string, idx: number, cfg: ContributedAnalytics): AnalyticsProvider {
  const allow = new Set((cfg.events || []).filter(Boolean));
  const shouldSend = (name: string) => allow.size === 0 || allow.has(name);
  const post = (type: string, name: string, payload: Record<string, unknown>) => {
    if (!shouldSend(name)) return;
    try {
      // Fire-and-forget; keepalive lets it survive a page transition.
      void fetch(cfg.ingestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, payload, ts: Date.now() }),
        keepalive: true,
      }).catch(() => { /* ignore network errors */ });
    } catch {
      /* ignore */
    }
  };
  return {
    id: `${extensionId}:analytics:${idx}`,
    trackEvent: (name, params) => post('event', name, params || {}),
    trackPageView: (path, title) => post('pageview', path, { title }),
    trackError: (error, context) => post('error', error.message, { ...context }),
  };
}

/** Register a data-driven theme, namespacing its id under the extension. */
function registerContributedTheme(extensionId: string, theme: ContributedTheme) {
  if (!theme?.id || !theme.colors) return;
  const registered: RegisteredTheme = {
    id: `${extensionId}:${theme.id}`,
    name: theme.name || theme.id,
    colors: theme.colors,
    info: theme.info
      ? { label: theme.info.label, description: theme.info.description, accent: theme.info.accent }
      : undefined,
    extensionId,
  };
  extensionRegistry.registerTheme(registered);
}

/** Merge one extension's declarative (data-driven) contributions. */
function applyDataDriven(row: InstalledRow) {
  const namespace = row.apiServer?.namespace;

  // Custom sources → registry (sidebar discovery; content served over HTTP host).
  if (namespace && Array.isArray(row.customSources)) {
    for (const src of row.customSources) {
      if (!src?.id || !src.name) continue;
      extensionRegistry.registerCustomSource({ ...src, extensionId: row.id, namespace });
    }
  }

  // Themes.
  for (const theme of row.contributes?.themes || []) registerContributedTheme(row.id, theme);

  // Analytics sinks.
  (row.contributes?.analytics || []).forEach((cfg, i) => {
    if (!cfg?.ingestUrl) return;
    analytics.registerProvider(makeIngestProvider(row.id, i, cfg));
  });
}

/**
 * Boot all installed extensions' renderer contributions. Idempotent.
 *
 * @param navigate router push used to build the renderer ExtensionContext.
 */
export async function bootstrapExtensions(navigate: (path: string) => void): Promise<void> {
  if (booted) return;
  booted = true;

  const w = (typeof window !== 'undefined' ? window : {}) as BootRuntime;
  const list = w.electron?.listInstalledExtensions;
  if (!list) {
    // Web build (no Electron): data-driven custom sources are discovered lazily
    // over HTTP by custom-source-runtime; nothing to bootstrap here.
    return;
  }

  let rows: InstalledRow[] = [];
  try {
    rows = (await list()) || [];
  } catch (e) {
    console.warn('[bootstrapExtensions] listInstalledExtensions failed', e);
    return;
  }

  // Deterministic order (lower priority first), matching source-resolution order.
  rows.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  for (const row of rows) {
    if (!row?.id) continue;
    try {
      applyDataDriven(row);
    } catch (e) {
      console.warn(`[bootstrapExtensions] data-driven failed for ${row.id}`, e);
    }

    // Code-driven renderer contribution (trust-gated inside the loader + main).
    if (row.contributes?.rendererEntry) {
      try {
        await loadRendererContribution(
          { id: row.id, sideloaded: row.sideloaded, signature: row.signature, contributes: row.contributes },
          navigate,
        );
      } catch (e) {
        console.warn(`[bootstrapExtensions] renderer load failed for ${row.id}`, e);
      }
    }
  }

  console.log(`[bootstrapExtensions] booted ${rows.length} extension(s)`);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tatakai-extensions-changed'));
  }
}
