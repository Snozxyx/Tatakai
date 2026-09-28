import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Favorite anime characters. Mirrors useMangaReadlist's structure, including the
// missing-table → localStorage fallback so the heart button keeps working in
// environments where the migration has not been applied yet.

export interface CharacterFavorite {
  id: string;
  user_id: string | null;
  character_id: string;
  character_name: string;
  character_image: string | null;
  character_native_name: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ToggleCharacterFavoriteInput {
  characterId: string;
  characterName: string;
  characterImage?: string | null;
  nativeName?: string | null;
  source?: string;
}

const LOCAL_KEY = 'tatakai:character-favorites:v1';

const safeNow = () => new Date().toISOString();
const normStr = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
};

const isMissingTableError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('character_favorites') ||
    details.includes('character_favorites') ||
    message.includes('could not find the table')
  );
};

const getLocal = (): CharacterFavorite[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: any) => ({
        id: String(row?.id || `local-${String(row?.character_id || '').trim()}`),
        user_id: null,
        character_id: String(row?.character_id || '').trim(),
        character_name: String(row?.character_name || '').trim(),
        character_image: normStr(row?.character_image),
        character_native_name: normStr(row?.character_native_name),
        source: String(row?.source || 'anilist'),
        created_at: String(row?.created_at || safeNow()),
        updated_at: String(row?.updated_at || safeNow()),
      }))
      .filter((r: CharacterFavorite) => r.character_id && r.character_name)
      .sort(
        (a: CharacterFavorite, b: CharacterFavorite) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  } catch {
    return [];
  }
};

const saveLocal = (rows: CharacterFavorite[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, 500)));
};

const upsertLocal = (input: ToggleCharacterFavoriteInput): CharacterFavorite => {
  const now = safeNow();
  const list = getLocal();
  const existing = list.find((r) => r.character_id === input.characterId);
  const next: CharacterFavorite = {
    id: existing?.id || `local-${input.characterId}`,
    user_id: null,
    character_id: input.characterId,
    character_name: input.characterName,
    character_image: normStr(input.characterImage),
    character_native_name: normStr(input.nativeName),
    source: input.source || 'anilist',
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  const filtered = list.filter((r) => r.character_id !== input.characterId);
  filtered.unshift(next);
  saveLocal(filtered);
  return next;
};

const removeLocal = (characterId: string) => {
  saveLocal(getLocal().filter((r) => r.character_id !== characterId));
};

/** List a user's favorite characters. Defaults to the signed-in user. */
export function useCharacterFavorites(userId?: string) {
  const { user } = useAuth();
  const targetId = userId || user?.id;

  return useQuery({
    queryKey: ['character-favorites', targetId || 'guest'],
    queryFn: async (): Promise<CharacterFavorite[]> => {
      if (!targetId) return getLocal();

      const { data, error } = await supabase
        .from('character_favorites')
        .select('*')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          // Only the signed-in user has anything in local storage.
          return targetId === user?.id ? getLocal() : [];
        }
        throw error;
      }
      return (data || []) as CharacterFavorite[];
    },
    enabled: !!targetId || typeof window !== 'undefined',
  });
}

/** Whether the current user has favorited a given character. */
export function useIsCharacterFavorited(characterId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['character-favorite', user?.id || 'guest', characterId],
    queryFn: async (): Promise<boolean> => {
      if (!characterId) return false;
      if (!user) return getLocal().some((r) => r.character_id === characterId);

      const { data, error } = await supabase
        .from('character_favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('character_id', characterId)
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          return getLocal().some((r) => r.character_id === characterId);
        }
        throw error;
      }
      return !!data;
    },
    enabled: !!characterId,
  });
}

/** Toggle a character favorite on/off for the current user. */
export function useToggleCharacterFavorite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: ToggleCharacterFavoriteInput) => {
      const characterId = String(input.characterId || '').trim();
      const characterName = String(input.characterName || '').trim();
      if (!characterId) throw new Error('Missing character id');
      if (!characterName) throw new Error('Missing character name');
      if (!user) throw new Error('Please sign in to favorite characters');

      // Is it already favorited?
      const { data: existing, error: readErr } = await supabase
        .from('character_favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('character_id', characterId)
        .maybeSingle();

      if (readErr) {
        if (isMissingTableError(readErr)) {
          const wasFav = getLocal().some((r) => r.character_id === characterId);
          if (wasFav) {
            removeLocal(characterId);
            return { favorited: false };
          }
          upsertLocal({ ...input, characterId, characterName });
          return { favorited: true };
        }
        throw readErr;
      }

      if (existing) {
        const { error } = await supabase
          .from('character_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('character_id', characterId);
        if (error) throw error;
        return { favorited: false };
      }

      const { error } = await supabase.from('character_favorites').insert({
        user_id: user.id,
        character_id: characterId,
        character_name: characterName,
        character_image: normStr(input.characterImage),
        character_native_name: normStr(input.nativeName),
        source: input.source || 'anilist',
      });
      if (error) {
        if (isMissingTableError(error)) {
          upsertLocal({ ...input, characterId, characterName });
          return { favorited: true };
        }
        throw error;
      }
      return { favorited: true };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['character-favorites'] });
      queryClient.invalidateQueries({ queryKey: ['character-favorite'] });
      toast.success(result.favorited ? 'Added to favorites' : 'Removed from favorites');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update favorites');
    },
  });
}
