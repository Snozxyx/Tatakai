/**
 * Manga and manhwa picks, driven by the visitor's own genre weights
 * (docs/Plans.md §2 — "Favorites Page").
 *
 * Favorites already knows which genres someone actually finishes — the "Your
 * genres" chips are built from the same `useGenrePreferences` data — so the
 * recommendation here is a genre lookup rather than a second recommender: the
 * top genre opens selected, and the pills let the visitor walk the rest.
 *
 * A genre that comes back empty falls back to the trending chart instead of
 * leaving a hole, and the heading says so, so the row is never silently about
 * something other than what the pill claims.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { PosterCard } from '@/components/anime/discover/PosterCard';
import {
  POSTER_GRID_CLASS,
  PosterGridSkeleton,
} from '@/components/anime/discover/DiscoverPosterGrid';
import { getMangaByGenre, getTrendingManga } from '@/core/content/manga-client';
import { mangaCardToPosterItem } from './mangaPosterItem';

/** Not a genre, so it cannot collide with one coming out of the preferences. */
const TRENDING = '__trending__';

const STALE_TIME = 10 * 60 * 1000;

interface MangaPicksSectionProps {
  /** The visitor's genres, most-watched first. Empty means trending only. */
  genres?: string[];
  /** How many pills the genres get. Four fits beside "Trending" on a phone. */
  maxGenres?: number;
  limit?: number;
  className?: string;
}

export function MangaPicksSection({
  genres = [],
  maxGenres = 4,
  limit = 12,
  className,
}: MangaPicksSectionProps) {
  const options = useMemo<ReadonlyArray<PillOption<string>>>(() => {
    const top = genres.filter(Boolean).slice(0, maxGenres);
    return [
      { id: TRENDING, label: 'Trending', icon: <Flame className="h-3.5 w-3.5" /> },
      ...top.map((genre) => ({ id: genre, label: genre })),
    ];
  }, [genres, maxGenres]);

  /**
   * Null until the visitor picks, rather than seeding state from `genres`: the
   * preferences arrive a tick after mount, and a `useState` initialiser would
   * have latched "Trending" before the top genre existed.
   */
  const [chosen, setChosen] = useState<string | null>(null);
  const active =
    chosen && options.some((option) => option.id === chosen)
      ? chosen
      : (options[1]?.id ?? TRENDING);

  const picks = useQuery({
    queryKey: ['manga-picks', active, limit],
    queryFn: () => (active === TRENDING ? getTrendingManga(limit) : getMangaByGenre(active, limit)),
    staleTime: STALE_TIME,
    gcTime: 30 * 60 * 1000,
  });

  /** Shares the primary query's key when `active` is already trending. */
  const emptyGenre = active !== TRENDING && !picks.isLoading && (picks.data?.length ?? 0) === 0;
  const fallback = useQuery({
    queryKey: ['manga-picks', TRENDING, limit],
    queryFn: () => getTrendingManga(limit),
    enabled: emptyGenre,
    staleTime: STALE_TIME,
    gcTime: 30 * 60 * 1000,
  });

  const isLoading = picks.isLoading || (emptyGenre && fallback.isLoading);

  const items = useMemo(() => {
    const rows = emptyGenre ? (fallback.data ?? []) : (picks.data ?? []);
    return rows.slice(0, limit).map((manga, index) => mangaCardToPosterItem(manga, index));
  }, [emptyGenre, fallback.data, picks.data, limit]);

  const description = emptyGenre
    ? `Nothing tagged ${active} — here is what is trending instead`
    : active === TRENDING
      ? 'The manga and manhwa charts right now'
      : `Popular ${active.toLowerCase()} manga and manhwa`;

  // Nothing to switch between if the manga API is unreachable, so the whole
  // section stays out of the page rather than parking an empty panel in it.
  if (!isLoading && items.length === 0) return null;

  return (
    <section className={cn(className)}>
      <SectionHeading
        eyebrow="Read next"
        title="Manga & manhwa for you"
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
        {options.length > 1 && (
          <PillGroup
            options={options}
            value={active}
            onChange={(id) => setChosen(id)}
            label="Manga genre"
          />
        )}
        <p className="text-xs font-medium text-white/40">{description}</p>
      </div>

      {isLoading && items.length === 0 ? (
        <PosterGridSkeleton className="mt-6" count={Math.min(limit, 12)} />
      ) : (
        <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
          {items.map((item, index) => (
            <PosterCard key={item.key} item={item} eager={index < 7} />
          ))}
        </div>
      )}
    </section>
  );
}
