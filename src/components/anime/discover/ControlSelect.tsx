/**
 * The dropdown control from docs/image-8.png, generalised.
 *
 * `DiscoverFilterBar` hand-rolls two of these (year, genre) because it only
 * needs two. The manga catalogue needs eight — feed, provider, type, status,
 * sort, year, rating, chapter count — and eight copies of the same
 * trigger/menu/item markup is how the page ended up with eleven raw `<select>`
 * elements in the first place, none of which took the theme.
 *
 * Generic over the option id so callers keep their own unions (`MangaSortFilter`,
 * `MangaFeedTimeWindow`) instead of widening to `string` at the boundary.
 */
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { controlItemClass, controlMenuClass, controlTriggerClass } from './types';

export interface ControlOption<T extends string> {
  value: T;
  label: string;
  /** Appended in a quieter weight, e.g. a facet count. */
  hint?: string;
}

interface ControlSelectProps<T extends string> {
  /** Screen-reader name, and the trigger's text when nothing is selected. */
  label: string;
  value: T;
  options: ReadonlyArray<ControlOption<T>>;
  onChange: (value: T) => void;
  icon?: LucideIcon;
  /** Values that mean "no filter", so the trigger shows `label` instead. */
  neutral?: ReadonlyArray<string>;
  className?: string;
}

export function ControlSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  icon: Icon,
  neutral,
  className,
}: ControlSelectProps<T>) {
  const active = options.find((option) => option.value === value);
  const isNeutral = neutral ? neutral.includes(value) : false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(controlTriggerClass, !isNeutral && 'border-primary/40 text-white', className)}
      >
        {Icon ? <Icon className="h-3.5 w-3.5 opacity-60" /> : null}
        {isNeutral || !active ? label : active.label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={controlMenuClass}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className={controlItemClass}
            onSelect={() => onChange(option.value)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{option.label}</span>
              {option.hint ? (
                <span className="shrink-0 text-xs text-white/30">{option.hint}</span>
              ) : null}
            </span>
            {value === option.value ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
