import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState, type RefObject } from 'react';
import { MessageSquareQuote } from 'lucide-react';

interface SelectedQuote { text: string; chapterKey: string; x: number; y: number; }

export function ReaderSelectionComment({ rootRef, chapterKey, onQuote }: {
  rootRef: RefObject<HTMLElement>;
  chapterKey: string;
  onQuote: (text: string, chapterKey: string) => void;
}) {
  useUiTranslation();
  const [quote, setQuote] = useState<SelectedQuote | null>(null);
  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      const root = rootRef.current;
      if (!root || !selection || selection.isCollapsed || !selection.rangeCount) { setQuote(null); return; }
      const element = (node: Node | null) => node instanceof Element ? node : node?.parentElement;
      const start = element(selection.anchorNode)?.closest<HTMLElement>('[data-reader-text]');
      const end = element(selection.focusNode)?.closest<HTMLElement>('[data-reader-text]');
      const selectedChapter = start?.dataset.quoteChapter;
      if (!start || !end || !root.contains(start) || !root.contains(end) || !selectedChapter || selectedChapter !== end.dataset.quoteChapter) { setQuote(null); return; }
      const range = selection.getRangeAt(0);
      // Build the quote from prose only, excluding paragraph buttons/threads.
      const selected = Array.from(root.querySelectorAll<HTMLElement>('[data-reader-text]'))
        .filter(paragraph => paragraph.dataset.quoteChapter === selectedChapter && range.intersectsNode(paragraph))
        .map(paragraph => {
          const part = document.createRange(); part.selectNodeContents(paragraph);
          if (paragraph.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
          if (paragraph.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
          return part.toString();
        }).join('\n\n').trim();
      if (!selected) { setQuote(null); return; }
      const rect = range.getBoundingClientRect();
      const height = window.visualViewport?.height ?? window.innerHeight;
      setQuote({ text: selected.slice(0, 2000), chapterKey: selectedChapter,
        x: Math.max(30, Math.min(window.innerWidth - 30, rect.left + rect.width / 2)),
        y: Math.max(64, Math.min(height - 56, rect.bottom + 8)) });
    };
    document.addEventListener('selectionchange', update);
    document.addEventListener('pointerup', update);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    setQuote(null);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('pointerup', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [chapterKey, rootRef]);
  if (!quote) return null;
  return <button type="button" aria-label={uiI18n.t('app.comment_on_selected_text_a7f95eba')} title={uiI18n.t('app.comment_on_selected_text_a7f95eba')}
    onPointerDown={event => event.preventDefault()}
    onClick={() => { onQuote(quote.text, quote.chapterKey); window.getSelection()?.removeAllRanges(); setQuote(null); }}
    className="fixed z-50 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    style={{ left: quote.x, top: quote.y }}><MessageSquareQuote className="h-5 w-5" /></button>;
}
