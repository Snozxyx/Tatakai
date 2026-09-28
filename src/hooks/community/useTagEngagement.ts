import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Fire-and-forget engagement signal: when the viewer opens or likes a post,
 * grow their `user_tag_interests` weights for that post's hashtags so the
 * For You feed (see [[community-feed-platform]]) can rank toward their taste.
 * Guarded — silently no-ops pre-migration or when the RPC is missing.
 */
export function useTagEngagement() {
  const { user } = useAuth();

  return useCallback(
    async (postId: string) => {
      if (!user || !postId) return;
      try {
        const db = supabase as any;
        const { data } = await db.from('post_hashtags').select('tag').eq('post_id', postId);
        const tags = [
          ...new Set(((data as any[]) || []).map((r) => String(r.tag).toLowerCase().trim()).filter(Boolean)),
        ];
        if (tags.length) await db.rpc('bump_tag_interest', { p_tags: tags });
      } catch {
        /* pre-migration / rpc missing */
      }
    },
    [user],
  );
}
