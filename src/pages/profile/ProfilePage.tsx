import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { WatchStreaks } from '@/components/profile/WatchStreaks';
import { useWatchStreaks, usePublicWatchStreaks } from '@/hooks/user/useWatchStreaks';
import { useExternalStats } from '@/hooks/user/useExternalStats';
import { ProfileOverviewTab } from '@/components/profile/overview';
import { WatchlistTab, MangaReadlistTab, HistoryTab, VaultTab } from '@/components/profile/tabs';
import { ProfileSettingsSheet } from '@/components/profile/ProfileSettingsSheet';
import { ProfileBackgroundEffects } from '@/components/profile/ProfileBackgroundEffects';
import { readProfileCustomization, ambientAccentStyle } from '@/lib/profileSettings';
import { Seo } from '@/components/seo/Seo';
import { useWatchlist } from '@/hooks/user/useWatchlist';
import { useWatchHistory } from '@/hooks/user/useWatchHistory';
import { usePublicProfile, usePublicWatchlist, usePublicWatchHistory } from '@/hooks/user/useProfileFeatures';
import {
  useMangaReadlist,
  usePublicMangaReadlist,
  useReadingTrackTotals,
  usePublicReadingTrackTotals,
  type MangaReadlistStatus,
} from '@/hooks/user/useMangaReadlist';
import { useUserForumPosts } from '@/hooks/community/useForum';
import { useFollow } from '@/hooks/community/useFollow';
import { useUserRank } from '@/hooks/community/useLeaderboard';
import { useUserRatings } from '@/hooks/user/useUserRatings';
import { useUserComments } from '@/hooks/user/useUserComments';
import { useTasteProfile } from '@/hooks/user/useTasteProfile';
import { useCharacterFavorites } from '@/hooks/user/useCharacterFavorites';
import { computeReputation } from '@/core/profile/reputation';
import { computeLibraryDistribution } from '@/core/profile/libraryDistribution';
import { computeWatchingHabits } from '@/core/profile/watchingHabits';
import { computeRatingDistribution } from '@/core/profile/ratingStats';
import { computeMonthlySeries } from '@/core/profile/growthSeries';
import { deriveInsights } from '@/core/profile/insights';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getProxiedImageUrl } from '@/lib/api';
import { AvatarPickerSheet } from '@/components/profile/AvatarPickerSheet';
import { SocialLinksEditor, SocialLinksDisplay, SocialLinks } from '@/components/profile/SocialLinksEditor';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  User, Settings, List, History, LogOut, Edit2, Save, X,
  Play, Trash2, Clock, CheckCircle, Eye, Pause, XCircle, ArrowLeft, Camera, Shield, Sparkles, Globe, Lock, Share2, Library, AlertCircle, UserPlus, UserMinus, Bell, Check,
  Loader2, Flame, BookOpen, LayoutGrid
} from 'lucide-react';
import { useNotifications } from '@/hooks/community/useNotifications';
import { motion } from 'framer-motion';
import { RankBadge } from '@/components/ui/RankBadge';
import { getRankNameStyle, computeRankScore } from '@/lib/rankUtils';
import { UserBadges } from '@/components/ui/UserBadges';
import { useUserBadges } from '@/hooks/community/useUserBadges';

const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  watching: { label: 'Watching', icon: <Play className="w-3 h-3" />, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  completed: { label: 'Completed', icon: <CheckCircle className="w-3 h-3" />, color: 'text-green-400', bg: 'bg-green-400/10' },
  plan_to_watch: { label: 'Plan to Watch', icon: <Eye className="w-3 h-3" />, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  on_hold: { label: 'On Hold', icon: <Pause className="w-3 h-3" />, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  dropped: { label: 'Dropped', icon: <XCircle className="w-3 h-3" />, color: 'text-red-400', bg: 'bg-red-400/10' },
};

const MANGA_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  reading: { label: 'Reading', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  completed: { label: 'Completed', color: 'text-green-300', bg: 'bg-green-500/15' },
  plan_to_read: { label: 'Plan to Read', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  on_hold: { label: 'On Hold', color: 'text-orange-300', bg: 'bg-orange-500/15' },
  dropped: { label: 'Dropped', color: 'text-red-300', bg: 'bg-red-500/15' },
};

const MANGA_READING_ONLY_STATUSES: MangaReadlistStatus[] = ['reading'];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { username: usernameParam, atUsername, slug } = useParams<{ username?: string; atUsername?: string; slug?: string }>();
  const { user, profile: ownProfile, signOut, refreshProfile, isAdmin } = useAuth();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobileApp = useIsMobileApp();
  const isMobile = useIsMobile();
  const showSidebar = !isMobile && !isMobileApp;
  const { data: notifications = [], unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  const viewingUsername = usernameParam ||
    (atUsername?.startsWith('@') ? atUsername.slice(1) : atUsername) ||
    (slug?.startsWith('@') ? slug.slice(1) : undefined);

  const isViewingOther = !!viewingUsername && viewingUsername !== ownProfile?.username;
  // Tracker stats use the profile owner's own tokens, so only fetch on your own profile.
  const { stats: externalStats, isLoading: externalStatsLoading } = useExternalStats(
    ownProfile,
    !isViewingOther,
  );

  const { data: publicProfile, isLoading: loadingPublicProfile, error: publicProfileError } = usePublicProfile(viewingUsername || '');

  const profile = isViewingOther ? publicProfile : ownProfile;

  // Per-profile customization (ambient accent + background effect) — read from the
  // resolved profile so it applies for own AND other viewers.
  const { ambientColor, backgroundEffect } = readProfileCustomization(profile);

  const { data: ownWatchlist, isLoading: loadingOwnWatchlist } = useWatchlist();
  const { data: ownHistory, isLoading: loadingOwnHistory } = useWatchHistory();
  const { data: ownMangaReadlist = [], isLoading: loadingOwnMangaReadlist } = useMangaReadlist();
  const { data: ownMangaReadingHistory = [], isLoading: loadingOwnMangaReadingHistory } = useMangaReadlist(MANGA_READING_ONLY_STATUSES);

  const { data: publicWatchlist = [], isLoading: loadingPublicWatchlist } = usePublicWatchlist(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_watchlist ?? true,
  );

  const { data: publicHistory = [], isLoading: loadingPublicHistory } = usePublicWatchHistory(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_history ?? true,
  );

  const { data: publicMangaReadlist = [], isLoading: loadingPublicMangaReadlist } = usePublicMangaReadlist(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_watchlist ?? true,
  );

  const { data: publicMangaReadingHistory = [], isLoading: loadingPublicMangaReadingHistory } = usePublicMangaReadlist(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_history ?? true,
    MANGA_READING_ONLY_STATUSES,
  );

  // Reading-track chapter totals (all statuses) — drive per-track ranks.
  const { data: ownReadingTotals } = useReadingTrackTotals();
  const { data: publicReadingTotals } = usePublicReadingTrackTotals(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_watchlist ?? true,
  );
  const readingTotals = isViewingOther ? publicReadingTotals : ownReadingTotals;

  const { data: forumPosts = [] } = useUserForumPosts(profile?.user_id);
  const { isFollowing, checkingFollow, followStats, follow, unfollow, isFollowingLoading } = useFollow(profile?.user_id);

  // Analytics data sources for the Overview tab.
  const { data: userRatings = [] } = useUserRatings(profile?.user_id);
  const { data: userCommentRows = [] } = useUserComments(profile?.user_id);
  const { data: favoriteCharacters = [], isLoading: loadingFavoriteCharacters } = useCharacterFavorites(profile?.user_id);
  const { data: tasteProfile = null, isLoading: loadingTasteProfile } = useTasteProfile(!isViewingOther);
  const { data: userRank = null } = useUserRank('active', profile?.user_id);

  const watchlist = isViewingOther ? publicWatchlist : ownWatchlist;
  const history = isViewingOther ? publicHistory : ownHistory;
  const mangaReadlist = isViewingOther ? publicMangaReadlist : ownMangaReadlist;
  const mangaHistorySource = isViewingOther ? publicMangaReadingHistory : ownMangaReadingHistory;
  const loadingWatchlist = isViewingOther ? loadingPublicWatchlist : loadingOwnWatchlist;
  const loadingHistory = isViewingOther ? loadingPublicHistory : loadingOwnHistory;
  const loadingMangaReadlist = isViewingOther ? loadingPublicMangaReadlist : loadingOwnMangaReadlist;
  const loadingMangaHistory = isViewingOther ? loadingPublicMangaReadingHistory : loadingOwnMangaReadingHistory;
  const loadingCombinedHistory = loadingHistory || loadingMangaHistory;

  const computedWatchTimeSeconds = useMemo(() => {
    if (!history || history.length === 0) return 0;
    return history.reduce((total: number, item: any) => {
      const progressSeconds = Number(item?.progress_seconds);
      if (Number.isFinite(progressSeconds) && progressSeconds > 0) return total + progressSeconds;
      const durationSeconds = Number(item?.duration_seconds);
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) return total + durationSeconds;
      return total;
    }, 0);
  }, [history]);

  const mangaHistoryEntries = useMemo(() => {
    return [...(mangaHistorySource || [])]
      .filter((entry: any) => {
        if (!entry) return false;
        const status = String(entry.status || '').trim().toLowerCase();
        if (status !== 'reading') return false;
        return Boolean(
          entry.last_chapter_key ||
            entry.last_chapter_number != null ||
            (entry.last_chapter_title && String(entry.last_chapter_title).trim().length > 0),
        );
      })
      .sort((left: any, right: any) => new Date(right?.updated_at || 0).getTime() - new Date(left?.updated_at || 0).getTime());
  }, [mangaHistorySource]);

  const hasAnimeHistory = Boolean(history && history.length > 0);
  const hasMangaHistory = mangaHistoryEntries.length > 0;

  // Rank/episode counts reflect REAL watch activity only. Manual achievement
  // grants unlock badges (via the streak hook), but no longer inflate the
  // episode count or rank — that mismatch was the Overview↔Streaks↔Wrapped
  // inconsistency (e.g. "600 episodes / Hashira" vs a real 106 / Bankai).
  const effectiveEpisodeCount = history?.length || 0;

  // One unified rank per user: episodes + weighted reading chapters/issues.
  const profileRankScore = computeRankScore({
    episodes: effectiveEpisodeCount,
    manga: readingTotals?.manga ?? 0,
    manhwa: readingTotals?.manhwa ?? 0,
    comic: readingTotals?.comic ?? 0,
  });

  const showWatchlistTab = !isViewingOther || (publicProfile?.is_public && publicProfile?.show_watchlist !== false);
  const showHistoryTab = !isViewingOther || (publicProfile?.is_public && publicProfile?.show_history !== false);

  const { streak: ownStreak, achievements: ownAchievements = [], stats: ownStreakStats } = useWatchStreaks();
  const { streak: publicStreak, achievements: publicAchievements = [], stats: publicStreakStats } = usePublicWatchStreaks(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_history ?? true,
  );
  // Show the *viewed* user's streaks/achievements/stats when looking at someone else.
  const viewedStreak = isViewingOther ? publicStreak : ownStreak;
  const achievements = isViewingOther ? publicAchievements : ownAchievements;
  const viewedStreakStats = isViewingOther ? publicStreakStats : ownStreakStats;

  const { data: profileBadges = [] } = useUserBadges(profile?.user_id);

  const { data: commentsCount = 0 } = useQuery({
    queryKey: ['user_comments_count', profile?.user_id],
    enabled: !!profile?.user_id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('comments' as any)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile!.user_id);
      if (error) return 0;
      return count || 0;
    },
  });

  const mangaCounts = useMemo(() => {
    let manga = 0, manhwa = 0, comics = 0, totalChapters = 0;
    (mangaReadlist || []).forEach((item: any) => {
      const title = (item.manga_title || '').toLowerCase();
      const format = (item.format || '').toLowerCase();
      if (format.includes('manhwa') || title.includes('manhwa') || title.includes('solo leveling') || title.includes('ranker') || title.includes('tower of god')) {
        manhwa++;
      } else if (format.includes('comic') || title.includes('comic')) {
        comics++;
      } else {
        manga++;
      }
      if (item.last_chapter_number) totalChapters += Number(item.last_chapter_number) || 0;
    });
    return { manga, manhwa, comics, totalChapters };
  }, [mangaReadlist]);

  const forumUpvotes = useMemo(
    () => (forumPosts || []).reduce((acc: number, p: any) => acc + (p.upvotes || 0), 0),
    [forumPosts],
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
    [history, viewedStreak, userRatings, commentsCount, forumPosts, forumUpvotes, followStats],
  );
  const reputationRate = reputation.score;

  // Derived analytics shared across the Overview cards.
  const libraryDistribution = useMemo(
    () => computeLibraryDistribution(watchlist || [], mangaReadlist || []),
    [watchlist, mangaReadlist],
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
  }, [history, userRatings, watchlist, mangaReadlist, userCommentRows, libraryDistribution, tasteProfile, viewedStreak]);

  const [activeTab, setActiveTab] = useState<string>('overview');

  // Allow deep-linking to a tab, e.g. Continue Watching's "History" button → /profile?tab=history.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'watchlist', 'manga-readlist', 'history', 'vault', 'streaks'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user && !isViewingOther) {
      refreshProfile();
    }
  }, []);

  if (isViewingOther && !loadingPublicProfile && (publicProfileError || !publicProfile)) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        {showSidebar && <Sidebar />}
        <main className={cn("relative z-10 w-full", !isDesktopApp && "md:pl-24")}>
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
            <div className="text-center">
              <Lock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h1 className="text-2xl font-bold mb-2">Profile Not Available</h1>
              <p className="text-muted-foreground mb-6">This profile is private or doesn't exist.</p>
              <Button onClick={() => navigate('/')}>Go Home</Button>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  if (isViewingOther && loadingPublicProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !isViewingOther) {
    navigate('/auth');
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    toast.success('Signed out');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const stats = {
    total: watchlist?.length || 0,
    watching: watchlist?.filter(i => i.status === 'watching').length || 0,
    completed: watchlist?.filter(i => i.status === 'completed').length || 0,
    plan_to_watch: watchlist?.filter(i => i.status === 'plan_to_watch').length || 0,
    watchTimeSeconds: computedWatchTimeSeconds,
  };

  const formatWatchTime = (seconds: number): string => {
    if (seconds === 0) return '0 hours';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground overflow-x-hidden relative"
      style={ambientAccentStyle(ambientColor)}
    >
      {profile?.username && (
        <Seo
          title={profile.display_name || profile.username}
          description={profile.bio || `${profile.display_name || profile.username}'s anime profile on Tatakai.`}
          image={profile.banner_url || profile.avatar_url || undefined}
          canonicalPath={`/user/${profile.username}`}
          kind="profile"
        />
      )}
      {showSidebar && <Sidebar />}

      {/* ── Per-profile animated background effect (visible to all viewers) ── */}
      <ProfileBackgroundEffects effect={backgroundEffect} />

      {/* ── Ambient Background Color Bleed Throughout Whole Page ── */}
      {profile?.banner_url && (
        <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none -z-10">
          <img
            src={profile.banner_url}
            alt=""
            className="w-full h-full object-cover opacity-[0.15] md:opacity-[0.25] blur-[100px] saturate-[2.5] transform scale-125"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background/95" />
        </div>
      )}

      <main className={cn(
        "relative z-10 w-full",
        !isDesktopApp && "md:pl-24"
      )}>
        
        {/* ── Cinematic Hero Banner ── */}
        <div className="h-[360px] md:h-[500px] relative w-full overflow-hidden group select-none">
          {profile?.banner_url ? (
            <img
              src={profile.banner_url}
              alt="Profile banner"
              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-[2s] ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
          )}

          {/* Cinematic blending overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent opacity-90 pointer-events-none" />
          
          {/* Banner Picker Button - Only show for own profile */}
          {!isViewingOther && (
            <AvatarPickerSheet
              type="banner"
              currentImage={profile?.banner_url || undefined}
              trigger={
                <button className="absolute top-6 right-6 px-4 py-2 rounded-full bg-black/40 hover:bg-black/60 text-white/90 text-xs font-bold flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-xl border border-white/20 shadow-2xl hover:scale-105 z-10">
                  <Camera className="w-3.5 h-3.5" />
                  Change Cover
                </button>
              }
            />
          )}

          {isViewingOther && (
            <div className="absolute top-6 left-6 z-20">
              <button
                onClick={() => navigate(-1)}
                className="group flex items-center gap-2 text-xs font-bold text-white/90 hover:text-white transition-all backdrop-blur-xl px-4 py-2 rounded-full bg-black/40 border border-white/20 shadow-xl hover:bg-black/60"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                <span>Back</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Profile Header Section ── */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 relative z-20 pb-20">
          
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 md:gap-10 -mt-20 md:-mt-24 mb-10"
          >
            {/* Left side: Avatar and Core Details */}
            <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8 w-full xl:w-auto">
              
              {/* Avatar Container */}
              <div className="relative group shrink-0">
                <div className="w-36 h-36 md:w-48 md:h-48 rounded-full overflow-hidden bg-background ring-[6px] md:ring-[8px] ring-background shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-white/10 z-10 relative">
                  <Avatar className="w-full h-full">
                    <AvatarImage src={profile?.avatar_url || undefined} className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105" />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-5xl font-black uppercase">
                      {profile?.display_name?.[0] || (isViewingOther ? 'U' : user?.email?.[0]) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {!isViewingOther && (
                  <AvatarPickerSheet
                    type="avatar"
                    currentImage={profile?.avatar_url || undefined}
                    trigger={
                      <button className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 border-2 border-background z-20">
                        <Sparkles className="w-4 h-4" />
                      </button>
                    }
                  />
                )}
              </div>

              {/* User Details & Actions */}
              <div className="flex flex-col items-center md:items-start text-center md:text-left w-full pb-2">
                
                {/* Header Name & Badges */}
                <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap mb-1">
                  {(() => {
                    const rankStyle = getRankNameStyle(profileRankScore);
                    return (
                      <h1 className="text-3xl md:text-5xl font-black tracking-tight drop-shadow-xl font-display">
                        <span className={rankStyle.className} style={rankStyle.style}>
                          {profile?.display_name || (profile?.username && profile?.username !== 'null' ? profile?.username : 'User')}
                        </span>
                      </h1>
                    );
                  })()}
                  
                  <UserBadges badges={profileBadges} size={22} />
                </div>

                {/* Username & Rank Row */}
                <div className="flex items-center justify-center md:justify-start gap-3 mb-5 flex-wrap">
                  <span className="text-sm font-medium text-muted-foreground/80 hover:text-muted-foreground transition-colors">
                    @{profile?.username && profile?.username !== 'null' ? profile.username : 'anonymous'}
                  </span>
                  <div className="w-1 h-1 rounded-full bg-white/20" />
                  {/* One unified rank across anime + manga/manhwa/comic. */}
                  <RankBadge score={profileRankScore} size="sm" />
                </div>

                {/* Sleek Action Buttons */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 w-full">
                  {isViewingOther ? (
                    <>
                      {user && (
                        <Button
                          onClick={() => isFollowing ? unfollow() : follow()}
                          disabled={isFollowingLoading || checkingFollow}
                          className={cn(
                            "rounded-full h-9 px-6 font-bold text-xs transition-all shadow-xl",
                            isFollowing 
                              ? "bg-white/10 hover:bg-white/20 text-white border border-white/10" 
                              : "bg-primary hover:bg-primary/90 text-primary-foreground hover:scale-105"
                          )}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const shareUrl = window.location.href;
                          navigator.clipboard.writeText(shareUrl);
                          toast.success('Profile link copied!');
                        }}
                        className="rounded-full h-9 px-5 bg-white/5 hover:bg-white/15 border border-white/10 text-white text-xs font-bold transition-all backdrop-blur-md"
                      >
                        <Share2 className="w-3.5 h-3.5 mr-2" /> Share
                      </Button>
                    </>
                  ) : (
                    <>
                      <ProfileSettingsSheet
                        trigger={
                          <Button
                            variant="secondary"
                            className="rounded-full h-9 px-5 bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-bold transition-all backdrop-blur-md hover:scale-105 shadow-xl"
                          >
                            <Settings className="w-3.5 h-3.5 mr-2" /> Profile Settings
                          </Button>
                        }
                      />
                      <SocialLinksEditor
                        currentLinks={(ownProfile as any)?.social_links || {}}
                        isPublic={ownProfile?.is_public ?? false}
                        showWatchlist={(ownProfile as any)?.show_watchlist ?? true}
                        showHistory={(ownProfile as any)?.show_history ?? true}
                        trigger={
                          <Button variant="secondary" className="rounded-full h-9 px-5 bg-white/5 hover:bg-white/15 border border-white/10 text-white/90 text-xs font-bold transition-all backdrop-blur-md shadow-xl">
                            <Share2 className="w-3.5 h-3.5 mr-2" /> Social Links
                          </Button>
                        }
                      />
                      {isAdmin && (
                        <Button
                          variant="secondary"
                          onClick={() => navigate('/admin')}
                          className="rounded-full h-9 px-5 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary text-xs font-bold transition-all backdrop-blur-md shadow-xl"
                        >
                          <Shield className="w-3.5 h-3.5 mr-2" /> Dashboard
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right side: Sleek Stats Card (Desktop Only) */}
            <div className="hidden xl:flex items-center gap-6 bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2rem] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] min-w-[380px] justify-between">
              <div className="flex flex-col items-center px-2 flex-1">
                <span className="text-2xl font-black text-white drop-shadow-md">{stats.completed}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Anime</span>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="flex flex-col items-center px-2 flex-1">
                <span className="text-2xl font-black text-white drop-shadow-md">{mangaCounts.totalChapters}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Chapters</span>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="flex flex-col items-center px-2 flex-1">
                <span className="text-2xl font-black text-white drop-shadow-md">{followStats?.followers || 0}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Friends</span>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="flex flex-col items-center px-2 flex-1">
                <span className="text-2xl font-black text-white drop-shadow-md">{formatWatchTime(stats.watchTimeSeconds)}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Time</span>
              </div>
            </div>

          </motion.div>

          {/* Bio & Social Links Section */}
          <div className="flex flex-col md:flex-row gap-8 mb-10 w-full max-w-3xl">
            <div className="w-full">
              {profile?.bio && (
                <p className="text-[15px] text-muted-foreground/90 leading-relaxed font-normal whitespace-pre-line mb-5">
                  {profile.bio}
                </p>
              )}
              {profile?.social_links && (
                <div>
                  <SocialLinksDisplay links={profile.social_links as SocialLinks} />
                </div>
              )}
            </div>
          </div>

          {/* ── Content Tabs ── */}
          <div className="mt-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                  <TabsList
                    className="
                      bg-white/[0.03]
                      backdrop-blur-2xl
                      p-2
                      border border-white/[0.08]
                      rounded-full
                      w-full
                      md:w-auto
                      mx-auto
                      flex items-center justify-center
                      gap-1.5
                      overflow-x-auto
                      overflow-y-hidden
                      whitespace-nowrap
                      shadow-xl
                      no-scrollbar
                    "
                  >
                <TabsTrigger
                  value="overview"
                  className="shrink-0 gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.4)] rounded-full px-5 py-2.5 text-sm font-bold whitespace-nowrap transition-all"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Overview
                </TabsTrigger>
                {showWatchlistTab && (
                  <TabsTrigger value="watchlist" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.4)] rounded-full px-6 py-2.5 text-sm font-bold transition-all">
                    <List className="w-4 h-4" />
                    Watchlist
                  </TabsTrigger>
                )}
                {showWatchlistTab && (
                  <TabsTrigger value="manga-readlist" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.4)] rounded-full px-6 py-2.5 text-sm font-bold transition-all">
                    <BookOpen className="w-4 h-4" />
                    Manga Readlist
                  </TabsTrigger>
                )}
                {showHistoryTab && (
                  <TabsTrigger value="history" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.4)] rounded-full px-6 py-2.5 text-sm font-bold transition-all">
                    <History className="w-4 h-4" />
                    History
                  </TabsTrigger>
                )}
                <TabsTrigger value="vault" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.4)] rounded-full px-6 py-2.5 text-sm font-bold transition-all">
                  <Library className="w-4 h-4" />
                  Vault
                </TabsTrigger>
                {(!isViewingOther || showHistoryTab) && (
                  <TabsTrigger value="streaks" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.4)] rounded-full px-6 py-2.5 text-sm font-bold transition-all">
                    <Flame className="w-4 h-4" />
                    Streaks
                  </TabsTrigger>
                )}
              </TabsList>

              {isViewingOther && !showWatchlistTab && !showHistoryTab && (
                <div className="text-center py-16 border border-white/5 bg-white/[0.02] backdrop-blur-sm rounded-[2rem]">
                  <Lock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground font-medium">This user has chosen to keep their anime lists private.</p>
                </div>
              )}

              <TabsContent value="overview" className="mt-8 focus-visible:outline-none">
                <ProfileOverviewTab
                  userId={profile?.user_id}
                  username={profile?.username}
                  isViewingOther={isViewingOther}
                  isPublic={(profile as any)?.is_public ?? false}
                  showCalendar={(profile as any)?.show_calendar ?? true}
                  watchTimeSeconds={computedWatchTimeSeconds}
                  episodesCount={effectiveEpisodeCount}
                  completedAnimeCount={stats.completed}
                  watchingAnimeCount={stats.watching}
                  mangaCount={mangaCounts.manga}
                  manhwaCount={mangaCounts.manhwa}
                  comicsCount={mangaCounts.comics}
                  totalChaptersRead={mangaCounts.totalChapters}
                  readingTotals={readingTotals}
                  planToWatchCount={stats.plan_to_watch}
                  streakDays={viewedStreak?.currentStreak || 0}
                  longestStreak={viewedStreak?.longestStreak || 0}
                  totalDaysActive={viewedStreak?.totalDaysWatched || 0}
                  commentCount={commentsCount}
                  forumPostCount={forumPosts?.length || 0}
                  forumUpvotes={forumUpvotes}
                  reputationRate={reputationRate}
                  reputationBreakdown={reputation.breakdown}
                  leaderboardRank={userRank?.rank ?? null}
                  totalRankedUsers={userRank?.totalUsers ?? null}
                  followersCount={followStats?.followers || 0}
                  followingCount={followStats?.following || 0}
                  watchlist={watchlist || []}
                  history={history || []}
                  mangaReadlist={mangaReadlist || []}
                  ratings={userRatings}
                  commentDates={userCommentRows}
                  favoriteCharacters={favoriteCharacters}
                  favoriteCharactersLoading={loadingFavoriteCharacters}
                  tasteProfile={tasteProfile}
                  tasteProfileLoading={loadingTasteProfile}
                  insights={overviewInsights}
                  achievements={achievements}
                  externalStats={externalStats}
                  externalStatsLoading={externalStatsLoading}
                  onNavigateTab={(tabKey) => setActiveTab(tabKey)}
                />
              </TabsContent>

              {showWatchlistTab && (
                <TabsContent value="watchlist" className="mt-8">
                  <WatchlistTab
                    watchlist={watchlist || []}
                    loading={loadingWatchlist}
                    isViewingOther={isViewingOther}
                    onNavigate={navigate}
                  />
                </TabsContent>
              )}

              {showWatchlistTab && (
                <TabsContent value="manga-readlist" className="mt-8">
                  <MangaReadlistTab
                    mangaReadlist={mangaReadlist || []}
                    loading={loadingMangaReadlist}
                    isViewingOther={isViewingOther}
                    onNavigate={navigate}
                  />
                </TabsContent>
              )}

              {showHistoryTab && (
                <TabsContent value="history" className="mt-8">
                  <HistoryTab
                    history={history || []}
                    mangaHistoryEntries={mangaHistoryEntries}
                    loading={loadingCombinedHistory}
                    isViewingOther={isViewingOther}
                    onNavigate={navigate}
                    formatDate={formatDate}
                  />
                </TabsContent>
              )}

              <TabsContent value="vault" className="mt-8">
                <VaultTab
                  userId={profile?.user_id}
                  isViewingOther={isViewingOther}
                  onNavigate={navigate}
                />
              </TabsContent>

              {(!isViewingOther || showHistoryTab) && (
                <TabsContent value="streaks" className="mt-8">
                  <WatchStreaks
                    isOwnProfile={!isViewingOther}
                    rankScore={profileRankScore}
                    streak={isViewingOther ? viewedStreak : undefined}
                    stats={isViewingOther ? viewedStreakStats : undefined}
                  />
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}