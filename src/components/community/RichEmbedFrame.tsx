import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A shared rich-preview surface for post attachments and comment embeds. */
export function RichEmbedFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-full min-w-0 max-w-xl overflow-hidden rounded-xl border border-border/60 border-l-[3px] border-l-primary bg-muted/25 text-foreground', className)}>
    {children}
  </div>;
}
