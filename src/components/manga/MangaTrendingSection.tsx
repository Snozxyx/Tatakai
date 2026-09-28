/**
 * The manga/manhwa block on the v6 surfaces — the trending page, the
 * recommendations page and collections (docs/Plans.md §2 — "Cards (improve
 * polish and consistency)").
 *
 * It used to be a horizontal scroller of 140px tiles: the titles sat inside the
 * scroll container and clipped against its bottom edge, and each tab painted
 * itself a different off-palette gradient (violet, sky, emerald) that matched
 * nothing else in the app. It is now the same furniture as every other v6
 * block — `SectionHeading`, a `PillGroup` of tabs and the shared `PosterCard` in
 * the standard poster grid — so a manga card and an anime card are one object,
 * with one rank ramp and one score badge.
 *
 * Ranks show on the two charts and not on "New Chapters": that tab is ordered by
 * recency, and a numbered badge would claim a chart position it does not have.
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
import {
  getLatestMangaUpdates,
  getTrendingManga,
  getTrendingManhwa,
} from '@/core/content/manga-client';
import { mangaCardToPosterItem } from './mangaPosterItem';

type MangaTab = 'manga' | 'manhwa' | 'latest';

interface MangaTrendingSectionProps {
  title?: string;
  /** Which chart opens first. */
  defaultTab?: MangaTab;
  /** Max cards to render. */
  limit?: number;
  /** Off pins the section to `defaultTab` and fetches only that chart. */
  showTabs?: boolean;
  className?: string;
}

const TABS: ReadonlyArray<PillOption<MangaTab>> = [
  { id: 'manga', label: 'Manga', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'manhwa', label: 'Manhwa', icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: 'latest', label: 'New Chapters', icon: <Clock className="h-3.5 w-3.5" /> },
];

/** The line under the heading, so the tabs are not the only label. */
const DESCRIPTION: Record<MangaTab, string> = {
  manga: 'Top-rated trending manga',
  manhwa: 'Korean webtoon charts',
  latest: 'Recently updated chapters',
};

/** Recency is not a ranking, so the badge stays off that tab. */
const RANKED: Record<MangaTab, boolean> = { manga: true, manhwa: true, latest: false };

export function MangaTrendingSection({
  title = 'Trending manga & manhwa',
  defaultTab = 'manga',
  limit = 18,
  showTabs = true,
  className,
}: MangaTrendingSectionProps) {
  const [activeTab, setActiveTab] = useState<MangaTab>(defaultTab);

  /**
   * With the tabs hidden only the pinned chart is ever shown, so the other two
   * requests are dead weight — and the pinned one has to be enabled whichever
   * tab it is, which the old unconditional `manga` query got wrong.
   */
  const wants = (tab: MangaTab) => showTabs || activeTab === tab;

  const { data: mangaData = [], isLoading: loadingManga } = useQuery({
    queryKey: ['trending-manga', limit],
    queryFn: () => getTrendingManga(limit),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: wants('manga'),
  });

  const { data: manhwaData = [], isLoading: loadingManhwa } = useQuery({
    queryKey: ['trending-manhwa', limit],
    queryFn: () => getTrendingManhwa(limit),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: wants('manhwa'),
  });

  const { data: latestData = [], isLoading: loadingLatest } = useQuery({
    queryKey: ['latest-manga-updates', limit],
    queryFn: () => getLatestMangaUpdates(limit),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: wants('latest'),
  });

  const active =
    activeTab === 'manga' ? mangaData : activeTab === 'manhwa' ? manhwaData : latestData;

  const isLoading =
    activeTab === 'manga' ? loadingManga : activeTab === 'manhwa' ? loadingManhwa : loadingLatest;

  const items = useMemo(
    () => active.slice(0, limit).map((manga, index) => mangaCardToPosterItem(manga, index)),
    [active, limit],
  );

  return (
    <section className={cn('mb-12', className)}>
      <SectionHeading
        eyebrow="Manga & manhwa"
        title={title}
        action={
          <Link
            to="/manga"
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
            label="Manga chart"
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
            The manga charts could not be reached. Try again in a moment.
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
