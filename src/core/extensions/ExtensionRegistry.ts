import React from 'react';
import type { LanguageCapability, CustomSourceDescriptor } from './sdk/types';

export interface ExtensionPage {
  id: string;
  path: string;
  component: React.ComponentType;
  label: string;
  icon?: string;
}

export interface ExtensionSlot {
  id: string;
  slotId: string;
  component: React.ComponentType<any>;
}

export interface ExtensionSearchProvider {
  id: string;
  name: string;
  /** Extension category — determines available source methods and UI sections. */
  type?: 'torrent' | 'onlinestream' | 'custom';
  /** Static hint: language codes this extension generally supports. Used for UI display. */
  supportedLanguages?: string[];
  /**
   * Live per-episode language query.
   * Called by the automation engine before invoking `search()` / `single()`.
   * Returns the audio/subtitle languages available for a specific episode.
   * Return `[]` if the extension cannot determine available languages.
   */
  getEpisodeLanguages?: (anilistId: number, episode: number) => Promise<LanguageCapability[]>;
  search: (query: string) => Promise<any[]>;
}

/**
 * A theme contributed by an extension (data- or code-driven). The `colors` map is a
 * CSS-token object in the same shape the built-in `THEME_COLORS` entries use
 * (camelCase keys without the `--` prefix, e.g. `primary`, `mutedForeground`).
 * A leading `--` on a key is tolerated and stripped at apply time.
 */
export interface RegisteredTheme {
  /** Namespaced theme id, unique across extensions (used as the persisted theme value). */
  id: string;
  name: string;
  colors: Record<string, string>;
  info?: {
    label?: string;
    description?: string;
    accent?: string;
    gradient?: string;
    icon?: string;
    category?: 'dark' | 'light';
  };
  /** Owning extension id (prefix of `id`, used by `unregisterAll`). */
  extensionId: string;
}

/** A runtime analytics sink. Registered providers are fanned out to by `AnalyticsService`. */
export interface AnalyticsProvider {
  /** Namespaced provider id (prefixed with the owning extension id). */
  id: string;
  trackEvent: (name: string, params?: Record<string, any>) => void;
  trackPageView: (path: string, title?: string) => void;
  trackError?: (error: Error, context?: Record<string, any>) => void;
}

/** A long-lived platform module contributed by a (trusted) extension's renderer bundle. */
export interface ExtensionModule {
  /** Namespaced module id (prefixed with the owning extension id). */
  id: string;
  /** Called once at boot with the extension capability context. */
  init: (ctx: any) => void | Promise<void>;
  /** Called on unload/unregister for cleanup. */
  dispose?: () => void;
}

/** A named service an extension exposes to the rest of the app (integrations). */
export interface ExtensionService {
  /** Namespaced service id (prefixed with the owning extension id). */
  id: string;
  name: string;
  /** Arbitrary service API surface. */
  api?: Record<string, any>;
}

/** A custom source registered at runtime (supplements the async HTTP/IPC discovery). */
export interface RegisteredCustomSource extends CustomSourceDescriptor {
  /** Owning extension id (prefix of the registry key). */
  extensionId: string;
  /** API-server namespace the source is served under. */
  namespace: string;
}

class ExtensionRegistry {
  private static instance: ExtensionRegistry;

  /** Shared empty slot array — a stable reference for `useSyncExternalStore`. */
  private static readonly EMPTY_SLOTS: ExtensionSlot[] = [];

  private pages: Map<string, ExtensionPage> = new Map();
  private slots: Map<string, ExtensionSlot[]> = new Map();
  private searchProviders: Map<string, ExtensionSearchProvider> = new Map();
  private themes: Map<string, RegisteredTheme> = new Map();
  private analyticsProviders: Map<string, AnalyticsProvider> = new Map();
  private services: Map<string, ExtensionService> = new Map();
  private modules: Map<string, ExtensionModule> = new Map();
  private customSources: Map<string, RegisteredCustomSource> = new Map();

  /** Change listeners — fired after any (un)registration so React consumers can recompute. */
  private listeners: Set<() => void> = new Set();

  private constructor() { }

  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry();
    }
    return ExtensionRegistry.instance;
  }

  /** Subscribe to registry changes. Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.warn('[ExtensionRegistry] listener threw', e);
      }
    });
  }

  // --- Registration ---

  registerPage(page: ExtensionPage) {
    this.pages.set(page.id, page);
    console.log(`[ExtensionRegistry] Registered page: ${page.label} at ${page.path}`);
    this.notify();
  }

  registerSlot(slot: ExtensionSlot) {
    const existing = this.slots.get(slot.slotId) || [];
    this.slots.set(slot.slotId, [...existing, slot]);
    console.log(`[ExtensionRegistry] Registered slot: ${slot.id} for ${slot.slotId}`);
    this.notify();
  }

  registerSearchProvider(provider: ExtensionSearchProvider) {
    this.searchProviders.set(provider.id, provider);
    console.log(`[ExtensionRegistry] Registered search provider: ${provider.name}`);
    this.notify();
  }

  registerTheme(theme: RegisteredTheme) {
    this.themes.set(theme.id, theme);
    console.log(`[ExtensionRegistry] Registered theme: ${theme.name} (${theme.id})`);
    this.notify();
  }

  registerAnalyticsProvider(provider: AnalyticsProvider) {
    this.analyticsProviders.set(provider.id, provider);
    console.log(`[ExtensionRegistry] Registered analytics provider: ${provider.id}`);
    this.notify();
  }

  registerService(service: ExtensionService) {
    this.services.set(service.id, service);
    console.log(`[ExtensionRegistry] Registered service: ${service.name} (${service.id})`);
    this.notify();
  }

  registerModule(mod: ExtensionModule) {
    this.modules.set(mod.id, mod);
    console.log(`[ExtensionRegistry] Registered module: ${mod.id}`);
    this.notify();
  }

  registerCustomSource(source: RegisteredCustomSource) {
    this.customSources.set(`${source.namespace}::${source.id}`, source);
    console.log(`[ExtensionRegistry] Registered custom source: ${source.name} (${source.namespace}/${source.id})`);
    this.notify();
  }

  // --- Retrieval ---

  getPages(): ExtensionPage[] {
    return Array.from(this.pages.values());
  }

  getSlotComponents(slotId: string): ExtensionSlot[] {
    // Stable empty reference so `useSyncExternalStore` snapshots don't churn.
    return this.slots.get(slotId) || ExtensionRegistry.EMPTY_SLOTS;
  }

  getSearchProviders(): ExtensionSearchProvider[] {
    return Array.from(this.searchProviders.values());
  }

  getThemes(): RegisteredTheme[] {
    return Array.from(this.themes.values());
  }

  getAnalyticsProviders(): AnalyticsProvider[] {
    return Array.from(this.analyticsProviders.values());
  }

  getServices(): ExtensionService[] {
    return Array.from(this.services.values());
  }

  getService(id: string): ExtensionService | undefined {
    return this.services.get(id);
  }

  getModules(): ExtensionModule[] {
    return Array.from(this.modules.values());
  }

  getCustomSources(): RegisteredCustomSource[] {
    return Array.from(this.customSources.values());
  }

  unregisterAll(extensionId: string) {
    // Cleanup for a specific extension (e.g. on unload)
    this.pages.forEach((page, id) => {
      if (id.startsWith(extensionId)) this.pages.delete(id);
    });

    this.slots.forEach((list, slotId) => {
      this.slots.set(slotId, list.filter(s => !s.id.startsWith(extensionId)));
    });

    this.searchProviders.forEach((provider, id) => {
      if (id.startsWith(extensionId)) this.searchProviders.delete(id);
    });

    this.themes.forEach((theme, id) => {
      if (theme.extensionId === extensionId || id.startsWith(extensionId)) this.themes.delete(id);
    });

    this.analyticsProviders.forEach((provider, id) => {
      if (id.startsWith(extensionId)) this.analyticsProviders.delete(id);
    });

    this.services.forEach((service, id) => {
      if (id.startsWith(extensionId)) this.services.delete(id);
    });

    // Modules get their dispose() hook called before removal.
    this.modules.forEach((mod, id) => {
      if (id.startsWith(extensionId)) {
        try {
          mod.dispose?.();
        } catch (e) {
          console.warn(`[ExtensionRegistry] module dispose failed for ${id}`, e);
        }
        this.modules.delete(id);
      }
    });

    this.customSources.forEach((source, key) => {
      if (source.extensionId === extensionId) this.customSources.delete(key);
    });

    this.notify();
  }

  unregisterSearchProvider(providerId: string) {
    this.searchProviders.delete(providerId);
    console.log(`[ExtensionRegistry] Unregistered search provider: ${providerId}`);
    this.notify();
  }
}

export const extensionRegistry = ExtensionRegistry.getInstance();
