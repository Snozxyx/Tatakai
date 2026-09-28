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
import type { ReactNode } from 'react';
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

// Fade the scroll edges so an overflowing row reads as scrollable rather than
// clipped. Transparent for the first/last 1.25rem, opaque between.
const SCROLL_FADE_MASK =
  'linear-gradient(to right, transparent, black 1.25rem, black calc(100% - 1.25rem), transparent)';

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: PillGroupProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/30 p-1.5 backdrop-blur-md scrollbar-none',
        className,
      )}
      style={{ WebkitMaskImage: SCROLL_FADE_MASK, maskImage: SCROLL_FADE_MASK }}
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
            className={cn(
              'group inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              active
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                : 'text-white/55 hover:bg-white/[0.06] hover:text-white',
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
