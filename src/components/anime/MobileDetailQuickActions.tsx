import type { ReactNode } from 'react';

/** Keep the main action and entry list within reach on narrow detail pages. */
export function MobileDetailQuickActions({ children, target, label }: {
  children: ReactNode;
  target: string;
  label: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 md:hidden">
      {children}
      <a href={`#${target}`} className="flex min-h-11 items-center justify-center rounded-full border border-border bg-muted/50 px-4 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        {label}
      </a>
    </div>
  );
}
