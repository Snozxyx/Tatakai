import FavoritesHistory from "./FavoritesHistory";
import FavoritesWatchControls from "./FavoritesWatchControls";
import { ThemedCheckbox } from "@/components/ui/themed-checkbox";
import { ThemedSelect } from "@/components/ui/themed-select";
import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MobileNav } from "@/components/layout/MobileNav";
import { ProfileOverviewTab } from "@/components/profile/overview";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PosterCard } from "@/components/anime/discover/PosterCard";
import {
  POSTER_GRID_CLASS,
  PosterGridSkeleton,
} from "@/components/anime/discover/DiscoverPosterGrid";
import {
  useWatchlist,
  useAddToWatchlist,
  useBulkRemoveFromWatchlist,
  type WatchlistStatus,
} from "@/hooks/user/useWatchlist";
import {
  useMangaReadlist,
  useReadingTrackTotals,
  useUpsertMangaReadlist,
  useRemoveFromMangaReadlist,
  type MangaReadlistStatus,
} from "@/hooks/user/useMangaReadlist";
import {
  useNovelReadlist,
  useUpsertNovelReadlist,
  useRemoveFromNovelReadlist,
  type NovelReadlistStatus,
} from "@/hooks/user/useNovelReadlist";
import { useWatchHistory } from "@/hooks/user/useWatchHistory";
import { useProfileAnalytics } from "@/hooks/user/useProfileAnalytics";
import { useProfileWatchTime } from "@/hooks/user/useProfileWatchTime";
import { useWatchStreaks } from "@/hooks/user/useWatchStreaks";
import { useExternalStats } from "@/hooks/user/useExternalStats";
import { useUserForumPosts } from "@/hooks/community/useForum";
import { useFollow } from "@/hooks/community/useFollow";
import { useResolvedMangaReadlist } from "@/hooks/api/useResolvedMangaReadlist";
import { useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { getReadingHistory, readingHistoryHref } from "@/lib/readingHistory";
import { readlistProgressLabels } from "@/lib/reader/readlistDisplay";
import {
  filterLibrary,
  groupLibrary,
  type LibraryEntry,
} from "@/lib/favoritesLibrary";
import { parseExternalAnimeId } from "@/lib/animeIdMapping";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton-custom";
import "./favorites.css";

const Recommendations = lazy(() => import("./FavoritesRecommendations"));
const TABS = [
  "overview",
  "watchlist",
  "manga",
  "novels",
  "history",
  "recommendations",
] as const;
type Tab = (typeof TABS)[number];
const ANIME_STATUSES = [
  "watching",
  "completed",
  "plan_to_watch",
  "on_hold",
  "dropped",
];
const READING_STATUSES = [
  "reading",
  "completed",
  "plan_to_read",
  "on_hold",
  "dropped",
];
const EMPTY: any[] = [];

function FavoritesLoadingState() {
  return (
    <section
      role="status"
      aria-label="Loading favorites"
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28 rounded-lg" />
          <Skeleton className="h-11 w-28 rounded-lg" />
          <Skeleton className="h-11 w-24 rounded-lg" />
        </div>
      </div>
      <PosterGridSkeleton count={12} />
    </section>
  );
}

export default function FavoritesPage() {
  const { t } = useTranslation();
  const { user, profile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const desktop = useIsDesktopApp();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("tab") as Tab)
    ? (params.get("tab") as Tab)
    : "overview";
  const setParam = (key: string, value: string, replace = false) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(key, value);
        return next;
      },
      { replace }
    );
  const watchlist = useWatchlist();
  const manga = useMangaReadlist();
  const novels = useNovelReadlist();
  const history = useWatchHistory();
  const resolved = useResolvedMangaReadlist(manga.data || EMPTY);
  const totals = useReadingTrackTotals();
  const watchTime = useProfileWatchTime(profile?.user_id, !!user);
  const { streak, achievements } = useWatchStreaks();
  const external = useExternalStats(profile, !!user);
  const forum = useUserForumPosts(profile?.user_id);
  const { followStats } = useFollow(profile?.user_id);
  const analytics = useProfileAnalytics({
    profile,
    watchlist: watchlist.data,
    history: history.data,
    mangaReadlist: resolved.data,
    ownNovelReadlist: novels.data || EMPTY,
    viewedStreak: streak,
    forumPosts: forum.data || EMPTY,
    followStats,
  });
  const animeMutation = useAddToWatchlist();
  const mangaMutation = useUpsertMangaReadlist();
  const novelMutation = useUpsertNovelReadlist();
  const bulkRemove = useBulkRemoveFromWatchlist();
  const removeManga = useRemoveFromMangaReadlist();
  const removeNovel = useRemoveFromNovelReadlist();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<string[]>([]);
  const [managing, setManaging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  useEffect(() => {
    setManaging(false);
    setSelected([]);
  }, [tab]);
  const entries = useMemo<LibraryEntry[]>(
    () => [
      ...(watchlist.data || []).map((row) => ({
        key: `anime:${row.anime_id}`,
        id: row.anime_id,
        kind: "anime" as const,
        title: row.anime_name,
        poster: row.anime_poster,
        status: row.status,
        format: "anime",
        updatedAt: row.updated_at || row.created_at,
        href: `/anime/${encodeURIComponent(row.anime_id)}`,
        source: row,
      })),
      ...[
        ...(resolved.data || []).map((row) => ({
          row,
          kind: "manga" as const,
        })),
        ...(novels.data || []).map((row) => ({ row, kind: "novel" as const })),
      ].map(({ row, kind }) => {
        const progress = readlistProgressLabels(row);
        return {
          key: `${kind}:${row.manga_id}`,
          id: row.manga_id,
          kind,
          title: row.manga_title,
          poster: row.manga_poster,
          status: row.status,
          format: kind === "novel" ? "novel" : row.format || "manga",
          updatedAt: row.updated_at,
          href: `/${kind}/${encodeURIComponent(
            ("resolved_manga_id" in row && row.resolved_manga_id) ||
              row.manga_id
          )}`,
          resumeHref: progress.hasChapter ? readingHistoryHref(row) : undefined,
          progress: [
            progress.chapterLabel,
            kind === "novel"
              ? row.last_chapter_key
                ? `${t("favoritesHub.paragraph")} ${
                    (row.last_page_index || 0) + 1
                  }`
                : null
              : progress.pageLabel,
          ]
            .filter(Boolean)
            .join(" · "),
          source: row,
        };
      }),
    ],
    [watchlist.data, resolved.data, novels.data, t]
  );
  const historyEntries = useMemo<LibraryEntry[]>(
    () => [
      ...(history.data || []).map((row) => ({
        key: `history:${row.id}`,
        id: row.anime_id,
        kind: "anime" as const,
        title: row.anime_name,
        poster: row.anime_poster,
        status: row.completed ? "completed" : "watching",
        format: "anime",
        updatedAt: row.watched_at,
        href: `/watch/${encodeURIComponent(row.episode_id)}`,
        progress: `${t("favoritesHub.episode")} ${row.episode_number}`,
        source: row,
      })),
      ...entries
        .filter(
          (entry) =>
            entry.kind !== "anime" &&
            getReadingHistory([entry.source]).length > 0
        )
        .map((entry) => ({
          ...entry,
          key: `history:${entry.key}`,
          href: readingHistoryHref(entry.source),
        })),
    ],
    [entries, history.data, t]
  );
  const prefix = `${tab}.`;
  const query = params.get(`${prefix}q`) || "";
  const status = params.get(`${prefix}status`) || "all";
  const format = params.get(`${prefix}format`) || "all";
  const sort = params.get(`${prefix}sort`) === "title" ? "title" : "recent";
  const media = params.get("history.media") || "all";
  const days = ["7", "30", "90"].includes(params.get("history.days") || "")
    ? Number(params.get("history.days"))
    : 0;
  const list =
    tab === "history"
      ? historyEntries
      : entries.filter(
          (entry) =>
            entry.kind ===
            (tab === "watchlist"
              ? "anime"
              : tab === "novels"
              ? "novel"
              : "manga")
        );
  const filtered = filterLibrary(list, {
    search: query,
    status: tab === "history" ? "all" : status,
    format: tab === "manga" ? format : "all",
    sort: tab === "history" ? "recent" : sort,
    kind: tab === "history" ? media : "all",
    days: tab === "history" ? days : 0,
  });
  const groups = groupLibrary(filtered);
  const sourceQueries =
    tab === "watchlist"
      ? [watchlist]
      : tab === "manga"
      ? [manga]
      : tab === "novels"
      ? [novels]
      : [watchlist, manga, novels, history];
  const loading =
    sourceQueries.some((query) => query.isLoading) ||
    ((tab === "manga" || tab === "overview" || tab === "history") &&
      resolved.isLoading);
  const failed = sourceQueries.some((query) => query.isError);
  const statuses = tab === "watchlist" ? ANIME_STATUSES : READING_STATUSES;
  const busy =
    animeMutation.isPending ||
    mangaMutation.isPending ||
    novelMutation.isPending ||
    removing;
  const updateStatus = (entry: LibraryEntry, value: string) => {
    if (entry.kind === "anime")
      animeMutation.mutate({
        animeId: entry.id,
        animeName: entry.title,
        animePoster: entry.poster || undefined,
        status: value as WatchlistStatus,
      });
    else if (entry.kind === "novel")
      novelMutation.mutate({
        novelId: entry.id,
        novelTitle: entry.title,
        novelPoster: entry.poster,
        status: value as NovelReadlistStatus,
      });
    else
      mangaMutation.mutate({
        mangaId: entry.id,
        mangaTitle: entry.title,
        mangaPoster: entry.poster,
        format: entry.source.format,
        status: value as MangaReadlistStatus,
      });
  };
  const removeSelected = async () => {
    const targets = entries.filter((entry) => selected.includes(entry.key));
    if (
      !targets.length ||
      !(await confirm({
        title: t("favoritesHub.confirmRemove", { count: targets.length }),
        destructive: true,
      }))
    )
      return;
    setRemoving(true);
    setMutationError(false);
    try {
      const anime = targets.filter((entry) => entry.kind === "anime");
      if (anime.length)
        await bulkRemove.mutateAsync(anime.map((entry) => entry.id));
      for (const entry of targets.filter((entry) => entry.kind !== "anime")) {
        if (entry.kind === "novel")
          await removeNovel.mutateAsync({ novelId: entry.id });
        else await removeManga.mutateAsync({ mangaId: entry.id });
      }
      setSelected([]);
      setManaging(false);
    } catch {
      setMutationError(true);
    } finally {
      setRemoving(false);
    }
  };
  const select = (
    label: string,
    value: string,
    key: string,
    options: Array<[string, string]>
  ) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <ThemedSelect
        aria-label={label}
        value={value}
        onChange={(event) => setParam(key, event.target.value)}
        className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </ThemedSelect>
    </label>
  );
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <main
        className={cn(
          "favorites-hub relative z-10 mx-auto max-w-[1600px] px-4 pb-24 pt-[calc(1rem+env(safe-area-inset-top,0px))] md:py-6 md:pr-8",
          desktop ? "md:pl-8" : "md:pl-32"
        )}
      >
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-medium">{t("favoritesHub.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("favoritesHub.subtitle")}
            </p>
          </div>
          <Heart className="mt-2 size-5 text-primary" aria-hidden="true" />
        </header>
        {!user && authLoading ? (
          <FavoritesLoadingState />
        ) : !user ? (
          <section className="rounded-xl border border-border p-8">
            <h2 className="text-lg font-medium">{t("favoritesHub.signIn")}</h2>
            <Button asChild className="mt-4">
              <Link to="/auth">{t("favoritesHub.signInAction")}</Link>
            </Button>
          </section>
        ) : (
          <>
            <nav
              aria-label={t("favoritesHub.title")}
              className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
            >
              {TABS.map((value) => (
                <Link
                  key={value}
                  aria-current={tab === value ? "page" : undefined}
                  to={{
                    search: (() => {
                      const next = new URLSearchParams(params);
                      next.set("tab", value);
                      return next.toString();
                    })(),
                  }}
                  onClick={() => {
                    setManaging(false);
                    setSelected([]);
                  }}
                  className={cn(
                    "shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tab === value
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`favoritesHub.${value}`)}
                </Link>
              ))}
            </nav>
            <section aria-label={t(`favoritesHub.${tab}`)}>
              {tab === "recommendations" ? (
                <Suspense fallback={<PosterGridSkeleton count={12} />}>
                  <Recommendations />
                </Suspense>
              ) : (
                <>
                  {failed && (
                    <div
                      role="alert"
                      className="mb-4 rounded-lg border border-border p-4 text-sm"
                    >
                      {t("favoritesHub.unavailable")}{" "}
                      <button
                        className="text-primary underline"
                        onClick={() =>
                          sourceQueries.forEach((query) => void query.refetch())
                        }
                      >
                        {t("favoritesHub.retry")}
                      </button>
                    </div>
                  )}
                  {tab === "overview" ? (
                    loading ||
                    analytics.loading ||
                    watchTime.isLoading ||
                    totals.isLoading ||
                    forum.isLoading ? (
                      <div
                        role="status"
                        className="py-8 text-sm text-muted-foreground"
                      >
                        {t("favoritesHub.loading")}
                      </div>
                    ) : failed ? null : analytics.error ||
                      watchTime.isError ||
                      totals.isError ||
                      forum.isError ? (
                      <div
                        role="alert"
                        className="rounded-xl border border-border p-6 text-sm"
                      >
                        <p>{t("favoritesHub.partialAnalytics")}</p>
                        <Button
                          variant="outline"
                          className="mt-3"
                          onClick={() => {
                            void analytics.retry();
                            void watchTime.refetch();
                            void totals.refetch();
                            void forum.refetch();
                          }}
                        >
                          {t("favoritesHub.retry")}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <ProfileOverviewTab
                          userId={profile?.user_id}
                          username={profile?.username}
                          watchTimeSeconds={watchTime.data || 0}
                          episodesCount={history.data?.length || 0}
                          completedAnimeCount={
                            (watchlist.data || []).filter(
                              (row) => row.status === "completed"
                            ).length
                          }
                          watchingAnimeCount={
                            (watchlist.data || []).filter(
                              (row) => row.status === "watching"
                            ).length
                          }
                          planToWatchCount={
                            (watchlist.data || []).filter(
                              (row) => row.status === "plan_to_watch"
                            ).length
                          }
                          mangaCount={analytics.mangaCounts.manga}
                          manhwaCount={analytics.mangaCounts.manhwa}
                          comicsCount={analytics.mangaCounts.comics}
                          totalChaptersRead={
                            analytics.mangaCounts.totalChapters
                          }
                          readingTotals={totals.data}
                          streakDays={streak?.currentStreak || 0}
                          longestStreak={streak?.longestStreak || 0}
                          totalDaysActive={streak?.totalDaysWatched || 0}
                          commentCount={analytics.commentsCount}
                          forumPostCount={forum.data?.length || 0}
                          forumUpvotes={analytics.forumUpvotes}
                          reputationRate={analytics.reputationRate}
                          reputationBreakdown={analytics.reputation.breakdown}
                          leaderboardRank={analytics.userRank?.rank ?? null}
                          totalRankedUsers={
                            analytics.userRank?.totalUsers ?? null
                          }
                          followersCount={followStats?.followers || 0}
                          followingCount={followStats?.following || 0}
                          watchlist={watchlist.data || EMPTY}
                          history={history.data || EMPTY}
                          mangaReadlist={resolved.data}
                          ratings={analytics.userRatings}
                          commentDates={analytics.userCommentRows}
                          favoriteCharacters={analytics.favoriteCharacters}
                          favoriteCharactersLoading={
                            analytics.loadingFavoriteCharacters
                          }
                          tasteProfile={analytics.tasteProfile}
                          tasteProfileLoading={analytics.loadingTasteProfile}
                          insights={analytics.overviewInsights}
                          achievements={achievements}
                          externalStats={external.stats}
                          externalStatsLoading={external.isLoading}
                          onNavigateTab={(value) => {
                            const mapped =
                              (
                                {
                                  readlist: "manga",
                                  "manga-readlist": "manga",
                                  "novel-readlist": "novels",
                                } as Record<string, string>
                              )[value] || value;
                            if (TABS.includes(mapped as Tab))
                              setParam("tab", mapped);
                            else
                              navigate(
                                `/profile?tab=${encodeURIComponent(value)}`
                              );
                          }}
                        />
                      </>
                    )
                  ) : (
                    <>
                      <div className="mb-6 flex flex-wrap items-end gap-3">
                        <label className="min-w-48 flex-1 text-xs text-muted-foreground">
                          {t("favoritesHub.search")}
                          <div className="relative mt-1">
                            <Search
                              className="absolute left-3 top-3 size-4"
                              aria-hidden="true"
                            />
                            <Input
                              className="min-h-11 pl-9"
                              value={query}
                              onChange={(event) =>
                                setParam(`${prefix}q`, event.target.value, true)
                              }
                            />
                          </div>
                        </label>
                        {tab === "history" ? (
                          <>
                            {select(
                              t("favoritesHub.media"),
                              media,
                              "history.media",
                              ["all", "anime", "manga", "novel"].map(
                                (value) => [value, t(`favoritesHub.${value}`)]
                              )
                            )}
                            {select(
                              t("favoritesHub.period"),
                              String(days),
                              "history.days",
                              [
                                ["0", t("favoritesHub.allTime")],
                                ...[7, 30, 90].map(
                                  (value) =>
                                    [
                                      String(value),
                                      t("favoritesHub.days", { count: value }),
                                    ] as [string, string]
                                ),
                              ]
                            )}
                          </>
                        ) : (
                          <>
                            {select(
                              t("favoritesHub.status"),
                              status,
                              `${prefix}status`,
                              [
                                ["all", t("favoritesHub.all")],
                                ...statuses.map(
                                  (value) =>
                                    [value, t(`feedback.status.${value}`)] as [
                                      string,
                                      string
                                    ]
                                ),
                              ]
                            )}
                            {tab === "manga" &&
                              select(
                                t("favoritesHub.format"),
                                format,
                                `${prefix}format`,
                                [
                                  ["all", t("favoritesHub.all")],
                                  ...Array.from(
                                    new Set(list.map((entry) => entry.format))
                                  )
                                    .sort()
                                    .map(
                                      (value) =>
                                        [value, value] as [string, string]
                                    ),
                                ]
                              )}
                            {select(
                              t("favoritesHub.sort"),
                              sort,
                              `${prefix}sort`,
                              [
                                ["recent", t("favoritesHub.recent")],
                                ["title", t("favoritesHub.alphabetical")],
                              ]
                            )}
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setManaging(!managing);
                                setSelected([]);
                              }}
                            >
                              {t(
                                managing
                                  ? "favoritesHub.done"
                                  : "favoritesHub.manage"
                              )}
                            </Button>
                          </>
                        )}
                        <span className="py-3 text-xs tabular-nums text-muted-foreground">
                          {t("favoritesHub.results", {
                            count: filtered.length,
                          })}
                        </span>
                      </div>
                      {managing && (
                        <div className="mb-4 flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() =>
                              setSelected(filtered.map((entry) => entry.key))
                            }
                          >
                            {t("favoritesHub.selectAll")}
                          </Button>
                          <Button
                            variant="destructive"
                            disabled={!selected.length || busy}
                            onClick={removeSelected}
                          >
                            <Trash2 className="mr-2 size-4" />
                            {t("favoritesHub.removeSelected", {
                              count: selected.length,
                            })}
                          </Button>
                        </div>
                      )}
                      {mutationError && (
                        <p
                          role="alert"
                          className="mb-4 text-sm text-destructive"
                        >
                          {t("favoritesHub.mutationFailed")}
                        </p>
                      )}
                      {loading ? (
                        <FavoritesLoadingState />
                      ) : !filtered.length ? (
                        failed ? null : (
                          <p className="rounded-xl border border-border px-6 py-12 text-center text-sm text-muted-foreground">
                            {t(
                              list.length
                                ? "favoritesHub.noMatches"
                                : "favoritesHub.empty"
                            )}
                          </p>
                        )
                      ) : tab === "history" ? (
                        <FavoritesHistory entries={filtered} />
                      ) : (
                        <div className="space-y-8">
                          {groups.map((group) => (
                            <section key={group.status} className="space-y-4">
                              <h2 className="text-lg font-medium">
                                {t(`feedback.status.${group.status}`)}{" "}
                                <span className="ml-2 text-sm tabular-nums text-muted-foreground">
                                  {group.entries.length}
                                </span>
                              </h2>
                              <div className={POSTER_GRID_CLASS}>
                                {group.entries.map((entry, index) => {
                                  const parsed =
                                    entry.kind === "anime"
                                      ? parseExternalAnimeId(entry.id)
                                      : null;
                                  return (
                                    <div
                                      key={entry.key}
                                      className="relative min-w-0"
                                    >
                                      {managing && (
                                        <label className="absolute left-2 top-2 z-40 rounded bg-background/95 p-2">
                                          <ThemedCheckbox
                                            aria-label={t(
                                              "favoritesHub.selectTitle",
                                              { title: entry.title }
                                            )}
                                            checked={selected.includes(
                                              entry.key
                                            )}
                                            onChange={(event) =>
                                              setSelected((previous) =>
                                                event.target.checked
                                                  ? [...previous, entry.key]
                                                  : previous.filter(
                                                      (key) => key !== entry.key
                                                    )
                                              )
                                            }
                                          />
                                        </label>
                                      )}
                                      <PosterCard
                                        item={{
                                          key: entry.key,
                                          title: entry.title,
                                          poster: entry.poster || "",
                                          href: entry.href,
                                          anilistId:
                                            parsed?.provider === "anilist"
                                              ? parsed.id
                                              : undefined,
                                        }}
                                        preview={entry.kind === "anime"}
                                        eager={index < 6}
                                        footer={
                                          <div className="mt-2 space-y-2">
                                            {entry.progress && (
                                              <p className="text-xs text-muted-foreground">
                                                {entry.progress}
                                              </p>
                                            )}
                                            <>
                                              {entry.kind === "anime" && (
                                                <FavoritesWatchControls
                                                  anime={entry.source}
                                                  history={
                                                    history.data || EMPTY
                                                  }
                                                />
                                              )}
                                              {entry.resumeHref && (
                                                <Link
                                                  className="block text-xs font-medium text-primary hover:underline"
                                                  to={entry.resumeHref}
                                                >
                                                  {t("favoritesHub.resume")}
                                                </Link>
                                              )}
                                              <ThemedSelect
                                                aria-label={t(
                                                  "favoritesHub.statusFor",
                                                  { title: entry.title }
                                                )}
                                                value={entry.status}
                                                disabled={busy}
                                                onChange={(event) =>
                                                  updateStatus(
                                                    entry,
                                                    event.target.value
                                                  )
                                                }
                                                className="min-h-10 w-full rounded-lg border border-border bg-background px-2 text-xs"
                                              >
                                                {(entry.kind === "anime"
                                                  ? ANIME_STATUSES
                                                  : READING_STATUSES
                                                ).map((value) => (
                                                  <option
                                                    key={value}
                                                    value={value}
                                                  >
                                                    {t(
                                                      `feedback.status.${value}`
                                                    )}
                                                  </option>
                                                ))}
                                              </ThemedSelect>
                                            </>
                                          </div>
                                        }
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
