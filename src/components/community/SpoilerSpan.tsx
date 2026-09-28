import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Click-to-reveal inline spoiler. Hidden state blurs + boxes its children so
 * even nested colored nodes (mentions, links) stay obscured; a click or
 * Enter/Space reveals it. Shared by both render paths — post HTML
 * (`span[data-spoiler]`) and comment markdown (`||text||`).
 */
export function SpoilerSpan({ children }: { children: ReactNode }) {
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
      aria-label={revealed ? undefined : 'Spoiler, click to reveal'}
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
