/**
 * The discover filter row (docs/image-8.png): sort pills, then a year picker
 * and a genre picker.
 *
 * The four sort options map onto SearchFilters.sortBy in useDiscover; the year
 * and genre pickers change the route/query the grid runs, so everything in this
 * bar is real filtering rather than presentation.
 */
import { Check, ChevronDown, Tag } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAniListGenres } from '@/hooks/api/useAniListGenres';
import { DISCOVER_SORTS, discoverYears, type DiscoverSort } from '@/hooks/api/useDiscover';
import { PillGroup } from './PillGroup';
import { controlItemClass, controlMenuClass, controlTriggerClass } from './types';

interface DiscoverFilterBarProps {
  sort: DiscoverSort;
  onSortChange: (sort: DiscoverSort) => void;
  year: number | null;
  onYearChange: (year: number | null) => void;
  /** Resolved genre name, or undefined for "all genres". */
  genre?: string;
  onGenreChange: (genre?: string) => void;
  className?: string;
}

export function DiscoverFilterBar({
  sort,
  onSortChange,
  year,
  onYearChange,
  genre,
  onGenreChange,
  className,
}: DiscoverFilterBarProps) {
  const { genres: anilistGenres } = useAniListGenres();

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <PillGroup options={DISCOVER_SORTS} value={sort} onChange={onSortChange} label="Sort" />

      <DropdownMenu>
        <DropdownMenuTrigger className={controlTriggerClass}>
          {year ?? 'Any year'}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={controlMenuClass}>
          <DropdownMenuItem className={controlItemClass} onSelect={() => onYearChange(null)}>
            Any year
            {year === null && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
          {discoverYears().map((value) => (
            <DropdownMenuItem
              key={value}
              className={controlItemClass}
              onSelect={() => onYearChange(value)}
            >
              {value}
              {year === value && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={controlTriggerClass}>
          <Tag className="h-3.5 w-3.5 opacity-60" />
          {genre ?? 'Genre'}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={controlMenuClass}>
          <DropdownMenuItem className={controlItemClass} onSelect={() => onGenreChange(undefined)}>
            All genres
            {!genre && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
          {anilistGenres.map((value) => (
            <DropdownMenuItem
              key={value}
              className={controlItemClass}
              onSelect={() => onGenreChange(value)}
            >
              {value}
              {genre === value && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
