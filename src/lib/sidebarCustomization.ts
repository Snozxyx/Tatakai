import { useSyncExternalStore } from 'react';
import { normalizeSidebarRoute, sidebarQuickPeek, type SidebarOpenMode } from './sidebarLinks';

export const SIDEBAR_ITEMS = [
  { id: 'home', labelKey: 'nav.home', path: '/', defaultRail: true },
  { id: 'search', labelKey: 'nav.search', path: '/search', defaultRail: true },
  { id: 'manga', labelKey: 'nav.manga', path: '/manga', defaultRail: true },
  { id: 'novels', labelKey: 'nav.novels', path: '/novel', defaultRail: true },
  { id: 'community', labelKey: 'nav.community', path: '/community', defaultRail: true },
  { id: 'sources', labelKey: 'nav.customSources', path: '/custom-providers', defaultRail: true },
  { id: 'downloads', labelKey: 'nav.downloads', path: '/offline', defaultRail: true, desktopOnly: true },
  { id: 'trending', labelKey: 'nav.trending', path: '/trending', defaultRail: false },
  { id: 'calendar', labelKey: 'nav.calendar', path: '/calendar', defaultRail: false },
  { id: 'favorites', labelKey: 'nav.favorites', path: '/favorites', defaultRail: false },
] as const;
export type BuiltinSidebarItemId = typeof SIDEBAR_ITEMS[number]['id'];
export type SidebarItemId = BuiltinSidebarItemId | `link:${string}`;
export interface SidebarShortcut { id: `link:${string}`; name: string; path: string; mode: SidebarOpenMode }
export interface SidebarPreferences { version: 1; order: SidebarItemId[]; hidden: SidebarItemId[]; links?: Record<string, SidebarShortcut | null> }
export interface SidebarRouteItem { id: SidebarItemId; path: string; labelKey?: string; name?: string; mode?: SidebarOpenMode; desktopOnly?: boolean; defaultRail?: boolean }
export function sidebarItemLabel(item: SidebarRouteItem, translate: (key: string) => string): string { return item.name || translate(item.labelKey || ''); }
export function getSidebarItem(id: SidebarItemId, preferences: SidebarPreferences | null): SidebarRouteItem | undefined { return SIDEBAR_ITEMS.find(item => item.id === id) || preferences?.links?.[id] || undefined; }
export const DEFAULT_SIDEBAR: SidebarPreferences = {
  version: 1, order: SIDEBAR_ITEMS.map(item => item.id), hidden: SIDEBAR_ITEMS.filter(item => !item.defaultRail).map(item => item.id),
};
export const SIDEBAR_STORAGE_KEY = 'tatakai_sidebar_customization_v1';
export function normalizeSidebarPreferences(value: unknown): SidebarPreferences | null {
  if (!value || typeof value !== 'object' || (value as SidebarPreferences).version !== 1) return null;
  const input = value as SidebarPreferences;
  if (!Array.isArray(input.order) || !Array.isArray(input.hidden)) return null;
  const links: Record<string, SidebarShortcut> = {};
  for (const [id, raw] of Object.entries(input.links || {})) {
    if (!id.startsWith('link:') || !raw || typeof raw.name !== 'string' || !raw.name.trim() || typeof raw.path !== 'string') continue;
    const path = normalizeSidebarRoute(raw.path);
    if (!path) continue;
    links[id] = { id: id as `link:${string}`, name: raw.name.trim().slice(0, 100), path, mode: raw.mode === 'quick-view' && sidebarQuickPeek(path, raw.name) ? 'quick-view' : 'page' };
  }
  const known = (value: unknown): value is SidebarItemId => typeof value === 'string' && (SIDEBAR_ITEMS.some(item => item.id === value) || Object.prototype.hasOwnProperty.call(links, value));
  const order = Array.from(new Set([...input.order.filter(known), ...DEFAULT_SIDEBAR.order, ...Object.keys(links) as SidebarItemId[]]));
  const hidden = order.filter(id => input.hidden.includes(id));
  const result: SidebarPreferences = { version: 1, order, hidden, ...(Object.keys(links).length ? { links } : {}) };
  return JSON.stringify(result) === JSON.stringify(DEFAULT_SIDEBAR) ? null : result;
}
export function sidebarRailItems(preferences: SidebarPreferences | null, desktop: boolean): SidebarRouteItem[] {
  const config = preferences ?? DEFAULT_SIDEBAR;
  return config.order.map(id => getSidebarItem(id, config)).filter((item): item is SidebarRouteItem => !!item && !config.hidden.includes(item.id) && (!item.desktopOnly || desktop));
}
export function sidebarOverflowItems(preferences: SidebarPreferences | null, desktop: boolean): SidebarRouteItem[] {
  if (!preferences) return SIDEBAR_ITEMS.filter(item => !item.defaultRail);
  return preferences.order.map(id => getSidebarItem(id, preferences)).filter((item): item is SidebarRouteItem => !!item && preferences.hidden.includes(item.id) && (!item.desktopOnly || desktop));
}
export function sidebarItemActive(id: SidebarItemId, pathname: string, preferences: SidebarPreferences | null = null): boolean {
  if (id === 'manga') return pathname === '/manga' || pathname.startsWith('/manga/');
  if (id === 'novels') return pathname === '/novel' || pathname.startsWith('/novel/');
  if (id === 'sources') return pathname === '/custom-providers' || pathname.startsWith('/x/');
  const path = getSidebarItem(id, preferences)?.path;
  return path ? new URL(path, 'https://tatakai.app/').pathname === pathname : false;
}
let current: SidebarPreferences | null | undefined;
const listeners = new Set<() => void>();
function read() {
  if (current !== undefined) return current;
  try { current = normalizeSidebarPreferences(JSON.parse(localStorage.getItem(SIDEBAR_STORAGE_KEY) || 'null')); } catch { current = null; }
  return current;
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === SIDEBAR_STORAGE_KEY || event.key === null) { current = undefined; for (const listener of listeners) listener(); }
});
export function saveSidebarPreferences(preferences: SidebarPreferences | null) {
  const next = normalizeSidebarPreferences(preferences);
  if (next) localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next)); else localStorage.removeItem(SIDEBAR_STORAGE_KEY);
  current = next;
  for (const listener of listeners) listener();
}
export function useSidebarPreferences() {
  return { preferences: useSyncExternalStore(subscribe, read, () => null), save: saveSidebarPreferences };
}
