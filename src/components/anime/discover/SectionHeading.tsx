/**
 * The one section header for the v6 surfaces (docs/image-8.png).
 *
 * The old pages each rolled their own — a coloured lucide icon next to a bold
 * `h2`, in a different hue per section — which is what made the trending page
 * read as a stack of unrelated widgets. Here the hierarchy is carried by size
 * and the theme's accent eyebrow, so every section on every page lines up.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  /** Small uppercase line above the title. */
  eyebrow?: string;
  title: string;
  /** Right-aligned muted line, e.g. `50 titles`. */
  meta?: string;
  /** Right-aligned control — a link, a pill row. Replaces `meta` visually. */
  action?: ReactNode;
  className?: string;
}

export function SectionHeading({ eyebrow, title, meta, action, className }: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display mt-1.5 text-2xl font-black tracking-tight text-foreground sm:text-[1.75rem]">
          {title}
        </h2>
      </div>
      {action ?? (meta && <p className="text-xs font-medium text-white/40">{meta}</p>)}
    </div>
  );
}
