import { throwCompatibilityAbort } from '../compatibility/abort';
import { soraHash, soraText, sourceUrl } from '../sora/repository';

export interface MangayomiPackage {
  id: string; upstreamId: string; name: string; version: string; repository: string;
  ecosystem: 'mangayomi'; kind: 'watch' | 'read'; lang: string; baseUrl: string; scriptUrl: string;
  source: Record<string, unknown>; digest?: string; hasSettings?: boolean; hasBrowse?: boolean;
}
export function isMangayomiRepositoryMetadata(value: unknown): boolean {
  return Array.isArray(value) && value.some(entry => entry && typeof entry.sourceCodeUrl === 'string' && entry.sourceCodeLanguage !== undefined);
}
export async function mangayomiRepository(url: string, signal?: AbortSignal): Promise<MangayomiPackage[]> {
  const root = sourceUrl(url, undefined, true);
  let endpoint = root, decoded = JSON.parse(await soraText(endpoint, signal));
  if (!Array.isArray(decoded) && typeof decoded?.name === 'string' && typeof decoded?.website === 'string') {
    endpoint = sourceUrl('index.json', root, true); decoded = JSON.parse(await soraText(endpoint, signal));
  }
  if (!isMangayomiRepositoryMetadata(decoded) || decoded.length > 10000) throw Error('Expected a Mangayomi extension index');
  const packages = new Map<string, MangayomiPackage>();
  for (const entry of decoded) {
    throwCompatibilityAbort(signal);
    // Dart and novel sources require additional runtimes/readers. Never execute
    // them as JavaScript or report a successful install for unsupported code.
    if (entry.sourceCodeLanguage !== 1 || ![0, 1].includes(entry.itemType)) continue;
    if (typeof entry.id === 'number' && !Number.isSafeInteger(entry.id)) throw Error('Unsafe Mangayomi source ID');
    const upstreamId = String(entry.id ?? '');
    if (!upstreamId || upstreamId.length > 200 || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 200 || !entry.version || String(entry.version).length > 100) throw Error('Invalid Mangayomi source metadata');
    const kind = entry.itemType === 1 ? 'watch' : 'read';
    const id = 'mangayomi-' + await soraHash(JSON.stringify([root, upstreamId, kind]));
    if (packages.has(id)) throw Error('Duplicate Mangayomi source identity');
    const baseUrl = sourceUrl(entry.baseUrl), scriptUrl = sourceUrl(entry.sourceCodeUrl, endpoint, true);
    // Retain the original provider metadata, excluding executable/installation fields.
    const { sourceCode: _code, sourceCodeUrl: _url, ...metadata } = entry;
    packages.set(id, { id, upstreamId, name: entry.name, version: String(entry.version), repository: root, ecosystem: 'mangayomi', kind, lang: String(entry.lang || 'unknown').slice(0, 100), baseUrl, scriptUrl, source: metadata });
  }
  if (!packages.size) throw Error('No supported Mangayomi JavaScript anime/manga sources. Dart and novel sources require additional hosts.');
  return [...packages.values()];
}
