import { throwCompatibilityAbort } from '../compatibility/abort';
import { extensionFetch } from '../remote/transport';

export interface SoraPackage { id: string; name: string; version: string; repository: string; ecosystem: 'sora'; kind: 'watch' | 'read'; lang: string; baseUrl: string; scriptUrl: string; digest?: string; hasDetails?: boolean }
export function isSoraRepositoryMetadata(value: any): boolean {
  return !!value && (typeof value.sourceName === 'string' || (Array.isArray(value) ? value.some(entry => typeof entry?.sourceName === 'string') : Array.isArray(value.modules) ? value.modules.some((entry: any) => typeof entry?.manifestUrl === 'string') : Object.values(value).some((entry: any) => typeof entry?.sourceName === 'string')));
}
export const soraHash = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
export function sourceUrl(value: string, base?: string, secure = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > 16384) throw Error('Source returned an invalid URL');
  const url = new URL(value, base || undefined);
  if (!(secure ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) || url.username || url.password) throw Error('Use a valid source URL without login credentials');
  url.hash = ''; return url.href;
}
export async function soraText(url: string, signal?: AbortSignal) {
  const response = await extensionFetch(sourceUrl(url, undefined, true), { signal });
  if (!response.ok) throw Error(`Sora download failed (${response.status})`);
  const text = await response.text(); if (text.length > 2 * 1024 * 1024) throw Error('Sora artifact exceeds 2 MB'); return text;
}
export async function soraRepository(url: string, signal?: AbortSignal): Promise<SoraPackage[]> {
  const root = sourceUrl(url, undefined, true), visited = new Set<string>();
  const packages = new Map<string, SoraPackage>();
  async function read(endpoint: string, depth: number) {
    if (depth > 3 || visited.size >= 200) throw Error('Sora repository index is too large or recursive');
    if (visited.has(endpoint)) return;
    visited.add(endpoint);
    const json = JSON.parse(await soraText(endpoint, signal));
    const entries = Array.isArray(json) ? json : json?.sourceName ? [json] : Array.isArray(json?.modules) ? json.modules : Object.values(json || {});
    for (const entry of entries) {
      throwCompatibilityAbort(signal);
      if (typeof entry === 'string') { await read(sourceUrl(entry, endpoint, true), depth + 1); continue; }
      if (typeof entry?.manifestUrl === 'string') { await read(sourceUrl(entry.manifestUrl, endpoint, true), depth + 1); continue; }
      if (!entry || typeof entry.sourceName !== 'string') continue;
      if (!entry.sourceName.trim() || entry.sourceName.length > 200 || String(entry.version).length > 100 || String(entry.language || '').length > 100) throw Error('Invalid Sora module metadata');
      const type = String(entry.type || '').toLowerCase();
      const kind = ['anime', 'movie'].includes(type) ? 'watch' : ['manga', 'mangas'].includes(type) ? 'read' : null;
      if (!kind) continue;
      const script = entry.scriptUrl || entry.scriptURL;
      if (!script || !entry.version) throw Error('Sora module needs scriptUrl and version');
      const id = 'sora-' + await soraHash(JSON.stringify([root, entry.sourceName, kind]));
      if (packages.has(id)) throw Error('Sora repository contains duplicate module identities');
      packages.set(id, { id, name: entry.sourceName, version: String(entry.version), repository: root, ecosystem: 'sora', kind, lang: String(entry.language || 'unknown'), baseUrl: entry.baseUrl ? sourceUrl(entry.baseUrl) : '', scriptUrl: sourceUrl(script, endpoint, true) });
    }
  }
  await read(root, 0);
  if (!packages.size) throw Error('No supported Sora anime or manga modules found in this repository');
  return [...packages.values()];
}
