import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { PollResult } from './usePostPolls';

/**
 * Comment polls — the comment-side mirror of usePostPolls. Backed by the
 * comment_polls / comment_poll_votes tables (migration 20260922200000), which
 * copy post_polls / post_poll_votes but key on comment_id. The presentational
 * <Poll> component drives both, so CommentPoll matches PostPoll field-for-field
 * except post_id → comment_id.
 */
export interface CommentPoll {
  id: string;
  comment_id: string;
  question: string;
  options: string[];
  ends_at: string | null;
  created_at: string;
  votes_count: number;
  user_vote: number | null;
  results: PollResult[];
  is_closed: boolean;
}

/** Shape raw poll + vote rows into a tallied CommentPoll (same maths as tallyPoll). */
export function tallyCommentPoll(
  poll: { id: string; comment_id: string; question: string; options: unknown; ends_at: string | null; created_at: string },
  votes: Array<{ user_id: string; option_index: number }>,
  currentUserId?: string,
): CommentPoll {
  const options = Array.isArray(poll.options) ? (poll.options as string[]) : [];
  const counts = new Array(options.length).fill(0);
  let userVote: number | null = null;

  votes.forEach((v) => {
    if (typeof v.option_index === 'number' && v.option_index >= 0 && v.option_index < counts.length) {
      counts[v.option_index] += 1;
    }
    if (currentUserId && v.user_id === currentUserId && typeof v.option_index === 'number') {
      userVote = v.option_index;
    }
  });

  const totalVotes = counts.reduce((sum, c) => sum + c, 0);
  const results: PollResult[] = options.map((option, index) => ({
    option,
    votes: counts[index] || 0,
    percent: totalVotes > 0 ? Math.round(((counts[index] || 0) / totalVotes) * 100) : 0,
  }));

  return {
    id: poll.id,
    comment_id: poll.comment_id,
    question: poll.question,
    options,
    ends_at: poll.ends_at,
    created_at: poll.created_at,
    votes_count: totalVotes,
    user_vote: userVote,
    results,
    is_closed: !!poll.ends_at && new Date(poll.ends_at).getTime() <= Date.now(),
  };
}

/**
 * Batch-load polls for a list of comment ids in two queries (polls, then their
 * votes), returning comment_id → CommentPoll. Called from useComments/useReplies
 * so a thread renders its polls without one query per comment. Comments without
 * a poll are simply absent from the map.
 */
export async function fetchCommentPolls(
  commentIds: string[],
  currentUserId?: string,
): Promise<Map<string, CommentPoll>> {
  const out = new Map<string, CommentPoll>();
  if (commentIds.length === 0) return out;

  const db = supabase as any;
  const { data: polls, error } = await db
    .from('comment_polls')
    .select('*')
    .in('comment_id', commentIds);
  if (error) throw error;
  if (!polls || polls.length === 0) return out;

  const pollIds = polls.map((p: any) => p.id);
  const { data: votes, error: votesError } = await db
    .from('comment_poll_votes')
    .select('poll_id, user_id, option_index')
    .in('poll_id', pollIds);
  if (votesError) throw votesError;

  const votesByPoll = new Map<string, Array<{ user_id: string; option_index: number }>>();
  (votes || []).forEach((v: any) => {
    const arr = votesByPoll.get(v.poll_id) || [];
    arr.push({ user_id: v.user_id, option_index: v.option_index });
    votesByPoll.set(v.poll_id, arr);
  });

  polls.forEach((p: any) => {
    out.set(p.comment_id, tallyCommentPoll(p, votesByPoll.get(p.id) || [], currentUserId));
  });
  return out;
}

/** Cast or change a vote on a comment poll. Refetches the affected thread. */
export function useVoteCommentPoll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      pollId,
      optionIndex,
    }: {
      pollId: string;
      optionIndex: number;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const db = supabase as any;
      const { error } = await db
        .from('comment_poll_votes')
        .upsert(
          {
            poll_id: pollId,
            user_id: user.id,
            option_index: optionIndex,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'poll_id,user_id' },
        );

      if (error) throw error;
    },
    onSuccess: () => {
      // The poll tally lives inside the comment/reply query results, so refetch
      // those rather than a dedicated poll key.
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      queryClient.invalidateQueries({ queryKey: ['replies'] });
    },
  });
}
