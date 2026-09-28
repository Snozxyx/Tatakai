/**
 * Favorites (docs/Plans.md §2 "Favorites Page"), rebuilt in the discover design
 * language of docs/image-8.png.
 *
 * Four data sources land on this one page: the saved watchlist, the heuristic
 * recommender, the ML recommender, and AniList's all-time favorites. The old
 * page gave each its own card treatment, grid gutters and accent colour, so the
 * page read as four widgets stacked. Here they all render through the shared
 * `PosterCard`, and whatever is specific to a source — a match score, a reason,
 * an add-to-list button — goes in that card's `footer` slot.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Heart,
  Pause,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BoardHero } from '@/components/anime/discover/BoardHero';
import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { PosterCard } from '@/components/anime/discover/PosterCard';
import {
  POSTER_GRID_CLASS,
  PosterGridSkeleton,
} from '@/components/anime/discover/DiscoverPosterGrid';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import { MangaPicksSection } from '@/components/manga/MangaPicksSection';
import {
  animeCardToPosterItem,
  controlItemClass,
  controlMenuClass,
  controlTriggerClass,
  RAIL_LENGTH,
  type PosterItem,
} from '@/components/anime/discover/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  useGenrePreferences,
  usePersonalizedRecommendations,
} from '@/hooks/api/useRecommendations';
import { useMLRecommendations, useTasteProfile } from '@/hooks/api/useMLRecommendations';
import { useSmartFavorites, type SmartFavorite } from '@/hooks/user/useSmartFavorites';
import {
  useAddToWatchlist,
  useBulkRemoveFromWatchlist,
  useWatchlist,
  type WatchlistItem,
  type WatchlistStatus,
} from '@/hooks/user/useWatchlist';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import {
  fetchAniListDiscover,
  fetchAniListMediaById,
  type AniListMedia,
} from '@/lib/externalIntegrations';
import { parseExternalAnimeId, buildExternalAnimeRouteId, toPositiveInt } from '@/lib/animeIdMapping';
import { cn } from '@/lib/utils';

type TabType =
  | 'for-you'
  | 'ai-recs'
  | 'all'
  | 'watching'
  | 'completed'
  | 'plan'
  | 'on-hold'
  | 'dropped';

const TABS: ReadonlyArray<PillOption<TabType>> = [
  { id: 'for-you', label: 'For you', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'ai-recs', label: 'AI picks', icon: <Brain className="h-3.5 w-3.5" /> },
  { id: 'all', label: 'All saved', icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: 'watching', label: 'Watching', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'completed', label: 'Completed', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { id: 'plan', label: 'Planned', icon: <Clock className="h-3.5 w-3.5" /> },
  { id: 'on-hold', label: 'On hold', icon: <Pause className="h-3.5 w-3.5" /> },
  { id: 'dropped', label: 'Dropped', icon: <X className="h-3.5 w-3.5" /> },
];

/** Tab → the `watchlist.status` it filters on. Null means "not a list tab". */
const STATUS_MAP: Record<TabType, WatchlistStatus | null> = {
  'for-you': null,
  'ai-recs': null,
  all: null,
  watching: 'watching',
  completed: 'completed',
  plan: 'plan_to_watch',
  'on-hold': 'on_hold',
  dropped: 'dropped',
};

const STATUS_LABEL: Record<WatchlistStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  plan_to_watch: 'Planned',
  on_hold: 'On hold',
  dropped: 'Dropped',
};

type SortBy = 'recent' | 'alpha';

const SORTS: ReadonlyArray<{ id: SortBy; label: string }> = [
  { id: 'recent', label: 'Recently added' },
  { id: 'alpha', label: 'A–Z' },
];

/** Headings per tab, so the section under the filter row says what it lists. */
const TAB_COPY: Record<TabType, { eyebrow: string; title: string }> = {
  'for-you': { eyebrow: 'Picked for you', title: 'Because of what you watch' },
  'ai-recs': { eyebrow: 'Taste model', title: 'Ranked by match' },
  all: { eyebrow: 'Your collection', title: 'Everything saved' },
  watching: { eyebrow: 'In progress', title: 'Currently watching' },
  completed: { eyebrow: 'Finished', title: 'Completed' },
  plan: { eyebrow: 'Queued', title: 'Planned to watch' },
  'on-hold': { eyebrow: 'Paused', title: 'On hold' },
  dropped: { eyebrow: 'Set aside', title: 'Dropped' },
};

/** Empty copy per tab — eight tabs, one panel, no generic "nothing here". */
const EMPTY_COPY: Record<TabType, { title: string; hint: string }> = {
  'for-you': {
    title: 'No recommendations yet',
    hint: 'Watch a few episodes and this fills in with titles like the ones you finish.',
  },
  'ai-recs': {
    title: 'The taste model needs more history',
    hint: 'Complete a couple of series and the match scores start to mean something.',
  },
  all: { title: 'Nothing saved yet', hint: 'Add a title from its page and it lands here.' },
  watching: {
    title: 'Nothing in progress',
    hint: 'Titles you are part-way through show up here.',
  },
  completed: { title: 'Nothing finished yet', hint: 'Mark a title completed and it moves here.' },
  plan: { title: 'Your queue is empty', hint: 'Save anything you want to get to later.' },
  'on-hold': {
    title: 'Nothing on hold',
    hint: 'Paused a series? Park it here so it stays out of your active list.',
  },
  dropped: { title: 'Nothing dropped', hint: 'Titles you set aside show up here.' },
};

/**
 * Saved rows and suggestions keep an `anime_id` only, so the id the hover
 * preview needs has to be read back out of it — `anilist:456` for anything that
 * came from AniList, nothing at all for a provider slug, in which case the card
 * simply never fetches a preview.
 */
function previewAniListId(animeId: string | null | undefined): number | undefined {
  const parsed = parseExternalAnimeId(String(animeId || '').trim());
  return parsed?.provider === 'anilist' ? parsed.id : undefined;
}

function watchlistToPosterItem(entry: WatchlistItem, index: number): PosterItem {
  return {
    key: `${entry.id || entry.anime_id}-${index}`,
    href: entry.anime_id
      ? `/anime/${entry.anime_id}`
      : `/search?q=${encodeURIComponent(entry.anime_name)}`,
    title: entry.anime_name,
    poster: entry.anime_poster || '',
    anilistId: toPositiveInt((entry as any)?.anilist_id) || previewAniListId(entry.anime_id),
    meta: STATUS_LABEL[entry.status] ?? undefined,
  };
}

/** AniList and the smart recommender both hand over ids, names and posters only. */
function suggestionToPosterItem(
  suggestion: { animeId: string; animeName: string; animePoster: string | null },
  index: number,
): PosterItem {
  return {
    key: `${suggestion.animeId}-${index}`,
    href: suggestion.animeId
      ? `/anime/${suggestion.animeId}`
      : `/search?q=${encodeURIComponent(suggestion.animeName)}`,
    title: suggestion.animeName,
    poster: suggestion.animePoster || '',
    anilistId: previewAniListId(suggestion.animeId),
  };
}

export default function FavoritesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const [activeTab, setActiveTab] = useState<TabType>('for-you');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const confirm = useConfirm();

  const { data: recommendations, isLoading: loadingRecs } = usePersonalizedRecommendations(24);
  const { data: mlRecommendations, isLoading: loadingML } = useMLRecommendations(30);
  const { data: tasteProfile, isLoading: loadingProfile } = useTasteProfile();
  const { data: genrePrefs } = useGenrePreferences();
  const { data: watchlist, isLoading: loadingWatchlist } = useWatchlist();
  const { data: smartFavorites } = useSmartFavorites(6);
  const { data: aniListFavorites = [], isLoading: loadingAniListFavorites } = useQuery({
    queryKey: ['anilist-favorites-favorites-page'],
    queryFn: () => fetchAniListDiscover({ perPage: 18, sort: 'FAVOURITES_DESC' }),
    staleTime: 10 * 60 * 1000,
  });
  const bulkRemove = useBulkRemoveFromWatchlist();
  const addToWatchlist = useAddToWatchlist();

  const showRecommendations = activeTab === 'for-you';
  const showMLRecs = activeTab === 'ai-recs';
  const isListTab = !showRecommendations && !showMLRecs;
  const isLoading = showRecommendations
    ? loadingRecs
    : showMLRecs
      ? loadingML || loadingProfile
      : loadingWatchlist;

  const rows = useMemo(() => watchlist ?? [], [watchlist]);

  /** Lets a suggestion card say "in your list" instead of offering a second add. */
  const savedIds = useMemo(() => new Set(rows.map((row) => row.anime_id)), [rows]);

  const counts = useMemo(() => {
    const tally = { total: rows.length, watching: 0, completed: 0 };
    for (const row of rows) {
      if (row.status === 'watching') tally.watching += 1;
      if (row.status === 'completed') tally.completed += 1;
    }
    return tally;
  }, [rows]);

  const filteredWatchlist = useMemo(() => {
    const status = STATUS_MAP[activeTab];
    const list = status ? rows.filter((row) => row.status === status) : [...rows];
    if (sortBy === 'alpha') {
      list.sort((a, b) => a.anime_name.localeCompare(b.anime_name));
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [rows, activeTab, sortBy]);

  /** The row the hero is about: the most recently touched watching entry. */
  const heroRow = useMemo(() => {
    if (rows.length === 0) return null;
    return rows.find((row) => row.status === 'watching') ?? rows[0];
  }, [rows]);

  const heroExternalIds = useMemo(() => {
    if (!heroRow) return { anilistId: null as number | null, malId: null as number | null };

    // Saved rows only keep `anime_id`, so the external ids usually have to be
    // read back out of it — `mal:123` / `anilist:456` for externally-sourced
    // titles, nothing at all for provider slugs.
    const parsed = parseExternalAnimeId(String(heroRow.anime_id || '').trim());
    let anilistId = toPositiveInt((heroRow as any)?.anilist_id) || null;
    let malId = toPositiveInt((heroRow as any)?.mal_id) || null;
    if (parsed?.provider === 'anilist') anilistId = parsed.id;
    if (parsed?.provider === 'mal') malId = parsed.id;

    return { anilistId, malId };
  }, [heroRow]);

  const { data: heroAniListMedia } = useQuery({
    queryKey: ['favorites-hero-banner', heroExternalIds.anilistId, heroExternalIds.malId],
    queryFn: () =>
      fetchAniListMediaById({
        anilistId: heroExternalIds.anilistId,
        malId: heroExternalIds.malId,
      }),
    enabled: Boolean(heroRow && (heroExternalIds.anilistId || heroExternalIds.malId)),
    staleTime: 10 * 60 * 1000,
  });

  /** Leader first, then the rest of the list in most-recent order. */
  const heroItems = useMemo(() => {
    if (!heroRow) return [];
    const ordered = [heroRow, ...rows.filter((row) => row.id !== heroRow.id)];
    return ordered.slice(0, RAIL_LENGTH).map(watchlistToPosterItem);
  }, [heroRow, rows]);

  const heroStats = useMemo(() => {
    const chips: string[] = [];
    if (counts.total) chips.push(`${counts.total} saved`);
    if (counts.watching) chips.push(`${counts.watching} watching`);
    if (counts.completed) chips.push(`${counts.completed} completed`);
    return chips;
  }, [counts]);

  const recEntries = useMemo(
    () =>
      (recommendations ?? []).map((entry, index) => ({
        item: animeCardToPosterItem(entry.anime, index),
        note: entry.reason,
      })),
    [recommendations],
  );

  const mlEntries = useMemo(
    () =>
      (mlRecommendations ?? []).map((entry, index) => ({
        item: animeCardToPosterItem(entry.anime, index),
        note: [`${Math.round(entry.score)}% match`, entry.reasons?.[0]].filter(Boolean).join(' · '),
      })),
    [mlRecommendations],
  );

  const listEntries = useMemo(
    () =>
      filteredWatchlist.map((row, index) => ({
        item: watchlistToPosterItem(row, index),
        animeId: row.anime_id,
      })),
    [filteredWatchlist],
  );

  const smartEntries = useMemo(
    () =>
      (smartFavorites ?? []).map((suggestion: SmartFavorite, index) => ({
        item: suggestionToPosterItem(suggestion, index),
        suggestion,
        note: suggestion.reason,
      })),
    [smartFavorites],
  );

  const aniListEntries = useMemo(
    () =>
      aniListFavorites.slice(0, 12).map((media: AniListMedia, index) => {
        const suggestion = {
          // `/anime/:id` resolves `mal:`/`anilist:` prefixed ids; the bare
          // AniList id the old page linked to is not one of them.
          animeId:
            buildExternalAnimeRouteId(media?.idMal, media?.id) || String(media?.id ?? ''),
          animeName:
            media?.title?.english ||
            media?.title?.romaji ||
            media?.title?.native ||
            `AniList #${media?.id}`,
          animePoster: media?.coverImage?.large || media?.coverImage?.medium || null,
        };
        return {
          item: {
            ...suggestionToPosterItem(suggestion, index),
            anilistId: toPositiveInt(media?.id),
            meta: [media?.format, media?.seasonYear].filter(Boolean).join(' · '),
            score: media?.averageScore ? (media.averageScore / 10).toFixed(1) : undefined,
          },
          suggestion,
          note: `${media?.favourites?.toLocaleString() ?? '—'} favorites`,
        };
      }),
    [aniListFavorites],
  );

  /**
   * Suggestions land as `plan_to_watch` whichever section they came from. The
   * old smart-favorites button saved them as `watching`, which marked a title
   * the visitor had never opened as in progress.
   */
  const addSuggestion = (suggestion: {
    animeId: string;
    animeName: string;
    animePoster: string | null;
  }) =>
    addToWatchlist.mutate({
      animeId: suggestion.animeId,
      animeName: suggestion.animeName,
      animePoster: suggestion.animePoster || undefined,
      status: 'plan_to_watch',
    });

  const removeSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirm({ title: `Remove ${selectedIds.length} title${selectedIds.length === 1 ? '' : 's'}?`, destructive: true }))) return;
    await bulkRemove.mutateAsync(selectedIds);
    setSelectedIds([]);
    setSelectMode(false);
  };

  const shellClass = cn(
    'relative z-10 mx-auto max-w-[1800px] py-4 pb-24 pr-4 md:py-6 md:pb-6 md:pr-6',
    isNative ? 'pl-4' : 'pl-4 md:pl-32',
  );

  if (!user) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
        <Background />
        <Sidebar />

        <main className={shellClass}>
          <section className="relative mt-2 overflow-hidden rounded-[2rem] border border-white/[0.07] bg-card">
            <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_110%,hsl(var(--primary)/0.28),transparent_60%)]" />
            <div className="relative flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <Heart className="h-7 w-7 text-primary" />
              </span>
              <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
                Your collection
              </p>
              <h1 className="font-display mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
                Favorites live behind sign-in
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
                Sign in to keep a watchlist, pick up where you left off, and get recommendations
                built from what you actually watch.
              </p>
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-primary to-secondary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Sign in
              </button>
            </div>
          </section>
        </main>

        <MobileNav />
      </div>
    );
  }

  const toggleSelected = (animeId: string) =>
    setSelectedIds((prev) =>
      prev.includes(animeId) ? prev.filter((id) => id !== animeId) : [...prev, animeId],
    );

  /** Only the card being saved shows a pending state, not all of them. */
  const pendingAddId = addToWatchlist.isPending ? addToWatchlist.variables?.animeId : undefined;

  /**
   * All three tab families project to the same shape, so the grid below is
   * written once: `note` carries the recommender's reason, `animeId` marks a row
   * that select mode can act on.
   */
  const activeEntries: Array<{ item: PosterItem; note?: string; animeId?: string }> =
    showRecommendations ? recEntries : showMLRecs ? mlEntries : listEntries;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />

      <main className={shellClass}>
        <BoardHero
          className="mt-2"
          eyebrow="Your collection"
          heading={counts.total ? 'Everything you saved' : 'Start your collection'}
          description={
            counts.total
              ? 'Your watchlist, the titles the recommenders think you should try next, and what the wider fandom keeps coming back to — all on one page.'
              : 'Save a title from any page and it lands here, alongside recommendations built from what you actually watch.'
          }
          leader={heroItems[0]}
          leaderPrefix={heroRow?.status === 'watching' ? 'Resume' : 'Latest'}
          ctaLabel={heroRow?.status === 'watching' ? 'Resume watching' : 'Open title'}
          stats={heroStats}
          backdrop={heroAniListMedia?.bannerImage || undefined}
          items={heroItems}
          isLoading={loadingWatchlist}
        >
          <PillGroup
            options={TABS}
            value={activeTab}
            // Wrapped rather than passed as the setter: `SetStateAction` also
            // accepts an updater function, and that candidate would widen the
            // pill group's id type to bare `string`.
            onChange={(id) => setActiveTab(id)}
            label="Collection filter"
          />
        </BoardHero>

        <section className="mt-12">
          <SectionHeading
            eyebrow={TAB_COPY[activeTab].eyebrow}
            title={TAB_COPY[activeTab].title}
            meta={`${activeEntries.length} ${activeEntries.length === 1 ? 'title' : 'titles'}`}
            action={
              isListTab ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs font-medium text-white/40">
                    {activeEntries.length} {activeEntries.length === 1 ? 'title' : 'titles'}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger className={controlTriggerClass}>
                      {SORTS.find((option) => option.id === sortBy)?.label}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={controlMenuClass}>
                      {SORTS.map((option) => (
                        <DropdownMenuItem
                          key={option.id}
                          className={controlItemClass}
                          onSelect={() => setSortBy(option.id)}
                        >
                          {option.label}
                          {sortBy === option.id && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {selectMode && selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={removeSelected}
                      disabled={bulkRemove.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/15 px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:border-destructive/70 hover:bg-destructive/25 hover:text-destructive-foreground disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove {selectedIds.length}
                    </button>
                  )}

                  {activeEntries.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectMode((prev) => !prev);
                        setSelectedIds([]);
                      }}
                      className={controlTriggerClass}
                    >
                      {selectMode ? 'Done' : 'Manage list'}
                    </button>
                  )}
                </div>
              ) : undefined
            }
          />

          {showMLRecs && tasteProfile && (
            <div className="mt-6 rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/15">
                    <Brain className="h-5 w-5 text-primary" />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Taste model</p>
                    <h3 className="text-sm font-semibold text-white">Ranked from your history &amp; ratings</h3>
                  </div>
                </div>

                {tasteProfile.preferredGenres.length > 0 && (
                  <div className="min-w-0">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">Top genres</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tasteProfile.preferredGenres.slice(0, 5).map((g) => (
                        <span
                          key={g.genre}
                          className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-white/75"
                        >
                          {g.genre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">Rating range</p>
                  <p className="text-sm font-semibold text-white">
                    {tasteProfile.preferredRatings.min.toFixed(1)}–{tasteProfile.preferredRatings.max.toFixed(1)}{' '}
                    <span className="font-normal text-white/45">avg {tasteProfile.preferredRatings.average.toFixed(1)}</span>
                  </p>
                </div>

                <div className="min-w-[150px]">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">Diversity</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-primary" style={{ width: `${Math.round(tasteProfile.diversityScore * 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-white/70">{Math.round(tasteProfile.diversityScore * 100)}%</span>
                  </div>
                </div>

                <Link
                  to="/recommendations"
                  className="ml-auto inline-flex items-center gap-1.5 self-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:border-white/25 hover:text-white"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Full recommendations
                </Link>
              </div>
            </div>
          )}

          {isLoading ? (
            <PosterGridSkeleton className="mt-6" count={14} />
          ) : activeEntries.length === 0 ? (
            <EmptyPanel
              icon={
                showRecommendations ? (
                  <Sparkles className="h-7 w-7 text-white/25" />
                ) : showMLRecs ? (
                  <Brain className="h-7 w-7 text-white/25" />
                ) : (
                  <Heart className="h-7 w-7 text-white/25" />
                )
              }
              title={EMPTY_COPY[activeTab].title}
              hint={EMPTY_COPY[activeTab].hint}
              action={
                <Link
                  to="/genre"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:border-white/25 hover:text-white"
                >
                  Browse anime
                </Link>
              }
            />
          ) : (
            <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
              {activeEntries.map((entry, index) => {
                // Held in a const so the narrowing survives into the click
                // handler's closure.
                const animeId = entry.animeId;
                const selected = animeId ? selectedIds.includes(animeId) : false;

                return (
                  <PosterCard
                    key={entry.item.key}
                    item={entry.item}
                    eager={index < 7}
                    preview
                    footer={
                      <>
                        {entry.note && (
                          <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-relaxed text-primary/80">
                            {entry.note}
                          </p>
                        )}

                        {selectMode && animeId && (
                          <button
                            type="button"
                            onClick={() => toggleSelected(animeId)}
                            aria-pressed={selected}
                            aria-label={`Select ${entry.item.title}`}
                            className={cn(
                              'absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition-colors',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-white/25 bg-black/60 text-white/70 hover:border-white/60',
                            )}
                          >
                            {selected && <Check className="h-4 w-4" />}
                          </button>
                        )}
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        {showMLRecs && tasteProfile && (
          <section className="mt-14">
            <SectionHeading
              eyebrow="Your taste model"
              title="What the match scores are built from"
            />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Diversity"
                value={`${Math.round(tasteProfile.diversityScore * 100)}%`}
                hint="How widely your history spreads"
              />
              <StatTile
                label="Scores you finish"
                value={tasteProfile.preferredRatings.average.toFixed(1)}
                hint={`Mostly ${tasteProfile.preferredRatings.min.toFixed(1)}–${tasteProfile.preferredRatings.max.toFixed(1)}`}
              />
              <StatTile
                label="Top genre"
                value={tasteProfile.preferredGenres[0]?.genre ?? '—'}
                hint={
                  tasteProfile.preferredGenres.length > 1
                    ? `+${tasteProfile.preferredGenres.length - 1} more weighted`
                    : 'Weighted highest in your history'
                }
              />
              <StatTile
                label="Preferred format"
                value={tasteProfile.preferredTypes[0]?.type ?? '—'}
                hint={
                  tasteProfile.preferredTypes[0]
                    ? `${Math.round(tasteProfile.preferredTypes[0].weight * 100)}% of what you watch`
                    : 'Not enough history'
                }
              />
            </div>
          </section>
        )}

        {showRecommendations && (genrePrefs?.length ?? 0) > 0 && (
          <section className="mt-14">
            <SectionHeading eyebrow="Your genres" title="Weighted by what you finish" />
            <div className="mt-5 flex flex-wrap gap-2">
              {(genrePrefs ?? []).slice(0, 12).map((preference) => (
                <Link
                  key={preference.genre}
                  to={`/genre/${encodeURIComponent(preference.genre.toLowerCase())}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-primary/50 hover:text-primary"
                >
                  {preference.genre}
                  <span className="tabular-nums text-white/35">{preference.count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(showRecommendations || activeTab === 'all') && smartEntries.length > 0 && (
          <section className="mt-14">
            <SectionHeading
              eyebrow="From your history"
              title="Watched, never saved"
              meta="Scored on episodes, completions and recency"
            />
            <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
              {smartEntries.map((entry) => (
                <PosterCard
                  key={entry.item.key}
                  item={entry.item}
                  preview
                  footer={
                    <>
                      <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-relaxed text-primary/80">
                        {entry.note}
                      </p>
                      <AddToListButton
                        saved={savedIds.has(entry.suggestion.animeId)}
                        pending={pendingAddId === entry.suggestion.animeId}
                        onAdd={() => addSuggestion(entry.suggestion)}
                      />
                    </>
                  }
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-14">
          <SectionHeading eyebrow="All-time" title="Fan favorites" meta="Most favorited on AniList" />

          {loadingAniListFavorites && aniListEntries.length === 0 ? (
            <PosterGridSkeleton className="mt-6" count={12} />
          ) : (
            <div className={cn(POSTER_GRID_CLASS, 'mt-6')}>
              {aniListEntries.map((entry) => (
                <PosterCard
                  key={entry.item.key}
                  item={entry.item}
                  preview
                  footer={
                    <>
                      <p className="mt-1.5 text-[11px] font-bold uppercase tracking-widest text-white/35">
                        {entry.note}
                      </p>
                      <AddToListButton
                        saved={savedIds.has(entry.suggestion.animeId)}
                        pending={pendingAddId === entry.suggestion.animeId}
                        onAdd={() => addSuggestion(entry.suggestion)}
                      />
                    </>
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Fed by the same genre weights as the "Your genres" chips above, so the
            row is about what this visitor finishes rather than a global chart. */}
        <MangaPicksSection
          className="mt-14"
          genres={(genrePrefs ?? []).map((preference) => preference.genre)}
        />
      </main>

      <MobileNav />
    </div>
  );
}

/** One empty state for all eight tabs, so no tab invents its own. */
function EmptyPanel({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl border border-white/[0.07] bg-white/[0.02] py-20 text-center">
      {icon}
      <p className="text-base font-bold text-white/70">{title}</p>
      <p className="max-w-sm text-sm text-white/40">{hint}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** A single taste-profile figure. */
function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{label}</p>
      <p className="font-display mt-2 text-2xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs text-white/40">{hint}</p>
    </div>
  );
}

/**
 * The suggestion cards' add control. A real button under the poster rather than
 * the old hover-only overlay, which was unreachable on touch.
 */
function AddToListButton({
  saved,
  pending,
  onAdd,
}: {
  saved: boolean;
  pending: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={saved || pending}
      className={cn(
        'mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors',
        saved
          ? 'border-primary/25 bg-primary/10 text-primary'
          : 'border-white/10 bg-white/[0.04] text-white/70 hover:border-primary/50 hover:text-primary disabled:opacity-50',
      )}
    >
      {saved ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {saved ? 'In your list' : pending ? 'Adding…' : 'Add to list'}
    </button>
  );
}
