import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Click-to-reveal inline spoiler. Hidden state blurs + boxes its children so
 * even nested colored nodes (mentions, links) stay obscured; a click or
 * Enter/Space reveals it. Shared by both render paths — post HTML
 * (`span[data-spoiler]`) and comment markdown (`||text||`).
 */
export function SpoilerSpan({ children }: { children: ReactNode }) {
  useUiTranslation();
  const [revealed, setRevealed] = useState(false);

  const reveal = (e: MouseEvent | KeyboardEvent) => {
    if (revealed) return;
    e.preventDefault();
    e.stopPropagation();
    setRevealed(true);
  };

  return (
    <span
      role={revealed ? undefined : 'button'}
      tabIndex={revealed ? undefined : 0}
      aria-label={revealed ? undefined : uiI18n.t('app.spoiler_click_to_reveal_e59237a3')}
      onClick={reveal}
      onKeyDown={(e) => {
        if (!revealed && (e.key === 'Enter' || e.key === ' ')) reveal(e);
      }}
      className={cn(
        'rounded px-1 transition-all duration-200',
        revealed
          ? 'bg-foreground/[0.06]'
          : 'cursor-pointer select-none bg-foreground/15 text-transparent blur-[4px] hover:bg-foreground/20',
      )}
    >
      {children}
    </span>
  );
}
