import { useParams, useNavigate, Link } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { TierListGrid } from '@/components/tierlist/TierListCard';
import { usePublicProfile, usePublicWatchlist, usePublicWatchHistory } from '@/hooks/useProfileFeatures';
import { useUserTierLists } from '@/hooks/useTierLists';
import {
  ArrowLeft, User, Clock, Heart, List, Trophy, Eye, EyeOff, Calendar, Play, Lock, Globe, UserPlus, UserMinus, ShieldCheck, Shield
} from 'lucide-react';
import { useFollow } from '@/hooks/useFollow';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export default function PublicProfilePage() {
  const { username: usernameParam, atUsername, slug } = useParams<{ username?: string; atUsername?: string; slug?: string }>();
  const navigate = useNavigate();

  // Support both /user/:username, /@username, and /:slug routes
  const username = usernameParam ||
    (atUsername?.startsWith('@') ? atUsername.slice(1) : atUsername) ||
    (slug?.startsWith('@') ? slug.slice(1) : undefined) ||
    '';

  const { data: profile, isLoading: loadingProfile, error } = usePublicProfile(username);
  const { data: watchlist = [], isLoading: loadingWatchlist } = usePublicWatchlist(profile?.id, profile?.is_public ?? false);
  const { data: watchHistory = [], isLoading: loadingHistory } = usePublicWatchHistory(profile?.id, profile?.is_public ?? false);
  const { data: tierLists = [], isLoading: loadingTierLists } = useUserTierLists(profile?.id);
  const { user: currentUser } = useAuth();
  const { isFollowing, checkingFollow, followStats, follow, unfollow, isFollowingLoading } = useFollow(profile?.id);

  const isOwnProfile = currentUser?.id === profile?.id;

  // Calculate total watch time (rough estimate: 24 min per episode)
  const totalEpisodesWatched = watchHistory.length;
  const estimatedWatchTimeHours = Math.round((totalEpisodesWatched * 24) / 60);

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Background />
        <Sidebar />
        <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
          </div>

          <div className="text-center py-20">
            <Lock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Profile Not Available</h1>
            <p className="text-muted-foreground mb-6">
              This profile is private or doesn't exist.
            </p>
            <Button onClick={() => navigate('/')}>Go Home</Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  // Filter public tier lists only
  const publicTierLists = tierLists.filter(tl => tl.is_public);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
        </div>

        {/* Profile Header */}
        <GlassPanel className="relative overflow-hidden mb-8">
          {/* Banner */}
          <div className="h-32 md:h-48 relative overflow-hidden">
            {(profile as any).banner_url ? (
              <>
                {/* Blurred background layer */}
                <img
                  src={(profile as any).banner_url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60"
                  aria-hidden="true"
                />
                {/* Main banner - fit without cropping */}
                <img
                  src={(profile as any).banner_url}
                  alt="Profile banner"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20" />
            )}
          </div>

          {/* Profile Info */}
          <div className="p-6 pt-0 -mt-12">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <Avatar className="w-24 h-24 border-4 border-background shadow-xl">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  <User className="w-10 h-10" />
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
                    {profile?.display_name || username}
                    {profile?.role === 'admin' && (
                      <span className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold bg-violet-500/20 text-violet-400 border border-violet-500/30">
                        <ShieldCheck className="w-4 h-4" />
                        ADMIN
                      </span>
                    )}
                    {profile?.role === 'moderator' && (
                      <span className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <Shield className="w-4 h-4" />
                        MODERATOR
                      </span>
                    )}
                  </h1>
                  <span title="Public Profile">
                    <Globe className="w-4 h-4 text-green-500" />
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserPlus className="w-4 h-4" />
                    {followStats?.followers || 0} followers
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {followStats?.following || 0} following
                  </span>
                </div>
              </div>

              {!isOwnProfile && currentUser && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => isFollowing ? unfollow() : follow()}
                    disabled={isFollowingLoading || checkingFollow}
                    variant={isFollowing ? "outline" : "default"}
                    className="gap-2"
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="w-4 h-4" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Follow
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-muted">
              <div className="text-center p-3 rounded-xl bg-muted/30">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Heart className="w-4 h-4 text-primary" />
                  <span className="text-2xl font-bold">{watchlist.length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Favorites</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/30">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Play className="w-4 h-4 text-primary" />
                  <span className="text-2xl font-bold">{totalEpisodesWatched}</span>
                </div>
                <p className="text-sm text-muted-foreground">Episodes</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/30">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-2xl font-bold">{estimatedWatchTimeHours}h</span>
                </div>
                <p className="text-sm text-muted-foreground">Watch Time</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/30">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="text-2xl font-bold">{publicTierLists.length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Tier Lists</p>
              </div>
            </div>

            {/* Showcase Anime */}
            {(profile as any).showcase_anime && (profile as any).showcase_anime.length > 0 && (
              <div className="mt-6 pt-6 border-t border-muted">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Showcase</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {(profile as any).showcase_anime.map((anime: any, i: number) => (
                    <Link
                      key={i}
                      to={`/anime/${anime.id}`}
                      className="flex-shrink-0 group"
                    >
                      <div className="w-20 h-28 rounded-lg overflow-hidden">
                        <img
                          src={anime.image}
                          alt={anime.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassPanel>

        {/* Content Tabs */}
        <Tabs defaultValue="watchlist" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 flex-wrap h-auto gap-1">
            <TabsTrigger value="watchlist" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Heart className="w-4 h-4" />
              Watchlist
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="w-4 h-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="tierlists" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Trophy className="w-4 h-4" />
              Tier Lists
            </TabsTrigger>
          </TabsList>

          {/* Watchlist Tab */}
          <TabsContent value="watchlist">
            {loadingWatchlist ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : watchlist.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No favorites yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {watchlist.map((item) => (
                  <Link
                    key={item.id}
                    to={`/anime/${item.anime_id}`}
                    className="group"
                  >
                    <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2">
                      <img
                        src={item.anime_poster || ''}
                        alt={item.anime_name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                      />
                    </div>
                    <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                      {item.anime_name}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            {loadingHistory ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : watchHistory.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No watch history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {watchHistory.map((item) => (
                  <Link
                    key={item.id}
                    to={`/watch/${item.anime_id}?ep=${item.episode_number}`}
                    className="flex items-center gap-4 p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={item.anime_poster || ''}
                        alt={item.anime_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-1 group-hover:text-primary transition-colors">
                        {item.anime_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Episode {item.episode_number}
                      </p>
                      {item.progress_seconds > 0 && item.duration_seconds > 0 && (
                        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min((item.progress_seconds / item.duration_seconds) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.watched_at), { addSuffix: true })}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tier Lists Tab */}
          <TabsContent value="tierlists">
            {loadingTierLists ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : publicTierLists.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No public tier lists</p>
              </div>
            ) : (
              <TierListGrid tierLists={publicTierLists} showAuthor={false} />
            )}
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav />
    </div>
  );
}
