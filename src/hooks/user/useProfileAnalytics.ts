import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserRatings } from "@/hooks/user/useUserRatings";
import { useUserComments } from "@/hooks/user/useUserComments";
import { useTasteProfile } from "@/hooks/user/useTasteProfile";
import { useCharacterFavorites } from "@/hooks/user/useCharacterFavorites";
import { useUserRank } from "@/hooks/community/useLeaderboard";
import { computeReputation } from "@/core/profile/reputation";
import { computeLibraryDistribution } from "@/core/profile/libraryDistribution";
import { computeWatchingHabits } from "@/core/profile/watchingHabits";
import { computeRatingDistribution } from "@/core/profile/ratingStats";
import { computeMonthlySeries } from "@/core/profile/growthSeries";
import { deriveInsights } from "@/core/profile/insights";
import { supabase } from "@/integrations/supabase/client";

/** Shared profile/Favorites analytics. Keep activity and ranking calculations identical. */
export function useProfileAnalytics({
  profile,
  isViewingOther = false,
  watchlist,
  history,
  mangaReadlist,
  ownNovelReadlist,
  viewedStreak,
  forumPosts,
  followStats,
}: {
  profile: { user_id: string } | null | undefined;
  isViewingOther?: boolean;
  watchlist: any[] | undefined;
  history: any[] | undefined;
  mangaReadlist: any[] | undefined;
  ownNovelReadlist: any[];
  viewedStreak:
    | { longestStreak?: number; currentStreak?: number }
    | null
    | undefined;
  forumPosts: any[];
  followStats: { followers?: number; following?: number } | undefined;
}) {
  // Analytics data sources for the Overview tab.
  const {
    data: userRatings = [],
    isLoading: ratingsLoading,
    isError: ratingsError,
    refetch: refetchRatings,
  } = useUserRatings(profile?.user_id);
  const {
    data: userCommentRows = [],
    isLoading: commentsLoading,
    isError: commentsError,
    refetch: refetchComments,
  } = useUserComments(profile?.user_id);
  const {
    data: favoriteCharacters = [],
    isLoading: loadingFavoriteCharacters,
  } = useCharacterFavorites(profile?.user_id);
  const { data: tasteProfile = null, isLoading: loadingTasteProfile } =
    useTasteProfile(!isViewingOther);
  const { data: userRank = null } = useUserRank("active", profile?.user_id);

  const {
    data: commentsCount = 0,
    isLoading: countLoading,
    isError: countError,
    refetch: refetchCount,
  } = useQuery({
    queryKey: ["user_comments_count", profile?.user_id],
    enabled: !!profile?.user_id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("comments" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile!.user_id);
      if (error) throw error;
      return count || 0;
    },
  });

  const mangaCounts = useMemo(() => {
    let manga = 0,
      manhwa = 0,
      comics = 0,
      totalChapters = 0;
    (mangaReadlist || []).forEach((item: any) => {
      const format = (item.format || "").toLowerCase();
      if (format === "manhwa") {
        manhwa++;
      } else if (format === "comic") {
        comics++;
      } else {
        manga++;
      }
      if (item.last_chapter_number)
        totalChapters += Number(item.last_chapter_number) || 0;
    });
    return { manga, manhwa, comics, totalChapters };
  }, [mangaReadlist]);

  const forumUpvotes = useMemo(
    () =>
      (forumPosts || []).reduce(
        (acc: number, p: any) => acc + (p.upvotes || 0),
        0
      ),
    [forumPosts]
  );

  const novelChaptersRead = useMemo(
    () =>
      (ownNovelReadlist || []).reduce(
        (acc: number, item: any) =>
          acc + (Number(item.last_chapter_number) || 0),
        0
      ),
    [ownNovelReadlist]
  );

  // Real reputation score (0–100) from actual activity signals. viewedStreak is
  // resolved for whichever profile is open (own or public), so streak now
  // contributes for other users too.
  const reputation = useMemo(
    () =>
      computeReputation({
        episodes: history?.length || 0,
        longestStreak: viewedStreak?.longestStreak || 0,
        ratingsCount: userRatings.length,
        commentsCount: commentsCount,
        forumPosts: forumPosts?.length || 0,
        forumUpvotes,
        followers: followStats?.followers || 0,
      }),
    [
      history,
      viewedStreak,
      userRatings,
      commentsCount,
      forumPosts,
      forumUpvotes,
      followStats,
    ]
  );
  const reputationRate = reputation.score;

  // Derived analytics shared across the Overview cards.
  const libraryDistribution = useMemo(
    () => computeLibraryDistribution(watchlist || [], mangaReadlist || []),
    [watchlist, mangaReadlist]
  );

  const overviewInsights = useMemo(() => {
    const habits = computeWatchingHabits(history || []);
    const ratingDist = computeRatingDistribution(userRatings);
    const growth = computeMonthlySeries({
      history: history || [],
      watchlist: watchlist || [],
      mangaReadlist: mangaReadlist || [],
      ratings: userRatings,
      comments: userCommentRows,
    });
    return deriveInsights({
      distribution: libraryDistribution,
      habits,
      ratings: ratingDist,
      growth,
      topGenre: tasteProfile?.topGenres?.[0]?.genre ?? null,
      currentStreak: viewedStreak?.currentStreak || 0,
      longestStreak: viewedStreak?.longestStreak || 0,
    });
  }, [
    history,
    userRatings,
    watchlist,
    mangaReadlist,
    userCommentRows,
    libraryDistribution,
    tasteProfile,
    viewedStreak,
  ]);

  return {
    retry: () =>
      Promise.all([refetchRatings(), refetchComments(), refetchCount()]),
    loading: ratingsLoading || commentsLoading || countLoading,
    error: ratingsError || commentsError || countError,
    userRatings,
    userCommentRows,
    favoriteCharacters,
    loadingFavoriteCharacters,
    tasteProfile,
    loadingTasteProfile,
    userRank,
    commentsCount,
    mangaCounts,
    forumUpvotes,
    novelChaptersRead,
    reputation,
    reputationRate,
    libraryDistribution,
    overviewInsights,
  };
}
