import { canonicalTrendingAniListId, resolvedTrendingEntries } from '@/lib/trendingCatalog';
import { useAnimeMetaByIds } from '@/hooks/api/useAnimeMetaByIds';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * Trending board (docs/Plans.md §2 "Trending Page"), rebuilt in the discover
 * design language of docs/image-8.png: a board hero with the fanned top seven,
 * a timeframe pill row, then the rest of the ranking as shared `PosterCard`s.
 *
 * The ranking is rendered directly rather than through `VirtualAnimeGrid`.
 * `FeatureFlag.VIRTUAL_GRID` defaults to on (feature-flags.ts:85), so for
 * default users the old page's rank badges and pulse sparklines never rendered
 * at all — the flag routed every row into a virtualized grid that knows nothing
 * about ranks. Fifty posters is well under the size virtualization is for.
 *
 * The data layer is unchanged: the internal `get_trending_anime` RPC, with the
 * streaming API's homepage as both fallback and id-reconciliation source, since
 * RPC rows carry view counts but not always a resolvable route id.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Flame, Heart, Sparkles, TrendingUp } from 'lucide-react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { MangaTrendingSection } from '@/components/manga/MangaTrendingSection';
import { NovelTrendingSection } from '@/components/novel/NovelTrendingSection';
import { Sparkline } from '@/components/ui/Sparkline';
import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { PosterCard } from '@/components/anime/discover/PosterCard';
import {
  POSTER_GRID_CLASS,
  PosterGridSkeleton,
} from '@/components/anime/discover/DiscoverPosterGrid';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import { BoardHero } from '@/components/anime/discover/BoardHero';
import {
  animeCardToPosterItem,
  RAIL_LENGTH,
  type PosterItem,
} from '@/components/anime/discover/types';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useScrollRestoration } from '@/hooks/ui/useScrollRestoration';
import { formatViewCount, useTrendingAnime, type TrendingAnime } from '@/hooks/user/useViews';
import { fetchHome, type AnimeCard, type TrendingAnime as ApiTrendingAnime } from '@/lib/api';
import {
  fetchAniListDiscover,
  fetchAniListMediaById,
  type AniListMedia,
} from '@/lib/externalIntegrations';
import {
  buildExternalAnimeRouteId,
  buildPreferredAnimeRouteId,
  collectAnimeCandidatesFromHome,
  createAnimeIdMappingIndex,
  parseExternalAnimeId,
  registerAnimeIdMappings,
  toPositiveInt,
} from '@/lib/animeIdMapping';
import { cn } from '@/lib/utils';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { filterAdultAnime } from '@/lib/contentSafety';

type TimeFrame = 'today' | 'week' | 'month' | 'all';

/**
 * `TrendingAnime` in useViews only declares the three view counters; the RPC
 * also returns the title, poster and a daily series the old page read through
 * `any`. Declared structurally here so the sparkline stays typed on the way
 * into the chart.
 */
interface TrendingRow extends TrendingAnime {
  views_month?: number;
  anime_name?: string;
  poster?: string;
  sparkline?: { date: string; count: number }[];
}

interface BoardFrame extends PillOption<TimeFrame> {
  eyebrow: string;
  heading: string;
  description: string;
  /** Suffix for the hero's view chip — the counter differs per window. */
  viewsLabel: string;
}

const TIME_FRAMES: ReadonlyArray<BoardFrame> = [
  {
    id: 'today',
    get label() { return uiI18n.t('app.today_24345a14'); },
    icon: <Clock className="h-3.5 w-3.5" />,
    eyebrow: 'Right now',
    get heading() { return uiI18n.t('app.trending_today_1ea3fa93'); },
    get description() { return uiI18n.t('app.what_the_community_started_watching_in_the_last__3ae00616'); },
    viewsLabel: 'views today',
  },
  {
    id: 'week',
    get label() { return uiI18n.t('app.this_week_7b72883e'); },
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    eyebrow: 'This week',
    get heading() { return uiI18n.t('app.popular_this_week_c0b5556d'); },
    get description() { return uiI18n.t('app.tatakai_s_most_watched_titles_over_the_last_seve_0c886633'); },
    viewsLabel: 'views this week',
  },
  {
    id: 'month',
    get label() { return uiI18n.t('app.this_month_1b478533'); },
    icon: <Flame className="h-3.5 w-3.5" />,
    eyebrow: 'This month',
    get heading() { return uiI18n.t('app.the_month_s_heat_d3f583c8'); },
    get description() { return uiI18n.t('app.thirty_days_of_watch_activity_so_a_strong_finale_502cfbbb'); },
    viewsLabel: 'views this month',
  },
  {
    id: 'all',
    get label() { return uiI18n.t('app.all_time_dbad49d8'); },
    icon: <Sparkles className="h-3.5 w-3.5" />,
    eyebrow: 'All time',
    get heading() { return uiI18n.t('app.most_watched_ever_128d8fa4'); },
    get description() { return uiI18n.t('app.every_view_ever_recorded_here_with_no_time_windo_693b8d13'); },
    viewsLabel: 'total views',
  },
];

const normalizeAnimeName = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[\W_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The counter that matches the selected window, falling back as the RPC allows. */
function viewsForFrame(row: TrendingRow, frame: TimeFrame): number | undefined {
  if (frame === 'today') return row.views_today ?? row.views_week ?? row.total_views;
  if (frame === 'week') return row.views_week ?? row.total_views;
  if (frame === 'month') return row.views_month ?? row.total_views;
  return row.total_views ?? row.views_week;
}

/** Converts an API trending row to the card shape, preserving the resolved id. */
type TrendingCandidate=Pick<AnimeCard,'id'|'name'|'poster'>;
function trendingToCard(trending: TrendingCandidate, routeIdOverride?: string): AnimeCard {
  const malId = toPositiveInt(
    (trending as any)?.malId ?? (trending as any)?.malID ?? (trending as any)?.mal_id,
  );
  const anilistId = toPositiveInt(
    (trending as any)?.anilistId ?? (trending as any)?.anilistID ?? (trending as any)?.anilist_id,
  );
  return {
    id: routeIdOverride || trending.id,
    name: trending.name,
    poster: trending.poster,
    type: 'TV',
    episodes: { sub: 0, dub: 0 },
    rating: undefined,
    malId: malId || undefined,
    anilistId: anilistId || undefined,
  };
}

/** One row of the ranked board: the card, its rank, and its pulse if we have one. */
interface BoardEntry {
  item: PosterItem;
  rank: number;
  views?: number;
  sparkline?: { date: string; count: number }[];
}

/** A card plus the metric its AniList section is ordered by. */
interface MetricEntry {
  item: PosterItem;
  metric: string;
}

export default function TrendingPage() {
  useUiTranslation();
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('week');
  const [showExtendedDiscover, setShowExtendedDiscover] = useState(false);
  const isDesktopApp = useIsDesktopApp();
  useScrollRestoration('trending', { useWindow: true });

  const frame = TIME_FRAMES.find((entry) => entry.id === timeFrame) ?? TIME_FRAMES[1];

  const { data: internalTrending, isLoading: loadingInternal } = useTrendingAnime(100, timeFrame);
  const {data:resolvedMetadata={},isLoading:loadingMetadata}=useAnimeMetaByIds((internalTrending??[]).map(row=>canonicalTrendingAniListId(row.anime_id)).filter(Boolean));

  // Hide mature (18+) titles from the board unless the user opts in globally.
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const showAdult = contentSafetySettings.showAdultEverywhere;

  // Fallback ranking, and the source the internal rows are reconciled against.
  const { data: homepageData, isLoading: loadingHomepage } = useQuery({
    queryKey: ['home'],
    queryFn: fetchHome,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  const { data: aniListTrending = [], isLoading: loadingAniListTrending } = useQuery({
    queryKey: ['anilist-trending-page'],
    queryFn: () => fetchAniListDiscover({ perPage: 18, sort: 'TRENDING_DESC' }),
    enabled: showExtendedDiscover,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: aniListFavorites = [], isLoading: loadingAniListFavorites } = useQuery({
    queryKey: ['anilist-favorites-page'],
    queryFn: () => fetchAniListDiscover({ perPage: 18, sort: 'FAVOURITES_DESC' }),
    enabled: showExtendedDiscover,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // The two AniList sections are below the fold; holding them back keeps the
  // board itself off a queue of three concurrent requests.
  useEffect(() => {
    if (loadingInternal || loadingHomepage) {
      setShowExtendedDiscover(false);
      return;
    }
    const timer = window.setTimeout(() => setShowExtendedDiscover(true), 350);
    return () => window.clearTimeout(timer);
  }, [loadingInternal, loadingHomepage, timeFrame]);

  const isLoading = loadingInternal || loadingHomepage || loadingMetadata;
  // Memoized so the empty-array fallbacks keep a stable identity: everything
  // below derives from them through useMemo, which would otherwise recompute on
  // every render while either query is still pending.
  const internalRows = useMemo(
    () => filterAdultAnime((internalTrending ?? []) as TrendingRow[], showAdult, (r) => ({ name: r.anime_name })),
    [internalTrending, showAdult],
  );
  const apiTrending = useMemo(
    () => filterAdultAnime(homepageData?.trendingAnimes ?? [], showAdult),
    [homepageData, showAdult],
  );


  const homeIdMappingIndex = useMemo(() => {
    const index = createAnimeIdMappingIndex();
    registerAnimeIdMappings(index, collectAnimeCandidatesFromHome(homepageData));
    return index;
  }, [homepageData]);

  // Build a comprehensive map of all anime from the homepage data for better matching
  const allHomepageAnime = useMemo(() => {
    if (!homepageData) return [];
    const allAnime: TrendingCandidate[] = [];
    // Collect from all homepage sections to maximize matching chances
    const sections = [
      homepageData.spotlightAnimes,
      homepageData.trendingAnimes,
      homepageData.topAiringAnimes,
      homepageData.topUpcomingAnimes,
      homepageData.mostPopularAnimes,
      homepageData.mostFavoriteAnimes,
      homepageData.latestCompletedAnimes,
      homepageData.latestEpisodeAnimes,
    ];
    for (const section of sections) {
      if (Array.isArray(section)) {
        allAnime.push(...section);
      }
    }
    return filterAdultAnime(allAnime, showAdult);
  }, [homepageData, showAdult]);

  const apiTrendingById = useMemo(() => {
    const map = new Map<string, TrendingCandidate>();

    allHomepageAnime.forEach((item) => {
      const routeKeys = new Set<string>();
      const preferredId = buildPreferredAnimeRouteId(item as any, homeIdMappingIndex);
      const fallbackExternalId = buildExternalAnimeRouteId(
        (item as any)?.malId ?? (item as any)?.malID ?? (item as any)?.mal_id,
        (item as any)?.anilistId ?? (item as any)?.anilistID ?? (item as any)?.anilist_id,
      );

      if (preferredId) routeKeys.add(preferredId);
      if (typeof item?.id === 'string' && item.id.trim()) routeKeys.add(item.id.trim());
      if (fallbackExternalId) routeKeys.add(fallbackExternalId);

      for (const key of routeKeys) {
        map.set(key, item);
      }
    });

    return map;
  }, [allHomepageAnime, homeIdMappingIndex]);

  const apiTrendingByName = useMemo(() => {
    const map = new Map<string, TrendingCandidate>();
    allHomepageAnime.forEach((item) => {
      const key = normalizeAnimeName(item?.name);
      if (key) map.set(key, item);
    });
    return map;
  }, [allHomepageAnime]);

  /**
   * An RPC row only reliably has `anime_id` and `anime_name`, and `anime_id` is
   * whatever the player recorded — sometimes a provider slug, sometimes an
   * external `mal:`/`anilist:` id. Matching it against the homepage payload by
   * id and then by normalized name is what gives the card a working link.
   */
  const resolveInternalTrendingCard = useCallback(
    (entry: TrendingRow): AnimeCard => {
      const rawEntryId = String(entry?.anime_id || '').trim();
      const canonical=canonicalTrendingAniListId(rawEntryId);
      const metadata=canonical?resolvedMetadata[Number(canonical)]:undefined;
      if(metadata?.title&&metadata.coverImage&&(!metadata.isAdult||showAdult))return {
        id:`anilist:${metadata.id}`,name:metadata.title,poster:metadata.coverImage,type:metadata.format||'TV',
        episodes:{sub:0,dub:0},anilistId:metadata.id,
      };

      const preferredRouteId = buildPreferredAnimeRouteId(
        {
          id: entry?.anime_id,
          name: entry?.anime_name,
          malId: (entry as any)?.malId,
          malID: (entry as any)?.malID,
          anilistId: (entry as any)?.anilistId,
          anilistID: (entry as any)?.anilistID,
        },
        homeIdMappingIndex,
      );

      const directResolved =
        (preferredRouteId && apiTrendingById.get(preferredRouteId)) ||
        apiTrendingById.get(rawEntryId) ||
        apiTrendingByName.get(normalizeAnimeName(entry?.anime_name));

      if (directResolved) {
        const resolvedRouteId =
          buildPreferredAnimeRouteId(directResolved as any, homeIdMappingIndex) ||
          directResolved.id;
        return trendingToCard(directResolved, resolvedRouteId);
      }

      // Historical provider slugs without a current metadata mapping are retired.
      // Never manufacture titles or image URLs from obsolete identifiers.
      return null;

    },
    [homeIdMappingIndex, apiTrendingById, apiTrendingByName, resolvedMetadata, showAdult],
  );

  const aniListToCard = useCallback(
    (media: AniListMedia): AnimeCard => {
      const title =
        media?.title?.english || media?.title?.romaji || media?.title?.native || uiI18n.t('app.anilist_i18n_value_0_66482db8', { value0: media.id });
      const malId = toPositiveInt(media?.idMal);
      const anilistId = toPositiveInt(media?.id);
      const fallbackExternalId = buildExternalAnimeRouteId(malId, anilistId);
      const routeId =
        buildPreferredAnimeRouteId({ id: fallbackExternalId || undefined, name: title, malId, anilistId }, homeIdMappingIndex) ||
        fallbackExternalId ||
        String(media.id);

      return {
        id: routeId,
        name: title,
        poster: media?.coverImage?.large || media?.coverImage?.medium || '',
        type: media?.format || 'TV',
        episodes: { sub: Number(media?.episodes || 0), dub: 0 },
        rating: media?.averageScore ? (media.averageScore / 10).toFixed(1) : undefined,
        malId: malId || undefined,
        anilistId: anilistId || undefined,
      };
    },
    [homeIdMappingIndex],
  );

  const resolvedInternalRows=useMemo(()=>resolvedTrendingEntries(internalRows,resolveInternalTrendingCard),[internalRows,resolveInternalTrendingCard]);
  const hasInternalData=resolvedInternalRows.length>0;

  // ─── The board ──────────────────────────────────────────────────────────────

  const board = useMemo<BoardEntry[]>(() => {
    if (hasInternalData) {
      return resolvedInternalRows.slice(0,50).map(({row,card}, index) => ({
        item: animeCardToPosterItem(card, index),
        rank: index + 1,
        views: viewsForFrame(row, timeFrame),
        sparkline: row.sparkline,
      }));
    }
    return apiTrending.map((row, index) => ({
      item: animeCardToPosterItem(
        trendingToCard(row, buildPreferredAnimeRouteId(row as any, homeIdMappingIndex) || row.id),
        index,
      ),
      rank: index + 1,
    }));
  }, [hasInternalData, resolvedInternalRows, apiTrending, homeIdMappingIndex, timeFrame]);

  const podium = board.slice(0, RAIL_LENGTH);
  const rest = board.slice(RAIL_LENGTH);

  /** Resolved separately from `board` because the banner query needs the ids. */
  const leaderCard = useMemo<AnimeCard | null>(() => {
    if (hasInternalData) return resolvedInternalRows[0].card;
    if (!apiTrending[0]) return null;
    return trendingToCard(
      apiTrending[0],
      buildPreferredAnimeRouteId(apiTrending[0] as any, homeIdMappingIndex) || apiTrending[0].id,
    );
  }, [hasInternalData, resolvedInternalRows, apiTrending, homeIdMappingIndex]);

  const heroExternalIds = useMemo(() => {
    if (!leaderCard) return { anilistId: null as number | null, malId: null as number | null };

    let anilistId = toPositiveInt(leaderCard.anilistId) || null;
    let malId = toPositiveInt(leaderCard.malId) || null;

    // The ids are often only present inside the route id we just built.
    if (!anilistId && !malId && leaderCard.id) {
      const parsed = parseExternalAnimeId(leaderCard.id);
      if (parsed?.provider === 'anilist') anilistId = parsed.id;
      if (parsed?.provider === 'mal') malId = parsed.id;
    }

    return { anilistId, malId };
  }, [leaderCard]);

  // The board's own rows only have portrait posters; the hero needs wide art.
  const { data: heroAniListMedia } = useQuery({
    queryKey: ['anilist-trending-hero-banner', heroExternalIds.anilistId, heroExternalIds.malId],
    queryFn: () =>
      fetchAniListMediaById({
        anilistId: heroExternalIds.anilistId,
        malId: heroExternalIds.malId,
      }),
    enabled: Boolean(leaderCard && (heroExternalIds.anilistId || heroExternalIds.malId)),
    staleTime: 10 * 60 * 1000,
  });

  const stats = useMemo(() => {
    const chips: string[] = [];
    const leaderViews = board[0]?.views;
    if (leaderViews) chips.push(`${formatViewCount(leaderViews)} ${frame.viewsLabel}`);
    if (board.length) chips.push(`${board.length} titles ranked`);
    return chips;
  }, [board, frame.viewsLabel]);

  const globalPulse = useMemo<MetricEntry[]>(
    () =>
      filterAdultAnime(aniListTrending, showAdult)
        .slice(0, 12)
        .map((media, index) => ({
          item: animeCardToPosterItem(aniListToCard(media), index),
          metric: `Trending score ${media.trending ?? media.popularity ?? '—'}`,
        })),
    [aniListTrending, aniListToCard, showAdult],
  );

  const fanFavorites = useMemo<MetricEntry[]>(
    () =>
      filterAdultAnime(aniListFavorites, showAdult)
        .slice(0, 12)
        .map((media, index) => ({
          item: animeCardToPosterItem(aniListToCard(media), index),
          metric: `${media.favourites?.toLocaleString(uiI18n.language) ?? '—'} favorites`,
        })),
    [aniListFavorites, aniListToCard, showAdult],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />

      <main
        className={cn(
          'relative z-10 mx-auto max-w-[1800px] pb-24 md:pb-6',
          'pr-[max(1rem,env(safe-area-inset-right))] md:pr-6',
          'pt-[calc(1rem+env(safe-area-inset-top,0px))] md:pt-6',
          isDesktopApp ? 'p-4 md:p-6' : 'pl-[max(1rem,env(safe-area-inset-left))] md:pl-32',
        )}
      >
        <BoardHero
          className="mt-2"
          eyebrow={frame.eyebrow}
          heading={frame.heading}
          description={frame.description}
          leader={podium[0]?.item}
          stats={stats}
          backdrop={heroAniListMedia?.bannerImage || undefined}
          items={podium.map((entry) => entry.item)}
          isLoading={isLoading}
        >
          <PillGroup
            options={TIME_FRAMES}
            value={timeFrame}
            // Wrapped rather than passed as the setter itself: `SetStateAction`
            // accepts an updater function, and that extra candidate makes TS
            // infer the pill group's id type as bare `string`.
            onChange={(id) => setTimeFrame(id)}
            label={uiI18n.t('app.timeframe_85decb73')}
          />
        </BoardHero>

        <section className="mt-12">
          <SectionHeading
            eyebrow="The full board"
            title={hasInternalData ? uiI18n.t('app.ranked_by_watch_time_c8eedd00') : uiI18n.t('app.ranked_by_popularity_89329771')}
            meta={
              rest.length > 0
                ? `Ranks ${rest[0].rank}–${rest[rest.length - 1].rank}`
                : undefined
            }
          />

          {isLoading ? (
            <PosterGridSkeleton className="mt-6" count={14} />
          ) : board.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl border border-white/[0.07] bg-white/[0.02] py-20 text-center">
              <Flame className="h-7 w-7 text-white/25" />
              <p className="text-base font-bold text-white/70">{uiI18n.t('app.nothing_is_trending_yet_42accacc')}</p>
              <p className="max-w-sm text-sm text-white/40">
                {uiI18n.t('app.this_window_has_no_recorded_views_try_a_longer_t_a0f0bb5e')}
              </p>
            </div>
          ) : rest.length === 0 ? (
            <p className="mt-6 text-sm text-white/40">
              {uiI18n.t('app.the_whole_board_fits_on_the_podium_above_4e79118f')}
            </p>
          ) : (
            <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
              {rest.map((entry) => (
                <PosterCard
                  key={entry.item.key}
                  item={entry.item}
                  rank={entry.rank}
                  preview
                  footer={
                    entry.views !== undefined ? (
                      <PulseFooter views={entry.views} series={entry.sparkline} />
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-14">
          <SectionHeading
            eyebrow="Beyond Tatakai"
            title={uiI18n.t('app.global_trending_pulse_941fb085')}
            meta="From AniList"
          />
          {!showExtendedDiscover || loadingAniListTrending ? (
            <PosterGridSkeleton className="mt-6" count={12} />
          ) : (
            <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
              {globalPulse.map((entry) => (
                <PosterCard
                  key={entry.item.key}
                  item={entry.item}
                  preview
                  footer={<MetricFooter label={entry.metric} />}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-14">
          <SectionHeading
            eyebrow="Most loved"
            title={uiI18n.t('app.fan_favorites_c94fbc02')}
            action={
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/40">
                <Heart className="h-3.5 w-3.5 text-destructive/80" />
                {uiI18n.t('app.all_time_anilist_favorites_714e1f6f')}
              </span>
            }
          />
          {!showExtendedDiscover || loadingAniListFavorites ? (
            <PosterGridSkeleton className="mt-6" count={12} />
          ) : (
            <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
              {fanFavorites.map((entry) => (
                <PosterCard
                  key={entry.item.key}
                  item={entry.item}
                  preview
                  footer={<MetricFooter label={entry.metric} />}
                />
              ))}
            </div>
          )}
        </section>

        <div className="mt-14">
          <MangaTrendingSection
            title={uiI18n.t('app.trending_manga_manhwa_42cc803d')}
            defaultTab="manga"
            showTabs
            limit={18}
          />
        </div>

        <div className="mt-14">
          <NovelTrendingSection
            title={uiI18n.t('app.trending_light_novels_d730dfb3')}
            defaultTab="trending"
            showTabs
            limit={18}
          />
        </div>
      </main>

      <MobileNav />
    </div>
  );
}

/** The board's pulse row: the window's count plus its daily series. */
function PulseFooter({
  views,
  series,
}: {
  views: number;
  series?: { date: string; count: number }[];
}) {
  useUiTranslation();
  return (
    <div className="mt-3 hidden md:block">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">{uiI18n.t('app.pulse_b3cc660b')}</span>
        <span className="text-[10px] font-bold tabular-nums text-primary">
          {formatViewCount(views)}
        </span>
      </div>
      <div className="mt-1 text-primary/70 opacity-60 transition-opacity group-hover:opacity-100">
        <Sparkline series={series} width={140} height={26} />
      </div>
    </div>
  );
}

/** The ordering metric under an AniList card, so the sort order is legible. */
function MetricFooter({ label }: { label: string }) {
  useUiTranslation();
  return (
    <p className="mt-1.5 text-[11px] font-bold uppercase tracking-widest text-white/35">{label}</p>
  );
}
