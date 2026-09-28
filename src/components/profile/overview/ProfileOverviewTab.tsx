import { memo } from 'react';
import { OverviewAchievements } from './OverviewAchievements';
import { computeRankScore } from '@/lib/rankUtils';
import { OverviewActivityHeatmap } from './OverviewActivityHeatmap';
import { OverviewCalendarSaves } from './OverviewCalendarSaves';
import { OverviewReviews } from './OverviewReviews';
import { OverviewMangaAnalytics } from './OverviewMangaAnalytics';
import { OverviewHeroStats } from './OverviewHeroStats';
import { OverviewInteractiveCharts } from './OverviewInteractiveCharts';
import { OverviewSocialConnections } from './OverviewSocialConnections';
import { OverviewWidgetsRail } from './OverviewWidgetsRail';
import { OverviewExternalStats } from './OverviewExternalStats';
import { OverviewLibraryDistribution } from './OverviewLibraryDistribution';
import { OverviewRatingDistribution } from './OverviewRatingDistribution';
import { OverviewGenreAnalytics } from './OverviewGenreAnalytics';
import { OverviewTasteBreakdown } from './OverviewTasteBreakdown';
import { OverviewWatchingHabits } from './OverviewWatchingHabits';
import { OverviewCommunityAnalytics } from './OverviewCommunityAnalytics';
import { OverviewGrowthTrends } from './OverviewGrowthTrends';
import { OverviewFavoriteCharacters } from './OverviewFavoriteCharacters';
import { OverviewSmartInsights } from './OverviewSmartInsights';
import type { WatchAchievement } from '@/hooks/user/useWatchStreaks';
import type { ExternalStats } from '@/lib/externalIntegrations';
import type { TasteProfile } from '@/core/recommendations/types';
import type { RatingRow } from '@/core/profile/ratingStats';
import type { CharacterFavorite } from '@/hooks/user/useCharacterFavorites';
import type { ReputationTerm } from '@/core/profile/reputation';
import type { Insight } from '@/core/profile/insights';

export interface ProfileOverviewTabProps {
  userId?: string;
  username?: string | null;
  isViewingOther?: boolean;
  /** Viewed profile's privacy flags — gate the public calendar read when isViewingOther. */
  isPublic?: boolean;
  showCalendar?: boolean;
  watchTimeSeconds: number;
  episodesCount: number;
  completedAnimeCount: number;
  watchingAnimeCount: number;
  planToWatchCount?: number;
  mangaCount: number;
  manhwaCount: number;
  comicsCount: number;
  totalChaptersRead: number;
  /** Chapter totals per reading track — drive the manga/manhwa/comic rank ladders. */
  readingTotals?: { manga: number; manhwa: number; comic: number } | null;
  streakDays: number;
  longestStreak: number;
  totalDaysActive?: number;
  commentCount: number;
  forumPostCount: number;
  forumUpvotes?: number;
  reputationRate?: number;
  reputationBreakdown?: ReputationTerm[];
  leaderboardRank?: number | null;
  totalRankedUsers?: number | null;
  followersCount?: number;
  followingCount?: number;
  watchlist?: any[];
  history?: any[];
  mangaReadlist?: any[];
  ratings?: RatingRow[];
  commentDates?: Array<{ created_at?: string | null }>;
  favoriteCharacters?: CharacterFavorite[];
  favoriteCharactersLoading?: boolean;
  tasteProfile?: TasteProfile | null;
  tasteProfileLoading?: boolean;
  insights?: Insight[];
  achievements?: WatchAchievement[];
  externalStats?: ExternalStats[];
  externalStatsLoading?: boolean;
  onNavigateTab?: (tabKey: string) => void;
  onStatClick?: (statKey: string) => void;
}

export const ProfileOverviewTab = memo(function ProfileOverviewTab({
  userId,
  username,
  isViewingOther = false,
  isPublic = false,
  showCalendar = true,
  watchTimeSeconds,
  episodesCount,
  completedAnimeCount,
  watchingAnimeCount,
  planToWatchCount = 0,
  mangaCount,
  manhwaCount,
  comicsCount,
  totalChaptersRead,
  readingTotals,
  streakDays,
  longestStreak,
  totalDaysActive = 0,
  commentCount,
  forumPostCount,
  forumUpvotes = 0,
  reputationRate,
  reputationBreakdown = [],
  leaderboardRank = null,
  totalRankedUsers = null,
  followersCount = 0,
  followingCount = 0,
  watchlist = [],
  history = [],
  mangaReadlist = [],
  ratings = [],
  commentDates = [],
  favoriteCharacters = [],
  favoriteCharactersLoading = false,
  tasteProfile = null,
  tasteProfileLoading = false,
  insights = [],
  achievements = [],
  externalStats = [],
  externalStatsLoading = false,
  onNavigateTab,
  onStatClick,
}: ProfileOverviewTabProps) {
  const navigateTab = onNavigateTab ?? (() => undefined);

  const rankUnits = {
    episodes: episodesCount,
    manga: readingTotals?.manga ?? 0,
    manhwa: readingTotals?.manhwa ?? 0,
    comic: readingTotals?.comic ?? 0,
  };
  const rankScore = computeRankScore(rankUnits);

  return (
    <div className="space-y-5">
      <OverviewHeroStats
        watchTimeSeconds={watchTimeSeconds}
        episodesCount={episodesCount}
        completedAnimeCount={completedAnimeCount}
        watchingAnimeCount={watchingAnimeCount}
        planToWatchCount={planToWatchCount}
        mangaCount={mangaCount}
        manhwaCount={manhwaCount}
        comicsCount={comicsCount}
        totalChaptersRead={totalChaptersRead}
        streakDays={streakDays}
        longestStreak={longestStreak}
        totalDaysActive={totalDaysActive}
        commentCount={commentCount}
        forumPostCount={forumPostCount}
        forumUpvotes={forumUpvotes}
        reputationRate={reputationRate}
        onStatClick={onStatClick}
      />

      {!isViewingOther && (
        <OverviewExternalStats stats={externalStats} isLoading={externalStatsLoading} />
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <OverviewLibraryDistribution watchlist={watchlist} mangaReadlist={mangaReadlist} />
        <OverviewRatingDistribution ratings={ratings} />
      </div>

      <OverviewInteractiveCharts
        animeCount={episodesCount}
        manhwaCount={manhwaCount}
        mangaCount={mangaCount}
        comicsCount={comicsCount}
        watchTimeSeconds={watchTimeSeconds}
        commentCount={commentCount}
        forumPostCount={forumPostCount}
        reputationRate={reputationRate}
        history={history}
      />

      {!isViewingOther && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <OverviewGenreAnalytics profile={tasteProfile} isLoading={tasteProfileLoading} />
          <OverviewTasteBreakdown profile={tasteProfile} isLoading={tasteProfileLoading} />
        </div>
      )}
         <div className="grid grid-cols-1 gap-5 xl:grid-cols-1">

      <OverviewMangaAnalytics mangaReadlist={mangaReadlist} />
        <OverviewGrowthTrends
        history={history}
        watchlist={watchlist}
        mangaReadlist={mangaReadlist}
        ratings={ratings}
        comments={commentDates}
      />
</div>
    

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <OverviewWatchingHabits
          history={history}
          currentStreak={streakDays}
          longestStreak={longestStreak}
        />
        <OverviewCommunityAnalytics
          commentCount={commentCount}
          forumPostCount={forumPostCount}
          forumUpvotes={forumUpvotes}
          followersCount={followersCount}
          followingCount={followingCount}
          reputationScore={reputationRate != null ? Math.round(reputationRate) : undefined}
          reputationBreakdown={reputationBreakdown}
          leaderboardRank={leaderboardRank}
          totalRankedUsers={totalRankedUsers}
        />
      </div>

      <OverviewWidgetsRail
        watchlist={watchlist}
        history={history}
        mangaReadlist={mangaReadlist}
        onNavigateTab={navigateTab}
        isViewingOther={isViewingOther}
      />

      <OverviewFavoriteCharacters
        characters={favoriteCharacters}
        isLoading={favoriteCharactersLoading}
        isViewingOther={isViewingOther}
      />

      <OverviewActivityHeatmap
        history={history}
        mangaReadlist={mangaReadlist}
        commentDates={commentDates}
        currentStreak={streakDays}
        longestStreak={longestStreak}
        userId={userId}
      />

      {isViewingOther ? (
        // Other user's calendar shows only when their profile is public and they
        // haven't opted out (show_calendar). Otherwise reviews take the full row.
        isPublic && showCalendar ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <OverviewCalendarSaves
              userId={userId}
              isViewingOther
              isPublic={isPublic}
              showCalendar={showCalendar}
            />
            <OverviewReviews ratings={ratings} watchlist={watchlist} history={history} isViewingOther />
          </div>
        ) : (
          <OverviewReviews
            ratings={ratings}
            watchlist={watchlist}
            history={history}
            isViewingOther
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <OverviewCalendarSaves />
          <OverviewReviews ratings={ratings} watchlist={watchlist} history={history} />
        </div>
      )}


      <OverviewAchievements
        streakDays={streakDays}
        longestStreak={longestStreak}
        episodesCount={episodesCount}
        rankScore={rankScore}
        units={rankUnits}
        onNavigateTab={navigateTab}
      />
 <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <OverviewSocialConnections
        userId={userId}
        username={username}
        followersCount={followersCount}
        followingCount={followingCount}
      />
            <OverviewSmartInsights insights={insights} />

    </div>
    
    </div>
   
  );
});
