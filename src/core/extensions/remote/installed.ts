import Dexie, { type Table } from 'dexie';
import { extensionDeadline } from './deadline';
import { extensionRequestId } from '../compatibility/request-id';
import { detectEcosystem, normalizeManifestUrl, EXTENSION_INSTALLED_EVENT } from '../ecosystems';
import { fetchExtensionJson, extensionFetch } from './transport';
import { buildSeanimeBundle, wrapSeanimeCode } from './seanime';
import type { StremioManifest } from './stremio';
import type { ExtensionManifest } from '../sdk/types';

export interface RemoteExtension {
  id: string; ecosystem: 'stremio' | 'seanime'; manifestUrl: string;
  manifest: Record<string, any>; bundleCode?: string; enabled: boolean;
  preferences: Record<string, unknown>; matches: Record<string, string>; updatedAt: string;
}
const remoteDb = new Dexie('TatakaiRemoteExtensions');
remoteDb.version(1).stores({ extensions: 'id, ecosystem' });
const table = remoteDb.table('extensions') as Table<RemoteExtension, string>;
const notice = () => window.dispatchEvent(new CustomEvent(EXTENSION_INSTALLED_EVENT));
export const listRemoteExtensions = () => table.toArray();

export async function installRemoteExtension(input: string | Record<string, any>, origin?: string, existingId?: string, configuredPreferences?: Record<string, unknown>): Promise<RemoteExtension> {
  const manifestUrl = typeof input === 'string' ? normalizeManifestUrl(input) : origin ? normalizeManifestUrl(origin) : '';
  const manifest = typeof input === 'string' ? await fetchExtensionJson(manifestUrl) : input;
  const ecosystem = detectEcosystem(manifest);
  if (!['stremio', 'seanime'].includes(ecosystem)) throw new Error('This is not a Stremio or Seanime manifest');
  if (!manifest.id || !manifest.name || !manifest.version) throw new Error('Manifest needs id, name, and version');
  if (ecosystem === 'stremio' && !manifest.resources.some((r: any) => ['stream','subtitles'].includes(typeof r === 'string' ? r : r.name))) throw new Error('This addon does not provide streams or subtitles');
  if (ecosystem === 'stremio' && !manifestUrl) throw new Error('Stremio addons need their hosted manifest URL');
  if (ecosystem === 'stremio' && (manifest as StremioManifest).behaviorHints?.configurationRequired) throw new Error('Configure this addon first, then paste its configured manifest URL');
  if (ecosystem === 'seanime' && !['onlinestream-provider', 'anime-torrent-provider', 'manga-provider', 'custom-source'].includes(manifest.type)) throw new Error('This Seanime extension type requires Seanime');
  const all = await listRemoteExtensions();
  const previous = all.find(row => row.id === existingId || (row.ecosystem === ecosystem && row.manifestUrl === manifestUrl && row.manifest.id === manifest.id));
  const id = previous?.id || `${ecosystem}-${extensionRequestId()}`;
  let bundleCode: string | undefined;
  if (ecosystem === 'seanime') {
    let payload = manifest.payload;
    if (!payload && manifest.payloadURI) {
      const res = await extensionFetch(new URL(manifest.payloadURI, manifestUrl || undefined).href);
      if (!res.ok) throw new Error(`Seanime payload download failed (${res.status})`);
      payload = await res.text();
    }
    if (typeof payload !== 'string' || !payload.trim()) throw new Error('Seanime manifest has no executable payload');
    if (payload.length > 10 * 1024 * 1024) throw new Error('Seanime payload is too large');
    bundleCode = await buildSeanimeBundle(payload, manifest.language);
  }
  const row: RemoteExtension = { id, ecosystem: ecosystem as RemoteExtension['ecosystem'], manifestUrl,
    manifest: { ...manifest, ...(previous?.manifest.customSettings ? { customSettings: previous.manifest.customSettings } : {}), payload: undefined }, bundleCode, enabled: previous?.enabled ?? true,
    preferences: configuredPreferences || previous?.preferences || Object.fromEntries((manifest.userConfig?.fields || []).map((f: any) => [f.name, f.default || ""])), matches: previous?.matches || {}, updatedAt: new Date().toISOString() };
  if (manifest.userConfig?.requiresConfig && (manifest.userConfig.fields || []).some((f: any) => !String(row.preferences[f.name] ?? '').trim())) throw new Error('Configure required provider preferences before installation');
  if (row.enabled && row.ecosystem === 'seanime') await mountSeanime(row);
  if (row.manifest.type === 'custom-source' && row.enabled) {
    try { row.manifest.customSettings = await invokeRemote(row, 'remoteCustom', { method: 'getSettings' }); }
    catch (error) { await unmountRemote(row); throw error; }
    if (!row.manifest.customSettings?.supportsAnime && !row.manifest.customSettings?.supportsManga) { await unmountRemote(row); throw new Error('Custom source does not advertise anime or manga'); }
  }
  await table.put(row); notice(); return row;
}
export async function mountSeanime(row: RemoteExtension): Promise<void> {
  let browserDomains: string[] = [];
  if (/ChromeDP\s*\.\s*newBrowser/.test(row.bundleCode || '')) {
    if (!(window as any).electron) throw new Error('This Seanime provider requires Tatakai desktop browser support');
    try { const website = new URL(row.manifest.website); if (website.protocol === 'https:') browserDomains = [website.hostname]; } catch {}
    if (!browserDomains.length) throw new Error('ChromeDP provider must declare its HTTPS website');
  }
  // Rebind cached providers to the current adapter without downloading or
  // executing upstream code. Keep preferences, matches and enabled state.
  const cached = row.bundleCode?.match(/\)\(("(?:\\.|[^"\\])*"), typeof __tatakai_parse_html__/s);
  if (cached) {
    const refreshed = wrapSeanimeCode(JSON.parse(cached[1]));
    if (refreshed !== row.bundleCode) { row.bundleCode = refreshed; await table.put(row); }
  }
  const manifest: ExtensionManifest = { id: row.id, name: row.manifest.name, version: row.manifest.version,
    description: row.manifest.description || '', type: row.manifest.type === 'anime-torrent-provider' ? 'torrent' : 'custom',
    permissions: ['network:domain:*'], browserDomains };
  const runtime = (window as any).tatakaiRuntime;
  if (runtime?.installManifest || runtime?.sideloadManifest) {
    const result = await (runtime.installManifest || runtime.sideloadManifest)(manifest, row.bundleCode);
    if (!result?.success) throw new Error(result?.error || 'Seanime runtime installation failed');
  } else {
    const { registerMobileExtension } = await import('../mobile/mobileExtensionHost');
    const result = await registerMobileExtension(manifest, row.bundleCode || '');
    if (!result.ok) throw new Error('error' in result ? result.error : 'Seanime runtime unavailable');
  }
}
export async function invokeRemote(row: RemoteExtension, method: string, args: any): Promise<any> {
  if (!row.enabled) throw new Error('Extension is disabled');
  const runtime = (window as any).tatakaiRuntime;
  if (runtime?.invokeExtension && (window as any).electron) {
    const result = await extensionDeadline<{ success?: boolean; error?: string; result?: unknown }>(() => runtime.invokeExtension(row.id, method, { ...args, preferences: row.preferences }), 30000);
    if (!result?.success) throw new Error(result?.error || 'Seanime provider call failed');
    return result.result;
  }
  const { invokeMobileExtension } = await import('../mobile/mobileExtensionHost');
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([invokeMobileExtension(row.id, method, [{ ...args, preferences: row.preferences }]), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Provider timed out')), 30000); })]); }
  finally { clearTimeout(timer!); }
}
export async function updateRemoteExtension(row: RemoteExtension, notify = true): Promise<void> { await table.put(row); if (notify) notice(); }
export async function setRemoteEnabled(id: string, enabled: boolean): Promise<void> {
  const row = await table.get(id); if (!row) return;
  if (enabled && row.ecosystem === 'seanime') await mountSeanime(row);
  if (!enabled) await unmountRemote(row);
  const persisted = row.ecosystem === 'seanime' ? await (window as any).tatakaiRuntime?.setExtensionEnabled?.(id, enabled) : undefined;
  if (persisted && !persisted.success) throw new Error(persisted.error || 'Could not persist enabled state');
  row.enabled = enabled; await updateRemoteExtension(row);
}
async function unmountRemote(row: RemoteExtension): Promise<void> {
  await (window as any).tatakaiRuntime?.unloadExtension?.(row.id);
  const { unregisterMobileExtension } = await import('../mobile/mobileExtensionHost');
  unregisterMobileExtension(row.id);
}
export async function removeRemoteExtension(id: string): Promise<void> {
  const row = await table.get(id); if (row) await unmountRemote(row);
  const removed = await (window as any).tatakaiRuntime?.removeExtension?.(id);
  if (removed && !removed.success) throw new Error(removed.error || 'Could not remove extension');
  await table.delete(id);
  for (const key of ['tatakai_installed_extensions', 'tatakai_extension_manifests']) {
    try { const data = JSON.parse(localStorage.getItem(key) || '[]'); localStorage.setItem(key, JSON.stringify(Array.isArray(data) ? data.filter(v => typeof v === 'string' ? v !== id : v.id !== id) : data)); } catch { /* preserve malformed legacy storage */ }
  }
  notice();
}
export async function hydrateRemoteExtensions(): Promise<void> {
  for (const row of await listRemoteExtensions()) if (row.enabled && row.ecosystem === 'seanime') {
    try { await mountSeanime(row); } catch { /* Keep the install available for retry/configuration. */ }
  }
}
