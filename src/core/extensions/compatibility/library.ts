import { db } from '@/core/db/tatakai-db';
import { orderedCustomEntries } from '@/core/content/custom-source-model';

export interface ExtensionTitle { namespace: string; sourceId: string; id: string; title: string; image?: string; sourceName?: string; kind: 'watch' | 'read'; catalog?: { id: string; label: string; number?: number }[] }
export interface ExtensionProgress { id: string; label: string; position: number; duration: number; completed: boolean; updatedAt: string }
export interface ExtensionLibraryItem extends ExtensionTitle { saved: boolean; updatedAt: string; latest?: string; entries: Record<string, ExtensionProgress> }
export function extensionContinueEntry(item: ExtensionLibraryItem) {
  const latest = item.latest && item.entries[item.latest];
  if (!latest) return null;
  if (!latest.completed) return latest;
  const catalog = orderedCustomEntries(item.catalog || []);
  const index = catalog.findIndex(entry => entry.id === latest.id);
  return index >= 0 ? catalog.slice(index + 1).find(entry => !item.entries[entry.id]?.completed) || null : null;
}
export const libraryPrefix = (profile: string) => `extension-library:${encodeURIComponent(profile)}:`;
export const libraryKey = (profile: string, title: Pick<ExtensionTitle, 'namespace' | 'sourceId' | 'id'>) => libraryPrefix(profile) + JSON.stringify([title.namespace, title.sourceId, title.id]);
export function extensionTitleRoute(title: ExtensionTitle, resume = true): string {
  const base = `/x/${encodeURIComponent(title.namespace)}/${encodeURIComponent(title.sourceId)}`;
  const latest = (title as ExtensionLibraryItem).latest;
  return latest && resume ? `${base}/${title.kind}/${encodeURIComponent(title.id)}/${encodeURIComponent(latest)}` : `${base}/info/${encodeURIComponent(title.id)}`;
}
export async function extensionLibrary(profile: string): Promise<ExtensionLibraryItem[]> {
  const rows = await db.kv.where('key').startsWith(libraryPrefix(profile)).toArray();
  return rows.map(row => JSON.parse(row.value) as ExtensionLibraryItem).filter(row => row.saved || row.latest).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function updateExtensionLibrary(profile: string, title: ExtensionTitle, patch: { saved?: boolean; progress?: ExtensionProgress }) {
  const key = libraryKey(profile, title);
  await db.transaction('rw', db.kv, async () => {
    const stored = await db.kv.get(key);
    const previous: ExtensionLibraryItem | undefined = stored ? JSON.parse(stored.value) : undefined;
    const updatedAt = new Date().toISOString();
    const item: ExtensionLibraryItem = { ...previous, ...title, saved: patch.saved ?? previous?.saved ?? false, entries: { ...previous?.entries }, updatedAt };
    if (patch.progress) {
      const p = patch.progress;
      if (![p.position, p.duration].every(Number.isFinite) || p.position < 0 || p.duration < 0) throw Error('Invalid extension progress');
      item.entries[p.id] = p; item.latest = p.id;
    }
    await db.kv.put({ key, value: JSON.stringify(item), createdAt: stored?.createdAt || updatedAt });
  });
  window.dispatchEvent(new CustomEvent('tatakai-extension-library-changed'));
}
export async function removeExtensionLibrary(profile: string, title: ExtensionTitle) {
  await db.kv.delete(libraryKey(profile, title));
  window.dispatchEvent(new CustomEvent('tatakai-extension-library-changed'));
}
