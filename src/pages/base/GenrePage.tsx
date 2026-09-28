import { useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Header } from '@/components/layout/Header';
import { DiscoverHero } from '@/components/anime/discover/DiscoverHero';
import { DiscoverFilterBar } from '@/components/anime/discover/DiscoverFilterBar';
import { DiscoverPosterGrid } from '@/components/anime/discover/DiscoverPosterGrid';
import { PAGER_CLASS } from '@/components/anime/discover/types';
import {
  DISCOVER_SORTS,
  genreDisplayName,
  resolveGenreSlug,
  useDiscoverMedia,
  type DiscoverSort,
} from '@/hooks/api/useDiscover';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { cn } from '@/lib/utils';

const SORT_IDS = DISCOVER_SORTS.map((s) => s.id);
const isSort = (value: string | null): value is DiscoverSort =>
  !!value && (SORT_IDS as string[]).includes(value);

const toSlug = (genre: string) => genre.toLowerCase().replace(/\s+/g, '-');

/**
 * Genre / discover surface, rebuilt to docs/image-8.png (docs/Plans.md §2).
 *
 * Sort, year and page live in the query string rather than component state so a
 * filtered view can be linked and the browser's back button steps through it;
 * the genre stays in the path, where the rest of the app already links it.
 */
export default function GenrePage() {
  const { genre: genreSlug } = useParams<{ genre?: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const gridTop = useRef<HTMLDivElement>(null);

  const sortParam = params.get('sort');
  const sort: DiscoverSort = isSort(sortParam) ? sortParam : 'for-you';
  const year = Number(params.get('year')) || null;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const resolvedGenre = resolveGenreSlug(genreSlug);
  const { data, isLoading, isFetching } = useDiscoverMedia({ genre: genreSlug, sort, year, page });
  const media = data?.media ?? [];
  const pageInfo = data?.pageInfo;

  const heading = useMemo(
    () => (genreSlug ? `${genreDisplayName(genreSlug)} anime` : 'Browse everything'),
    [genreSlug],
  );

  /** Filter changes reset paging — page 4 of one filter is meaningless in another. */
  const patch = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    Object.entries(next).forEach(([key, value]) => {
      if (value === null) merged.delete(key);
      else merged.set(key, value);
    });
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  const goToPage = (next: number) => {
    patch({ page: String(next) });
    gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />

      <main
        className={cn(
          'relative z-10 mx-auto max-w-[1800px] px-4 py-6 pb-24 sm:px-6 md:pb-6',
          isDesktopApp ? 'md:pl-6' : 'md:pl-32',
        )}
      >
        <Header />

        <DiscoverHero className="mt-2" />

        <div ref={gridTop} className="scroll-mt-6 pt-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight capitalize sm:text-3xl">
                {heading}
              </h2>
              {pageInfo && pageInfo.total > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {pageInfo.total.toLocaleString()} titles · page {pageInfo.currentPage} of{' '}
                  {pageInfo.lastPage.toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <DiscoverFilterBar
            className="mb-8"
            sort={sort}
            onSortChange={(next) => patch({ sort: next === 'for-you' ? null : next })}
            year={year}
            onYearChange={(next) => patch({ year: next ? String(next) : null })}
            genre={resolvedGenre}
            onGenreChange={(next) => {
              const query = params.toString();
              const suffix = query ? `?${query}` : '';
              navigate(next ? `/genre/${toSlug(next)}${suffix}` : `/genre${suffix}`);
            }}
          />

          {media.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.07] bg-white/[0.02] py-24 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground/60" />
              <p className="mt-4 text-lg font-semibold">Nothing matches those filters</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {year
                  ? `No ${resolvedGenre ?? 'anime'} titles from ${year}. Try “Any year”.`
                  : 'Try a different genre or sort order.'}
              </p>
            </div>
          ) : (
            <DiscoverPosterGrid media={media} isLoading={isLoading} preview className={cn(isFetching && 'opacity-70 transition-opacity')} />
          )}

          {pageInfo && pageInfo.lastPage > 1 && (
            <nav className="mt-14 flex items-center justify-center gap-3" aria-label="Pagination">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className={PAGER_CLASS}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="min-w-24 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                {pageInfo.currentPage} / {pageInfo.lastPage.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={!pageInfo.hasNextPage}
                className={PAGER_CLASS}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          )}
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
