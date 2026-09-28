import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  anime_id: string | null;
  icon_url: string | null;
  banner_url: string | null;
  /** Long-form community info (items 10/12) — dormant until the migration is applied. */
  rules: string | null;
  about: string | null;
  created_by: string | null;
  created_at: string;
  /** Official/verified community (blue tick) — set when created by a platform admin. */
  is_verified: boolean;
  member_count: number;
  is_member: boolean;
  /** The viewer's role in this community (null when not a member / signed out). */
  my_role: CommunityRole | null;
}

export type CommunityRole = 'owner' | 'mod' | 'member';

/** List communities with member counts + the viewer's membership. */
export function useCommunities() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['communities', user?.id],
    queryFn: async (): Promise<Community[]> => {
      const db = supabase as any;
      try {
        const { data: communities, error } = await db
          .from('communities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        const list = (communities || []) as any[];
        if (!list.length) return [];

        const ids = list.map((c) => c.id);
        const { data: members } = await db
          .from('community_members')
          .select('community_id, user_id, role')
          .in('community_id', ids);

        const counts = new Map<string, number>();
        const mine = new Set<string>();
        const roles = new Map<string, CommunityRole>();
        (members || []).forEach((m: any) => {
          counts.set(m.community_id, (counts.get(m.community_id) || 0) + 1);
          if (user && m.user_id === user.id) {
            mine.add(m.community_id);
            roles.set(m.community_id, m.role);
          }
        });

        return list.map((c) => ({
          ...c,
          member_count: counts.get(c.id) || 0,
          is_member: mine.has(c.id),
          my_role: roles.get(c.id) ?? null,
        }));
      } catch {
        return []; // pre-migration
      }
    },
  });
}

export function useCommunityBySlug(slug: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community', slug, user?.id],
    enabled: !!slug,
    queryFn: async (): Promise<Community | null> => {
      const db = supabase as any;
      const { data, error } = await db.from('communities').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: members } = await db.from('community_members').select('user_id, role').eq('community_id', data.id);
      const list = members || [];
      const myMembership = user ? list.find((m: any) => m.user_id === user.id) : undefined;
      return {
        ...data,
        member_count: list.length,
        is_member: !!myMembership,
        my_role: (myMembership?.role as CommunityRole | undefined) ?? null,
      };
    },
  });
}

export interface CommunityMember {
  user_id: string;
  role: 'member' | 'mod' | 'owner';
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function useCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: ['community-members', communityId],
    enabled: !!communityId,
    queryFn: async (): Promise<CommunityMember[]> => {
      const db = supabase as any;
      const { data: members, error } = await db
        .from('community_members')
        .select('user_id, role')
        .eq('community_id', communityId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      const list = (members || []) as any[];
      if (!list.length) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', list.map((m) => m.user_id));
      const map = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return list.map((m) => ({ user_id: m.user_id, role: m.role, ...(map.get(m.user_id) || { username: null, display_name: null, avatar_url: null }) }));
    },
  });
}

/**
 * The viewer's role in a community (`'owner'|'mod'|'member'|null`). Gates
 * community-scoped moderation (pin/delete/settings) by `community_members.role`
 * rather than only `communities.created_by`. [[tatakai-two-id-spaces-in-profiles]]
 */
export function useMyCommunityRole(communityId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-community-role', communityId, user?.id],
    enabled: !!communityId && !!user,
    queryFn: async (): Promise<CommunityRole | null> => {
      const db = supabase as any;
      const { data, error } = await db
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as CommunityRole | undefined) ?? null;
    },
  });
}

export function useCreateCommunity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; slug: string; description?: string; icon_url?: string; banner_url?: string; anime_id?: string }) => {
      if (!user) throw new Error('Must be logged in');
      const db = supabase as any;
      // SECURITY DEFINER RPC: creates the community + owner membership in one
      // transaction, immune to per-table RLS/grant ordering.
      const { data, error } = await db.rpc('create_community', {
        p_name: input.name,
        p_slug: input.slug,
        p_description: input.description ?? null,
        p_icon_url: input.icon_url ?? null,
        p_banner_url: input.banner_url ?? null,
        p_anime_id: input.anime_id ?? null,
      });
      if (error) throw error;
      // RPC returns the created row (single composite).
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communities'] }),
  });
}

export function useUpdateCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; description?: string; icon_url?: string; banner_url?: string; rules?: string; about?: string }) => {
      const db = supabase as any;
      // Role-aware SECURITY DEFINER RPC: lets community owners/mods (not only the
      // creator) and platform staff edit. Falls back to a direct UPDATE if the RPC
      // isn't present yet (migration written, not applied). [[tatakai-profiles-writes-go-through-rpcs]]
      const { error } = await db.rpc('update_community', {
        p_id: id,
        p_name: patch.name ?? null,
        p_description: patch.description ?? null,
        p_icon_url: patch.icon_url ?? null,
        p_banner_url: patch.banner_url ?? null,
        p_rules: patch.rules ?? null,
        p_about: patch.about ?? null,
      });
      if (error) {
        // RPC not deployed yet — fall back so pre-migration edits still work for the creator.
        if (error.code === 'PGRST202' || /function .*update_community/i.test(error.message || '')) {
          const { error: upErr } = await db.from('communities').update(patch).eq('id', id);
          if (upErr) throw upErr;
          return;
        }
        throw error;
      }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['community'] });
      queryClient.invalidateQueries({ queryKey: ['community-members', id] });
    },
  });
}

/** Delete a community (owner | creator | platform staff) via SECURITY DEFINER RPC. */
export function useDeleteCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = supabase as any;
      const { error } = await db.rpc('delete_community', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ communityId, userId, role }: { communityId: string; userId: string; role: 'member' | 'mod' | 'owner' }) => {
      const db = supabase as any;
      const { error } = await db.from('community_members').update({ role }).eq('community_id', communityId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { communityId }) => queryClient.invalidateQueries({ queryKey: ['community-members', communityId] }),
  });
}

export function useToggleCommunityMembership() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ communityId, isMember }: { communityId: string; isMember: boolean }) => {
      if (!user) throw new Error('Must be logged in');
      const db = supabase as any;
      if (isMember) {
        const { error } = await db.from('community_members').delete().eq('community_id', communityId).eq('user_id', user.id);
        if (error) throw error;
        return false;
      }
      const { error } = await db.from('community_members').insert({ community_id: communityId, user_id: user.id, role: 'member' });
      if (error) throw error;
      return true;
    },
    onSuccess: (_joined, { communityId }) => {
      // Refresh the list, the single-community view, its roster and the viewer's
      // role so a join/leave reflects everywhere immediately (space page header,
      // members rail, moderation gating).
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['community'] });
      queryClient.invalidateQueries({ queryKey: ['community-members', communityId] });
      queryClient.invalidateQueries({ queryKey: ['my-community-role', communityId] });
    },
  });
}
