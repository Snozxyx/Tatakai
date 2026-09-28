import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PollOption {
  text: string;
  image: string | null;
}

export interface PollResult {
  option: string;
  image: string | null;
  votes: number;
  percent: number;
}

export interface PostPoll {
  id: string;
  post_id: string;
  question: string;
  options: PollOption[];
  ends_at: string | null;
  created_at: string;
  votes_count: number;
  user_vote: number | null;
  results: PollResult[];
  is_closed: boolean;
}

/** Coerce a stored poll option — legacy rows are bare strings, new rows are
 *  `{ text, image }` objects (see 20260923093000_community_phase_b.sql). */
function coerceOption(raw: unknown): PollOption {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return { text: String(o.text ?? ''), image: typeof o.image === 'string' ? o.image : null };
  }
  return { text: String(raw ?? ''), image: null };
}

/**
 * Shape raw poll + votes rows into a `PostPoll` with tallied results.
 * Shared by the batch feed loader (useFeed) and the single-poll hook so the
 * <Poll> component always receives the same structure it gets for watchroom
 * polls (see useWatchRoom.ts:useActiveRoomPoll).
 */
export function tallyPoll(
  poll: { id: string; post_id: string; question: string; options: unknown; ends_at: string | null; created_at: string },
  votes: Array<{ user_id: string; option_index: number }>,
  currentUserId?: string,
): PostPoll {
  const options = Array.isArray(poll.options) ? (poll.options as unknown[]).map(coerceOption) : [];
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
    option: option.text,
    image: option.image,
    votes: counts[index] || 0,
    percent: totalVotes > 0 ? Math.round(((counts[index] || 0) / totalVotes) * 100) : 0,
  }));

  return {
    id: poll.id,
    post_id: poll.post_id,
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

/** Fetch a single post's poll with tallied results (standalone / post detail). */
export function usePostPoll(postId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['post-poll', postId, user?.id],
    queryFn: async () => {
      if (!postId) return null;
      const db = supabase as any;

      const { data: poll, error } = await db
        .from('post_polls')
        .select('*')
        .eq('post_id', postId)
        .maybeSingle();

      if (error) throw error;
      if (!poll) return null;

      const { data: votes, error: votesError } = await db
        .from('post_poll_votes')
        .select('user_id, option_index')
        .eq('poll_id', poll.id);

      if (votesError) throw votesError;

      return tallyPoll(poll, votes || [], user?.id);
    },
    enabled: !!postId,
  });
}

/** Attach a poll to a post the user just created. */
export function useCreatePostPoll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      postId,
      question,
      options,
      endsAt,
    }: {
      postId: string;
      question: string;
      options: PollOption[];
      endsAt?: string | null;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const db = supabase as any;
      const { data, error } = await db
        .from('post_polls')
        .insert({
          post_id: postId,
          question,
          options,
          created_by: user.id,
          ends_at: endsAt || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post-poll', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/** Cast or change a vote on a post poll. */
export function useVotePostPoll() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      pollId,
      optionIndex,
    }: {
      postId: string;
      pollId: string;
      optionIndex: number;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const db = supabase as any;
      const { error } = await db
        .from('post_poll_votes')
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
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post-poll', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
