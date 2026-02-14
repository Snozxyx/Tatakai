import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/useIsNativeApp';
import { useIsMobile } from '@/hooks/use-mobile';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { usePublicProfile, usePublicWatchlist, usePublicWatchHistory } from '@/hooks/useProfileFeatures';
import { useUserForumPosts } from '@/hooks/useForum';
import { useFollow } from '@/hooks/useFollow';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getProxiedImageUrl } from '@/lib/api';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { SocialLinksEditor, SocialLinksDisplay, SocialLinks } from '@/components/profile/SocialLinksEditor';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  User, Settings, List, History, LogOut, Edit2, Save, X,
  Play, Trash2, Clock, CheckCircle, Eye, Pause, XCircle, ArrowLeft, Camera, Shield, Sparkles, Globe, Lock, Share2, MessageSquare, AlertCircle, UserPlus, UserMinus, Bell, Check,
  ShieldCheck, Loader2
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { motion } from 'framer-motion';
// import { StatusVideoBackground } from '@/components/layout/StatusVideoBackground';

const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  watching: { label: 'Watching', icon: <Play className="w-3 h-3" />, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  completed: { label: 'Completed', icon: <CheckCircle className="w-3 h-3" />, color: 'text-green-400', bg: 'bg-green-400/10' },
  plan_to_watch: { label: 'Plan to Watch', icon: <Eye className="w-3 h-3" />, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  on_hold: { label: 'On Hold', icon: <Pause className="w-3 h-3" />, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  dropped: { label: 'Dropped', icon: <XCircle className="w-3 h-3" />, color: 'text-red-400', bg: 'bg-red-400/10' },
};

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

  // Determine if viewing someone else's profile
  // Supports /user/:username, /@username (via atUsername), and /:slug (where slug is @username)
  const viewingUsername = usernameParam ||
    (atUsername?.startsWith('@') ? atUsername.slice(1) : atUsername) ||
    (slug?.startsWith('@') ? slug.slice(1) : undefined);

  const isViewingOther = !!viewingUsername && viewingUsername !== ownProfile?.username;

  // Fetch public profile if viewing other user
  const { data: publicProfile, isLoading: loadingPublicProfile, error: publicProfileError } = usePublicProfile(viewingUsername || '');

  // Use the appropriate profile data
  const profile = isViewingOther ? publicProfile : ownProfile;

  // Fetch watchlist and history - own data or public data
  const { data: ownWatchlist, isLoading: loadingOwnWatchlist } = useWatchlist();
  const { data: ownHistory, isLoading: loadingOwnHistory } = useWatchHistory();
  const { data: publicWatchlist = [], isLoading: loadingPublicWatchlist } = usePublicWatchlist(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_watchlist ?? true
  );
  const { data: publicHistory = [], isLoading: loadingPublicHistory } = usePublicWatchHistory(
    publicProfile?.user_id,
    publicProfile?.is_public ?? false,
    publicProfile?.show_history ?? true
  );

  // Fetch forum posts for the profile
  const { data: forumPosts = [], isLoading: loadingForumPosts } = useUserForumPosts(profile?.user_id);

  // Follow features
  const { isFollowing, checkingFollow, followStats, follow, unfollow, isFollowingLoading } = useFollow(profile?.user_id);

  const watchlist = isViewingOther ? publicWatchlist : ownWatchlist;
  const history = isViewingOther ? publicHistory : ownHistory;
  const loadingWatchlist = isViewingOther ? loadingPublicWatchlist : loadingOwnWatchlist;
  const loadingHistory = isViewingOther ? loadingPublicHistory : loadingOwnHistory;

  // Check if tabs should be visible for public profiles
  const showWatchlistTab = !isViewingOther || (publicProfile?.is_public && publicProfile?.show_watchlist !== false);
  const showHistoryTab = !isViewingOther || (publicProfile?.is_public && publicProfile?.show_history !== false);

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync state when profile loads or changes
  useEffect(() => {
    if (ownProfile && !isViewingOther) {
      setDisplayName(ownProfile.display_name || '');
      setUsername(ownProfile.username || '');
      setBio(ownProfile.bio || '');
    }
  }, [ownProfile, isViewingOther]);

  // Refresh profile on mount to ensure latest MAL tokens
  useEffect(() => {
    if (user && !isViewingOther) {
      console.log('[Profile] ProfilePage mounted for logged-in user, refreshing tokens...');
      refreshProfile();
    }
  }, []);

  // If viewing other's profile that doesn't exist or is private
  if (isViewingOther && !loadingPublicProfile && (publicProfileError || !publicProfile)) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        {/* <StatusVideoBackground overlayColor="from-background/95 via-background/90 to-background/80" /> */}
        {showSidebar && <Sidebar />}
        <main className={cn(
          "relative z-10 w-full",
          !isDesktopApp && "md:pl-24" // Left padding for floating sidebar on web
        )}>
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
            <div className="text-center">
              <Lock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h1 className="text-2xl font-bold mb-2">Profile Not Available</h1>
              <p className="text-muted-foreground mb-6">
                This profile is private or doesn't exist.
              </p>
              <Button onClick={() => navigate('/')}>Go Home</Button>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  // Loading state for public profile
  if (isViewingOther && loadingPublicProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Redirect to auth if not logged in and viewing own profile
  if (!user && !isViewingOther) {
    navigate('/auth');
    return null;
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          username: username.trim() || null,
          bio: bio.trim() || null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      await refreshProfile();
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      if (error.message?.includes('unique') || error.code === '23505') {
        toast.error('Username is already taken');
      } else {
        toast.error(`Failed to update profile: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

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

  // Calculate stats
  const stats = {
    total: watchlist?.length || 0,
    watching: watchlist?.filter(i => i.status === 'watching').length || 0,
    completed: watchlist?.filter(i => i.status === 'completed').length || 0,
    plan_to_watch: watchlist?.filter(i => i.status === 'plan_to_watch').length || 0,
    watchTimeSeconds: profile?.total_watch_time_seconds || 0,
  };

  // Format watch time to hours and minutes
  const formatWatchTime = (seconds: number): string => {
    if (seconds === 0) return '0 hours';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* <StatusVideoBackground overlayColor="from-background/95 via-background/90 to-background/80" /> */}
      {showSidebar && <Sidebar />}

      <main className={cn(
        "relative z-10 w-full",
        !isDesktopApp && "md:pl-24" // Left padding for floating sidebar on web
      )}>
        {/* Hero Banner */}
        <div className="h-[300px] md:h-[400px] relative w-full overflow-hidden group">
          {profile?.banner_url ? (
            <img
              src={profile.banner_url}
              alt="Profile banner"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-purple-500/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background" />

          {/* Banner Picker Button - Only show for own profile */}
          {!isViewingOther && (
            <AvatarPicker
              type="banner"
              currentImage={profile?.banner_url || undefined}
              trigger={
                <button className="absolute top-4 right-4 px-4 py-2 rounded-lg bg-black/50 hover:bg-black/70 text-white flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                  <Camera className="w-4 h-4" />
                  Change Banner
                </button>
              }
            />
          )}
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-32 relative pb-20">
          {/* Back button when viewing other's profile */}
          {isViewingOther && (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
          )}

          {/* Profile Header Card */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-col md:flex-row gap-8 items-start"
          >
            {/* Avatar Column */}
            <div className="flex flex-col items-center md:items-start gap-4">
              <div className="relative group">
                <div className="w-32 h-32 md:w-48 md:h-48 rounded-full p-1 bg-background ring-4 ring-background/50 overflow-hidden shadow-2xl">
                  <Avatar className="w-full h-full">
                    <AvatarImage src={profile?.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-5xl font-bold">
                      {profile?.display_name?.[0]?.toUpperCase() || (isViewingOther ? 'U' : user?.email?.[0]?.toUpperCase()) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Anime Avatar Picker - Only show for own profile */}
                {!isViewingOther && (
                  <AvatarPicker
                    type="avatar"
                    currentImage={profile?.avatar_url || undefined}
                    trigger={
                      <button className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110">
                        <Sparkles className="w-5 h-5 text-primary-foreground" />
                      </button>
                    }
                  />
                )}
              </div>

              {/* Quick Stats for Mobile */}
              <div className="flex md:hidden gap-4 text-sm text-muted-foreground">
                <div className="text-center">
                  <div className="font-bold text-foreground text-lg">{formatWatchTime(stats.watchTimeSeconds)}</div>
                  <div>Watch Time</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-foreground text-lg">{followStats?.followers || 0}</div>
                  <div>Followers</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-foreground text-lg">{followStats?.following || 0}</div>
                  <div>Following</div>
                </div>
              </div>
            </div>

            {/* Info Column */}
            <div className="flex-1 pt-2 md:pt-12 w-full">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  {isEditing && !isViewingOther ? (
                    <div className="space-y-4 w-full max-w-md">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Display Name</Label>
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="bg-background/50 backdrop-blur-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Username</Label>
                          <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="username"
                            className="bg-background/50 backdrop-blur-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Bio</Label>
                        <Textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Tell us about yourself..."
                          className="bg-background/50 backdrop-blur-sm resize-none"
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSaveProfile} disabled={isSaving} className="gap-2">
                          <Save className="w-4 h-4" />
                          Save Changes
                        </Button>
                        <Button variant="outline" onClick={() => setIsEditing(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-3xl md:text-5xl font-black tracking-tighter mb-2 break-all drop-shadow-sm flex items-center gap-2">
                          {profile?.display_name || (profile?.username && profile?.username !== 'null' ? profile?.username : 'User')}
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
                        <div className="flex items-center gap-3 text-muted-foreground/80 bg-background/30 backdrop-blur-sm px-3 py-1 rounded-full border border-white/5 w-fit">
                          <span className="text-sm font-medium">@{profile?.username && profile?.username !== 'null' ? profile.username : 'anonymous'}</span>
                        </div>
                        {isViewingOther && publicProfile?.is_public && (
                          <span title="Public Profile">
                            <Globe className="w-5 h-5 text-green-500" />
                          </span>
                        )}
                        {!isViewingOther && isAdmin && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/20 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> ADMIN
                          </span>
                        )}
                      </div>
                      {!isViewingOther && user && (
                        <div className="text-muted-foreground mb-4 flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-xs font-medium">{user.email}</span>
                        </div>
                      )}
                      {profile?.bio && (
                        <p className="text-foreground/80 max-w-2xl leading-relaxed mb-4">
                          {profile.bio}
                        </p>
                      )}

                      {/* Social Links Display */}
                      {profile?.social_links && (
                        <div className="mb-6">
                          <SocialLinksDisplay links={profile.social_links as SocialLinks} />
                        </div>
                      )}

                      {/* Action buttons */}
                      {isViewingOther ? (
                        <div className="flex flex-wrap gap-3">
                          {user && (
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
                          )}
                          <Button
                            variant="outline"
                            onClick={() => {
                              const shareUrl = window.location.href;
                              navigator.clipboard.writeText(shareUrl);
                              toast.success('Profile link copied!');
                            }}
                            className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-background/80"
                          >
                            <Share2 className="w-4 h-4" />
                            Share
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          <Button variant="outline" onClick={() => setIsEditing(true)} className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-background/80">
                            <Edit2 className="w-4 h-4" />
                            Edit Profile
                          </Button>
                          <SocialLinksEditor
                            currentLinks={(ownProfile as any)?.social_links || {}}
                            isPublic={ownProfile?.is_public ?? false}
                            showWatchlist={(ownProfile as any)?.show_watchlist ?? true}
                            showHistory={(ownProfile as any)?.show_history ?? true}
                            trigger={
                              <Button variant="outline" className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-background/80">
                                <Share2 className="w-4 h-4" />
                                Social & Privacy
                              </Button>
                            }
                          />
                          {isAdmin && (
                            <Button
                              variant="outline"
                              onClick={() => navigate('/admin')}
                              className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-background/80 border-primary/50 text-primary"
                            >
                              <Settings className="w-4 h-4" />
                              Admin Dashboard
                            </Button>
                          )}
                          <Button variant="destructive" onClick={handleSignOut} className="gap-2">
                            <LogOut className="w-4 h-4" />
                            Sign Out
                          </Button>

                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Desktop Stats */}
                <div className="hidden md:flex gap-8 p-6 rounded-2xl bg-background/40 backdrop-blur-md border border-white/5">
                  <div className="text-center">
                    <div className="text-2xl font-black text-primary">{followStats?.followers || 0}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Followers</div>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div className="text-center">
                    <div className="text-2xl font-black text-primary">{followStats?.following || 0}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Following</div>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div className="text-center">
                    <div className="text-2xl font-black text-foreground">{formatWatchTime(stats.watchTimeSeconds)}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Watch Time</div>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div className="text-center">
                    <div className="text-2xl font-black text-green-500">{stats.completed}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Completed</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Content Tabs */}
          <div className="mt-12">
            <Tabs defaultValue={showWatchlistTab ? "watchlist" : (showHistoryTab ? "history" : "forum")} className="space-y-8">
              <TabsList className="bg-background/40 backdrop-blur-md p-1 border border-white/5 rounded-xl w-full md:w-auto flex overflow-x-auto">
                {showWatchlistTab && (
                  <TabsTrigger value="watchlist" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6">
                    <List className="w-4 h-4" />
                    Watchlist
                  </TabsTrigger>
                )}
                {showHistoryTab && (
                  <TabsTrigger value="history" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6">
                    <History className="w-4 h-4" />
                    History
                  </TabsTrigger>
                )}
                <TabsTrigger value="forum" className="flex-1 md:flex-none gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6">
                  <MessageSquare className="w-4 h-4" />
                  Forum Posts
                </TabsTrigger>
              </TabsList>

              {/* No data available message for public profiles with hidden data */}
              {isViewingOther && !showWatchlistTab && !showHistoryTab && (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl">
                  <Lock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">This user has chosen to keep their anime lists private.</p>
                </div>
              )}

              {showWatchlistTab && (
                <TabsContent value="watchlist" className="mt-6">
                  <GlassPanel className="p-6 md:p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                        <List className="w-6 h-6 text-primary" />
                        {isViewingOther ? 'Watchlist' : 'My Watchlist'}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {watchlist?.length || 0} items
                      </span>
                    </div>

                    {loadingWatchlist ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="aspect-[3/4] bg-muted/50 rounded-xl animate-pulse" />
                        ))}
                      </div>
                    ) : watchlist && watchlist.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                        {watchlist.map((item) => {
                          const statusInfo = STATUS_LABELS[item.status || 'plan_to_watch'];
                          return (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              key={item.id}
                              className="group cursor-pointer relative"
                              onClick={() => navigate(`/anime/${item.anime_id}`)}
                            >
                              <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 shadow-lg group-hover:shadow-primary/20 transition-all duration-300 ring-1 ring-white/10 group-hover:ring-primary/50">
                                <img
                                  src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')}
                                  alt={item.anime_name}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                <div className={`absolute top-2 left-2 px-2 py-1 rounded-md backdrop-blur-md flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide ${statusInfo?.bg} ${statusInfo?.color} border border-white/5`}>
                                  {statusInfo?.icon}
                                  {statusInfo?.label}
                                </div>
                              </div>
                              <h3 className="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                                {item.anime_name}
                              </h3>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl">
                        <List className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-xl font-bold mb-2">{isViewingOther ? 'Watchlist is empty' : 'Your watchlist is empty'}</h3>
                        <p className="text-muted-foreground mb-6">{isViewingOther ? 'This user hasn\'t added any anime yet.' : 'Start adding anime to track your progress!'}</p>
                        {!isViewingOther && (
                          <Button onClick={() => navigate('/')}>
                            Browse Anime
                          </Button>
                        )}
                      </div>
                    )}
                  </GlassPanel>
                </TabsContent>
              )}

              {showHistoryTab && (
                <TabsContent value="history" className="mt-6">
                  <GlassPanel className="p-6 md:p-8">
                    <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
                      <History className="w-6 h-6 text-primary" />
                      Watch History
                    </h2>

                    {loadingHistory ? (
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
                        ))}
                      </div>
                    ) : history && history.length > 0 ? (
                      <div className="space-y-3">
                        {history.map((item, index) => (
                          <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            key={item.id}
                            className="flex gap-4 p-3 rounded-xl bg-background/40 hover:bg-background/60 border border-white/5 hover:border-primary/20 transition-all cursor-pointer group"
                            onClick={() => navigate(`/watch/${encodeURIComponent(item.episode_id)}`)}
                          >
                            <div className="relative w-32 aspect-video rounded-lg overflow-hidden flex-shrink-0">
                              <img
                                src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')}
                                alt={item.anime_name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Play className="w-8 h-8 text-white fill-white" />
                              </div>
                              {item.duration_seconds && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                                  <div
                                    className="h-full bg-primary"
                                    style={{
                                      width: `${Math.min(100, ((item.progress_seconds || 0) / item.duration_seconds) * 100)}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 py-1 flex flex-col justify-center">
                              <h3 className="font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                                {item.anime_name}
                              </h3>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                <span className="text-foreground/80 font-medium">Episode {item.episode_number}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDate(item.watched_at)}
                                </span>
                              </div>
                            </div>

                            {item.completed && (
                              <div className="flex items-center px-4">
                                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                                  <CheckCircle className="w-5 h-5" />
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl">
                        <History className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-xl font-bold mb-2">No watch history</h3>
                        <p className="text-muted-foreground mb-6">{isViewingOther ? 'This user hasn\'t watched any episodes yet.' : 'Episodes you watch will appear here.'}</p>
                        {!isViewingOther && (
                          <Button onClick={() => navigate('/')}>
                            Start Watching
                          </Button>
                        )}
                      </div>
                    )}
                  </GlassPanel>
                </TabsContent>
              )}

              {/* Forum Posts Tab */}
              <TabsContent value="forum" className="mt-6">
                <GlassPanel className="p-6 md:p-8">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <MessageSquare className="w-6 h-6 text-primary" />
                      {isViewingOther ? 'Forum Posts' : 'My Forum Posts'}
                    </h2>
                  </div>

                  {loadingForumPosts ? (
                    <div className="text-center py-12 text-muted-foreground">Loading forum posts...</div>
                  ) : forumPosts.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl">
                      <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                      <h3 className="text-xl font-bold mb-2">No forum posts</h3>
                      <p className="text-muted-foreground mb-6">{isViewingOther ? 'This user hasn\'t posted in the forum yet.' : 'Your forum posts will appear here.'}</p>
                      {!isViewingOther && (
                        <Button onClick={() => navigate('/community/forum/new')}>
                          Go to Forum
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {forumPosts.map((post: any) => (
                        <Link
                          key={post.id}
                          to={post.is_approved === false ? '#' : `/community/forum/${post.id}`}
                          className={cn("block", post.is_approved === false && "cursor-default")}
                          onClick={(e) => {
                            if (post.is_approved === false) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <div className={cn(
                            "p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors",
                            post.is_approved === false && "opacity-70 hover:bg-white/5"
                          )}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-bold text-lg line-clamp-2">
                                    {post.title}
                                  </h3>
                                  {post.is_approved === false && !isViewingOther && (
                                    <Badge variant="secondary" className="gap-1 text-xs bg-yellow-500/20 text-yellow-400">
                                      <AlertCircle className="w-3 h-3" />
                                      Pending
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {post.content}
                                </p>
                                {post.image_url && (
                                  <div className="mb-2">
                                    <img
                                      src={getProxiedImageUrl(post.image_url)}
                                      alt="Forum post image"
                                      className="w-16 h-16 object-cover rounded border border-white/10"
                                    />
                                  </div>
                                )}
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3" />
                                    {post.comments_count || 0}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Eye className="w-3 h-3" />
                                    {post.views_count || 0}
                                  </span>
                                  <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </GlassPanel>
              </TabsContent>
              {!isViewingOther && (
                <TabsContent value="notifications" className="mt-6">
                  <GlassPanel className="p-6 md:p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Bell className="w-6 h-6 text-primary" />
                        Notifications
                      </h2>
                      {notifications.length > 0 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markAllAsRead.mutate()}
                            disabled={unreadCount === 0 || markAllAsRead.isPending}
                          >
                            Mark all as read
                          </Button>
                        </div>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-2xl">
                        <Bell className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-xl font-bold mb-2">All caught up!</h3>
                        <p className="text-muted-foreground">You have no new notifications.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={cn(
                              "p-4 rounded-xl border transition-all flex justify-between items-start gap-4",
                              notification.read
                                ? "bg-white/5 border-white/5 opacity-70"
                                : "bg-primary/5 border-primary/20 shadow-lg shadow-primary/5"
                            )}
                          >
                            <div className="flex-1 min-w-0" onClick={() => !notification.read && markAsRead.mutate(notification.id)}>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-bold text-lg leading-tight">{notification.title}</h4>
                                {!notification.read && (
                                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                )}
                              </div>
                              <p className="text-muted-foreground text-sm leading-relaxed mb-2 break-words">
                                {notification.body}
                              </p>
                              <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/50">
                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {!notification.read && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => markAsRead.mutate(notification.id)}
                                  className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm('Delete notification?')) deleteNotification.mutate(notification.id);
                                }}
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassPanel>
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
