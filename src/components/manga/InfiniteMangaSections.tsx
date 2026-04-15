import { useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { useInfiniteMangaSections, type MangaSection, type SectionLayout } from '@/hooks/useInfiniteMangaSections';
import { Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContentSafetySettings } from '@/hooks/useContentSafetySettings';

function SectionSkeleton({ layout }: { layout: SectionLayout }) {
  return (
    <div className="mb-16 animate-pulse">
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/5" />
          <div className="h-8 bg-white/5 rounded-lg w-48" />
        </div>
        <div className="h-6 bg-white/5 rounded-md w-20" />
      </div>

      <div className={cn(
        "grid gap-4",
        layout === 'grid' && "grid-cols-2 md:grid-cols-4 lg:grid-cols-6",
        layout === 'carousel' && "flex overflow-hidden",
        layout === 'featured' && "grid-cols-1 md:grid-cols-3",
        layout === 'compact' && "grid-cols-3 md:grid-cols-6 lg:grid-cols-8",
        layout === 'masonry' && "grid-cols-2 md:grid-cols-4 lg:grid-cols-6"
      )}>
        {[...Array(layout === 'compact' ? 8 : 6)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl bg-white/5 border border-white/5",
              layout === 'carousel' ? "flex-shrink-0 w-44 aspect-[3/4]" : "aspect-[3/4]",
              layout === 'featured' && i === 0 && "md:col-span-1 lg:row-span-2 min-h-[400px]",
              layout === 'masonry' && (i === 0 || i === 3) && "md:col-span-2 row-span-2 h-full"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function SectionContent({ section, isMobile }: { section: MangaSection; isMobile: boolean }) {
  const items = section.items.slice(0, 10);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={isMobile ? false : { opacity: 0, scale: 0.9 }}
          animate={isMobile ? {} : { opacity: 1, scale: 1 }}
          transition={{ delay: i * (isMobile ? 0.03 : 0.05), duration: isMobile ? 0.25 : 0.35 }}
        >
          <UnifiedMediaCard item={item} />
        </motion.div>
      ))}
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

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (isFetchingNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });

    if (node) observerRef.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

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
      {data?.pages.map((page, pageIndex) => (
        <div key={pageIndex} className="space-y-16 md:space-y-24">
          {page.sections.map((section) => (
            <section key={section.id} className="relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 px-2">
                <div className="flex items-center gap-3">
                  {section.icon && (
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                      <section.icon className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-2xl md:text-3xl font-display font-black tracking-tight">{section.title}</h2>
                    <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider hidden sm:block">
                      Curated {section.genre}
                    </p>
                  </div>
                </div>
              </div>

              <SectionContent section={section} isMobile={isMobile} />
            </section>
          ))}
        </div>
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