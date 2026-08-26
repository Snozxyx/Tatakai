import React from 'react';
import type { LanguageCapability } from './sdk/types';

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

class ExtensionRegistry {
  private static instance: ExtensionRegistry;

  private pages: Map<string, ExtensionPage> = new Map();
  private slots: Map<string, ExtensionSlot[]> = new Map();
  private searchProviders: Map<string, ExtensionSearchProvider> = new Map();

  private constructor() { }

  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry();
    }
    return ExtensionRegistry.instance;
  }

  // --- Registration ---

  registerPage(page: ExtensionPage) {
    this.pages.set(page.id, page);
    console.log(`[ExtensionRegistry] Registered page: ${page.label} at ${page.path}`);
  }

  registerSlot(slot: ExtensionSlot) {
    const existing = this.slots.get(slot.slotId) || [];
    this.slots.set(slot.slotId, [...existing, slot]);
    console.log(`[ExtensionRegistry] Registered slot: ${slot.id} for ${slot.slotId}`);
  }

  registerSearchProvider(provider: ExtensionSearchProvider) {
    this.searchProviders.set(provider.id, provider);
    console.log(`[ExtensionRegistry] Registered search provider: ${provider.name}`);
  }

  // --- Retrieval ---

  getPages(): ExtensionPage[] {
    return Array.from(this.pages.values());
  }

  getSlotComponents(slotId: string): ExtensionSlot[] {
    return this.slots.get(slotId) || [];
  }

  getSearchProviders(): ExtensionSearchProvider[] {
    return Array.from(this.searchProviders.values());
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
  }

  unregisterSearchProvider(providerId: string) {
    this.searchProviders.delete(providerId);
    console.log(`[ExtensionRegistry] Unregistered search provider: ${providerId}`);
  }
}

export const extensionRegistry = ExtensionRegistry.getInstance();
