/**
 * The segmented pill row from docs/image-8.png — the discover page's sort
 * options, the trending page's timeframes, the favorites collection filter.
 *
 * Kept generic over the option id so each caller keeps its own union type
 * (`DiscoverSort`, `TimeFrame`) instead of widening to `string` at the boundary.
 * It scrolls rather than wraps on narrow screens: many pills do not fit a phone,
 * and a wrapped row moves the content below it on every render. When the row
 * overflows, the edges fade to signal there is more to scroll to.
 */
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PillOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface PillGroupProps<T extends string> {
  options: ReadonlyArray<PillOption<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Names the group for screen readers, e.g. "Sort" or "Timeframe". */
  label: string;
  className?: string;
}

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: PillGroupProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  const handleKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(group.current?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  return (
    <div
      ref={group}
      onKeyDown={handleKey}
      role="tablist"
      aria-label={label}
      className={cn(
        'flex w-full min-w-0 max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-border bg-muted/50 p-1.5 backdrop-blur-md scrollbar-hide no-scrollbar [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] overscroll-x-contain',
        className,
      )}

    >
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            onClick={() => onChange(option.id)}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={cn(
              'group inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              active
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {option.icon && (
              <span className={cn('transition-opacity', active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100')}>
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
