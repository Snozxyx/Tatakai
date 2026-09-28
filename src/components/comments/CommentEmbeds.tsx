import {
  PostMediaEmbed,
  PostPlaylistEmbed,
  PostTierlistEmbed,
  QuotedPostEmbed,
} from '@/components/community/feed/PostEmbeds';
import { Poll } from '@/components/community/feed/Poll';
import { useVoteCommentPoll, type CommentPoll } from '@/hooks/community/useCommentPolls';
import type { CommentEmbed } from '@/lib/commentEmbeds';

/**
 * Renders a comment's rich content — link/share cards (embeds) and an attached
 * poll — reusing the community feed's embed cards and <Poll> so a comment looks
 * and behaves like a feed post. Renders nothing when a comment has neither.
 */
export function CommentEmbeds({ embeds, poll }: { embeds?: CommentEmbed[]; poll?: CommentPoll | null }) {
  const hasEmbeds = !!embeds && embeds.length > 0;
  if (!hasEmbeds && !poll) return null;

  return (
    <div className="mt-2 space-y-2">
      {embeds?.map((embed, i) => <CommentEmbedCard key={`${embed.kind}-${i}`} embed={embed} />)}
      {poll && <CommentPollCard poll={poll} />}
    </div>
  );
}

function CommentEmbedCard({ embed }: { embed: CommentEmbed }) {
  switch (embed.kind) {
    case 'media':
      return <PostMediaEmbed id={embed.id} name={embed.name} poster={embed.poster} type={embed.mediaType} variant="card" />;
    case 'playlist':
      return <PostPlaylistEmbed playlistId={embed.id} size="lg" />;
    case 'tierlist':
      return <PostTierlistEmbed tierlistId={embed.id} />;
    case 'post':
      return <QuotedPostEmbed postId={embed.id} />;
    default:
      return null;
  }
}

/** Interactive poll attached to a comment (mirror of feed PostPollCard). */
function CommentPollCard({ poll }: { poll: CommentPoll }) {
  const vote = useVoteCommentPoll();
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4">
      <Poll
        results={poll.results}
        votesCount={poll.votes_count}
        userVote={poll.user_vote}
        endsAt={poll.ends_at}
        isClosed={poll.is_closed}
        disabled={vote.isPending}
        onVote={(optionIndex) => vote.mutate({ pollId: poll.id, optionIndex })}
      />
    </div>
  );
}
