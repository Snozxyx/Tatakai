/**
 * Novel readlist — progress + library state for light novels.
 *
 * Storage: the shared `manga_readlist` table with `format = 'novel'`
 * (see 20261012000000_novel_readlist_format.sql). Paragraph position reuses
 * `last_page_index` / `total_pages` so sync, realtime and rank pipelines work
 * unchanged. AniList/MAL sync mirrors the manga path (manga endpoints accept
 * NOVEL media).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { updateMalMangaStatus } from '@/lib/mal';
import { mapTatakaiMangaStatusToAniList, updateAniListMangaStatus } from '@/lib/externalIntegrations';

export type NovelReadlistStatus = 'plan_to_read' | 'reading' | 'completed' | 'on_hold' | 'dropped';

export interface NovelReadlistItem {
  id: string;
  user_id: string | null;
  manga_id: string;
  manga_title: string;
  manga_poster: string | null;
  mal_id: number | null;
  anilist_id: number | null;
  format: string;
  status: NovelReadlistStatus;
  last_chapter_key: string | null;
  last_chapter_number: number | null;
  last_chapter_title: string | null;
  last_provider: string | null;
  last_language: string | null;
  last_page_index: number;
  total_pages: number | null;
  last_extension_id: string | null;
  last_scanlator: string | null;
  last_page_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertNovelReadlistInput {
  novelId: string;
  novelTitle: string;
  novelPoster?: string | null;
  malId?: number | null;
  anilistId?: number | null;
  status?: NovelReadlistStatus;
  lastChapterKey?: string | null;
  lastChapterNumber?: number | null;
  lastChapterTitle?: string | null;
  lastProvider?: string | null;
  lastLanguage?: string | null;
  lastParagraphIndex?: number;
  totalParagraphs?: number | null;
  lastTranslator?: string | null;
  silentToast?: boolean;
}

const normalizeStatus = (v: unknown): NovelReadlistStatus => {
  const n = String(v || '').trim().toLowerCase();
  if (n === 'reading') return 'reading';
  if (n === 'completed') return 'completed';
  if (n === 'on_hold') return 'on_hold';
  if (n === 'dropped') return 'dropped';
  return 'plan_to_read';
};

const toItem = (row: any): NovelReadlistItem => ({
  id: String(row.id),
  user_id: row.user_id ?? null,
  manga_id: String(row.manga_id),
  manga_title: row.manga_title ?? '',
  manga_poster: row.manga_poster ?? null,
  mal_id: row.mal_id ?? null,
  anilist_id: row.anilist_id ?? null,
  format: row.format ?? 'novel',
  status: normalizeStatus(row.status),
  last_chapter_key: row.last_chapter_key ?? null,
  last_chapter_number: row.last_chapter_number ?? null,
  last_chapter_title: row.last_chapter_title ?? null,
  last_provider: row.last_provider ?? null,
  last_language: row.last_language ?? null,
  last_page_index: Number(row.last_page_index || 0),
  total_pages: row.total_pages ?? null,
  last_extension_id: row.last_extension_id ?? null,
  last_scanlator: row.last_scanlator ?? null,
  last_page_id: row.last_page_id ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export function useNovelReadlist() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['novel-readlist', user?.id],
    queryFn: async (): Promise<NovelReadlistItem[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', user.id)
        .eq('format', 'novel')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []).map(toItem);
    },
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
}

export function useNovelReadlistItem(novelId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['novel-readlist-item', user?.id, novelId],
    queryFn: async (): Promise<NovelReadlistItem | null> => {
      if (!user?.id || !novelId) return null;
      const { data, error } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', user.id)
        .eq('manga_id', String(novelId))
        .eq('format', 'novel')
        .maybeSingle();
      if (error) throw error;
      return data ? toItem(data) : null;
    },
    enabled: Boolean(user?.id && novelId),
    staleTime: 60_000,
  });
}

export function useUpsertNovelReadlist() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  return useMutation({
    mutationFn: async (input: UpsertNovelReadlistInput) => {
      if (!user?.id) throw new Error('Sign in to save novels');
      const payload: any = {
        user_id: user.id,
        manga_id: String(input.novelId),
        manga_title: input.novelTitle,
        ...(input.novelPoster ? { manga_poster: input.novelPoster } : {}),
        mal_id: input.malId ?? null,
        anilist_id: input.anilistId ?? null,
        format: 'novel',
        status: normalizeStatus(input.status ?? 'plan_to_read'),
        last_chapter_key: input.lastChapterKey ?? null,
        last_chapter_number: input.lastChapterNumber ?? null,
        last_chapter_title: input.lastChapterTitle ?? null,
        last_provider: input.lastProvider ?? null,
        last_language: input.lastLanguage ?? null,
        last_page_index: Math.max(0, Number(input.lastParagraphIndex || 0)),
        total_pages: input.totalParagraphs ?? null,
        last_scanlator: input.lastTranslator ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('manga_readlist')
        .upsert(payload, { onConflict: 'user_id,manga_id' })
        .select()
        .single();
      if (error) throw error;
      return toItem(data);
    },
    onSuccess: (item, input) => {
      queryClient.invalidateQueries({ queryKey: ['novel-readlist'] });
      queryClient.invalidateQueries({ queryKey: ['novel-readlist-item'] });
      queryClient.invalidateQueries({ queryKey: ['manga-continue-reading'] });

      // Auto-sync to trackers — same single-sync fan-out as the manga
      // readlist (AniList + MAL accept NOVEL media through the manga calls,
      // MangaBaka resolves server-side). Best-effort, never blocks the UI.
      const toPositiveIntOrNull = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      };
      const chapterProgress = toPositiveIntOrNull(item?.last_chapter_number) ?? undefined;
      const statusForSync = normalizeStatus(item?.status ?? input.status ?? 'plan_to_read');
      let singleSyncPosted = false;

      if ((profile as any)?.mal_access_token) {
        const targetMalId = toPositiveIntOrNull(item?.mal_id ?? (input as any)?.malId);
        if (targetMalId) {
          singleSyncPosted = true;
          updateMalMangaStatus(targetMalId, statusForSync, undefined, chapterProgress)
            .catch((error) => console.error('[useNovelReadlist] MAL auto-sync failed:', error));
        }
      }

      if ((profile as any)?.anilist_access_token) {
        const targetAniListId = toPositiveIntOrNull(item?.anilist_id ?? (input as any)?.anilistId);
        if (targetAniListId) {
          singleSyncPosted = true;
          updateAniListMangaStatus(
            (profile as any).anilist_access_token,
            targetAniListId,
            mapTatakaiMangaStatusToAniList(statusForSync),
            chapterProgress,
          ).catch((error) => console.error('[useNovelReadlist] AniList auto-sync failed:', error));
        }
      }

      if (!singleSyncPosted) {
        void import('@/lib/mangabaka').then(({ pushMangaProgressViaServer }) => {
          pushMangaProgressViaServer({
            anilistId: toPositiveIntOrNull(item?.anilist_id ?? (input as any)?.anilistId),
            malId: toPositiveIntOrNull(item?.mal_id ?? (input as any)?.malId),
            status: statusForSync,
            chapter: chapterProgress ?? null,
          }).catch((error) => console.error('[useNovelReadlist] MangaBaka auto-sync failed:', error));
        }).catch((error) => console.error('[useNovelReadlist] MangaBaka auto-sync failed:', error));
      }

      if (!input.silentToast) {
        const action = item.status === 'plan_to_read' ? 'Added to novel library' : 'Updated novel library';
        toast.success(action);
      }
    },
    onError: () => toast.error('Could not save novel'),
  });
}

export function useRemoveFromNovelReadlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ novelId }: { novelId: string }) => {
      if (!user?.id) throw new Error('Sign in first');
      const { error } = await supabase
        .from('manga_readlist')
        .delete()
        .eq('user_id', user.id)
        .eq('manga_id', String(novelId))
        .eq('format', 'novel');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['novel-readlist'] });
      queryClient.invalidateQueries({ queryKey: ['novel-readlist-item'] });
      toast.success('Removed from novel library');
    },
  });
}

/** Persist paragraph progress (debounced by the reader) + mirror to trackers. */
export function useSaveNovelReadingProgress() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      novelId: string;
      novelTitle: string;
      novelPoster?: string | null;
      lastChapterKey: string;
      lastChapterNumber?: number | null;
      lastChapterTitle?: string | null;
      lastProvider?: string | null;
      lastParagraphIndex: number;
      totalParagraphs?: number | null;
      lastTranslator?: string | null;
      anilistId?: number | null;
      malId?: number | null;
    }) => {
      if (!user?.id) return null;
      const payload: any = {
        user_id: user.id,
        manga_id: String(input.novelId),
        manga_title: input.novelTitle,
        ...(input.novelPoster ? { manga_poster: input.novelPoster } : {}),
        mal_id: input.malId ?? null,
        anilist_id: input.anilistId ?? null,
        format: 'novel',
        status: 'reading' as const,
        last_chapter_key: input.lastChapterKey,
        last_chapter_number: input.lastChapterNumber ?? null,
        last_chapter_title: input.lastChapterTitle ?? null,
        last_provider: input.lastProvider ?? null,
        last_page_index: Math.max(0, Number(input.lastParagraphIndex || 0)),
        total_pages: input.totalParagraphs ?? null,
        last_scanlator: input.lastTranslator ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('manga_readlist')
        .upsert(payload, { onConflict: 'user_id,manga_id' });
      if (error) throw error;

      // Best-effort tracker sync (same single-sync endpoints as manga —
      // AniList/MAL both accept NOVEL media through the manga status calls).
      const chapter = input.lastChapterNumber != null && Number.isFinite(Number(input.lastChapterNumber))
        ? Number(input.lastChapterNumber)
        : undefined;
      try {
        if (typeof input.anilistId === 'number' && (profile as any)?.anilist_access_token) {
          await updateAniListMangaStatus(
            (profile as any).anilist_access_token,
            input.anilistId,
            mapTatakaiMangaStatusToAniList('reading'),
            chapter,
          ).catch(() => undefined);
        }
      } catch { /* best-effort */ }
      try {
        if (typeof input.malId === 'number' && (profile as any)?.mal_access_token) {
          await updateMalMangaStatus(input.malId, 'reading', undefined, chapter).catch(() => undefined);
        }
      } catch { /* best-effort */ }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['novel-readlist'] });
      queryClient.invalidateQueries({ queryKey: ['novel-readlist-item'] });
      queryClient.invalidateQueries({ queryKey: ['manga-continue-reading'] });
    },
  });
}
