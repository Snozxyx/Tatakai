import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { cn } from "@/lib/utils";
import { searchManga } from "@/services/manga.service";
import type { MangaSearchItem, MangaSearchResult } from "@/types/manga";
import { UnifiedMediaCard, UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useContentSafetySettings } from "@/hooks/useContentSafetySettings";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { MangaHeroSection } from "@/components/manga/MangaHeroSection";
import { MangaTrendingGrid } from "@/components/manga/MangaTrendingGrid";
import { InfiniteMangaSections } from "@/components/manga/InfiniteMangaSections";
import { IndexMangaShowcase } from "@/components/manga/IndexMangaShowcase";
import { LastReadMangaSection } from "@/components/manga/LastReadMangaSection";
import { MangaGenreSlider } from "@/components/manga/MangaGenreSlider";
import { MangaDiscoveryQuickFilters } from "@/components/manga/MangaDiscoveryQuickFilters";
import { CuratedMangaSections } from "@/components/manga/CuratedMangaSections";

const TRENDING_QUERIES = ["Solo Leveling", "Jujutsu Kaisen", "Blue Lock", "Oshi no Ko", "Lookism"];
const RECOMMENDED_QUERIES = ["Frieren", "Blue Box", "Dandadan", "Sakamoto Days", "Kaiju No. 8"];

function getDayOfYear(value: Date) {
  const start = new Date(value.getFullYear(), 0, 0);
  const diff = value.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

function toUnifiedMangaCard(
  manga: MangaSearchItem,
  options?: { isAdult?: boolean; blurAdult?: boolean },
): UnifiedMediaCardProps["item"] | null {
  const displayTitle =
    manga.canonicalTitle || manga.title?.english || manga.title?.romaji || manga.title?.native;
  const id = manga.anilistId || manga.malId || manga.id;
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

  const daySeed = useMemo(() => getDayOfYear(new Date()), []);
  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  const activeTrendingQuery = useMemo(() => TRENDING_QUERIES[(daySeed) % TRENDING_QUERIES.length], [daySeed]);
  const activeRecommendedQuery = useMemo(() => RECOMMENDED_QUERIES[(daySeed * 3) % RECOMMENDED_QUERIES.length], [daySeed]);

  const queries = useQueries({
    queries: [
      {
        queryKey: ["manga-home-recommended", activeRecommendedQuery],
        queryFn: (): Promise<MangaSearchResult> => searchManga(activeRecommendedQuery, 1, 10),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ["manga-home-trending", activeTrendingQuery],
        queryFn: (): Promise<MangaSearchResult> => searchManga(activeTrendingQuery, 1, 10),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ["manga-home-adult-section-latest", canShowAdultEverywhere],
        queryFn: (): Promise<MangaSearchResult> =>
          searchManga("", 1, 24, {
            provider: "atsu",
            mode: "latest",
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
            provider: "atsu",
            mode: "explore",
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-24">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
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

            <IndexMangaShowcase />

            <MangaGenreSlider />

            <MangaDiscoveryQuickFilters />

            <CuratedMangaSections />

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