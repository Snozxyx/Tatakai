import { useMemo, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { useInfiniteMangaSections, useMangaSectionItems, type MangaSection, type SectionLayout } from '@/hooks/api/useInfiniteMangaSections';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';

import { ChevronLeft, ChevronRight, ArrowRight, BookOpen, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';

function SectionSkeleton({ layout }: { layout: SectionLayout }) {
  return (
    <div className="mb-16 animate-pulse">
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/5" />
          <div className="space-y-2">
            <div className="h-6 bg-white/5 rounded-lg w-48" />
            <div className="h-3.5 bg-white/5 rounded-md w-28" />
          </div>
        </div>
        <div className="h-8 bg-white/5 rounded-full w-24" />
      </div>

      <div className="flex gap-4 overflow-hidden px-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="w-36 sm:w-44 md:w-48 flex-shrink-0 space-y-3">
            <div className="aspect-[2/3] w-full rounded-2xl bg-white/[0.04] border border-white/5" />
            <div className="h-3.5 w-3/4 rounded bg-white/[0.05]" />
            <div className="h-3 w-1/2 rounded bg-white/[0.03]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionContent({ section, isMobile }: { section: MangaSection; isMobile: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    items: sectionItems,
    loadMore,
    isFetching,
    hasMore,
    sentinelRef,
  } = useMangaSectionItems(section.id, isMobile);

  const listItems = useMemo(() => section.items.concat(sectionItems), [section.items, sectionItems]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -420 : 420;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const genreSlug = section.genre
    ? section.genre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : '';

  return (
    <div className="space-y-4 group/section">
      {/* Horizontal scroll container for the card row */}
      <div className="relative">
        {/* Desktop Carousel Navigation Arrows */}
        {!isMobile && listItems.length > 4 && (
          <>
            <button
              onClick={() => scroll('left')}
              className="absolute -left-3.5 top-[40%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 border border-white/15 text-white/90 shadow-xl backdrop-blur-md flex items-center justify-center opacity-0 group-hover/section:opacity-100 hover:scale-110 hover:bg-black transition-all"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="absolute -right-3.5 top-[40%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 border border-white/15 text-white/90 shadow-xl backdrop-blur-md flex items-center justify-center opacity-0 group-hover/section:opacity-100 hover:scale-110 hover:bg-black transition-all"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth"
        >
          {listItems.map((item, i) => (
            <motion.div
              key={`${item.id}-${i}`}
              className="w-36 sm:w-44 md:w-48 flex-shrink-0"
              initial={isMobile ? false : { opacity: 0, y: 10 }}
              animate={isMobile ? {} : { opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
            >
              <UnifiedMediaCard item={item} variant="poster" />
            </motion.div>
          ))}

          {/* Inline Loading / Sentinel Indicator */}
          {hasMore && (
            <div
              ref={sentinelRef}
              className="w-24 sm:w-32 flex-shrink-0 flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-center"
            >
              {isFetching ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadMore()}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Load more
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function InfiniteMangaSections() {
  const isMobile = window.innerWidth < 768;
  const { settings } = useContentSafetySettings();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteMangaSections({ showAdult: settings.showAdultEverywhere });

  /**
   * Flattened once, and keyed by the server's stable slug so a shelf can't render
   * twice if two pages happen to overlap.
   */
  const sections = useMemo(() => {
    const seen = new Set<string>();
    const flat: MangaSection[] = [];
    for (const page of data?.pages ?? []) {
      for (const section of page.sections) {
        if (seen.has(section.id)) continue;
        seen.add(section.id);
        flat.push(section);
      }
    }
    return flat;
  }, [data]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (isFetchingNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    }, {
      // Start the next page well before the sentinel is visible, so the shelves
      // are already there by the time the user scrolls to them.
      rootMargin: isMobile ? '400px' : '800px',
    });

    if (node) observerRef.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage, isMobile]);

  if (status === 'pending') {
    return (
      <div className="space-y-12">
        <SectionSkeleton layout="featured" />
        <SectionSkeleton layout="carousel" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <p className="text-muted-foreground">Failed to load more sections.</p>
        <Button onClick={() => fetchNextPage()} variant="outline">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-16 md:space-y-24 mt-24">
      {sections.map((section) => (
        <section key={section.id} className="relative w-full">
          {(() => {
            const genreSlug = section.genre
              ? section.genre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
              : '';
            const genreUrl = genreSlug ? `/manga/genre/${genreSlug}` : '/manga/discover';

            return (
              <HomeSectionHeading
                icon={section.icon ? <section.icon className="w-5 h-5 text-primary" /> : undefined}
                title={section.title}
                subtitle={`Curated ${section.genre}`}
                action={
                  <Link
                    to={genreUrl}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider self-start sm:self-center px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/15 shrink-0"
                  >
                    <span>Explore all {section.genre}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                }
              />
            );
          })()}

          <SectionContent section={section} isMobile={isMobile} />
        </section>
      ))}

      <div ref={loadMoreRef} className="h-32 flex items-center justify-center">
        {isFetchingNextPage ? (
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        ) : hasNextPage ? (
          <div className="text-muted-foreground/50 text-sm font-medium">Scroll for more</div>
        ) : (
          <div className="text-muted-foreground/50 text-sm font-medium">You've reached the end</div>
        )}
      </div>
    </div>
  );
}
