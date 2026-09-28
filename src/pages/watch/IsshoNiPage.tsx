import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Users, Plus, Lock, Globe, Key, ArrowLeft, Play, Clock,
  Sparkles, Film, UserPlus, Crown, Eye, Radio, Tv, Zap, Search,
  Subtitles, Mic2, ChevronRight, X
} from 'lucide-react';

import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedCounter } from '@/components/profile/overview/AnimatedCounter';
import { UserBadges } from '@/components/ui/UserBadges';

import { useAuth } from '@/contexts/AuthContext';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { usePublicWatchRooms, useUserWatchRooms, useCreateRoom, useInfinitePublicWatchRooms, WatchRoom } from '@/hooks/media/useWatchRoom';
import { getProxiedImageUrl } from '@/lib/api';
import { contentGraph, toAnimeCard } from '@/core';
import { useDebounce } from "@/hooks/ui/useDebounce";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { cn } from '@/lib/utils';

/* ==============================================================================
   REUSABLE ROOM CARD
   ============================================================================== */
export function WatchRoomCard({ room }: { room: WatchRoom }) {
  const navigate = useNavigate();
  const { data: hostBadges } = useUserBadges(room.host_id);

  const accessBadge = {
    public: { icon: Globe, color: 'bg-white/10 text-white border-white/20', label: 'Public' },
    invite: { icon: UserPlus, color: 'bg-sky-500/10 text-sky-400 border-sky-500/20', label: 'Invite' },
    password: { icon: Lock, color: 'bg-rose-500/10 text-rose-400 border-rose-500/20', label: 'Private' },
  }[room.access_type] || { icon: Globe, color: 'bg-white/10 text-white border-white/20', label: 'Public' };

  const AccessIcon = accessBadge.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="group relative h-full"
    >
      <GlassPanel
        onClick={() => navigate(`/isshoni/room/${room.id}`)}
        className="flex h-full flex-col overflow-hidden cursor-pointer p-0 border border-white/[0.08] bg-[#0a0a0a]/80 transition-all duration-300 hover:border-white/[0.18] hover:bg-[#111] hover:shadow-2xl"
      >
        {/* 16:9 Thumbnail Area */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/40">
          {room.anime_poster ? (
            <>
              <img
                src={getProxiedImageUrl(room.anime_poster)}
                alt={room.anime_title || ''}
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 opacity-90 group-hover:opacity-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/20 to-transparent opacity-80" />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/[0.02]">
              <Tv className="h-10 w-10 text-white/20" />
            </div>
          )}

          {/* Top Right: Live Badge */}
          {room.is_playing && (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-rose-400 backdrop-blur-md">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
              Live
            </div>
          )}

          {/* Bottom Left: Access & Type */}
          <div className="absolute bottom-3 left-3 flex gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md', accessBadge.color)}>
              <AccessIcon className="h-3 w-3" />
              {accessBadge.label}
            </span>
            <span className="inline-flex items-center rounded-md border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-md">
              {room.category || 'SUB'}
            </span>
          </div>
        </div>

        {/* Content Details */}
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 flex-1 font-display text-lg font-bold leading-tight tracking-tight text-foreground transition-colors group-hover:text-white">
              {room.name}
            </h3>
          </div>

          {room.anime_title && (
            <p className="mb-4 flex items-center gap-2 line-clamp-1 text-sm text-muted-foreground/90 font-medium">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                <Play className="h-2.5 w-2.5 ml-0.5" fill="currentColor" />
              </span>
              <span className="truncate">
                {room.anime_title}
                {room.episode_number ? <span className="text-white/40 font-normal"> • Ep {room.episode_number}</span> : ''}
              </span>
            </p>
          )}

          {/* Footer Meta */}
          <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                <Crown className="h-3 w-3 text-white/70" />
              </div>
              <span className="max-w-[100px] truncate text-xs font-semibold text-white/80">
                {room.host_profile?.display_name || room.host_profile?.username || 'Host'}
              </span>
              <span onClick={(e) => e.stopPropagation()}>
                <UserBadges badges={hostBadges} size={14} max={3} />
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {formatDistanceToNow(new Date(room.created_at), { addSuffix: false })}
              </span>
              <div className="flex items-center gap-1 text-[11px] font-bold text-white/70">
                <Users className="h-3.5 w-3.5" />
                <span>{room.participant_count || 0}/{room.max_participants}</span>
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

/* ==============================================================================
   PAGE COMPONENT
   ============================================================================== */
export default function IsshoNiPage() {
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Search State
  const [animeSearchQuery, setAnimeSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [scheduledStart, setScheduledStart] = useState('now');
  const [customMinutes, setCustomMinutes] = useState('10');
  const debouncedAnimeSearch = useDebounce(animeSearchQuery, 500);

  // URL Params Setup
  const animeIdFromUrl = searchParams.get('anime');
  const animeTitleFromUrl = searchParams.get('title');
  const animePosterFromUrl = searchParams.get('poster');

  const [newRoom, setNewRoom] = useState({
    name: '',
    access_type: 'public' as 'public' | 'invite' | 'password',
    password: '',
    max_participants: 10,
    anime_id: '',
    anime_title: '',
    anime_poster: '',
    category: 'sub' as 'sub' | 'dub',
  });

  const { data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: loadingPublic } = useInfinitePublicWatchRooms();
  const { data: myRooms = [], isLoading: loadingMyRooms } = useUserWatchRooms();
  const { data: publicRoomsSimple = [] } = usePublicWatchRooms();
  const createRoom = useCreateRoom();

  const allPublicRooms = infiniteData?.pages.flat() || [];
  const liveRooms = allPublicRooms.filter(r => r.is_playing);
  const otherRooms = allPublicRooms.filter(r => !r.is_playing);

  // Infinite scroll observer
  const observer = useRef<IntersectionObserver | null>(null);
  const lastRoomElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loadingPublic) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: isMobile ? '300px' : '600px', threshold: isMobile ? 0.2 : 0.1 });
    if (node) observer.current.observe(node);
  }, [loadingPublic, hasNextPage, isFetchingNextPage, fetchNextPage, isMobile]);

  // Auto-open create dialog from URL
  useEffect(() => {
    if (animeIdFromUrl && animeTitleFromUrl && user) {
      setNewRoom(prev => ({
        ...prev,
        name: `Watching ${animeTitleFromUrl}`,
        anime_id: animeIdFromUrl,
        anime_title: animeTitleFromUrl,
        anime_poster: animePosterFromUrl || '',
      }));
      setIsCreateOpen(true);
    }
  }, [animeIdFromUrl, animeTitleFromUrl, animePosterFromUrl, user]);

  // Anime Search Effect
  useEffect(() => {
    const search = async () => {
      if (debouncedAnimeSearch.length < 3) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const results = await contentGraph.search({ query: debouncedAnimeSearch, page: 1, perPage: 5 });
        setSearchResults((results.media || []).map(toAnimeCard).slice(0, 5));
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    };
    search();
  }, [debouncedAnimeSearch]);

  const handleCreate = async () => {
    if (!newRoom.name.trim()) return toast.error('Please enter a room name');
    if (newRoom.access_type === 'password' && !newRoom.password.trim()) return toast.error('Please enter a password');

    let scheduledStartAt = null;
    if (scheduledStart !== 'now') {
      const minutes = scheduledStart === 'custom' ? parseInt(customMinutes) : parseInt(scheduledStart);
      if (!isNaN(minutes)) scheduledStartAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    }

    createRoom.mutate({
      name: newRoom.name,
      access_type: newRoom.access_type,
      password: newRoom.access_type === 'password' ? newRoom.password : undefined,
      max_participants: newRoom.max_participants,
      anime_id: (newRoom.anime_id || undefined),
      anime_title: newRoom.anime_title || undefined,
      anime_poster: newRoom.anime_poster || undefined,
      category: newRoom.category,
      scheduled_start_at: scheduledStartAt
    }, {
      onSuccess: (room) => {
        toast.success('Room created successfully!');
        setIsCreateOpen(false);
        navigate(`/isshoni/room/${room.id}`);
      },
      onError: (error: any) => toast.error(error.message || 'Failed to create room')
    });
  };

  const totalParticipants = publicRoomsSimple.reduce((acc, r) => acc + (r.participant_count || 0), 0);

  // Common premium input class for the modal
  const inputCls = "w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-all focus:border-white/30 focus:bg-black/40 focus:ring-1 focus:ring-white/10 h-12";

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      {/* Very subtle top radial gradient instead of glowing blobs */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[50vh] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.04] via-background to-background" />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-4' : 'pl-4 md:pl-32'} pr-4 md:pr-6 py-4 md:py-8 max-w-[1600px] mx-auto pb-24 md:pb-8`}>
        
        {/* ================= HERO HEADER ================= */}
        <div className="mb-14">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => navigate(-1)} className="group flex items-center gap-2 text-muted-foreground transition-colors hover:text-white">
              <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
              <span className="text-sm font-medium">Back</span>
            </button>
          </div>

          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              
              {/* Clean Icon Box */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] shadow-sm"
              >
                <Tv className="h-8 w-8 text-white/90" />
              </motion.div>
              
              <div>
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80"
                >
                  Synchronized Viewing
                </motion.p>
                <motion.h1
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="font-display text-4xl font-black tracking-tight text-white md:text-5xl lg:text-6xl"
                >
                  Watch2Together
                </motion.h1>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wider"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-rose-400">
                    <Radio className="h-3.5 w-3.5 animate-pulse" />
                    <AnimatedCounter value={liveRooms.length} className="tabular-nums" /> Live
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-white/80">
                    <Users className="h-3.5 w-3.5 text-white/50" />
                    <AnimatedCounter value={totalParticipants} className="tabular-nums" /> Watching
                  </span>
                </motion.div>
              </div>
            </div>

            {/* Premium High-Contrast CTA */}
            {user ? (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                    <Button size="lg" className="gap-2 rounded-full bg-white text-black hover:bg-white/90 font-bold shadow-xl px-8 h-12 transition-transform active:scale-95">
                      <Plus className="h-5 w-5" />
                      Create Room
                    </Button>
                  </motion.div>
                </DialogTrigger>
                
                {/* CREATE ROOM MODAL */}
                <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-[#0a0a0a] border-white/10 sm:rounded-3xl shadow-2xl">
                  
                  <div className="px-6 pt-6 pb-4 border-b border-white/5 bg-white/[0.01]">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white">
                          <Tv className="h-4 w-4" />
                        </div>
                        Create Watch Room
                      </DialogTitle>
                    </DialogHeader>
                  </div>

                  <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Anime Search Selection */}
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Select Anime (Optional)</Label>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <input
                          placeholder="Search for an anime..."
                          className={cn(inputCls, "pl-11")}
                          value={animeSearchQuery}
                          onChange={(e) => setAnimeSearchQuery(e.target.value)}
                        />
                        {isSearching && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          </div>
                        )}
                        
                        {/* Search Results Dropdown */}
                        {searchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-[#111] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                            {searchResults.map((anime) => (
                              <div
                                key={anime.id}
                                className="flex items-center gap-4 p-3 hover:bg-white/5 cursor-pointer transition-colors border-b border-white/5 last:border-0"
                                onClick={() => {
                                  setNewRoom({
                                    ...newRoom,
                                    name: newRoom.name || `Watching ${anime.name}`,
                                    anime_id: anime.id,
                                    anime_title: anime.name,
                                    anime_poster: anime.poster
                                  });
                                  setAnimeSearchQuery('');
                                  setSearchResults([]);
                                }}
                              >
                                <img src={getProxiedImageUrl(anime.poster)} alt="" className="w-10 h-14 object-cover rounded-md bg-black/50" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white line-clamp-1">{anime.name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{anime.type || 'Anime'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Selected Anime Pill */}
                      {newRoom.anime_title && (
                        <div className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/10 mt-3">
                          {newRoom.anime_poster && (
                            <img src={getProxiedImageUrl(newRoom.anime_poster)} alt="" className="w-10 h-14 object-cover rounded-md" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white line-clamp-1">{newRoom.anime_title}</p>
                            <button
                              onClick={() => setNewRoom({ ...newRoom, anime_id: '', anime_title: '', anime_poster: '' })}
                              className="text-[11px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 mt-1"
                            >
                              Remove Selection
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Room Name */}
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Room Name *</Label>
                      <input
                        placeholder="e.g., Chill Anime Night 🌙"
                        value={newRoom.name}
                        onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                        className={inputCls}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Access Type</Label>
                        <Select value={newRoom.access_type} onValueChange={(v) => setNewRoom({ ...newRoom, access_type: v as any })}>
                          <SelectTrigger className={cn(inputCls, "py-0 h-12")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#111] border-white/10">
                            <SelectItem value="public"><span className="flex items-center gap-2"><Globe className="w-4 h-4 text-white/50" />Public</span></SelectItem>
                            <SelectItem value="password"><span className="flex items-center gap-2"><Lock className="w-4 h-4 text-rose-400" />Password</span></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Version</Label>
                        <Select value={newRoom.category} onValueChange={(v) => setNewRoom({ ...newRoom, category: v as 'sub' | 'dub' })}>
                          <SelectTrigger className={cn(inputCls, "py-0 h-12")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#111] border-white/10">
                            <SelectItem value="sub"><span className="flex items-center gap-2"><Subtitles className="w-4 h-4 text-white/50" />Subbed</span></SelectItem>
                            <SelectItem value="dub"><span className="flex items-center gap-2"><Mic2 className="w-4 h-4 text-white/50" />Dubbed</span></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Schedule</Label>
                        <Select value={scheduledStart} onValueChange={setScheduledStart}>
                          <SelectTrigger className={cn(inputCls, "py-0 h-12")}>
                            <SelectValue placeholder="When to start?" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#111] border-white/10">
                            <SelectItem value="now">Start Immediately</SelectItem>
                            <SelectItem value="1">In 1 minute</SelectItem>
                            <SelectItem value="5">In 5 minutes</SelectItem>
                            <SelectItem value="custom">Custom wait time...</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Max Viewers</Label>
                        <Select value={newRoom.max_participants.toString()} onValueChange={(v) => setNewRoom({ ...newRoom, max_participants: parseInt(v) })}>
                          <SelectTrigger className={cn(inputCls, "py-0 h-12")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#111] border-white/10">
                            <SelectItem value="5">5 Viewers</SelectItem>
                            <SelectItem value="10">10 Viewers</SelectItem>
                            <SelectItem value="20">20 Viewers</SelectItem>
                            <SelectItem value="50">50 Viewers</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {scheduledStart === 'custom' && (
                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Minutes from now</Label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max="1440"
                            value={customMinutes}
                            onChange={(e) => setCustomMinutes(e.target.value)}
                            className={inputCls}
                          />
                          <span className="text-sm text-muted-foreground">minutes</span>
                        </div>
                      </div>
                    )}

                    {newRoom.access_type === 'password' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-rose-400 ml-1">Room Password *</Label>
                        <div className="relative">
                          <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                          <input
                            type="password"
                            placeholder="Enter a secret password"
                            value={newRoom.password}
                            onChange={(e) => setNewRoom({ ...newRoom, password: e.target.value })}
                            className={cn(inputCls, "pl-11")}
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-white/[0.01]">
                    <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="rounded-full hover:bg-white/5 font-semibold">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={createRoom.isPending}
                      className="rounded-full bg-white text-black hover:bg-white/90 font-bold px-8 h-10 shadow-lg active:scale-95 transition-transform"
                    >
                      {createRoom.isPending ? 'Creating...' : 'Create Room'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <Button onClick={() => navigate('/auth')} size="lg" className="rounded-full bg-white text-black hover:bg-white/90 font-bold px-8 shadow-xl">
                Sign in to Create
              </Button>
            )}
          </div>
        </div>

        {/* ================= MY ACTIVE ROOMS ================= */}
        {user && myRooms.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight">Your Active Rooms</h2>
                <p className="text-sm text-muted-foreground/70">Manage your hosted sessions</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {myRooms.map((room) => <WatchRoomCard key={room.id} room={room} />)}
            </div>
          </section>
        )}

        {/* ================= LIVE ROOMS ================= */}
        {liveRooms.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5">
                <Radio className="h-4 w-4 animate-pulse text-rose-400" />
                <span className="text-sm font-bold uppercase tracking-wider text-rose-300">Live Now</span>
              </div>
              <span className="text-sm text-muted-foreground tabular-nums font-medium">{liveRooms.length} public rooms broadcasting</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {liveRooms.map((room) => <WatchRoomCard key={room.id} room={room} />)}
            </div>
          </section>
        )}

        {/* ================= DISCOVER ROOMS ================= */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white">
              <Globe className="h-5 w-5 text-white/70" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">Discover Lobbies</h2>
              <p className="text-sm text-muted-foreground/70">Find open communities to watch with</p>
            </div>
          </div>

          {loadingPublic ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => <div key={i} className="h-56 bg-white/[0.03] border border-white/5 rounded-2xl animate-pulse" />)}
            </div>
          ) : otherRooms.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {otherRooms.map((room, index) => (
                  <div key={room.id} ref={index === otherRooms.length - 1 ? lastRoomElementRef : null}>
                    <WatchRoomCard room={room} />
                  </div>
                ))}
              </div>
              {isFetchingNextPage && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mt-5">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-56 bg-white/[0.03] border border-white/5 rounded-2xl animate-pulse" />)}
                </div>
              )}
            </>
          ) : allPublicRooms.length === 0 ? (
            
            /* Empty State */
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-20 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.03] ring-1 ring-white/10">
                <Tv className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="font-display text-xl font-semibold tracking-tight text-white mb-2">The Lobby is Empty</h3>
              <p className="max-w-[320px] text-sm text-muted-foreground leading-relaxed mb-8">
                Be the trendsetter! Create your own room and start a watch party for others to join.
              </p>
              {user && (
                <Button onClick={() => setIsCreateOpen(true)} size="lg" className="rounded-full bg-white text-black hover:bg-white/90 font-bold px-8 shadow-lg active:scale-95">
                  Host a Room
                </Button>
              )}
            </div>
          ) : null}
        </section>
      </main>

      <MobileNav />
    </div>
  );
}