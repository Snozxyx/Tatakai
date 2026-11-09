import { createContext, createElement, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { discardPendingAccountSettingsField } from '@/lib/appSettingsPersistence';
import { commitAppearanceAssets, appearanceNamespace } from '@/lib/appearanceAssets';
import { publishCustomThemes } from '@/lib/customThemeRegistry';
import { EMPTY_CUSTOMIZATION, mergeCustomization, readCustomization, type CustomizationPatch, type CustomizationSettings, type LayoutTarget } from '@/lib/customization';

export type CustomizationSyncStatus = 'saved' | 'saving' | 'pending';
interface Snapshot { settings: CustomizationSettings; syncStatus: CustomizationSyncStatus; syncError?: string }
const prefix = 'tatakai_customization_v1:';
const pendingPrefix = 'tatakai_customization_pending_v1:';
const changeEvent = 'tatakai-customization-changed';
const snapshots = new Map<string, Snapshot>();
let activeNamespace: string | undefined;
const serverSnapshot: Snapshot = { settings: EMPTY_CUSTOMIZATION, syncStatus: 'saved' };
function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function snapshot(namespace: string, userId?: string | null): Snapshot {
  const cached = snapshots.get(namespace);
  if (cached) return cached;
  const stored = readJson(prefix + namespace);
  const settings = readCustomization(stored);
  const result: Snapshot = { settings, syncStatus: 'saved' };
  snapshots.set(namespace, result);
  return result;
}
function publish(namespace: string, next: Snapshot, persist = false): void {
  if (persist && typeof localStorage !== 'undefined') localStorage.setItem(prefix + namespace, JSON.stringify(next.settings));
  snapshots.set(namespace, next);
  if (namespace === activeNamespace) publishCustomThemes(next.settings, namespace);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(changeEvent, { detail: { namespace } }));
}
function subscribe(namespace: string, notify: () => void): () => void {
  const changed = (event: Event) => { if ((event as CustomEvent).detail?.namespace === namespace) notify(); };
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === prefix + namespace || event.key === pendingPrefix + namespace) { snapshots.delete(namespace); notify(); }
  };
  window.addEventListener(changeEvent, changed);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(changeEvent, changed); window.removeEventListener('storage', storage); };
}
/** Appearance preferences and image bytes remain on this device. */
export function useCustomization() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const namespace = appearanceNamespace(userId);
  const listen = useCallback((notify: () => void) => subscribe(namespace, notify), [namespace]);
  const read = useCallback(() => snapshot(namespace, userId), [namespace, userId]);
  const state = useSyncExternalStore(listen, read, () => serverSnapshot);
  useEffect(() => {
    activeNamespace = namespace;
    publishCustomThemes(state.settings, namespace);
  }, [namespace, state.settings]);
  useEffect(() => {
    if (!userId) return;
    for (const field of ['customization', 'theme', 'sidebar'] as const) discardPendingAccountSettingsField(userId, field);
    // This old local preference outbox is no longer replayed to an account.
    localStorage.removeItem(pendingPrefix + namespace);
  }, [namespace, userId]);
  const savePatch = useCallback(async (patch: CustomizationPatch): Promise<void> => {
    const prepared = await commitAppearanceAssets(patch, userId);
    const settings = mergeCustomization(snapshot(namespace, userId).settings, prepared.value);
    publish(namespace, { settings, syncStatus: 'saved', syncError: prepared.error }, true);
  }, [namespace, userId]);
  return { ...state, userId, savePatch };
}
interface CustomizationScope { themeId: string; target: LayoutTarget }
const ScopeContext = createContext<CustomizationScope | null>(null);
export function CustomizationScopeProvider({ themeId, target, children }: CustomizationScope & { children?: ReactNode }) {
  return createElement(ScopeContext.Provider, { value: { themeId, target } }, children);
}
const activeThemeListeners = new Set<() => void>();
let activeThemeObserver: MutationObserver | undefined;
function subscribeActiveTheme(notify: () => void): () => void {
  activeThemeListeners.add(notify);
  if (!activeThemeObserver && typeof MutationObserver !== 'undefined' && document.body) {
    activeThemeObserver = new MutationObserver(() => { for (const listener of activeThemeListeners) listener(); });
    activeThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  }
  return () => {
    activeThemeListeners.delete(notify);
    if (!activeThemeListeners.size) { activeThemeObserver?.disconnect(); activeThemeObserver = undefined; }
  };
}
export function useActiveThemeId(): string {
  const scope = useContext(ScopeContext);
  const listen = useCallback((notify: () => void) => scope ? () => {} : subscribeActiveTheme(notify), [scope]);
  const read = useCallback(() => scope?.themeId ?? (typeof document !== 'undefined' ? document.body?.dataset.theme : undefined) ?? 'cherry-blossom', [scope]);
  return useSyncExternalStore(listen, read, () => scope?.themeId ?? 'cherry-blossom');
}
export function useCustomizationScope(): CustomizationScope {
  const scope = useContext(ScopeContext);
  const themeId = useActiveThemeId();
  const listen = useCallback((notify: () => void) => {
    if (scope) return () => {};
    window.addEventListener('resize', notify);
    return () => window.removeEventListener('resize', notify);
  }, [scope]);
  const read = useCallback((): LayoutTarget => scope?.target ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop'), [scope]);
  const target = useSyncExternalStore(listen, read, () => scope?.target ?? 'desktop');
  return scope ?? { themeId, target };
}
