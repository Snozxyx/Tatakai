import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { updateMalMangaStatus } from '@/lib/mal';
import { mapTatakaiMangaStatusToAniList, updateAniListMangaStatus } from '@/lib/externalIntegrations';

export type MangaReadlistStatus = 'plan_to_read' | 'reading' | 'completed' | 'on_hold' | 'dropped';

const EXPLICIT_READLIST_STATUSES: MangaReadlistStatus[] = ['plan_to_read', 'completed', 'on_hold', 'dropped'];

export interface MangaReadlistItem {
  id: string;
  user_id: string | null;
  manga_id: string;
  manga_title: string;
  manga_poster: string | null;
  mal_id: number | null;
  anilist_id: number | null;
  status: MangaReadlistStatus;
  last_chapter_key: string | null;
  last_chapter_number: number | null;
  last_chapter_title: string | null;
  last_provider: string | null;
  last_language: string | null;
  last_page_index: number;
  total_pages: number | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMangaReadlistInput {
  mangaId: string;
  mangaTitle: string;
  mangaPoster?: string | null;
  malId?: number | null;
  anilistId?: number | null;
  status?: MangaReadlistStatus;
  lastChapterKey?: string | null;
  lastChapterNumber?: number | null;
  lastChapterTitle?: string | null;
  lastProvider?: string | null;
  lastLanguage?: string | null;
  lastPageIndex?: number;
  totalPages?: number | null;
  silentToast?: boolean;
}

const LOCAL_MANGA_READLIST_KEY = 'tatakai:manga-readlist:v1';

const normalizeStatus = (value: unknown): MangaReadlistStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'reading') return 'reading';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'on_hold') return 'on_hold';
  if (normalized === 'dropped') return 'dropped';
  return 'plan_to_read';
};

const normalizeStatusList = (statuses?: MangaReadlistStatus[]): MangaReadlistStatus[] => {
  const source = Array.isArray(statuses) && statuses.length > 0 ? statuses : EXPLICIT_READLIST_STATUSES;
  const normalized = Array.from(new Set(source.map((status) => normalizeStatus(status)))) as MangaReadlistStatus[];
  return normalized.length > 0 ? normalized : EXPLICIT_READLIST_STATUSES;
};

const isExplicitReadlistStatus = (status: unknown): boolean => {
  if (!status) return false;
  return EXPLICIT_READLIST_STATUSES.includes(normalizeStatus(status));
};

const normalizeString = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
};

const toPositiveIntOrNull = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = Math.trunc(numeric);
  return normalized > 0 ? normalized : null;
};

const normalizeSyncStatusWithProgress = (
  status: MangaReadlistStatus,
  chapterProgress?: number,
): MangaReadlistStatus => {
  if (chapterProgress && chapterProgress > 0 && status === 'plan_to_read') {
    return 'reading';
  }
  return status;
};

const extractExternalIdsFromMangaId = (mangaId: string): { malId: number | null; anilistId: number | null } => {
  const value = String(mangaId || '').trim();
  if (!value) return { malId: null, anilistId: null };

  const malMatch = value.match(/^mal:(\d+)$/i);
  if (malMatch?.[1]) {
    return { malId: toPositiveIntOrNull(malMatch[1]), anilistId: null };
  }

  const aniMatch = value.match(/^anilist:(\d+)$/i);
  if (aniMatch?.[1]) {
    return { malId: null, anilistId: toPositiveIntOrNull(aniMatch[1]) };
  }

  if (/^\d+$/.test(value)) {
    return { malId: null, anilistId: toPositiveIntOrNull(value) };
  }

  return { malId: null, anilistId: null };
};

const clampPageIndex = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

const safeNow = () => new Date().toISOString();

const isMissingTableError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('manga_readlist') ||
    details.includes('manga_readlist') ||
    message.includes('could not find the table')
  );
};

const getLocalMangaReadlist = (): MangaReadlistItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_MANGA_READLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((row: any) => ({
        id: String(row?.id || `local-${String(row?.manga_id || '').trim()}`),
        user_id: null,
        manga_id: String(row?.manga_id || '').trim(),
        manga_title: String(row?.manga_title || '').trim(),
        manga_poster: normalizeString(row?.manga_poster),
        mal_id: toPositiveIntOrNull(row?.mal_id),
        anilist_id: toPositiveIntOrNull(row?.anilist_id),
        status: normalizeStatus(row?.status),
        last_chapter_key: normalizeString(row?.last_chapter_key),
        last_chapter_number: Number.isFinite(Number(row?.last_chapter_number))
          ? Number(row.last_chapter_number)
          : null,
        last_chapter_title: normalizeString(row?.last_chapter_title),
        last_provider: normalizeString(row?.last_provider),
        last_language: normalizeString(row?.last_language),
        last_page_index: clampPageIndex(row?.last_page_index),
        total_pages: Number.isFinite(Number(row?.total_pages)) ? Number(row.total_pages) : null,
        created_at: String(row?.created_at || safeNow()),
        updated_at: String(row?.updated_at || safeNow()),
      }))
      .filter((row: MangaReadlistItem) => row.manga_id && row.manga_title)
      .sort((a: MangaReadlistItem, b: MangaReadlistItem) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
  } catch {
    return [];
  }
};

const saveLocalMangaReadlist = (rows: MangaReadlistItem[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_MANGA_READLIST_KEY, JSON.stringify(rows));
};

const upsertLocalMangaReadlist = (input: UpsertMangaReadlistInput): MangaReadlistItem => {
  const now = safeNow();
  const list = getLocalMangaReadlist();
  const index = list.findIndex((row) => row.manga_id === input.mangaId);
  const existing = index >= 0 ? list[index] : null;
  const inferredIds = extractExternalIdsFromMangaId(input.mangaId);
  const nextMalId = toPositiveIntOrNull(input.malId ?? existing?.mal_id ?? inferredIds.malId);
  const nextAniListId = toPositiveIntOrNull(input.anilistId ?? existing?.anilist_id ?? inferredIds.anilistId);

  const next: MangaReadlistItem = {
    id: existing?.id || `local-${input.mangaId}`,
    user_id: null,
    manga_id: input.mangaId,
    manga_title: input.mangaTitle,
    manga_poster: normalizeString(input.mangaPoster),
    mal_id: nextMalId,
    anilist_id: nextAniListId,
    status: normalizeStatus(input.status || existing?.status || 'plan_to_read'),
    last_chapter_key: normalizeString(input.lastChapterKey ?? existing?.last_chapter_key),
    last_chapter_number:
      Number.isFinite(Number(input.lastChapterNumber))
        ? Number(input.lastChapterNumber)
        : existing?.last_chapter_number ?? null,
    last_chapter_title: normalizeString(input.lastChapterTitle ?? existing?.last_chapter_title),
    last_provider: normalizeString(input.lastProvider ?? existing?.last_provider),
    last_language: normalizeString(input.lastLanguage ?? existing?.last_language),
    last_page_index:
      input.lastPageIndex !== undefined
        ? clampPageIndex(input.lastPageIndex)
        : existing?.last_page_index ?? 0,
    total_pages:
      input.totalPages !== undefined && Number.isFinite(Number(input.totalPages))
        ? Number(input.totalPages)
        : existing?.total_pages ?? null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (index >= 0) {
    list.splice(index, 1);
  }

  list.unshift(next);
  saveLocalMangaReadlist(list.slice(0, 500));
  return next;
};

const removeLocalMangaReadlist = (mangaId: string) => {
  const next = getLocalMangaReadlist().filter((row) => row.manga_id !== mangaId);
  saveLocalMangaReadlist(next);
};

export function useMangaReadlist(statuses: MangaReadlistStatus[] = EXPLICIT_READLIST_STATUSES) {
  const { user } = useAuth();
  const statusFilter = normalizeStatusList(statuses);
  const statusKey = statusFilter.join('|');

  return useQuery({
    queryKey: ['manga-readlist', user?.id || 'guest', statusKey],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', user.id)
        .in('status', statusFilter)
        .order('updated_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          return getLocalMangaReadlist().filter((row) => statusFilter.includes(normalizeStatus(row.status)));
        }
        throw error;
      }

      return (data || []) as MangaReadlistItem[];
    },
  });
}

export function useMangaContinueReading(limit: number = 6) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['manga-continue-reading', user?.id || 'guest', limit],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', user.id)
        .not('last_chapter_key', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (isMissingTableError(error)) {
          return getLocalMangaReadlist()
            .filter((row) => Boolean(row.last_chapter_key))
            .slice(0, limit);
        }
        throw error;
      }

      return (data || []) as MangaReadlistItem[];
    },
  });
}

export function useMangaReadlistItem(mangaId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['manga-readlist-item', user?.id || 'guest', mangaId],
    queryFn: async () => {
      if (!mangaId) return null;
      if (!user) return null;

      const { data, error } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', user.id)
        .eq('manga_id', mangaId)
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          return getLocalMangaReadlist().find((row) => row.manga_id === mangaId) || null;
        }
        throw error;
      }

      return (data as MangaReadlistItem | null) || null;
    },
    enabled: !!mangaId,
  });
}

export function useUpsertMangaReadlist() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (input: UpsertMangaReadlistInput) => {
      const mangaId = String(input.mangaId || '').trim();
      const mangaTitle = String(input.mangaTitle || '').trim();

      if (!mangaId) throw new Error('Missing manga id');
      if (!mangaTitle) throw new Error('Missing manga title');
      if (!user) throw new Error('Please sign in to manage your manga readlist');

      const inferredIds = extractExternalIdsFromMangaId(mangaId);
      const malId = toPositiveIntOrNull(input.malId ?? inferredIds.malId);
      const anilistId = toPositiveIntOrNull(input.anilistId ?? inferredIds.anilistId);

      const payload: any = {
        user_id: user.id,
        manga_id: mangaId,
        manga_title: mangaTitle,
        manga_poster: normalizeString(input.mangaPoster),
        mal_id: malId,
        anilist_id: anilistId,
        status: normalizeStatus(input.status || 'plan_to_read'),
        last_chapter_key: normalizeString(input.lastChapterKey),
        last_chapter_number:
          input.lastChapterNumber !== undefined && Number.isFinite(Number(input.lastChapterNumber))
            ? Number(input.lastChapterNumber)
            : null,
        last_chapter_title: normalizeString(input.lastChapterTitle),
        last_provider: normalizeString(input.lastProvider),
        last_language: normalizeString(input.lastLanguage),
        last_page_index: clampPageIndex(input.lastPageIndex ?? 0),
        total_pages:
          input.totalPages !== undefined && Number.isFinite(Number(input.totalPages))
            ? Number(input.totalPages)
            : null,
        updated_at: safeNow(),
      };

      const { data, error } = await supabase
        .from('manga_readlist')
        .upsert(payload, { onConflict: 'user_id,manga_id' })
        .select()
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          return upsertLocalMangaReadlist({ ...input, mangaId, mangaTitle });
        }
        throw error;
      }

      return data as MangaReadlistItem;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['manga-readlist'] });
      queryClient.invalidateQueries({ queryKey: ['manga-readlist-item'] });
      queryClient.invalidateQueries({ queryKey: ['manga-continue-reading'] });

      const chapterProgress = toPositiveIntOrNull(data?.last_chapter_number) ?? undefined;
      const statusForSync = normalizeSyncStatusWithProgress(normalizeStatus(data?.status), chapterProgress);

      if (profile?.mal_access_token) {
        const targetMalId = toPositiveIntOrNull(data?.mal_id ?? variables?.malId);
        if (targetMalId) {
          updateMalMangaStatus(targetMalId, statusForSync, undefined, chapterProgress)
            .catch((error) => console.error('[useMangaReadlist] MAL auto-sync failed:', error));
        }
      }

      if (profile?.anilist_access_token) {
        const targetAniListId = toPositiveIntOrNull(data?.anilist_id ?? variables?.anilistId);
        if (targetAniListId) {
          updateAniListMangaStatus(
            profile.anilist_access_token,
            targetAniListId,
            mapTatakaiMangaStatusToAniList(statusForSync),
            chapterProgress,
          ).catch((error) => console.error('[useMangaReadlist] AniList auto-sync failed:', error));
        }
      }

      if (!variables.silentToast) {
        const action = data.status === 'plan_to_read' ? 'Added to readlist' : 'Updated readlist';
        toast.success(action);
      }
    },
    onError: (error: any) => {
      toast.error(`Failed to update readlist: ${error?.message || 'Unknown error'}`);
    },
  });
}

export function useRemoveFromMangaReadlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ mangaId, silentToast = false }: { mangaId: string; silentToast?: boolean }) => {
      if (!mangaId) throw new Error('Missing manga id');
      if (!user) throw new Error('Please sign in to manage your manga readlist');

      const { error } = await supabase
        .from('manga_readlist')
        .delete()
        .eq('user_id', user.id)
        .eq('manga_id', mangaId);

      if (error) {
        if (isMissingTableError(error)) {
          removeLocalMangaReadlist(mangaId);
          return { mangaId, silentToast };
        }
        throw error;
      }

      return { mangaId, silentToast };
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['manga-readlist'] });
      queryClient.invalidateQueries({ queryKey: ['manga-readlist-item'] });
      queryClient.invalidateQueries({ queryKey: ['manga-continue-reading'] });
      if (!variables.silentToast) {
        toast.success('Removed from readlist');
      }
    },
    onError: (error: any) => {
      toast.error(`Failed to remove from readlist: ${error?.message || 'Unknown error'}`);
    },
  });
}

export function useSaveMangaReadingProgress() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<UpsertMangaReadlistInput, 'status' | 'silentToast'>) => {
      const mangaId = String(input.mangaId || '').trim();
      const mangaTitle = String(input.mangaTitle || '').trim();

      if (!mangaId || !mangaTitle) {
        throw new Error('Missing manga progress context');
      }

      if (!user) {
        return null;
      }

      const cachedEntry = queryClient.getQueryData<MangaReadlistItem | null>([
        'manga-readlist-item',
        user.id,
        mangaId,
      ]);
      const existingStatus = normalizeStatus(cachedEntry?.status);
      const chapterProgress = toPositiveIntOrNull(input.lastChapterNumber);
      const statusToPersist: MangaReadlistStatus = existingStatus === 'completed'
        ? 'completed'
        : chapterProgress
          ? 'reading'
          : (isExplicitReadlistStatus(existingStatus) ? existingStatus : 'reading');
      const inferredIds = extractExternalIdsFromMangaId(mangaId);
      const malIdToPersist = toPositiveIntOrNull(cachedEntry?.mal_id ?? inferredIds.malId);
      const anilistIdToPersist = toPositiveIntOrNull(cachedEntry?.anilist_id ?? inferredIds.anilistId);

      const payload: any = {
        user_id: user.id,
        manga_id: mangaId,
        manga_title: mangaTitle,
        manga_poster: normalizeString(input.mangaPoster),
        mal_id: malIdToPersist,
        anilist_id: anilistIdToPersist,
        status: statusToPersist,
        last_chapter_key: normalizeString(input.lastChapterKey),
        last_chapter_number:
          input.lastChapterNumber !== undefined && Number.isFinite(Number(input.lastChapterNumber))
            ? Number(input.lastChapterNumber)
            : null,
        last_chapter_title: normalizeString(input.lastChapterTitle),
        last_provider: normalizeString(input.lastProvider),
        last_language: normalizeString(input.lastLanguage),
        last_page_index: clampPageIndex(input.lastPageIndex ?? 0),
        total_pages:
          input.totalPages !== undefined && Number.isFinite(Number(input.totalPages))
            ? Number(input.totalPages)
            : null,
        updated_at: safeNow(),
      };

      const { data, error } = await supabase
        .from('manga_readlist')
        .upsert(payload, { onConflict: 'user_id,manga_id' })
        .select()
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          return upsertLocalMangaReadlist({
            ...input,
            mangaId,
            mangaTitle,
            status: statusToPersist,
            silentToast: true,
          });
        }
        throw error;
      }

      return data as MangaReadlistItem;
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.setQueryData(['manga-readlist-item', user?.id || 'guest', data.manga_id], data);
      queryClient.invalidateQueries({ queryKey: ['manga-readlist'] });
      queryClient.invalidateQueries({ queryKey: ['manga-continue-reading'] });

      const chapterProgress = toPositiveIntOrNull(data.last_chapter_number) ?? undefined;
      const statusForSync = normalizeSyncStatusWithProgress(normalizeStatus(data.status), chapterProgress);

      if (profile?.mal_access_token) {
        const targetMalId = toPositiveIntOrNull(data.mal_id);
        if (targetMalId) {
          updateMalMangaStatus(targetMalId, statusForSync, undefined, chapterProgress)
            .catch((error) => console.error('[useMangaReadlist] MAL progress sync failed:', error));
        }
      }

      if (profile?.anilist_access_token) {
        const targetAniListId = toPositiveIntOrNull(data.anilist_id);
        if (targetAniListId) {
          updateAniListMangaStatus(
            profile.anilist_access_token,
            targetAniListId,
            mapTatakaiMangaStatusToAniList(statusForSync),
            chapterProgress,
          ).catch((error) => console.error('[useMangaReadlist] AniList progress sync failed:', error));
        }
      }
    },
  });
}

export function usePublicMangaReadlist(
  userId: string | undefined,
  isPublic: boolean,
  showWatchlist: boolean = true,
  statuses: MangaReadlistStatus[] = EXPLICIT_READLIST_STATUSES,
) {
  const statusFilter = normalizeStatusList(statuses);
  const statusKey = statusFilter.join('|');

  return useQuery({
    queryKey: ['public-manga-readlist', userId, statusKey],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', userId)
        .in('status', statusFilter)
        .order('updated_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }

      return (data || []) as MangaReadlistItem[];
    },
    enabled: !!userId && isPublic && showWatchlist,
  });
}
