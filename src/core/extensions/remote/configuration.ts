import { Capacitor, registerPlugin } from '@capacitor/core';
import { extensionRequestId } from '../compatibility/request-id';
import { detectEcosystem, normalizeManifestUrl } from '../ecosystems';
import { fetchExtensionJson } from './transport';
import uiI18n from '@/lib/uiI18n';

export type ConfigurationResult =
  | { requestId: string; success: true; manifestUrl: string }
  | { requestId: string; success: false };
export interface ConfigurationDraft {
  requestId: string;
  manifestUrl: string;
  expectedAddonId: string;
  existingId?: string;
}
export interface ConfiguredAddon extends ConfigurationDraft {
  manifest: Record<string, any>;
}
export const CONFIGURATION_DRAFT_KEY = 'tatakai:extension-configuration';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function configuredManifestUrl(value: string): string {
  // Match the native configuration windows; URL() otherwise silently removes control characters.
  if (typeof value !== 'string' || value.length > 16384 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error(uiI18n.t('extensionSetup.invalidManifestUrl'));
  const url = normalizeManifestUrl(value);
  if (!new URL(url).pathname.endsWith('/manifest.json')) throw new Error(uiI18n.t('extensionSetup.invalidManifestUrl'));
  return url;
}

export function addonConfigurationUrl(value: string): string {
  const url = new URL(configuredManifestUrl(value));
  url.pathname = url.pathname.replace(/\/manifest\.json$/, '/configure');
  return url.href;
}

export function validateConfiguredAddon(manifest: Record<string, any>, expectedAddonId: string): void {
  if (!manifest || detectEcosystem(manifest) !== 'stremio' || manifest.id !== expectedAddonId || !manifest.name || !manifest.version) {
    throw new Error(uiI18n.t('extensionSetup.wrongAddon'));
  }
  if (manifest.behaviorHints?.configurationRequired) throw new Error(uiI18n.t('extensionSetup.finishConfiguration'));
  if (!manifest.resources.some((resource: any) => ['stream', 'subtitles'].includes(typeof resource === 'string' ? resource : resource?.name))) {
    throw new Error(uiI18n.t('extensionSetup.noResources'));
  }
}

/** Session correlation also covers Capacitor's restored activity result after process loss. */
export function createConfigurationCoordinator(deps: {
  storage: Storage;
  requestId(): string;
  open(input: { requestId: string; url: string }): Promise<ConfigurationResult>;
  fetchManifest(url: string): Promise<Record<string, any>>;
}) {
  let active: string | undefined;
  let epoch = 0;
  const pending = (): ConfigurationDraft | null => {
    try {
      const draft = JSON.parse(deps.storage.getItem(CONFIGURATION_DRAFT_KEY) || 'null');
      if (!draft || typeof draft.requestId !== 'string' || typeof draft.expectedAddonId !== 'string') return null;
      configuredManifestUrl(draft.manifestUrl);
      return draft;
    } catch { return null; }
  };
  const clearDraft = () => deps.storage.removeItem(CONFIGURATION_DRAFT_KEY);
  const cancel = () => { epoch += 1; clearDraft(); };
  const complete = async (result: ConfigurationResult): Promise<ConfiguredAddon | null> => {
    const draft = pending();
    if (!draft || draft.requestId !== result?.requestId) return null;
    // Consume before fetching so a duplicate redirect/restored callback cannot run twice.
    if (typeof result.success !== 'boolean') throw new Error(uiI18n.t('extensionSetup.interrupted'));
    const current = epoch;
    clearDraft();
    if (!result.success) return null;
    const manifestUrl = configuredManifestUrl(result.manifestUrl);
    const manifest = await deps.fetchManifest(manifestUrl);
    if (current !== epoch) return null;
    validateConfiguredAddon(manifest, draft.expectedAddonId);
    return { ...draft, manifestUrl, manifest };
  };
  return {
    pending,
    cancel,
    async start(input: Omit<ConfigurationDraft, 'requestId'>): Promise<ConfiguredAddon | null> {
      if (active) throw new Error(uiI18n.t('extensionSetup.busy'));
      const draft = { ...input, manifestUrl: configuredManifestUrl(input.manifestUrl), requestId: deps.requestId() };
      epoch += 1;
      active = draft.requestId;
      try {
        deps.storage.setItem(CONFIGURATION_DRAFT_KEY, JSON.stringify(draft));
        const result = await deps.open({ requestId: draft.requestId, url: addonConfigurationUrl(draft.manifestUrl) });
        if (result?.requestId !== draft.requestId) throw new Error(uiI18n.t('extensionSetup.interrupted'));
        return await complete(result);
      } finally {
        if (pending()?.requestId === draft.requestId) cancel();
        active = undefined;
      }
    },
    async restore(result: ConfigurationResult): Promise<ConfiguredAddon | null> {
      // A live promise owns its result. Restored results are only for a replaced renderer.
      if (active) return null;
      return complete(result);
    },
  };
}

const native = registerPlugin<{ configure(input: { requestId: string; url: string }): Promise<ConfigurationResult> }>('TatakaiExtensionConfig');
const storage: Storage = {
  getItem: key => typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
};
export const addonConfiguration = createConfigurationCoordinator({
  storage,
  requestId: extensionRequestId,
  fetchManifest: fetchExtensionJson,
  async open(input) {
    if (Capacitor.isNativePlatform()) return native.configure(input);
    const desktop = (window as any).electron?.configureExtension;
    if (desktop) return { ...await desktop(input.url), requestId: input.requestId };
    // Browsers cannot inspect navigation in another origin's setup page.
    window.open(input.url, '_blank', 'noopener,noreferrer');
    return { requestId: input.requestId, success: false };
  },
});
