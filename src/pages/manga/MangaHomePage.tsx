import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettingsModal } from "@/contexts/SettingsModalContext";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { ExtensionContinue } from '@/components/extensions/ExtensionContinue';
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";
import type { MangaSearchItem } from "@/types/manga";
import { UnifiedMediaCard, UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { useMangaHome } from "@/hooks/api/useMangaHome";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { MangaHeroSection } from "@/components/manga/MangaHeroSection";
import { CinematicHeroSkeleton, MobileHomeBackdrop, type CinematicSpotlight } from '@/components/anime/CinematicHero';
import { useMobileAppearance } from '@/hooks/ui/useMobileAppearance';
import { toMangaSpotlight } from '@/lib/mangaSpotlight';
import { MangaTrendingGrid } from "@/components/manga/MangaTrendingGrid";
import { InfiniteMangaSections } from "@/components/manga/InfiniteMangaSections";
import { IndexMangaShowcase } from "@/components/manga/IndexMangaShowcase";
import { LastReadMangaSection } from "@/components/manga/LastReadMangaSection";
import { MangaGenreSlider } from "@/components/manga/MangaGenreSlider";
import { MangaDiscoveryQuickFilters } from "@/components/manga/MangaDiscoveryQuickFilters";
import { MangaSmartDiscover } from "@/components/manga/MangaSmartDiscover";
import { FollowedMangaUpdates } from "@/components/manga/FollowedMangaUpdates";
import { MangaExtraLanes } from "@/components/manga/MangaExtraLanes";


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
    banner: manga.banner,
    logo: manga.logo,
    titleLogo: manga.titleLogo,
    description: manga.description,
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

/**
 * One lane of the home bundle → deduped cards, honouring the mature-content
 * setting. `forceAdult` is for the 18+ lanes, which are already opted into and
 * should be flagged regardless of what the title looks like.
 */
function laneToCards(
  lane: MangaSearchItem[] | undefined,
  limit: number,
  options: { canShowAdult: boolean; forceAdult?: boolean },
): UnifiedMediaCardProps["item"][] {
  if (!Array.isArray(lane)) return [];
  const mapped = lane
    .filter((item) => {
      const format = String(item.format || "").toUpperCase();
      return !format || format === "MANGA" || format === "ONE_SHOT";
    })
    .filter((item) => options.forceAdult || !inferMangaAdultFlag(item) || options.canShowAdult)
    .map((item) =>
      toUnifiedMangaCard(item, { isAdult: options.forceAdult || inferMangaAdultFlag(item) }),
    )
    .filter(Boolean) as UnifiedMediaCardProps["item"][];
  return dedupeCards(mapped).slice(0, limit);
}

export default function MangaHomePage() {
  useUiTranslation();
  const navigate = useNavigate();
  const { openSettings } = useSettingsModal();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();
  const refreshed = useMobileAppearance();
  const [activeSpotlight, setActiveSpotlight] = useState<CinematicSpotlight | null>(null);
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } = useContentSafetySettings();
  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  /**
   * One request for the whole top of the page.
   *
   * This was four `useQueries` lanes — recommended, trending and two mature feeds
   * — each a `/manga/search` call that fetched 12–24 heavy records, upserted 20
   * mapping rows and then walked a sequential Supabase chain per item. The lanes
   * now arrive pre-assembled and cached from `/api/v3/manga/home`, and
   * `IndexMangaShowcase` reads the same query rather than searching for two
   * hardcoded titles of its own.
   */
  const { data: home, isLoading } = useMangaHome();

  // The bundle's spotlight lane is its highest-rated titles, which is what the old
  // "recommendation / SCORE_DESC" lane was asking for.
  const spotlightCards = useMemo(
    () =>
      laneToCards(home?.spotlight?.length ? home.spotlight : home?.topRated, 8, {
        canShowAdult: canShowAdultEverywhere,
      }),
    [home, canShowAdultEverywhere],
  );

  const trendingCards = useMemo(
    () => laneToCards(home?.trending, 12, { canShowAdult: canShowAdultEverywhere }),
    [home, canShowAdultEverywhere],
  );

  const adultCards = useMemo(
    () =>
      laneToCards([...(home?.adultLatest ?? []), ...(home?.adultPopular ?? [])], 12, {
        canShowAdult: true,
        forceAdult: true,
      }),
    [home],
  );

  const isInitialLoading = isLoading && !home;

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-clip">
      {refreshed && spotlightCards.length > 0 && <MobileHomeBackdrop anime={toMangaSpotlight(spotlightCards.find(item => item.id === activeSpotlight?.id) || spotlightCards[0])} />}
      {!isNative && !refreshed && <Background />}
      {!isMobile && <Sidebar />}

      <main data-mobile-home data-manga-home className={cn(
        "app-page relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isDesktopApp ? "pl-6" : "pl-6 md:pl-32"
      )}>
        <Header />

        {isInitialLoading ? (
          <div className="space-y-12 mt-6 animate-pulse">
            {/* Hero Banner Skeleton */}
            {refreshed ? <CinematicHeroSkeleton /> : <div className="relative w-full aspect-[21/9] md:aspect-[21/7] rounded-3xl bg-muted/40 overflow-hidden border border-white/5 flex items-end p-6 md:p-10">
              <div className="space-y-4 max-w-xl">
                <div className="w-28 h-6 bg-white/10 rounded-full" />
                <div className="w-3/4 h-10 md:h-14 bg-white/15 rounded-2xl" />
                <div className="w-1/2 h-4 bg-white/10 rounded-lg" />
                <div className="w-36 h-12 bg-white/20 rounded-full mt-4" />
              </div>
            </div>}

            {/* Quick Filters Skeleton */}
            <div className="flex items-center gap-3 overflow-hidden py-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-28 h-10 bg-muted/40 rounded-xl flex-shrink-0" />
              ))}
            </div>

            {/* First Grid Row Skeleton */}
            <div>
              <div className="w-48 h-7 bg-muted/50 rounded-lg mb-4" />
              <div data-mobile-home-rail className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={`row1-${i}`} />
                ))}
              </div>
            </div>

            {/* Second Grid Row Skeleton */}
            <div>
              <div className="w-56 h-7 bg-muted/50 rounded-lg mb-4" />
              <div data-mobile-home-rail className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                onActiveSpotlightChange={setActiveSpotlight}
              />
            )}

            <LastReadMangaSection />

            <FollowedMangaUpdates />

            <MangaSmartDiscover />

            <IndexMangaShowcase />

            <MangaGenreSlider />

            <MangaDiscoveryQuickFilters />


            <section className="mb-12 md:mb-16">
              <div className="relative overflow-hidden rounded-3xl border border-destructive/30">
                <img
                  src={`${import.meta.env.BASE_URL}assets/image/content/manga18+.jpg`}
                  alt={uiI18n.t('app.18_manga_banner_232fee14')}
                  className="h-44 w-full object-cover md:h-56"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/70" />
                <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-7">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-destructive">{uiI18n.t('app.18_zone_ab82f3e1')}</p>
                  <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-white">
                    {uiI18n.t('app.hentai_mature_manga_70f832d8')}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/80">
                    {uiI18n.t('app.this_section_stays_hidden_unless_you_confirm_you_a8513b8f')}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!canShowAdultEverywhere ? (
                      <button
                        onClick={() => openSettings('privacy', 'mature-content-controls')}
                        className="rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:bg-destructive/85 transition-colors"
                      >
                        {uiI18n.t('app.open_18_settings_3e29afc5')}
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
                        {uiI18n.t('app.hide_18_section_ff15f17a')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {canShowAdultEverywhere && (
                <div className="mt-6">
                  <h3 className="mb-3 text-lg md:text-xl font-black tracking-tight">{uiI18n.t('app.mature_picks_ee174889')}</h3>

                  {isLoading ? (
                    <div data-mobile-home-rail className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <CardSkeleton key={`adult-skeleton-${index}`} />
                      ))}
                    </div>
                  ) : adultCards.length > 0 ? (
                    <div data-mobile-home-rail className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {adultCards.map((item) => (
                        <UnifiedMediaCard key={`manga-adult-${item.id}`} item={item} />
                      ))}
                    </div>
                  ) : (
                    <GlassPanel className="p-5 border border-destructive/20">
                      <p className="text-sm text-muted-foreground">
                        {uiI18n.t('app.no_mature_titles_were_returned_right_now_open_se_b91a7550')}
                      </p>
                      <button
                        onClick={() => openSettings('privacy', 'mature-content-controls')}
                        className="mt-3 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-white/10 transition-colors"
                      >
                        {uiI18n.t('app.open_privacy_settings_c64c0642')}
                      </button>
                    </GlassPanel>
                  )}
                </div>
              )}
            </section>
            
            {trendingCards.length > 0 && (
              <MangaTrendingGrid items={trendingCards} />
            )}

            <MangaExtraLanes />
          </>
        )}

        {/*
          Outside the loading branch on purpose: the endless feed is its own
          request and used to be gated behind the hero's queries, so the shelves
          only started loading once the top of the page had already resolved.
        */}
        <InfiniteMangaSections />
      </main>

      {/* MobileNav hides itself above `md` and on auth/error routes. */}
      <MobileNav />
    </div>
  );
}
