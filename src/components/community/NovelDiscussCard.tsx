/**
 * NovelDiscussCard — community surface for novels.
 *
 * A compact card that drops a novel (with chapter context) into feeds, forum
 * prompts and community spaces: cover, title, current chapter, and quick
 * actions (open novel, continue reading, discuss). Pairs with the paragraph
 * threads inside the reader — this is the novel's *public* discussion entry.
 */
import { Link } from 'react-router-dom';
import { BookOpen, MessageSquare, ChevronRight } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getProxiedImageUrl } from '@/lib/api';

export function NovelDiscussCard({
  novelId,
  title,
  poster,
  chapterNumber,
  chapterTitle,
  commentCount,
}: {
  novelId: string;
  title: string;
  poster?: string | null;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  commentCount?: number;
}) {
  const novelHref = `/novel/${encodeURIComponent(novelId)}`;
  return (
    <GlassPanel className="p-3 flex items-center gap-3">
      {poster ? (
        <img
          src={getProxiedImageUrl(poster)}
          alt=""
          className="w-12 h-[72px] rounded-lg object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-[72px] rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Novel discussion</p>
        <Link to={novelHref} className="block truncate text-sm font-black hover:underline">
          {title}
        </Link>
        {(chapterNumber != null || chapterTitle) && (
          <p className="truncate text-xs text-muted-foreground">
            {chapterNumber != null ? `Ch.${chapterNumber}` : ''}
            {chapterTitle ? ` · ${chapterTitle}` : ''}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <Link
            to={novelHref}
            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:brightness-110"
          >
            Open <ChevronRight className="w-3 h-3" />
          </Link>
          {typeof commentCount === 'number' && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageSquare className="w-3 h-3" /> {commentCount}
            </span>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}
