import { useEffect, useState } from 'react';
import { randomUUID } from '@/lib/uuid';
import { validateProfileImage } from '@/lib/profileMedia';
import { supabase } from '@/integrations/supabase/client';
import { isCustomizationObject, type AppearanceAssetRef, type BackgroundConfig } from '@/lib/customization';

interface StoredAppearanceAsset { key: string; id: string; namespace: string; blob: Blob; name: string; remote?: AppearanceAssetRef }
interface StagedAppearanceAsset extends StoredAppearanceAsset { preview: string; owner?: string }
const staged = new Map<string, StagedAppearanceAsset>();
const previewUrls = new Map<string, string>();
const cachingRemoteAssets = new Map<string, Promise<void>>();
export const appearanceNamespace = (userId?: string | null) => userId ? `account:${userId}` : 'guest';
const assetKey = (namespace: string, id: string) => `${namespace}:${id}`;
const DB_NAME = 'tatakai-appearance-assets';
function assetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function assetTransaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await assetDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('assets', mode);
    const request = run(transaction.objectStore('assets'));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Image storage was interrupted')); };
  });
}
/** Selecting stages memory only; Save persists the image on this device. */
export function stageAppearanceImage(file: File, userId?: string | null, owner?: string): AppearanceAssetRef {
  validateProfileImage(file);
  const id = randomUUID();
  const namespace = appearanceNamespace(userId);
  const key = assetKey(namespace, id);
  const preview = URL.createObjectURL(file);
  staged.set(key, { key, id, namespace, blob: file, name: file.name, preview, owner });
  return { id, namespace };
}
export function discardStagedAppearanceAsset(asset?: AppearanceAssetRef): void {
  if (!asset?.namespace) return;
  const key = assetKey(asset.namespace, asset.id);
  const draft = staged.get(key);
  if (draft) { URL.revokeObjectURL(draft.preview); staged.delete(key); }
}
/** Revoke staged previews owned by a closed editor; committed cached blobs stay. */
export function discardStagedAppearanceImages(assets: AppearanceAssetRef[]): void {
  for (const asset of assets) discardStagedAppearanceAsset(asset);
}
export function discardStagedAppearanceOwner(owner: string): void {
  for (const draft of staged.values()) if (draft.owner === owner) discardStagedAppearanceAsset({ id: draft.id, namespace: draft.namespace });
}
function publicAssetUrl(asset: AppearanceAssetRef): string | null {
  if (asset.bucket !== 'user-media' || !asset.path) return null;
  return supabase.storage.from(asset.bucket).getPublicUrl(asset.path).data.publicUrl;
}
export async function resolveAppearanceAsset(asset: AppearanceAssetRef): Promise<string | null> {
  const key = asset.namespace ? assetKey(asset.namespace, asset.id) : '';
  const draft = staged.get(key);
  if (draft) return draft.preview;
  if (previewUrls.has(key)) return previewUrls.get(key)!;
  if (key) {
    try {
      const stored = await assetTransaction<StoredAppearanceAsset | undefined>('readonly', store => store.get(key));
      if (stored?.blob) {
        const url = URL.createObjectURL(stored.blob); previewUrls.set(key, url); return url;
      }
    } catch { /* Remote references remain usable without IndexedDB. */ }
  }
  const remoteUrl = publicAssetUrl(asset);
  if (key && remoteUrl && !cachingRemoteAssets.has(key) && typeof fetch !== 'undefined') {
    // Warm durable storage without delaying the first remote paint.
    const task = (async () => {
      try {
        const response = await fetch(remoteUrl);
        if (!response.ok) return;
        const blob = await response.blob();
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type) || blob.size > 8 * 1024 * 1024) return;
        await assetTransaction('readwrite', store => store.put({ key, id: asset.id, namespace: asset.namespace, blob, name: asset.path?.split('/').pop() ?? 'appearance-image', remote: asset }));
      } catch { /* The renderer can use the remote URL when local caching fails. */ }
    })();
    cachingRemoteAssets.set(key, task);
  }
  return remoteUrl;
}
export function useAppearanceAsset(asset?: AppearanceAssetRef): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (asset) void resolveAppearanceAsset(asset).then(value => { if (active) setUrl(value); });
    return () => { active = false; };
  }, [asset?.id, asset?.namespace, asset?.bucket, asset?.path]);
  return url;
}
/** Save image bytes on this device only. Existing remote references remain readable. */
export async function commitAppearanceAssets<T>(value: T, userId?: string | null): Promise<{ value: T; pending: boolean; error?: string }> {
  const namespace = appearanceNamespace(userId);
  const resolved = new Map<string, AppearanceAssetRef>();
  const resolve = async (asset: AppearanceAssetRef): Promise<AppearanceAssetRef> => {
    if (asset.bucket && asset.path) return asset;
    if (asset.namespace !== namespace) throw new Error('Choose an image for this local profile before saving.');
    const key = assetKey(namespace, asset.id);
    if (resolved.has(key)) return resolved.get(key)!;
    const draft = staged.get(key);
    let stored: StoredAppearanceAsset | undefined = draft;
    if (draft) await assetTransaction('readwrite', store => store.put({ key, id: draft.id, namespace, blob: draft.blob, name: draft.name }));
    else stored = await assetTransaction<StoredAppearanceAsset | undefined>('readonly', store => store.get(key));
    if (!stored) throw new Error('This image is no longer available. Choose it again.');
    if (draft) {
      // Keep the same preview URL for mounted renderers, but remove the staged binary.
      previewUrls.set(key, draft.preview); staged.delete(key);
    }
    resolved.set(key, asset);
    return asset;
  };
  const walk = async (input: unknown): Promise<unknown> => {
    if (Array.isArray(input)) return Promise.all(input.map(walk));
    if (!isCustomizationObject(input)) return input;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(input)) {
      output[key] = key === 'asset' && isCustomizationObject(child) && typeof child.id === 'string'
        ? await resolve(child as unknown as AppearanceAssetRef) : await walk(child);
    }
    return output;
  };
  return { value: await walk(value) as T, pending: false };
}
export { safeAppearanceColor, appearanceBackgroundStyle } from './appearanceBackgroundStyle';
