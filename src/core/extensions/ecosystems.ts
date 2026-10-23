export const ECOSYSTEMS = ['tatakai', 'stremio', 'seanime', 'mihon', 'aniyomi', 'cloudstream', 'sora', 'mangayomi', 'kodi'] as const;
export type ExtensionEcosystem = typeof ECOSYSTEMS[number];
export type Compatibility = 'supported' | 'limited' | 'external' | 'unavailable';
export function ecosystemOf(value: unknown): ExtensionEcosystem {
  return ECOSYSTEMS.includes(value as ExtensionEcosystem) ? value as ExtensionEcosystem : 'tatakai';
}
export function detectEcosystem(manifest: Record<string, unknown>): ExtensionEcosystem {
  if (Array.isArray(manifest.resources) && Array.isArray(manifest.types)) return 'stremio';
  if (manifest.language && (manifest.payload || manifest.payloadURI || manifest.manifestURI)) return 'seanime';
  return ecosystemOf(manifest.ecosystem);
}
export const INSTALLED_MANIFESTS_KEY = 'tatakai_extension_manifests';
export const EXTENSION_INSTALLED_EVENT = 'tatakai:extension-installed';
export function migrateExtensionStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const old = localStorage.getItem('tatakai_sideloaded_extensions');
  if (!old) return;
  try {
    const current = JSON.parse(localStorage.getItem(INSTALLED_MANIFESTS_KEY) || '[]');
    const legacy = JSON.parse(old);
    if (!Array.isArray(current) || !Array.isArray(legacy)) return;
    const merged = new Map([...legacy, ...current].map(row => [row.id, row]));
    localStorage.setItem(INSTALLED_MANIFESTS_KEY, JSON.stringify([...merged.values()]));
    localStorage.removeItem('tatakai_sideloaded_extensions');
  } catch { /* Preserve malformed legacy records for recovery. */ }
}
export function normalizeManifestUrl(input: string): string {
  const url = new URL(input.trim().replace(/^stremio:\/\//i, 'https://'));
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS manifest URL');
  if (url.username || url.password) throw new Error('Use a manifest URL without HTTP login credentials');
  url.hash = '';
  return url.href;
}
