import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Flame } from "lucide-react";
import { searchManga } from "@/core/content/manga-client";
import type { MangaSearchItem, MangaSearchResult } from "@/types/manga";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { inferMangaAdultFlag } from "@/lib/contentSafety";

const SHOWCASE_QUERIES = [
  "Solo Leveling",
  "Blue Box",
];

function toMangaCard(item: MangaSearchItem): UnifiedMediaCardProps["item"] | null {
  const title =
    item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native;
  const id = item.anilistId || item.malId;

  if (!id || !title) return null;

  return {
    id: String(id),
    name: title,
    poster: item.poster || "",
    type: item.mediaType || "manga",
    status: item.status || undefined,
    rating:
      typeof item.score === "number" && Number.isFinite(item.score)
        ? (item.score / 10).toFixed(1)
        : undefined,
    chapters:
      typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : undefined,
    malId: typeof item.malId === "number" ? item.malId : undefined,
    anilistId: typeof item.anilistId === "number" ? item.anilistId : undefined,
    isAdult: inferMangaAdultFlag(item),
    mediaType: "manga",
  };
}

function dedupe(items: UnifiedMediaCardProps["item"][]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.anilistId ?? item.malId ?? item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function IndexMangaShowcase() {
  const { settings: contentSafetySettings } = useContentSafetySettings();

  const showcaseQueries = useQueries({
    queries: SHOWCASE_QUERIES.map((term) => ({
      queryKey: ["index-manga-showcase", term],
      queryFn: (): Promise<MangaSearchResult> => searchManga(term, 1, 12),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const showcaseCards = useMemo(() => {
    const cards = showcaseQueries.flatMap((state) => {
      const results = Array.isArray(state.data?.results) ? state.data.results : [];
      return results
        .filter((item) => {
          const isAdult = inferMangaAdultFlag(item);
          return !isAdult || contentSafetySettings.showAdultEverywhere;
        })
        .map(toMangaCard)
        .filter(Boolean) as UnifiedMediaCardProps["item"][];
    });

    return dedupe(cards).slice(0, 10);
  }, [showcaseQueries, contentSafetySettings.showAdultEverywhere]);

  const isLoading = showcaseQueries.some((queryState) => queryState.isLoading) && showcaseCards.length === 0;

  // Reusable classes to hide scrollbar but keep scroll functionality
  const scrollContainerStyles = "flex gap-4 overflow-x-auto pb-6 pt-2 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";
  
  // Reusable classes for card width to ensure they look good on all screens
  const cardWidthStyles = "w-[140px] md:w-[180px] lg:w-[220px] flex-shrink-0 snap-start";

  return (
    <section className="mb-12 overflow-hidden">
      {/* Section header */}
      <div className="mb-6 flex items-end justify-between gap-3 pr-4">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              Trending Manga
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 ml-7">
              Handpicked titles — open and read immediately.
            </p>
          </div>
        </div>
        <Link
          to="/manga"
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors group"
        >
          Open Hub
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {isLoading ? (
        <div className={scrollContainerStyles}>
          {Array.from({ length: 10 }).map((_, index) => (
             <div key={index} className={cardWidthStyles}>
               {/* Fixed height ensures skeleton matches the future card sizes roughly */}
               <div className="h-[200px] md:h-[260px] lg:h-[310px] w-full">
                 <CardSkeleton className="w-full h-full" />
               </div>
             </div>
          ))}
        </div>
      ) : showcaseCards.length > 0 ? (
        <div className={scrollContainerStyles}>
          {showcaseCards.map((item) => (
            <div key={`index-manga-${item.id}`} className={cardWidthStyles}>
              <UnifiedMediaCard item={item} />
            </div>
          ))}
          {/* Optional: Add a spacer at the end so the last card doesn't hug the screen edge */}
          <div className="w-4 flex-shrink-0" aria-hidden="true" />
        </div>
      ) : (
        <GlassPanel className="p-5 border border-white/10 mr-4">
          <p className="text-sm text-muted-foreground">Manga cards are loading. Please check again shortly.</p>
        </GlassPanel>
      )}
    </section>
  );
}