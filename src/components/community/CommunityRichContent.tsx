import { CommentContent } from '@/components/comments/CommentContent';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';
import { parseCommunityDoc } from '@/lib/communityDoc';
import { cn } from '@/lib/utils';

/**
 * Renders a community's rich long-form field (rules / about / detail) — the
 * formatted body plus any shared media/playlist/tierlist/post embeds — using the
 * exact same renderers the comment feed uses, so a community's info reads like a
 * comment. Returns null when the field is empty. [[community-feed-platform]]
 */
export function CommunityRichContent({
  value,
  className,
  bodyClassName,
}: {
  value?: string | null;
  className?: string;
  bodyClassName?: string;
}) {
  const { content, embeds } = parseCommunityDoc(value);
  if (!content.trim() && embeds.length === 0) return null;
  return (
    <div className={className}>
      {content.trim() && (
        <CommentContent content={content} className={cn('text-white/80', bodyClassName)} />
      )}
      <CommentEmbeds embeds={embeds} />
    </div>
  );
}
