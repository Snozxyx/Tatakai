/**
 * The novel block for the trending page — same furniture as the manga block:
 * `SectionHeading`, a `PillGroup` of tabs and the shared `PosterCard` in the
 * standard poster grid.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { PosterCard } from '@/components/anime/discover/PosterCard';
import {
  POSTER_GRID_CLASS,
  PosterGridSkeleton,
} from '@/components/anime/discover/DiscoverPosterGrid';
import { searchNovels, type NovelSearchItem } from '@/core/content/novel-client';
import type { PosterItem } from '@/components/anime/discover/types';

type NovelTab = 'trending' | 'top' | 'new';

interface NovelTrendingSectionProps {
  title?: string;
  /** Which chart opens first. */
  defaultTab?: NovelTab;
  /** Max cards to render. */
  limit?: number;
  /** Off pins the section to `defaultTab` and fetches only that chart. */
  showTabs?: boolean;
  className?: string;
}

const TABS: ReadonlyArray<PillOption<NovelTab>> = [
  { id: 'trending', label: 'Trending', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'top', label: 'Top Rated', icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: 'new', label: 'New & Hot', icon: <Clock className="h-3.5 w-3.5" /> },
];

/** The line under the heading, so the tabs are not the only label. */
const DESCRIPTION: Record<NovelTab, string> = {
  trending: 'Top-trending light novels',
  top: 'Highest-scored novels',
  new: 'Fresh novels heating up',
};

/** Recency is not a ranking, so the badge stays off that tab. */
const RANKED: Record<NovelTab, boolean> = { trending: true, top: true, new: false };

function novelToPosterItem(item: NovelSearchItem, index = 0): PosterItem | null {
  const title =
    item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native || '';
  const id = String(item.id || item.anilistId || item.malId || '').trim();
  if (!title || !id) return null;
  const score = item.score && item.score > 0 ? (item.score / 10).toFixed(1) : undefined;
  const meta = [
    'Novel',
    item.chapters ? `${item.chapters} ch` : undefined,
  ]
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
  return {
    key: `${id}-${index}`,
    href: `/novel/${id}`,
    title,
    poster: item.poster ?? '',
    meta: meta || undefined,
    score,
  };
}

export function NovelTrendingSection({
  title = 'Trending novels',
  defaultTab = 'trending',
  limit = 18,
  showTabs = true,
  className,
}: NovelTrendingSectionProps) {
  const [activeTab, setActiveTab] = useState<NovelTab>(defaultTab);

  const wants = (tab: NovelTab) => showTabs || activeTab === tab;

  const { data: trendingData = [], isLoading: loadingTrending } = useQuery({
    queryKey: ['trending-novels', limit],
    queryFn: async () => (await searchNovels('', 1, limit, { sort: 'TRENDING_DESC' }).catch(() => null))?.results ?? [],
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: wants('trending'),
  });

  const { data: topData = [], isLoading: loadingTop } = useQuery({
    queryKey: ['top-novels', limit],
    queryFn: async () => (await searchNovels('', 1, limit, { sort: 'SCORE_DESC' }).catch(() => null))?.results ?? [],
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: wants('top'),
  });

  const { data: newData = [], isLoading: loadingNew } = useQuery({
    queryKey: ['new-novels', limit],
    queryFn: async () => (await searchNovels('', 1, limit, { sort: 'POPULARITY_DESC' }).catch(() => null))?.results ?? [],
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: wants('new'),
  });

  const active =
    activeTab === 'trending' ? trendingData : activeTab === 'top' ? topData : newData;

  const isLoading =
    activeTab === 'trending' ? loadingTrending : activeTab === 'top' ? loadingTop : loadingNew;

  const items = useMemo(
    () =>
      active
        .slice(0, limit)
        .map((novel, index) => novelToPosterItem(novel, index))
        .filter((x): x is PosterItem => Boolean(x)),
    [active, limit],
  );

  return (
    <section className={cn('mb-12', className)}>
      <SectionHeading
        eyebrow="Light novels"
        title={title}
        action={
          <Link
            to="/novel"
            className="group inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-white/45 transition-colors hover:text-white"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {showTabs && (
          <PillGroup
            options={TABS}
            value={activeTab}
            // Wrapped rather than passed as the setter: `SetStateAction` also
            // accepts an updater, and that widens the pill group's id to `string`.
            onChange={(id) => setActiveTab(id)}
            label="Novel chart"
          />
        )}
        <p className="text-xs font-medium text-white/40">{DESCRIPTION[activeTab]}</p>
      </div>

      {isLoading && items.length === 0 ? (
        <PosterGridSkeleton className="mt-6" count={Math.min(limit, 14)} />
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl border border-white/[0.07] bg-white/[0.02] py-16 text-center">
          <BookOpen className="h-7 w-7 text-white/25" />
          <p className="text-base font-bold text-white/70">No titles on this chart</p>
          <p className="max-w-sm text-sm text-white/40">
            The novel charts could not be reached. Try again in a moment.
          </p>
        </div>
      ) : (
        <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
          {items.map((item, index) => (
            <PosterCard
              key={item.key}
              item={item}
              rank={RANKED[activeTab] ? index + 1 : undefined}
              eager={index < 7}
            />
          ))}
        </div>
      )}
    </section>
  );
}
