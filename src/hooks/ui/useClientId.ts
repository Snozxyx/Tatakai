import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const CID_STORAGE_KEY = 'tatakai-cid';

/**
 * Generate a persistent Client ID (CID) for rate limiting.
 * - Electron: reads from main process via IPC (stored in userData)
 * - Capacitor/Web: stored in localStorage
 */
export function useClientId() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Electron
        if ((window as any).electron?.getClientId) {
          const cid = await (window as any).electron.getClientId();
          if (cid) {
            setClientId(cid);
            setCachedClientId(cid);
            return;
          }
        }

        // Capacitor native or Web — use localStorage (persists on both)
        const prefix = Capacitor.isNativePlatform() ? 'mobile' : 'web';
        let cid = localStorage.getItem(CID_STORAGE_KEY);
        if (!cid) {
          cid = `${prefix}-${crypto.randomUUID()}`;
          localStorage.setItem(CID_STORAGE_KEY, cid);
        }
        setClientId(cid);
        setCachedClientId(cid);
      } catch (e) {
        console.warn('[CID] Failed to get/create client ID:', e);
        const fallback = `tmp-${crypto.randomUUID()}`;
        setClientId(fallback);
        setCachedClientId(fallback);
      }
    })();
  }, []);

  return clientId;
}

/**
 * Synchronous getter — reads from cache. Use in non-React contexts (api.ts).
 * Returns null if not yet initialized.
 */
let _cachedCID: string | null = null;

export function getClientIdSync(): string | null {
  return _cachedCID;
}

export function setCachedClientId(cid: string) {
  _cachedCID = cid;
}
