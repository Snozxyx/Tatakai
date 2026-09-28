/**
 * The poster grid from docs/image-8.png — seven columns at the design's widest
 * breakpoint, stepping down to two on phones. Cards come from the shared
 * PosterCard so the genre grid, the trending board and favorites all render the
 * same object.
 */
import { cn } from '@/lib/utils';
import { mediaToPosterItem } from '@/hooks/api/useDiscover';
import type { TatakaiMedia } from '@/core/content/types';
import { PosterCard } from './PosterCard';

export const POSTER_GRID_CLASS =
  'grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7';

interface DiscoverPosterGridProps {
  media: TatakaiMedia[];
  isLoading?: boolean;
  /** Skeleton count while the first page loads. */
  skeletonCount?: number;
  /** Hover video previews on every card. See `PosterCard`'s own `preview`. */
  preview?: boolean;
  className?: string;
}

export function PosterGridSkeleton({ count = 14, className }: { count?: number; className?: string }) {
  return (
    <div className={cn(POSTER_GRID_CLASS, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={`poster-skeleton-${i}`}>
          <div className="aspect-[2/3] w-full animate-pulse rounded-2xl border border-white/5 bg-white/[0.04]" />
          <div className="mt-3 h-3.5 w-4/5 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

export function DiscoverPosterGrid({
  media,
  isLoading,
  skeletonCount = 14,
  preview,
  className,
}: DiscoverPosterGridProps) {
  if (isLoading && media.length === 0) {
    return <PosterGridSkeleton count={skeletonCount} className={className} />;
  }

  return (
    <div className={cn(POSTER_GRID_CLASS, className)}>
      {media.map((item, index) => (
        <PosterCard
          key={`${item.anilistId || item.malId || item.titleRomaji}-${index}`}
          item={mediaToPosterItem(item, index)}
          eager={index < 7}
          preview={preview}
        />
      ))}
    </div>
  );
}
