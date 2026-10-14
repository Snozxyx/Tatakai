import { Flame, Plus } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { UnifiedMediaCard, type UnifiedMediaCardProps } from '@/components/UnifiedMediaCard';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';

interface NovelTrendingGridProps {
  items: UnifiedMediaCardProps['item'][];
}

const TRENDING_EXPLORE_TO = '/novel/discover?sort=trending';

export const NovelTrendingGrid = memo(function NovelTrendingGrid({ items }: NovelTrendingGridProps) {
  if (!items?.length) return null;
  const display = items.slice(0, 10);
  return <section className="mb-12 md:mb-24" aria-label="Hype and trending">
    <HomeSectionHeading
      icon={<Flame className="h-5 w-5 text-primary" />}
      title="Hype & Trending"
      subtitle="The ten hottest novels right now"
      viewAllTo={TRENDING_EXPLORE_TO}
    />
    <div data-mobile-home-rail className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
      {display.map((item, index) => <div key={item.id} className="w-36 shrink-0 sm:w-44 md:w-48">
        <UnifiedMediaCard item={item} rank={index + 1} />
      </div>)}
      {/* Poster-size "Show more" card to the filterable trending catalogue */}
      <Link
        to={TRENDING_EXPLORE_TO}
        aria-label="Show more trending novels"
        className="w-36 shrink-0 sm:w-44 md:w-48"
      >
        <span className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] transition-colors hover:border-primary/50 hover:bg-primary/[0.06]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Plus className="h-6 w-6" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Show more
          </span>
        </span>
        <span className="mt-2.5 block px-0.5 text-sm font-bold leading-snug text-white/45">
          Trending
        </span>
      </Link>
    </div>
  </section>;
});
