import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SearchUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
}
export interface SearchPlaylist {
  id: string;
  name: string;
  cover_image: string | null;
  items_count: number | null;
}
export interface SearchTierList {
  id: string;
  title: string;
  share_code: string | null;
}
export interface SearchPost {
  id: string;
  title: string | null;
  content: string | null;
}
export interface CommunitySearchResults {
  users: SearchUser[];
  playlists: SearchPlaylist[];
  tierlists: SearchTierList[];
  posts: SearchPost[];
}

const EMPTY: CommunitySearchResults = { users: [], playlists: [], tierlists: [], posts: [] };

/** Strip characters that would break a PostgREST `.or()`/`ilike` filter. */
function sanitize(term: string): string {
  return term.replace(/[,()%*\\]/g, ' ').trim();
}

/**
 * Multi-source community search (users / playlists / tier lists / posts).
 * Each source is guarded independently so a schema mismatch in one (e.g.
 * tier_lists `title` vs `name`) never blanks the whole result set.
 */
export function useCommunitySearch(q: string, limit = 5) {
  const term = sanitize(q);

  return useQuery<CommunitySearchResults>({
    queryKey: ['community-search', term, limit],
    queryFn: async () => {
      if (term.length < 2) return EMPTY;
      const like = `%${term}%`;

      const users = (async (): Promise<SearchUser[]> => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('user_id, username, display_name, avatar_url, banner_url')
            .eq('is_public', true)
            .or(`username.ilike.${like},display_name.ilike.${like}`)
            .limit(limit);
          return (data as any[]) || [];
        } catch { return []; }
      })();

      const playlists = (async (): Promise<SearchPlaylist[]> => {
        try {
          const { data } = await supabase
            .from('playlists')
            .select('id, name, cover_image, items_count')
            .eq('is_public', true)
            .ilike('name', like)
            .limit(limit);
          return (data as any[]) || [];
        } catch { return []; }
      })();

      const tierlists = (async (): Promise<SearchTierList[]> => {
        try {
          const { data, error } = await supabase
            .from('tier_lists')
            .select('id, title, share_code')
            .eq('is_public', true)
            .ilike('title', like)
            .limit(limit);
          if (error) throw error;
          return (data as any[]) || [];
        } catch {
          // Older schemas store the label in `name` instead of `title`.
          try {
            const { data } = await supabase
              .from('tier_lists')
              .select('id, name, share_code')
              .eq('is_public', true)
              .ilike('name', like)
              .limit(limit);
            return ((data as any[]) || []).map((t) => ({ id: t.id, title: t.name, share_code: t.share_code }));
          } catch { return []; }
        }
      })();

      const posts = (async (): Promise<SearchPost[]> => {
        try {
          const { data } = await supabase
            .from('forum_posts')
            .select('id, title, content')
            .eq('is_approved', true)
            .or(`title.ilike.${like},content.ilike.${like}`)
            .order('created_at', { ascending: false })
            .limit(limit);
          return (data as any[]) || [];
        } catch { return []; }
      })();

      const [u, p, t, po] = await Promise.all([users, playlists, tierlists, posts]);
      return { users: u, playlists: p, tierlists: t, posts: po };
    },
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
}
