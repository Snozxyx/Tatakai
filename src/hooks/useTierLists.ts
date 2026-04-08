import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TierListItem {
  anime_id: string;
  anime_title: string;
  anime_image: string;
  tier: string;
  position: number;
}

export interface TierList {
  id: string;
  user_id: string;
  name: string;
  title: string;
  description: string | null;
  is_public: boolean;
  items: TierListItem[];
  share_code: string;
  likes_count: number;
  views_count: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
  user_liked?: boolean;
}

export interface Tier {
  name: string;
  color: string;
}

function normalizeTierListRow(row: any): TierList {
  return {
    ...row,
    name: row?.title || row?.name,
    title: row?.title || row?.name,
    items: (row?.items || row?.tiers || []) as TierListItem[],
  } as TierList;
}

function isSchemaColumnError(error: any): boolean {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('does not exist')
  );
}

async function insertTierListWithFallback(
  payload: {
    user_id: string;
    title: string;
    description?: string;
    items: TierListItem[];
    is_public: boolean;
  }
) {
  const attempts = [
    {
      user_id: payload.user_id,
      title: payload.title,
      description: payload.description,
      items: payload.items as any,
      is_public: payload.is_public,
    },
    {
      user_id: payload.user_id,
      name: payload.title,
      description: payload.description,
      items: payload.items as any,
      is_public: payload.is_public,
    },
    {
      user_id: payload.user_id,
      title: payload.title,
      description: payload.description,
      tiers: payload.items as any,
      is_public: payload.is_public,
    },
    {
      user_id: payload.user_id,
      name: payload.title,
      description: payload.description,
      tiers: payload.items as any,
      is_public: payload.is_public,
    },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from('tier_lists')
      .insert(attempt as any)
      .select()
      .single();

    if (!error) return data;
    lastError = error;
    if (!isSchemaColumnError(error)) break;
  }

  throw lastError;
}

async function updateTierListWithFallback(id: string, updates: Record<string, any>) {
  const variants: Record<string, any>[] = [updates];
  const mapped: Record<string, any> = { ...updates };

  if ('title' in mapped) {
    mapped.name = mapped.title;
    delete mapped.title;
  }
  if ('items' in mapped) {
    mapped.tiers = mapped.items;
    delete mapped.items;
  }

  variants.push(mapped);

  let lastError: any = null;
  for (const attempt of variants) {
    const { data, error } = await supabase
      .from('tier_lists')
      .update(attempt)
      .eq('id', id)
      .select()
      .single();

    if (!error) return data;
    lastError = error;
    if (!isSchemaColumnError(error)) break;
  }

  throw lastError;
}

// Default tier colors
export const DEFAULT_TIERS: Tier[] = [
  { name: 'S', color: '#ff7f7f' },
  { name: 'A', color: '#ffbf7f' },
  { name: 'B', color: '#ffdf7f' },
  { name: 'C', color: '#ffff7f' },
  { name: 'D', color: '#bfff7f' },
  { name: 'F', color: '#7fbfff' },
];

// Fetch user's tier lists
export function useUserTierLists(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['tier_lists', 'user', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('tier_lists')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch user tier lists:', error);
        throw error;
      }
      
      // Fetch profile separately
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, username')
        .eq('user_id', targetUserId)
        .single();
      
      // Map title to name for component compatibility
      return (data || []).map((t) => ({
        ...normalizeTierListRow(t),
        profiles: profile || null,
      })) as unknown as TierList[];
    },
    enabled: !!targetUserId,
  });
}

// Fetch public tier lists
export function usePublicTierLists(limit = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tier_lists', 'public', limit],
    queryFn: async () => {
      const primary = await supabase
        .from('tier_lists')
        .select('*')
        .eq('is_public', true)
        .order('likes_count', { ascending: false })
        .limit(limit);

      let data = primary.data;
      if (primary.error) {
        console.warn('Public tier list primary query failed, falling back to recent ordering:', primary.error);
        const fallback = await supabase
          .from('tier_lists')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (fallback.error) {
          console.error('Failed to fetch public tier lists:', fallback.error);
          return [] as TierList[];
        }

        data = fallback.data;
      }

      // Fetch profiles for all users
      const userIds = [...new Set(data?.map(t => t.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Check if user has liked each tier list
      let likedIds = new Set<string>();
      if (user && data) {
        const { data: likes } = await supabase
          .from('tier_list_likes')
          .select('tier_list_id')
          .eq('user_id', user.id)
          .in('tier_list_id', data.map(t => t.id));

        likedIds = new Set(likes?.map(l => l.tier_list_id) || []);
      }

      return (data || []).map(t => ({
        ...normalizeTierListRow(t),
        profiles: profileMap.get(t.user_id) || null,
        user_liked: likedIds.has(t.id)
      })) as unknown as TierList[];
    },
  });
}

// Fetch single tier list by share code
export function useTierListByShareCode(shareCode: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tier_list', 'share', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tier_lists')
        .select('*')
        .eq('share_code', shareCode)
        .single();

      if (error) {
        console.error('Failed to fetch tier list by share code:', error);
        throw error;
      }

      // Fetch profile separately
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .eq('user_id', data.user_id)
        .single();

      // Increment view count using RPC function
      await supabase.rpc('increment_tier_list_views', { tier_list_id: data.id });

      // Check if user has liked
      if (user) {
        const { data: like } = await supabase
          .from('tier_list_likes')
          .select('id')
          .eq('user_id', user.id)
          .eq('tier_list_id', data.id)
          .single();

        return {
          ...normalizeTierListRow(data),
          profiles: profile,
          user_liked: !!like
        } as unknown as TierList;
      }

      return {
        ...normalizeTierListRow(data),
        profiles: profile,
      } as unknown as TierList;
    },
    enabled: !!shareCode,
  });
}

// Create tier list
export function useCreateTierList() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      name,
      description,
      items,
      is_public = true,
    }: {
      name: string;
      description?: string;
      items: TierListItem[];
      is_public?: boolean;
    }) => {
      if (!user) throw new Error('Must be logged in');
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Tier list name is required');

      const data = await insertTierListWithFallback({
        user_id: user.id,
        title: trimmedName,
        description,
        items,
        is_public,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier_lists'] });
    },
  });
}

// Update tier list
export function useUpdateTierList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      items,
      is_public,
    }: {
      id: string;
      name?: string;
      description?: string;
      items?: TierListItem[];
      is_public?: boolean;
    }) => {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.title = name.trim();
      if (description !== undefined) updates.description = description;
      if (items !== undefined) updates.items = items;
      if (is_public !== undefined) updates.is_public = is_public;
      if (typeof updates.title === 'string' && !updates.title) {
        throw new Error('Tier list name is required');
      }

      const data = await updateTierListWithFallback(id, updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier_lists'] });
    },
  });
}

// Delete tier list
export function useDeleteTierList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tier_lists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier_lists'] });
    },
  });
}

// Like/unlike tier list
export function useLikeTierList() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ tierListId, liked }: { tierListId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (liked) {
        const { error } = await supabase
          .from('tier_list_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('tier_list_id', tierListId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tier_list_likes')
          .insert({ user_id: user.id, tier_list_id: tierListId });
        if (error) {
          if (error.code === '23505') {
            // Unique violation: already liked. Treat as no-op and refresh.
            return;
          }
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier_lists'] });
      queryClient.invalidateQueries({ queryKey: ['tier_list'] });
    },
  });
}
