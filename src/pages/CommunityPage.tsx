import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from '@/components/ui/input';
// import { StatusVideoBackground } from '@/components/layout/StatusVideoBackground';
import { TierListCard } from '@/components/tierlist/TierListCard';
import { PlaylistCard } from '@/components/playlist/PlaylistCard';
import { usePublicTierLists } from '@/hooks/useTierLists';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Playlist, usePlaylistItems } from '@/hooks/usePlaylist';
import { getProxiedImageUrl } from '@/lib/api';
import { usePublicWatchRooms } from '@/hooks/useWatchRoom';
import { WatchRoomCard } from '@/pages/IsshoNiPage';
import {
  Users, Layers, Music2, Search, TrendingUp, Clock,
  Heart, ChevronRight, Sparkles, Globe, Play, MessageSquare, ArrowUp, ArrowDown, Eye, MessageCircle, Radio, Trophy
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useForumPosts, useCommunityStats, type ForumPost } from '@/hooks/useForum';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';
import { Leaderboard } from '@/components/community/Leaderboard';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';

// Hook to fetch public playlists from all users
function usePublicPlaylists() {
  return useQuery({
    queryKey: ['community_public_playlists'],
    queryFn: async () => {
      // First get public playlists
      const { data: playlists, error: playlistError } = await supabase
        .from('playlists')
        .select('*')
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (playlistError) throw playlistError;
      if (!playlists || playlists.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(playlists.map(p => p.user_id))];

      // Fetch profiles for those users
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      if (profileError) throw profileError;

      // Map profiles by user_id
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Combine playlists with profiles
      return playlists.map(playlist => ({
        ...playlist,
        profiles: profileMap.get(playlist.user_id) || {
          username: 'unknown',
          display_name: 'Unknown User',
          avatar_url: null
        }
      })) as (Playlist & { profiles: { username: string; display_name: string; avatar_url: string | null } })[];
    },
  });
}

// Community playlist card with user info
function CommunityPlaylistCard({ playlist }: { playlist: Playlist & { profiles: { username: string; display_name: string; avatar_url: string | null } } }) {
  const { data: items = [] } = usePlaylistItems(playlist.id);
  const navigate = useNavigate();
  const coverImages = items.slice(0, 4).map(item => item.anime_poster).filter(Boolean) as string[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <div
        className="cursor-pointer"
        onClick={() => navigate(`/playlist/${playlist.id}`)}
      >
        <div className="relative aspect-square rounded-xl overflow-hidden bg-muted mb-3 transition-all group-hover:ring-2 group-hover:ring-primary/50">
          {coverImages.length > 0 ? (
            <div className={cn(
              "grid w-full h-full",
              coverImages.length === 1 && "grid-cols-1",
              coverImages.length === 2 && "grid-cols-2",
              coverImages.length >= 3 && "grid-cols-2 grid-rows-2"
            )}>
              {coverImages.map((img, idx) => (
                <img
                  key={idx}
                  src={getProxiedImageUrl(img)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ))}
              {coverImages.length === 3 && (
                <div className="bg-muted/50 flex items-center justify-center">
                  <Music2 className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Music2 className="w-12 h-12 text-muted-foreground" />
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
              <Play className="w-6 h-6 text-primary-foreground fill-current ml-1" />
            </div>
          </div>
        </div>

        <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">
          {playlist.name}
        </h3>
        <p className="text-sm text-muted-foreground">
          {playlist.items_count} anime
        </p>
      </div>

      {/* User info */}
      <Link
        to={`/@${playlist.profiles.username}`}
        className="flex items-center gap-2 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={playlist.profiles.avatar_url || '/placeholder.svg'}
          alt=""
          className="w-5 h-5 rounded-full object-cover"
        />
        <span>@{playlist.profiles.username}</span>
      </Link>
    </motion.div>
  );
}

// Forum post card component
function ForumPostCard({ post }: { post: ForumPost }) {
  const navigate = useNavigate();
  const score = post.upvotes - post.downvotes;

  return (
    <GlassPanel className="p-4 hover:ring-1 hover:ring-primary/50 transition-all cursor-pointer">
      <div className="flex gap-4">
        {/* Vote buttons */}
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <button className={cn(
            "p-1 rounded hover:bg-primary/10 transition-colors",
            post.user_vote === 1 && "text-primary"
          )}>
            <ArrowUp className="w-5 h-5" />
          </button>
          <span className={cn(
            "text-sm font-bold",
            score > 0 && "text-primary",
            score < 0 && "text-destructive"
          )}>
            {score}
          </span>
          <button className={cn(
            "p-1 rounded hover:bg-destructive/10 transition-colors",
            post.user_vote === -1 && "text-destructive"
          )}>
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={() => navigate(`/community/forum/${post.id}`)}>
          {/* Flair and metadata */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {post.is_pinned && (
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 text-xs font-bold">
                Pinned
              </span>
            )}
            {post.flair && (
              <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                {post.flair}
              </span>
            )}
            {post.is_spoiler && (
              <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-500 text-xs font-bold">
                Spoiler
              </span>
            )}
            {post.anime_name && (
              <Link
                to={`/anime/${post.anime_id}`}
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                {post.anime_name}
              </Link>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-lg mb-2 line-clamp-2 hover:text-primary transition-colors">
            {post.title}
          </h3>

          {/* Content preview */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {post.content}
          </p>

          {/* Image indicator */}
          {post.image_url && (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center">
                <img
                  src={getProxiedImageUrl(post.image_url)}
                  alt=""
                  className="w-full h-full object-cover rounded"
                />
              </div>
              <span className="text-xs text-muted-foreground">Has image</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {/* Author */}
            {post.profiles && (
              <Link
                to={`/@${post.profiles.username}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Avatar className="w-5 h-5">
                  <AvatarImage src={post.profiles.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {(post.profiles.display_name || post.profiles.username || 'U')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{post.profiles.username || post.profiles.display_name || 'Anonymous'}</span>
              </Link>
            )}

            <span>•</span>
            <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>

            <span className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              {post.comments_count}
            </span>

            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {post.views_count}
            </span>
          </div>
        </div>

        {/* Anime poster thumbnail if present */}
        {post.anime_poster && (
          <div className="hidden sm:block w-20 h-28 rounded-lg overflow-hidden flex-shrink-0">
            <img
              src={getProxiedImageUrl(post.anime_poster)}
              alt={post.anime_name || ''}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

const communityNavItems = [
  { value: 'all', label: 'All Discover', icon: Sparkles },
  { value: 'forum', label: 'Forum', icon: MessageSquare },
  { value: 'tierlists', label: 'Tier Lists', icon: Layers },
  { value: 'playlists', label: 'Playlists', icon: Music2 },
  { value: 'isshoni', label: 'Watch2Together', icon: Radio },
  { value: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

export default function CommunityPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [forumSort, setForumSort] = useState<'hot' | 'new' | 'top'>('hot');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { data: tierLists = [], isLoading: loadingTierLists } = usePublicTierLists();
  const { data: playlists = [], isLoading: loadingPlaylists } = usePublicPlaylists();
  const { data: forumPosts = [], isLoading: loadingForum } = useForumPosts({ sortBy: forumSort });
  const { data: watchRooms = [], isLoading: loadingRooms } = usePublicWatchRooms();
  const { data: stats } = useCommunityStats();

  // Filter based on search
  const filteredTierLists = tierLists.filter(tl =>
    tl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tl.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPlaylists = playlists.filter(pl =>
    pl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pl.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredForumPosts = forumPosts.filter(post =>
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isLoading = loadingTierLists || loadingPlaylists;
  const isNative = useIsNativeApp();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* <StatusVideoBackground /> */}
      <Sidebar />

      <main className={cn(
        "relative z-10 w-full",
        isNative ? "pl-0" : "pl-0 md:pl-20 lg:pl-24"
      )}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-black flex items-center gap-3 mb-2">
              <Users className="w-10 h-10 text-primary" />
              Community
            </h1>
            <p className="text-muted-foreground text-lg">
              Discover tier lists and playlists shared by the community
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tier lists and playlists..."
              className="pl-12 h-12 bg-muted/30 border-white/5"
            />
          </div>

          {/* Main Layout with Sidebar Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-8 relative">
            {/* Mobile Navigation Toggle */}
            <div className="md:hidden mb-6">
              <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-14 px-6 bg-card/40 border-white/5 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Menu className="w-5 h-5 text-primary" />
                      <span className="font-bold">Community Menu</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] p-0 border-white/5 bg-background/95 backdrop-blur-xl">
                  <SheetHeader className="p-6 border-b border-white/5 text-left">
                    <SheetTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      Community Navigation
                    </SheetTitle>
                  </SheetHeader>
                  <div className="p-4 overflow-y-auto max-h-[calc(100vh-80px)]">
                    <TabsList className="flex flex-col h-auto bg-transparent border-0 gap-1 p-0 w-full">
                      {communityNavItems.map((item) => (
                        <TabsTrigger
                          key={item.value}
                          value={item.value}
                          onClick={() => setIsMenuOpen(false)}
                          className="justify-start gap-3 px-4 py-3.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex-shrink-0"
                        >
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.label}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Sidebar Navigation */}
            <div className="md:w-64 lg:w-72 flex-shrink-0">
              <div className="sticky top-24 space-y-4">
                <GlassPanel className="p-3">
                  <TabsList className="hidden md:flex flex-row md:flex-col h-auto bg-transparent border-0 gap-1 p-0 w-full overflow-x-auto no-scrollbar">
                    {communityNavItems.map((item) => (
                      <TabsTrigger
                        key={item.value}
                        value={item.value}
                        className="justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex-1 md:flex-none"
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </GlassPanel>

                {/* Community Stats or Info can go here */}
                <GlassPanel className="hidden md:block p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Community Info</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Active Members</span>
                      <span className="font-medium">{stats?.activeMembers || '...'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">New Posts Today</span>
                      <span className="font-medium">{stats?.newPostsToday || '0'}</span>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </div>

            <div className="flex-1 min-w-0">

              {/* All Content */}
              <TabsContent value="all" className="space-y-12">
                {/* Watch Rooms Section - Only if there are active rooms */}
                {watchRooms.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                          <Radio className="w-5 h-5 text-primary" />
                        </div>
                        <span>Issho Ni</span>
                        <span className="text-muted-foreground text-lg font-normal hidden sm:inline">Watch Together</span>
                      </h2>
                      <Button
                        variant="ghost"
                        onClick={() => setActiveTab('isshoni')}
                        className="gap-1 h-8 md:h-10 text-xs md:text-sm"
                      >
                        View All
                        <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {watchRooms.slice(0, 3).map((room, i) => (
                        <motion.div
                          key={room.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <WatchRoomCard room={room} />
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Tier Lists Section */}
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <Layers className="w-6 h-6 text-primary" />
                      Popular Tier Lists
                    </h2>
                    <Button
                      variant="ghost"
                      onClick={() => setActiveTab('tierlists')}
                      className="gap-1 h-8 md:h-10 text-xs md:text-sm"
                    >
                      View All
                      <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                    </Button>
                  </div>

                  {loadingTierLists ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : filteredTierLists.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredTierLists.slice(0, 6).map((tierList, index) => (
                        <motion.div
                          key={tierList.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <TierListCard tierList={tierList} />
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <GlassPanel className="p-8 text-center">
                      <Layers className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground">No tier lists found</p>
                    </GlassPanel>
                  )}
                </section>

                {/* Playlists Section */}
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <Music2 className="w-6 h-6 text-primary" />
                      Community Playlists
                    </h2>
                    <Button
                      variant="ghost"
                      onClick={() => setActiveTab('playlists')}
                      className="gap-1 h-8 md:h-10 text-xs md:text-sm"
                    >
                      View All
                      <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                    </Button>
                  </div>

                  {loadingPlaylists ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="space-y-2">
                          <div className="aspect-square bg-muted rounded-xl animate-pulse" />
                          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                          <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                        </div>
                      ))}
                    </div>
                  ) : filteredPlaylists.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {filteredPlaylists.slice(0, 10).map((playlist, index) => (
                        <motion.div
                          key={playlist.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                        >
                          <CommunityPlaylistCard playlist={playlist} />
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <GlassPanel className="p-8 text-center">
                      <Music2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground">No public playlists found</p>
                    </GlassPanel>
                  )}
                </section>
              </TabsContent>

              {/* Tier Lists Only */}
              <TabsContent value="tierlists">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Layers className="w-6 h-6 text-primary" />
                    All Tier Lists
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({filteredTierLists.length})
                    </span>
                  </h2>
                  <Button onClick={() => navigate('/tierlists')} className="gap-2 h-9 md:h-10 px-3 md:px-4">
                    <Layers className="w-4 h-4" />
                    <span className="hidden sm:inline">Create Tier List</span>
                    <span className="sm:hidden">Create</span>
                  </Button>
                </div>

                {loadingTierLists ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : filteredTierLists.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredTierLists.map((tierList, index) => (
                      <motion.div
                        key={tierList.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        <TierListCard tierList={tierList} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <GlassPanel className="p-12 text-center">
                    <Layers className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-bold mb-2">No tier lists found</h3>
                    <p className="text-muted-foreground mb-6">
                      {searchQuery ? 'Try a different search term' : 'Be the first to create a tier list!'}
                    </p>
                    <Button onClick={() => navigate('/tierlists')}>Create Tier List</Button>
                  </GlassPanel>
                )}
              </TabsContent>

              {/* Playlists Only */}
              <TabsContent value="playlists">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Music2 className="w-6 h-6 text-primary" />
                    All Playlists
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({filteredPlaylists.length})
                    </span>
                  </h2>
                  <Button onClick={() => navigate('/playlists')} className="gap-2 h-9 md:h-10 px-3 md:px-4">
                    <Music2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Create Playlist</span>
                    <span className="sm:hidden">Create</span>
                  </Button>
                </div>

                {loadingPlaylists ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {[...Array(10)].map((_, i) => (
                      <div key={i} className="space-y-2">
                        <div className="aspect-square bg-muted rounded-xl animate-pulse" />
                        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                        <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : filteredPlaylists.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {filteredPlaylists.map((playlist, index) => (
                      <motion.div
                        key={playlist.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                      >
                        <CommunityPlaylistCard playlist={playlist} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <GlassPanel className="p-12 text-center">
                    <Music2 className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-bold mb-2">No playlists found</h3>
                    <p className="text-muted-foreground mb-6">
                      {searchQuery ? 'Try a different search term' : 'Be the first to share a playlist!'}
                    </p>
                    <Button onClick={() => navigate('/playlists')}>Create Playlist</Button>
                  </GlassPanel>
                )}
              </TabsContent>

              {/* Forum Tab */}
              <TabsContent value="forum">
                <div className="space-y-6">
                  {/* Forum Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                    <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                      <MessageSquare className="w-5 sm:w-6 h-5 sm:h-6 text-primary" />
                      Community Forum
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({filteredForumPosts.length})
                      </span>
                    </h2>
                    <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                      {/* Sort options */}
                      <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
                        {(['hot', 'new', 'top'] as const).map((sort) => (
                          <button
                            key={sort}
                            onClick={() => setForumSort(sort)}
                            className={cn(
                              "px-3 py-2 rounded-md text-sm font-medium transition-all min-h-[40px]",
                              forumSort === sort
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {sort.charAt(0).toUpperCase() + sort.slice(1)}
                          </button>
                        ))}
                      </div>
                      {user && (
                        <Button onClick={() => navigate('/community/forum/new')} className="gap-2 min-h-[44px]">
                          <MessageSquare className="w-4 h-4" />
                          <span className="hidden sm:inline">New Post</span>
                          <span className="sm:hidden">Post</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Forum Posts */}
                  {loadingForum ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : filteredForumPosts.length > 0 ? (
                    <div className="space-y-4">
                      {filteredForumPosts.map((post, index) => (
                        <motion.div
                          key={post.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                        >
                          <ForumPostCard post={post} />
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <GlassPanel className="p-12 text-center">
                      <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                      <h3 className="text-xl font-bold mb-2">No forum posts yet</h3>
                      <p className="text-muted-foreground mb-6">
                        {searchQuery ? 'Try a different search term' : 'Be the first to start a discussion!'}
                      </p>
                      {user ? (
                        <Button onClick={() => navigate('/community/forum/new')}>Create Post</Button>
                      ) : (
                        <Button onClick={() => navigate('/auth')}>Sign in to Post</Button>
                      )}
                    </GlassPanel>
                  )}
                </div>
              </TabsContent>

              {/* Watch Together Tab */}
              <TabsContent value="isshoni" className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500">
                      <Radio className="w-5 h-5 text-white" />
                    </div>
                    <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">一緒に</span>
                    <span className="text-muted-foreground text-lg font-normal">Watch Rooms</span>
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({watchRooms.length})
                    </span>
                  </h2>
                  <Button
                    variant="default"
                    onClick={() => navigate('/isshoni')}
                    className="gap-2 bg-primary hover:bg-primary/90 h-9 md:h-10 px-3 md:px-4"
                  >
                    <Radio className="w-4 h-4" />
                    <span className="hidden sm:inline">Create Room</span>
                    <span className="sm:hidden">Create</span>
                  </Button>
                </div>

                {loadingRooms ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : watchRooms.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {watchRooms.map((room, index) => (
                      <motion.div
                        key={room.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <WatchRoomCard room={room} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <GlassPanel className="p-12 text-center bg-gradient-to-br from-pink-500/5 to-purple-500/5">
                    <Radio className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-bold mb-2">No Active Watch Rooms</h3>
                    <p className="text-muted-foreground mb-6">
                      Be the first to start a watch party!
                    </p>
                    <Button
                      onClick={() => navigate('/isshoni')}
                      className="bg-primary hover:bg-primary/90"
                    >
                      Create a Room
                    </Button>
                  </GlassPanel>
                )}
              </TabsContent>

              {/* Leaderboard Tab */}
              <TabsContent value="leaderboard">
                <Leaderboard />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
