/**
 * Admin moderation queue hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface ModerationItem {
  id: string;
  entity_type: 'comment' | 'playlist' | 'tier_list' | 'forum_post' | 'profile';
  entity_id: string;
  status: ModerationStatus;
  flagged_by?: string | null;
  flagged_reason?: string | null;
  flagged_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
  // Related entity data
  entity_data?: any;
  flagger_profile?: {
    display_name: string | null;
    username: string | null;
  };
  reviewer_profile?: {
    display_name: string | null;
    username: string | null;
  };
}

/**
 * Get moderation queue items
 */
export function useModerationQueue(filters?: {
  status?: ModerationStatus;
  entityType?: string;
  limit?: number;
}) {
  const { isAdmin, isModerator } = useAuth();

  return useQuery({
    queryKey: ['moderation_queue', filters],
    queryFn: async () => {
      if (!isAdmin && !isModerator) return [];

      let query = supabase
        .from('moderation_queue')
        .select('*')
        .order('flagged_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch related profiles
      const flaggedByIds = [...new Set((data || []).map((item) => item.flagged_by).filter(Boolean))];
      const reviewedByIds = [...new Set((data || []).map((item) => item.reviewed_by).filter(Boolean))];

      const [flaggers, reviewers] = await Promise.all([
        flaggedByIds.length > 0
          ? supabase
              .from('profiles')
              .select('user_id, display_name, username')
              .in('user_id', flaggedByIds)
          : { data: [] },
        reviewedByIds.length > 0
          ? supabase
              .from('profiles')
              .select('user_id, display_name, username')
              .in('user_id', reviewedByIds)
          : { data: [] },
      ]);

      const flaggerMap = new Map(flaggers.data?.map((p) => [p.user_id, p]) || []);
      const reviewerMap = new Map(reviewers.data?.map((p) => [p.user_id, p]) || []);

      return (data || []).map((item) => ({
        ...item,
        flagger_profile: item.flagged_by ? flaggerMap.get(item.flagged_by) : undefined,
        reviewer_profile: item.reviewed_by ? reviewerMap.get(item.reviewed_by) : undefined,
      })) as ModerationItem[];
    },
    enabled: (isAdmin || isModerator) === true,
  });
}

/**
 * Get pending moderation count
 */
export function useModerationCount() {
  const { isAdmin, isModerator } = useAuth();

  return useQuery({
    queryKey: ['moderation_count'],
    queryFn: async () => {
      if (!isAdmin && !isModerator) return 0;

      const { count, error } = await supabase
        .from('moderation_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) throw error;
      return count || 0;
    },
    enabled: (isAdmin || isModerator) === true,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Review a moderation item
 */
export function useReviewModeration() {
  const queryClient = useQueryClient();
  const { user, isAdmin, isModerator } = useAuth();

  return useMutation({
    mutationFn: async ({
      itemId,
      status,
      notes,
    }: {
      itemId: string;
      status: 'approved' | 'rejected';
      notes?: string;
    }) => {
      if (!user || (!isAdmin && !isModerator)) {
        throw new Error('Unauthorized');
      }

      const { error } = await supabase
        .from('moderation_queue')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes || null,
        })
        .eq('id', itemId);

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_logs').insert({
        user_id: user.id,
        action: `moderation_${status}`,
        entity_type: 'moderation_queue',
        entity_id: itemId,
        metadata: { notes },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation_queue'] });
      queryClient.invalidateQueries({ queryKey: ['moderation_count'] });
      toast.success('Moderation item reviewed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to review item');
    },
  });
}

/**
 * Flag content for moderation
 */
export function useFlagContent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      reason,
    }: {
      entityType: 'comment' | 'playlist' | 'tier_list' | 'forum_post' | 'profile';
      entityId: string;
      reason: string;
    }) => {
      if (!user) throw new Error('Not logged in');

      // Check if already flagged
      const { data: existing } = await supabase
        .from('moderation_queue')
        .select('id, status')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'pending') {
          throw new Error('Content already flagged and pending review');
        }
        // Re-flag if previously reviewed
        const { error } = await supabase
          .from('moderation_queue')
          .update({
            status: 'pending',
            flagged_by: user.id,
            flagged_reason: reason,
            flagged_at: new Date().toISOString(),
            reviewed_by: null,
            reviewed_at: null,
            review_notes: null,
          })
          .eq('id', existing.id);

        if (error) throw error;
        return;
      }

      // Create new flag
      const { error } = await supabase.from('moderation_queue').insert({
        entity_type: entityType,
        entity_id: entityId,
        status: 'pending',
        flagged_by: user.id,
        flagged_reason: reason,
        flagged_at: new Date().toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation_queue'] });
      queryClient.invalidateQueries({ queryKey: ['moderation_count'] });
      toast.success('Content flagged for review');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to flag content');
    },
  });
}
