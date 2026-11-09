import type { CustomizationSettings, CustomThemeDefinitions } from './customization';

interface Snapshot { namespace?: string; definitions: CustomThemeDefinitions; overrides: Record<string, Record<string, string> | null> }
const KEY = 'tatakai_custom_theme_registry_v1';
const empty: Snapshot = { definitions: {}, overrides: {} };
function normalized(value: unknown): Snapshot {
  const input = value && typeof value === 'object' ? value as Snapshot : empty;
  const definitions: CustomThemeDefinitions = {}, overrides: Snapshot['overrides'] = {};
  for (const [id, definition] of Object.entries(input.definitions || {})) {
    if (!id.startsWith('custom:')) continue;
    if (definition === null) { definitions[id] = null; continue; }
    if (!definition || typeof definition.name !== 'string' || typeof definition.baseTheme !== 'string') continue;
    definitions[id] = { name: definition.name.trim() || id, baseTheme: definition.baseTheme.trim() || 'cherry-blossom' };
    const palette = input.overrides?.[id];
    if (palette && typeof palette === 'object') overrides[id] = Object.fromEntries(Object.entries(palette).filter(([, value]) => typeof value === 'string'));
  }
  return { namespace: typeof input.namespace === 'string' ? input.namespace : undefined, definitions, overrides };
}
function stored(): Snapshot { try { return normalized(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return empty; } }
let snapshot = stored();
const listeners = new Set<() => void>();
function set(next: Snapshot, persist: boolean) {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  if (persist) { try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* use committed memory for this session */ } }
  for (const listener of listeners) listener();
}
export function getCustomThemeSnapshot() { return snapshot; }
export function getCustomThemeDefinitions() { return snapshot.definitions; }
export function getCustomThemeOverrides() { return snapshot.overrides; }
export function subscribeCustomThemes(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** The local committed store calls this. Preview resolution never publishes here. */
export function publishCustomThemes(settings: CustomizationSettings, namespace?: string) {
  const definitions = settings.customThemes || {}, overrides: Snapshot['overrides'] = {};
  for (const id of Object.keys(definitions)) overrides[id] = settings.themes[id]?.palette || null;
  set(normalized({ namespace, definitions, overrides }), true);
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === KEY || event.key === null) set(stored(), false);
});
