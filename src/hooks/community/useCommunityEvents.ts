import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CommunityEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  link: string | null;
  image_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CommunityEventInput {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  link?: string | null;
  image_url?: string | null;
}

/**
 * Upcoming community events for the Schedule tab. Includes events that started
 * within the last day (still "ongoing"); everything else is future-dated.
 * Guarded so the tab renders empty pre-migration instead of throwing.
 */
export function useCommunityEvents() {
  return useQuery({
    queryKey: ['community-events'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CommunityEvent[]> => {
      const db = supabase as any;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      try {
        const { data, error } = await db
          .from('community_events')
          .select('*')
          .gte('starts_at', since)
          .order('starts_at', { ascending: true })
          .limit(100);
        if (error) throw error;
        return (data || []) as CommunityEvent[];
      } catch {
        return []; // pre-migration
      }
    },
  });
}

/** Create an event (admin/moderator only — RLS enforces the staff gate). */
export function useCreateCommunityEvent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommunityEventInput): Promise<CommunityEvent> => {
      if (!user) throw new Error('Not authenticated');
      const db = supabase as any;
      const { data, error } = await db
        .from('community_events')
        .insert({ ...input, created_by: user.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as CommunityEvent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-events'] }),
  });
}

/** Delete an event (admin/moderator only — RLS enforces the staff gate). */
export function useDeleteCommunityEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const db = supabase as any;
      const { error } = await db.from('community_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-events'] }),
  });
}
