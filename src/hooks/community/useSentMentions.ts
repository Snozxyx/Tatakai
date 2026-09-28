import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MentionedUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface SentMention {
  id: string;
  created_at: string;
  preview: string;
  link: string;
  mentioned: MentionedUser[];
}

/**
 * Build the in-app deep link to a comment, tolerant of both the pre-unify
 * (`anime_id`, possibly `manga:`-prefixed) and post-unify (`entity_type` +
 * `entity_id`) comment shapes — the unify migration (20260923120000) is written
 * but may not be applied, and the frontend still reads `*`, so a row can have
 * either set of columns. Mirrors the link built by notify_on_comment().
 */
function commentLink(row: any): string {
  const hash = `#comment-${row.id}`;
  if (row.entity_type && row.entity_id) {
    switch (row.entity_type) {
      case 'anime':
        return `/anime/${row.entity_id}${row.episode_id ? `?episode=${row.episode_id}` : ''}${hash}`;
      case 'manga':
        return `/manga/${row.entity_id}${hash}`;
      case 'playlist':
        return `/playlist/${row.entity_id}${hash}`;
      case 'forum_post':
        return `/community/forum/${row.entity_id}${hash}`;
      default:
        return `/${hash}`;
    }
  }
  if (typeof row.anime_id === 'string') {
    if (row.anime_id.startsWith('manga:')) return `/manga/${row.anime_id.slice(6)}${hash}`;
    return `/anime/${row.anime_id}${row.episode_id ? `?episode=${row.episode_id}` : ''}${hash}`;
  }
  return `/${hash}`;
}

/**
 * The comments the current user wrote that @mention someone — the "Sent" side of
 * the Mentions tab ("You mentioned @X, @Y"). Comments carry a `mentions` uuid[]
 * (20260919120000); we resolve those ids to profiles for display.
 */
export function useSentMentions() {
  const { user } = useAuth();

  return useQuery<SentMention[]>({
    queryKey: ['sent-mentions', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: rows, error } = await supabase
        .from('comments')
        .select('*')
        .eq('user_id', user.id)
        .not('mentions', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const withMentions = (rows ?? []).filter(
        (r: any) => Array.isArray(r.mentions) && r.mentions.length > 0,
      );
      if (withMentions.length === 0) return [];

      // One profiles lookup for every mentioned id across all rows. Mentions are
      // auth user ids, so they join on profiles.user_id (not profiles.id).
      const ids = [...new Set(withMentions.flatMap((r: any) => r.mentions as string[]))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', ids);

      const byId = new Map<string, MentionedUser>(
        (profiles ?? []).map((p: any) => [p.user_id, p]),
      );

      return withMentions.map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        preview: (r.content ?? '').slice(0, 140) || 'Sent an attachment',
        link: commentLink(r),
        mentioned: (r.mentions as string[]).map(
          (id) => byId.get(id) ?? { user_id: id, username: null, display_name: null, avatar_url: null },
        ),
      }));
    },
    enabled: !!user,
  });
}
