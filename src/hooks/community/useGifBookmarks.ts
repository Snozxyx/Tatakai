import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { GiphyGif } from '@/lib/giphy';

export interface GifBookmark {
  id: string;
  user_id: string;
  gif_url: string;
  preview_url: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

/** A user's saved GIFs, newest first (the picker's "Saved" tab). */
export function useGifBookmarks() {
  const { user } = useAuth();

  return useQuery<GifBookmark[]>({
    queryKey: ['gif-bookmarks', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase
        .from('gif_bookmarks' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }) as any);
      if (error) throw error;
      return (data ?? []) as GifBookmark[];
    },
    enabled: !!user,
  });
}

/** Add or remove a GIF from the caller's bookmarks (keyed by url). */
export function useToggleGifBookmark() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ gif, bookmarked }: { gif: GiphyGif; bookmarked: boolean }) => {
      if (!user) throw new Error('Sign in to bookmark GIFs');
      if (bookmarked) {
        const { error } = await (supabase
          .from('gif_bookmarks' as any)
          .delete()
          .eq('user_id', user.id)
          .eq('gif_url', gif.url) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('gif_bookmarks' as any).insert({
          user_id: user.id,
          gif_url: gif.url,
          preview_url: gif.preview,
          title: gif.title,
          width: gif.width ?? null,
          height: gif.height ?? null,
        }) as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gif-bookmarks'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update bookmark');
    },
  });
}
