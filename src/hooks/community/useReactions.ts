/**
 * Reactions system for comments and posts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type ReactionType = 'like' | 'love' | 'laugh' | 'wow' | 'sad' | 'angry';

interface Reaction {
  id: string;
  user_id: string;
  entity_type: 'comment' | 'forum_post' | 'tier_list';
  entity_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

interface ReactionCounts {
  like: number;
  love: number;
  laugh: number;
  wow: number;
  sad: number;
  angry: number;
  user_reaction?: ReactionType | null;
}

/**
 * Get reaction counts for an entity
 */
export function useReactions(
  entityType: 'comment' | 'forum_post' | 'tier_list',
  entityId: string | undefined
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['reactions', entityType, entityId, user?.id],
    queryFn: async (): Promise<ReactionCounts> => {
      if (!entityId) {
        return { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, angry: 0 };
      }

      // Get all reactions
      const { data: reactions, error } = await supabase
        .from('reactions')
        .select('reaction_type, user_id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);

      if (error) throw error;

      // Count reactions
      const counts: ReactionCounts = {
        like: 0,
        love: 0,
        laugh: 0,
        wow: 0,
        sad: 0,
        angry: 0,
      };

      let userReaction: ReactionType | null = null;

      (reactions || []).forEach((reaction) => {
        counts[reaction.reaction_type as ReactionType]++;
        if (user && reaction.user_id === user.id) {
          userReaction = reaction.reaction_type as ReactionType;
        }
      });

      return { ...counts, user_reaction: userReaction };
    },
    enabled: !!entityId,
  });
}

/**
 * Add or update a reaction
 */
export function useReact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      reactionType,
    }: {
      entityType: 'comment' | 'forum_post' | 'tier_list';
      entityId: string;
      reactionType: ReactionType;
    }) => {
      if (!user) throw new Error('Not logged in');

      // Check if user already reacted
      const { data: existing } = await supabase
        .from('reactions')
        .select('id, reaction_type')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        if (existing.reaction_type === reactionType) {
          // Remove reaction if clicking the same type
          const { error } = await supabase
            .from('reactions')
            .delete()
            .eq('id', existing.id);

          if (error) throw error;
          return { action: 'removed' as const, reactionType: null };
        } else {
          // Update reaction type
          const { error } = await supabase
            .from('reactions')
            .update({ reaction_type: reactionType })
            .eq('id', existing.id);

          if (error) throw error;
          return { action: 'updated' as const, reactionType };
        }
      } else {
        // Add new reaction
        const { error } = await supabase.from('reactions').insert({
          user_id: user.id,
          entity_type: entityType,
          entity_id: entityId,
          reaction_type: reactionType,
        });

        if (error) throw error;
        return { action: 'added' as const, reactionType };
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['reactions', variables.entityType, variables.entityId],
      });
    },
    onError: () => {
      toast.error('Failed to react');
    },
  });
}
