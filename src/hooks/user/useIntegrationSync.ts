/**
 * src/hooks/user/useIntegrationSync.ts
 *
 * A unified hook that exposes sync state and actions for both
 * MyAnimeList and AniList integrations.
 *
 * Design goals:
 *  - Surfaces last-sync timestamp from localStorage (no DB needed)
 *  - Calls the TatakaiAPI /sync/preview endpoint to build an approval diff
 *  - Exposes an apply() function that calls /sync/apply with user-confirmed items
 *  - Designed to support the manual approval flow (always queue for approval)
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TATAKAI_API_URL } from '@/lib/api/api-client';

export type Integration = 'mal' | 'anilist';
export type MediaType = 'anime' | 'manga';

export interface SyncProposalItem {
  id: string;
  mediaId: string | number;
  malId?: number | null;
  anilistId?: number | null;
  title: string;
  poster: string | null;
  type: MediaType;
  direction: 'import' | 'export' | 'conflict';
  localStatus?: string | null;
  localProgress?: number | null;
  remoteStatus?: string | null;
  remoteProgress?: number | null;
  actionText: string;
}

export interface SyncState {
  isLoadingPreview: boolean;
  isApplying: boolean;
  previewItems: SyncProposalItem[];
  lastSyncedAt: string | null;
  error: string | null;
}

const LAST_SYNC_KEY = (integration: string, mediaType: string) =>
  `tatakai:sync:lastAt:${integration}:${mediaType}`;

/** Build Authorization header from the current Supabase session. */
async function getBearerHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

export function useIntegrationSync() {
  const [state, setState] = useState<SyncState>({
    isLoadingPreview: false,
    isApplying: false,
    previewItems: [],
    lastSyncedAt: null,
    error: null,
  });

  /** Load the last sync timestamp for a given integration + mediaType combo. */
  const getLastSyncedAt = useCallback((integration: Integration, mediaType: MediaType): string | null => {
    try {
      return localStorage.getItem(LAST_SYNC_KEY(integration, mediaType));
    } catch {
      return null;
    }
  }, []);

  /**
   * Call /sync/preview and return the diff.
   * Results are stored in state.previewItems for the approval modal to consume.
   */
  const loadPreview = useCallback(async (
    integration: Integration,
    mediaType: MediaType,
  ): Promise<SyncProposalItem[]> => {
    setState(s => ({ ...s, isLoadingPreview: true, error: null, previewItems: [] }));
    try {
      const headers = await getBearerHeader();
      const res = await fetch(`${TATAKAI_API_URL}/sync/preview`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration, mediaType }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Preview failed' }));
        throw new Error(err.message || err.error || 'Preview failed');
      }

      const json = await res.json();
      const items: SyncProposalItem[] = json.data ?? [];
      setState(s => ({ ...s, isLoadingPreview: false, previewItems: items }));
      return items;
    } catch (err: any) {
      setState(s => ({ ...s, isLoadingPreview: false, error: err.message }));
      return [];
    }
  }, []);

  /**
   * Apply a set of user-confirmed sync actions.
   * Always called AFTER user approves via the SyncPreviewModal.
   */
  const applySync = useCallback(async (
    integration: Integration,
    actions: SyncProposalItem[],
  ): Promise<{ success: boolean; error?: string }> => {
    setState(s => ({ ...s, isApplying: true, error: null }));
    try {
      const headers = await getBearerHeader();
      const res = await fetch(`${TATAKAI_API_URL}/sync/apply`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration, actions }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Apply failed' }));
        throw new Error(err.message || err.error || 'Apply failed');
      }

      // Record last sync time locally
      const mediaTypes = [...new Set(actions.map(a => a.type))] as MediaType[];
      for (const mt of mediaTypes) {
        try {
          localStorage.setItem(LAST_SYNC_KEY(integration, mt), new Date().toISOString());
        } catch {
          // storage error, ignore
        }
      }

      setState(s => ({
        ...s,
        isApplying: false,
        previewItems: [],
        lastSyncedAt: new Date().toISOString(),
      }));
      return { success: true };
    } catch (err: any) {
      setState(s => ({ ...s, isApplying: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Sends a single-item realtime sync (e.g. after episode completion).
   * This is the "smart auto-sync" path — bypasses the preview modal.
   */
  const singleItemSync = useCallback(async (params: {
    type: 'anime' | 'manga';
    malId?: number | null;
    anilistId?: number | null;
    status: string;
    progress: number;
    score?: number;
  }): Promise<void> => {
    try {
      const headers = await getBearerHeader();
      await fetch(`${TATAKAI_API_URL}/sync/single-sync`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch (err) {
      console.warn('[useIntegrationSync] Single item sync failed:', err);
    }
  }, []);

  return {
    ...state,
    getLastSyncedAt,
    loadPreview,
    applySync,
    singleItemSync,
  };
}
