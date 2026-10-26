import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DetailedComment } from '@/hooks/user/useUserCommentsDetailed';
import { CommentContent } from '@/components/comments/CommentContent';
import { CommentAttachments } from '@/components/comments/CommentAttachments';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { formatDistanceToNow } from '@/lib/localeFormat';

export function CommentFeedCard({ comment }: { comment: DetailedComment }) {
  const [revealed, setRevealed] = useState(false);
  const { t } = useTranslation();
  const kind = comment.source_kind ?? comment.entity_type;
  const author = comment.author;
  const authorName = author?.display_name || author?.username || 'Member';
  const profileTarget = author?.username ? `/@${author.username}` : comment.target;
  return (
    <div data-mobile-community-post>
      <GlassPanel className="relative flex flex-col gap-4 border border-white/5 p-4 transition-colors duration-150 hover:border-white/15 sm:p-5">
        <div className="flex items-start gap-3">
          <Link to={profileTarget} className="mt-0.5 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <CosmeticAvatar userId={comment.user_id} className="h-11 w-11 ring-1 ring-white/10">
              <AvatarImage src={author?.avatar_url || undefined} className="object-cover" />
              <AvatarFallback>{authorName[0]?.toUpperCase() || 'U'}</AvatarFallback>
            </CosmeticAvatar>
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={profileTarget} className="block truncate text-[15px] font-bold text-foreground underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <CosmeticName userId={comment.user_id}>{authorName}</CosmeticName>
            </Link>
            <time dateTime={comment.created_at} className="mt-0.5 block text-[13px] text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </time>
          </div>
        </div>
        <Link to={comment.target} className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          {t('community.commentSource', { title: comment.title, kind, defaultValue: 'Comment from {{title}} ({{kind}})' })}
        </Link>
        {!revealed ? (
          <button type="button" onClick={() => setRevealed(true)} className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl bg-muted/40 px-4 py-5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <EyeOff aria-hidden="true" className="h-5 w-5" />
            {t('community.revealComment', { defaultValue: 'Reveal spoiler' })}
          </button>
        ) : (
          <div className="space-y-3 break-words">
            <CommentContent content={comment.content} clamp />
            {comment.attachments.length > 0 && <CommentAttachments attachments={comment.attachments} />}
            <CommentEmbeds embeds={comment.embeds} poll={comment.poll} />
          </div>
        )}
        <div className="flex items-center border-t border-white/[0.06] pt-2">
          <Link to={comment.target} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <MessageCircle aria-hidden="true" className="h-[18px] w-[18px]" />
            {t('community.openDiscussion', { defaultValue: 'Open discussion' })}
          </Link>
          {revealed && <button type="button" onClick={() => setRevealed(false)} className="ml-auto min-h-11 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            {t('community.hideComment', { defaultValue: 'Hide spoiler' })}
          </button>}
        </div>
      </GlassPanel>
    </div>
  );
}
