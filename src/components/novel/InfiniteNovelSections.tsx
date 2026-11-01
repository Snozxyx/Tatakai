import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/skeleton-custom';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { useInfiniteNovelSections, useNovelSectionItems, type NovelSection, type NovelSectionLayout } from '@/hooks/api/useInfiniteNovelSections';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';

function SectionSkeleton({ layout }: { layout: NovelSectionLayout }) {
  useUiTranslation();
  void layout;
  return (
    <div className="animate-pulse">
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
          <div key={i} className="media-card-rail-item space-y-3">
            <CardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionContent({ section, isMobile }: { section: NovelSection; isMobile: boolean }) {
  useUiTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    items: sectionItems,
    isFetching,
    hasMore,
    sentinelRef,
  } = useNovelSectionItems(section.id);

  const listItems = useMemo(() => Array.from(new Map(section.items.concat(sectionItems).map(item => [item.id, item])).values()), [section.items, sectionItems]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -420 : 420;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

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
              aria-label={uiI18n.t('app.scroll_left_2c9e5a60')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="absolute -right-3.5 top-[40%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 border border-white/15 text-white/90 shadow-xl backdrop-blur-md flex items-center justify-center opacity-0 group-hover/section:opacity-100 hover:scale-110 hover:bg-black transition-all"
              aria-label={uiI18n.t('app.scroll_right_2994b49c')}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <div
          ref={scrollRef}
          data-mobile-home-rail
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth"
        >
          {listItems.map((item, i) => (
            <motion.div
              key={`${item.id}-${i}`}
              className="media-card-rail-item"
              initial={isMobile ? false : { opacity: 0, y: 10 }}
              animate={isMobile ? {} : { opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
            >
              <UnifiedMediaCard item={item} />
            </motion.div>
          ))}

          {hasMore && <div ref={sentinelRef} className="flex w-8 shrink-0 items-center justify-center" aria-hidden="true">
            {isFetching && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
          </div>}
        </div>
      </div>
    </div>
  );
}

export function InfiniteNovelSections() {
  useUiTranslation();
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : true;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteNovelSections();

  /**
   * Flattened once, and keyed by the shelf's stable slug so a shelf can't render
   * twice if two pages happen to overlap.
   */
  const sections = useMemo(() => {
    const seen = new Set<string>();
    const flat: NovelSection[] = [];
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
      <div className="space-y-8 md:space-y-12">
        <SectionSkeleton layout="featured" />
        <SectionSkeleton layout="carousel" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <p className="text-muted-foreground">{uiI18n.t('app.failed_to_load_more_sections_406937e6')}</p>
        <Button onClick={() => fetchNextPage()} variant="outline">{uiI18n.t('app.try_again_cef2fe09')}</Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-8 md:space-y-12 mt-8 md:mt-12")}>
      {sections.map((section) => (
        <section key={section.id} className="relative w-full">
          {(() => {
            const genreSlug = section.genre
              ? section.genre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
              : '';
            const genreUrl = genreSlug ? `/novel/genre/${genreSlug}` : '/novel/discover';

            return (
              <HomeSectionHeading
                icon={section.icon ? <section.icon className="w-5 h-5 text-primary" /> : undefined}
                title={section.title}
                action={
                  <Link
                    to={genreUrl}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider self-start sm:self-center px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/15 shrink-0"
                  >
                    <span>{uiI18n.t('app.explore_all_a47b25b9')} {section.genre}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                }
              />
            );
          })()}

          <SectionContent section={section} isMobile={isMobile} />
        </section>
      ))}

      <div ref={loadMoreRef} className="h-16 flex items-center justify-center">
        {isFetchingNextPage ? (
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        ) : hasNextPage ? (
          <div className="text-muted-foreground/50 text-sm font-medium">{uiI18n.t('app.scroll_for_more_f7f1bb4e')}</div>
        ) : (
          <div className="text-muted-foreground/50 text-sm font-medium">{uiI18n.t('app.you_ve_reached_the_end_2fa88e43')}</div>
        )}
      </div>
    </div>
  );
}
