import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { cn } from "@/lib/utils";
import { searchManga } from "@/core/content/manga-client";
import type { MangaSearchItem, MangaSearchResult } from "@/types/manga";
import { UnifiedMediaCard, UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { MangaHeroSection } from "@/components/manga/MangaHeroSection";
import { MangaTrendingGrid } from "@/components/manga/MangaTrendingGrid";
import { InfiniteMangaSections } from "@/components/manga/InfiniteMangaSections";
import { IndexMangaShowcase } from "@/components/manga/IndexMangaShowcase";
import { LastReadMangaSection } from "@/components/manga/LastReadMangaSection";
import { MangaGenreSlider } from "@/components/manga/MangaGenreSlider";
import { MangaDiscoveryQuickFilters } from "@/components/manga/MangaDiscoveryQuickFilters";
import { MangaDiscoveryLane } from "@/components/manga/MangaDiscoveryLane";


function toUnifiedMangaCard(
  manga: MangaSearchItem,
  options?: { isAdult?: boolean; blurAdult?: boolean },
): UnifiedMediaCardProps["item"] | null {
  const displayTitle =
    manga.canonicalTitle || manga.title?.english || manga.title?.romaji || manga.title?.native;
  const id = manga.id || (manga.anilistId ? `anilist:${manga.anilistId}` : manga.malId ? `mal:${manga.malId}` : "");
  if (!id || !displayTitle) return null;

  return {
    id: String(id),
    name: displayTitle,
    poster: manga.poster || "",
    type: manga.mediaType || "manga",
    status: manga.status || undefined,
    rating:
      typeof manga.score === "number" && Number.isFinite(manga.score)
        ? (manga.score / 10).toFixed(1)
        : undefined,
    chapters:
      typeof manga.chapters === "number" && manga.chapters > 0 ? manga.chapters : undefined,
    malId: typeof manga.malId === "number" ? manga.malId : undefined,
    anilistId: typeof manga.anilistId === "number" ? manga.anilistId : undefined,
    isAdult: options?.isAdult,
    blurAdult: options?.blurAdult,
    mediaType: "manga",
  };
}

function dedupeCards(items: UnifiedMediaCardProps["item"][]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.anilistId ?? item.malId ?? item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function MangaHomePage() {
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } = useContentSafetySettings();
  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  const queries = useQueries({
    queries: [
      {
        queryKey: ["manga-home-recommended"],
        queryFn: (): Promise<MangaSearchResult> =>
          searchManga("", 1, 12, { mode: "recommendation", sort: "SCORE_DESC" }),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ["manga-home-trending"],
        queryFn: (): Promise<MangaSearchResult> =>
          searchManga("", 1, 12, { mode: "popular", sort: "TRENDING_DESC" }),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ["manga-home-adult-section-latest", canShowAdultEverywhere],
        queryFn: (): Promise<MangaSearchResult> =>
          searchManga("", 1, 24, {
            mode: "latest",
            sort: "UPDATED_AT_DESC",
            adult: true,
            requiresQuery: false,
          }),
        staleTime: 3 * 60 * 1000,
        enabled: canShowAdultEverywhere,
      },
      {
        queryKey: ["manga-home-adult-section-explore", canShowAdultEverywhere],
        queryFn: (): Promise<MangaSearchResult> =>
          searchManga("", 1, 24, {
            mode: "explore",
            sort: "POPULARITY_DESC",
            adult: true,
            requiresQuery: false,
          }),
        staleTime: 5 * 60 * 1000,
        enabled: canShowAdultEverywhere,
      },
    ],
  });

  const spotlightCards = useMemo(() => {
    const data = queries[0]?.data?.results;
    if (!Array.isArray(data)) return [];
    
    const mapped = data
      .filter(item => !inferMangaAdultFlag(item) || canShowAdultEverywhere)
      .map(item => toUnifiedMangaCard(item, { isAdult: inferMangaAdultFlag(item) }))
      .filter(Boolean) as UnifiedMediaCardProps["item"][];
    
    return dedupeCards(mapped).slice(0, 8);
  }, [queries, canShowAdultEverywhere]);

  const trendingCards = useMemo(() => {
    const data = queries[1]?.data?.results;
    if (!Array.isArray(data)) return [];

    const mapped = data
      .filter(item => !inferMangaAdultFlag(item) || canShowAdultEverywhere)
      .map(item => toUnifiedMangaCard(item, { isAdult: inferMangaAdultFlag(item) }))
      .filter(Boolean) as UnifiedMediaCardProps["item"][];
    
    return dedupeCards(mapped).slice(0, 8);
  }, [queries, canShowAdultEverywhere]);

  const adultCards = useMemo(() => {
    const latestRows = Array.isArray(queries[2]?.data?.results) ? queries[2].data.results : [];
    const exploreRows = Array.isArray(queries[3]?.data?.results) ? queries[3].data.results : [];
    const data = [...latestRows, ...exploreRows];
    if (data.length === 0) return [];

    const mapped = data
      .map((item) => toUnifiedMangaCard(item, { isAdult: true }))
      .filter(Boolean) as UnifiedMediaCardProps["item"][];

    return dedupeCards(mapped).slice(0, 12);
  }, [queries]);

  const isInitialLoading = queries[0].isLoading || queries[1].isLoading;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {!isNative && <Background />}
      {!isNative && <Sidebar />}

      <main className={cn(
        "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isNative ? "pl-6" : "pl-6 md:pl-32"
      )}>
        <Header />

        {isInitialLoading ? (
          <div className="space-y-12 mt-6 animate-pulse">
            {/* Hero Banner Skeleton */}
            <div className="relative w-full aspect-[21/9] md:aspect-[21/7] rounded-3xl bg-muted/40 overflow-hidden border border-white/5 flex items-end p-6 md:p-10">
              <div className="space-y-4 max-w-xl">
                <div className="w-28 h-6 bg-white/10 rounded-full" />
                <div className="w-3/4 h-10 md:h-14 bg-white/15 rounded-2xl" />
                <div className="w-1/2 h-4 bg-white/10 rounded-lg" />
                <div className="w-36 h-12 bg-white/20 rounded-full mt-4" />
              </div>
            </div>

            {/* Quick Filters Skeleton */}
            <div className="flex items-center gap-3 overflow-hidden py-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-28 h-10 bg-muted/40 rounded-xl flex-shrink-0" />
              ))}
            </div>

            {/* First Grid Row Skeleton */}
            <div>
              <div className="w-48 h-7 bg-muted/50 rounded-lg mb-4" />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={`row1-${i}`} />
                ))}
              </div>
            </div>

            {/* Second Grid Row Skeleton */}
            <div>
              <div className="w-56 h-7 bg-muted/50 rounded-lg mb-4" />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={`row2-${i}`} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {spotlightCards.length > 0 && (
              <MangaHeroSection 
                spotlight={spotlightCards[0]} 
                spotlights={spotlightCards} 
              />
            )}

            <LastReadMangaSection />

            {/* Discovery Lane Section */}
            {trendingCards.length > 0 && (
              <MangaDiscoveryLane items={[...trendingCards, ...spotlightCards]} />
            )}

            <IndexMangaShowcase />

            <MangaGenreSlider />

            <MangaDiscoveryQuickFilters />


            <section className="mb-12 md:mb-16">
              <div className="relative overflow-hidden rounded-3xl border border-rose-500/30">
                <img
                  src="/manga18+.jpg"
                  alt="18+ Manga Banner"
                  className="h-44 w-full object-cover md:h-56"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/70" />
                <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-7">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-100/90">18+ Zone</p>
                  <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-white">
                    Hentai & Mature Manga
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/80">
                    This section stays hidden unless you confirm you are 18+ and explicitly opt in.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!canShowAdultEverywhere ? (
                      <button
                        onClick={() => navigate("/settings?tab=privacy#mature-content-controls")}
                        className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-400 transition-colors"
                      >
                        Open 18+ Settings
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          updateContentSafetySettings({
                            showAdultEverywhere: false,
                            warnBeforeAdultOpen: true,
                          })
                        }
                        className="rounded-xl border border-white/30 bg-black/40 px-4 py-2 text-sm font-bold text-white hover:bg-black/60 transition-colors"
                      >
                        Hide 18+ Section
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {canShowAdultEverywhere && (
                <div className="mt-6">
                  <h3 className="mb-3 text-lg md:text-xl font-black tracking-tight">Mature Picks</h3>

                  {queries[2].isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <CardSkeleton key={`adult-skeleton-${index}`} />
                      ))}
                    </div>
                  ) : queries[3].isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <CardSkeleton key={`adult-skeleton-${index}`} />
                      ))}
                    </div>
                  ) : adultCards.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {adultCards.map((item) => (
                        <UnifiedMediaCard key={`manga-adult-${item.id}`} item={item} />
                      ))}
                    </div>
                  ) : (
                    <GlassPanel className="p-5 border border-rose-500/20">
                      <p className="text-sm text-muted-foreground">
                        No mature titles were returned right now. Open settings to adjust mature filters and warnings.
                      </p>
                      <button
                        onClick={() => navigate("/settings?tab=privacy#mature-content-controls")}
                        className="mt-3 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-white/10 transition-colors"
                      >
                        Open Privacy Settings
                      </button>
                    </GlassPanel>
                  )}
                </div>
              )}
            </section>
            
            {trendingCards.length > 0 && (
              <MangaTrendingGrid items={trendingCards} />
            )}

            <InfiniteMangaSections />
          </>
        )}
      </main>

      {!isNative && <MobileNav />}
    </div>
  );
}
