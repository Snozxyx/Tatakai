import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * ParagraphComments — WebNovel-style per-paragraph threads.
 *
 * Each paragraph gets a hover/affordable comment affordance (count badge on
 * desktop, tap gutter on mobile). Threads reuse the global `Comments` system
 * keyed by `${novelId}:p${paragraphIndex}` so no new backend is needed.
 */
import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Comments } from '@/components/comments/Comments';
import { cn } from '@/lib/utils';

export function ParagraphCommentButton({
  novelId,
  paragraphIndex,
  count,
  onOpen,
}: {
  novelId: string;
  paragraphIndex: number;
  count?: number;
  onOpen: () => void;
}) {
  useUiTranslation();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      title={count ? uiI18n.t('app.i18n_value_0_comments_on_this_paragraph_7eabefc2', { value0: count }) : uiI18n.t('app.comment_on_this_paragraph_5f528479')}
      aria-label={uiI18n.t('app.comments_on_paragraph_i18n_value_0_62fa9ac8', { value0: paragraphIndex + 1 })}
      className={cn(
        'paragraph-comment-btn flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold transition-all',
        count && count > 0
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground/0 hover:border-white/15 hover:bg-white/5 hover:text-muted-foreground focus-visible:text-muted-foreground',
      )}
    >
      <MessageSquare className="w-3 h-3" />
      {count ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}

export function ParagraphThread({
  novelId,
  paragraphIndex,
  paragraphText,
  onClose,
}: {
  novelId: string;
  paragraphIndex: number;
  paragraphText: string;
  onClose: () => void;
}) {
  useUiTranslation();
  const threadId = `${novelId}:p${paragraphIndex}`;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 my-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-xs text-muted-foreground line-clamp-2 italic flex-1">“{paragraphText.slice(0, 220)}”</p>
        <button onClick={onClose} className="text-xs font-bold text-muted-foreground hover:text-foreground shrink-0">
          {uiI18n.t('app.close_bbfa773e')}
        </button>
      </div>
      <Comments sourceKind="novel" entityType="manga" entityId={threadId} entityName={`Paragraph ${paragraphIndex + 1}`} />
    </div>
  );
}

export function useParagraphCommentCounts(novelId: string | undefined, chapterKey: string | undefined) {
  useUiTranslation();
  // Counts resolve lazily per open thread (the Comments system owns storage);
  // this hook is the seam where a batched count query can land later.
  void novelId;
  void chapterKey;
  const [counts] = useState<Record<number, number>>({});
  return counts;
}
