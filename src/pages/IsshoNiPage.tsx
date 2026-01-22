import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { usePublicWatchRooms, useUserWatchRooms, useCreateRoom, useInfinitePublicWatchRooms, WatchRoom } from '@/hooks/useWatchRoom';
import { getProxiedImageUrl, searchAnime, fetchEpisodes } from '@/lib/api';
import {
    Users, Plus, Lock, Globe, Key, ArrowLeft, Play, Clock,
    Sparkles, Film, UserPlus, Crown, Eye, Radio, Tv, Zap, Search,
    Subtitles, Mic2, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useDebounce } from "@/hooks/useDebounce";
import { useRef, useCallback } from 'react';

// Reusable Room Card Component
export function WatchRoomCard({ room }: { room: WatchRoom }) {
    const navigate = useNavigate();

    const accessBadge = {
        public: { icon: Globe, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Public' },
        invite: { icon: UserPlus, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', label: 'Invite' },
        password: { icon: Lock, color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', label: 'Private' },
    }[room.access_type] || { icon: Globe, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Public' };

    const AccessIcon = accessBadge.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4 }}
            className="group relative"
        >
            <GlassPanel
                onClick={() => navigate(`/isshoni/room/${room.id}`)}
                className="overflow-hidden border-white/5 hover:border-primary/40 cursor-pointer transition-all duration-500 p-0"
            >
                <div className="relative aspect-[16/9] w-full overflow-hidden">
                    {room.anime_poster ? (
                        <div className="relative w-full h-full">
                            <img
                                src={getProxiedImageUrl(room.anime_poster)}
                                alt={room.anime_title || ''}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                        </div>
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                            <Film className="w-12 h-12 text-primary/30" />
                        </div>
                    )}

                    {room.is_playing && (
                        <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-xl">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                        </div>
                    )}

                    <div className="absolute bottom-3 left-3 flex gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase border backdrop-blur-md ${accessBadge.color}`}>
                            <AccessIcon className="w-3 h-3" />
                            {accessBadge.label}
                        </span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase border backdrop-blur-md ${room.category === 'sub' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}>
                            {room.category || 'sub'}
                        </span>
                    </div>
                </div>

                <div className="p-5">
                    <div className="flex justify-between items-start gap-4 mb-3">
                        <h3 className="text-lg font-bold line-clamp-1 group-hover:text-primary transition-colors flex-1 leading-snug">
                            {room.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap bg-muted/30 px-2 py-0.5 rounded-md text-[11px] font-medium border border-border/50">
                            <Users className="w-3.5 h-3.5" />
                            <span>{room.participant_count || 0}/{room.max_participants}</span>
                        </div>
                    </div>

                    {room.anime_title && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mb-5 flex items-center gap-2.5">
                            <Play className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            <span className="truncate">{room.anime_title} {room.episode_number && `• EP ${room.episode_number}`}</span>
                        </p>
                    )}

                    <div className="flex items-center justify-between border-t border-white/5 pt-4">
                        {room.host_profile ? (
                            <div className="flex items-center gap-2">
                                <Crown className="w-3.5 h-3.5 text-yellow-500/80" />
                                <span className="text-xs text-foreground/70 font-medium truncate max-w-[100px]">
                                    {room.host_profile.display_name || room.host_profile.username}
                                </span>
                            </div>
                        ) : <div />}

                        <span className="text-[10px] text-muted-foreground font-medium">
                            {formatDistanceToNow(new Date(room.created_at), { addSuffix: true })}
                        </span>
                    </div>
                </div>
            </GlassPanel>
        </motion.div>
    );
}

export default function IsshoNiPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Anime Search
    const [animeSearchQuery, setAnimeSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [scheduledStart, setScheduledStart] = useState('now');
    const [customMinutes, setCustomMinutes] = useState('10');
    const debouncedAnimeSearch = useDebounce(animeSearchQuery, 500);

    // Get anime info from URL params
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

    const {
        data: infiniteData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: loadingPublic
    } = useInfinitePublicWatchRooms();

    const { data: myRooms = [], isLoading: loadingMyRooms } = useUserWatchRooms();
    const { data: publicRoomsSimple = [] } = usePublicWatchRooms(); // Fallback/Simple for calculations
    const createRoom = useCreateRoom();

    const allPublicRooms = infiniteData?.pages.flat() || [];
    const liveRooms = allPublicRooms.filter(r => r.is_playing);
    const otherRooms = allPublicRooms.filter(r => !r.is_playing);

    // Observer for infinite scroll
    const observer = useRef<IntersectionObserver | null>(null);
    const lastRoomElementRef = useCallback((node: HTMLDivElement | null) => {
        if (loadingPublic) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasNextPage) {
                fetchNextPage();
            }
        });
        if (node) observer.current.observe(node);
    }, [loadingPublic, hasNextPage, fetchNextPage]);

    // Auto-open create dialog if anime params are present
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


    // Handle Anime Search
    useEffect(() => {
        const search = async () => {
            if (debouncedAnimeSearch.length < 3) {
                setSearchResults([]);
                return;
            }
            setIsSearching(true);
            try {
                const results = await searchAnime(debouncedAnimeSearch);
                setSearchResults(results.animes.slice(0, 5));
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setIsSearching(false);
            }
        };
        search();
    }, [debouncedAnimeSearch]);

    const handleCreate = async () => {
        if (!newRoom.name.trim()) {
            toast.error('Please enter a room name');
            return;
        }
        if (newRoom.access_type === 'password' && !newRoom.password.trim()) {
            toast.error('Please enter a password');
            return;
        }

        let scheduledStartAt = null;
        if (scheduledStart !== 'now') {
            const minutes = scheduledStart === 'custom' ? parseInt(customMinutes) : parseInt(scheduledStart);
            if (!isNaN(minutes)) {
                scheduledStartAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
            }
        }

        createRoom.mutate({
            name: newRoom.name,
            access_type: newRoom.access_type,
            password: newRoom.access_type === 'password' ? newRoom.password : undefined,
            max_participants: newRoom.max_participants,
            anime_id: (newRoom.anime_id || undefined),
            anime_title: newRoom.anime_title || undefined,
            anime_poster: newRoom.anime_poster || undefined,
            episode_id: (newRoom as any).episode_id || undefined,
            episode_number: (newRoom as any).episode_number || undefined,
            episode_title: (newRoom as any).episode_title || undefined,
            category: newRoom.category,
            scheduled_start_at: scheduledStartAt
        }, {
            onSuccess: (room) => {
                toast.success('Room created successfully!');
                setIsCreateOpen(false);
                navigate(`/isshoni/room/${room.id}`);
            },
            onError: (error: any) => {
                toast.error(error.message || 'Failed to create room');
            }
        });
    };

    const totalParticipants = publicRoomsSimple.reduce((acc, r) => acc + (r.participant_count || 0), 0);

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <Background />
            <Sidebar />

            <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-4 md:py-6 max-w-[1600px] mx-auto pb-24 md:pb-6">
                {/* Hero Header */}
                <div className="relative mb-12">
                    <div className="absolute inset-0 -z-10">
                        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
                        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            <span className="text-sm">Back</span>
                        </button>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                        <div className="flex items-start gap-5">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 200 }}
                                className="p-5 rounded-[1.25rem] bg-primary/20 border border-primary/20 shadow-2xl shadow-primary/10"
                            >
                                <Sparkles className="w-10 h-10 text-primary" />
                            </motion.div>
                            <div>
                                <motion.h1
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter"
                                >
                                    <span className="text-white">
                                        Watch2Together
                                    </span>
                                </motion.h1>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="flex items-center gap-4 mt-3 text-sm font-medium"
                                >
                                    <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                                        <Radio className="w-3.5 h-3.5" />
                                        {liveRooms.length} Live Rooms
                                    </span>
                                    <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                                        <Users className="w-3.5 h-3.5" />
                                        {totalParticipants} Watching Now
                                    </span>
                                </motion.div>
                            </div>
                        </div>


                        {user ? (
                            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                                <DialogTrigger asChild>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25">
                                            <Zap className="w-5 h-5" />
                                            Create Room
                                        </Button>
                                    </motion.div>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2 text-xl">
                                            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                                                <Sparkles className="w-5 h-5 text-primary" />
                                            </div>
                                            Create Watch Room
                                        </DialogTitle>
                                    </DialogHeader>

                                    <div className="space-y-6 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm font-medium">Select Anime (Optional)</Label>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Search to select anime..."
                                                    className="pl-9 h-11"
                                                    value={animeSearchQuery}
                                                    onChange={(e) => setAnimeSearchQuery(e.target.value)}
                                                />
                                                {isSearching && (
                                                    <div className="absolute right-3 top-3">
                                                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                                    </div>
                                                )}
                                                {searchResults.length > 0 && (
                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                                                        {searchResults.map((anime) => (
                                                            <div
                                                                key={anime.id}
                                                                className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                                                                onClick={async () => {
                                                                    setNewRoom({
                                                                        ...newRoom,
                                                                        name: newRoom.name || `Watching ${anime.name}`,
                                                                        anime_id: anime.id,
                                                                        anime_title: anime.name,
                                                                        anime_poster: anime.poster
                                                                    });
                                                                    setAnimeSearchQuery('');
                                                                    setSearchResults([]);

                                                                    // Auto-fetch first episode title
                                                                    try {
                                                                        const episodesData = await fetchEpisodes(anime.id).catch(() => null);
                                                                        if (episodesData?.episodes?.[0]) {
                                                                            const firstEp = episodesData.episodes[0];
                                                                            setNewRoom(prev => ({
                                                                                ...prev,
                                                                                episode_id: firstEp.episodeId,
                                                                                episode_number: firstEp.number,
                                                                                episode_title: firstEp.title
                                                                            } as any));
                                                                        }
                                                                    } catch (e) {
                                                                        console.error("Failed to fetch first episode title");
                                                                    }
                                                                }}
                                                            >
                                                                <img src={getProxiedImageUrl(anime.poster)} alt="" className="w-8 h-12 object-cover rounded" />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-medium line-clamp-1">{anime.name}</p>
                                                                    <p className="text-xs text-muted-foreground">{anime.type || 'Anime'}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {newRoom.anime_title && (
                                                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl border border-border/50">
                                                    {newRoom.anime_poster && (
                                                        <img src={getProxiedImageUrl(newRoom.anime_poster)} alt="" className="w-10 h-14 object-cover rounded" />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-sm line-clamp-1">{newRoom.anime_title}</p>
                                                        <button
                                                            onClick={() => setNewRoom({ ...newRoom, anime_id: '', anime_title: '', anime_poster: '' })}
                                                            className="text-xs text-red-400 hover:underline"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-sm font-medium">Room Name</Label>
                                            <Input
                                                placeholder="e.g., Chill Anime Night 🌙"
                                                value={newRoom.name}
                                                onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                                                className="h-11"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium">Access Type</Label>
                                                <Select
                                                    value={newRoom.access_type}
                                                    onValueChange={(v) => setNewRoom({ ...newRoom, access_type: v as any })}
                                                >
                                                    <SelectTrigger className="h-11">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="public">
                                                            <span className="flex items-center gap-2">
                                                                <Globe className="w-4 h-4 text-emerald-500" />
                                                                Public
                                                            </span>
                                                        </SelectItem>
                                                        <SelectItem value="password">
                                                            <span className="flex items-center gap-2">
                                                                <Lock className="w-4 h-4 text-orange-500" />
                                                                Password
                                                            </span>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium">Version</Label>
                                                <Select
                                                    value={newRoom.category}
                                                    onValueChange={(v) => setNewRoom({ ...newRoom, category: v as 'sub' | 'dub' })}
                                                >
                                                    <SelectTrigger className="h-11">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="sub">
                                                            <span className="flex items-center gap-2">
                                                                <Subtitles className="w-4 h-4 text-primary" />
                                                                Subtitles (SUB)
                                                            </span>
                                                        </SelectItem>
                                                        <SelectItem value="dub">
                                                            <span className="flex items-center gap-2">
                                                                <Mic2 className="w-4 h-4 text-orange-500" />
                                                                Dubbed (DUB)
                                                            </span>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium">Start Room</Label>
                                                <Select
                                                    value={scheduledStart}
                                                    onValueChange={setScheduledStart}
                                                >
                                                    <SelectTrigger className="h-11">
                                                        <SelectValue placeholder="When to start?" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="now">As soon as created</SelectItem>
                                                        <SelectItem value="1">In 1 minute</SelectItem>
                                                        <SelectItem value="2">In 2 minutes</SelectItem>
                                                        <SelectItem value="5">In 5 minutes</SelectItem>
                                                        <SelectItem value="custom">Custom time...</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium">Max Participants</Label>
                                                <Select
                                                    value={newRoom.max_participants.toString()}
                                                    onValueChange={(v) => setNewRoom({ ...newRoom, max_participants: parseInt(v) })}
                                                >
                                                    <SelectTrigger className="h-11">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="5">5 viewers</SelectItem>
                                                        <SelectItem value="10">10 viewers</SelectItem>
                                                        <SelectItem value="20">20 viewers</SelectItem>
                                                        <SelectItem value="50">50 viewers</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {scheduledStart === 'custom' && (
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium">Minutes from now</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        max="1440"
                                                        value={customMinutes}
                                                        onChange={(e) => setCustomMinutes(e.target.value)}
                                                        className="h-11"
                                                    />
                                                    <span className="text-sm text-muted-foreground whitespace-nowrap">minutes</span>
                                                </div>
                                            </div>
                                        )}

                                        {newRoom.access_type === 'password' && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="space-y-2"
                                            >
                                                <Label className="text-sm font-medium">Password</Label>
                                                <Input
                                                    type="password"
                                                    placeholder="Enter room password..."
                                                    value={newRoom.password}
                                                    onChange={(e) => setNewRoom({ ...newRoom, password: e.target.value })}
                                                    className="h-11"
                                                />
                                            </motion.div>
                                        )}
                                    </div>

                                    <DialogFooter className="gap-2 sm:gap-0">
                                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleCreate}
                                            disabled={createRoom.isPending}
                                            className="bg-primary hover:bg-primary/90"
                                        >
                                            {createRoom.isPending ? 'Creating...' : 'Create Room'}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        ) : (
                            <Button onClick={() => navigate('/auth')} size="lg" className="gap-2 bg-muted/20 border border-border hover:bg-muted/30">
                                Sign in to Create
                            </Button>
                        )}
                    </div>
                </div>

                {/* My Active Rooms */}
                {
                    user && myRooms.length > 0 && (
                        <section className="mb-12">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <Crown className="w-5 h-5 text-amber-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">My Active Rooms</h2>
                                    <p className="text-sm text-muted-foreground">Manage your current active watch sessions</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {myRooms.map((room) => (
                                    <WatchRoomCard key={room.id} room={room} />
                                ))}
                            </div>
                        </section>
                    )
                }

                {/* Live Rooms */}
                {
                    liveRooms.length > 0 && (
                        <section className="mb-12">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
                                    <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                                    <span className="text-sm font-bold text-red-400 uppercase tracking-wider">Live Now</span>
                                </div>
                                <span className="text-sm text-muted-foreground">{liveRooms.length} public rooms active</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-4">
                                {liveRooms.map((room) => (
                                    <WatchRoomCard key={room.id} room={room} />
                                ))}
                            </div>
                        </section>
                    )
                }

                {/* Public Discovery */}
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                            <Globe className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Discover Rooms</h2>
                            <p className="text-sm text-muted-foreground">Find public communities to watch with</p>
                        </div>
                    </div>

                    {loadingPublic ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="h-40 bg-card/30 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : otherRooms.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-4">
                                {otherRooms.map((room, index) => (
                                    <div
                                        key={room.id}
                                        ref={index === otherRooms.length - 1 ? lastRoomElementRef : null}
                                    >
                                        <WatchRoomCard room={room} />
                                    </div>
                                ))}
                            </div>
                            {isFetchingNextPage && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-4 mt-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-40 bg-card/30 rounded-2xl animate-pulse" />
                                    ))}
                                </div>
                            )}
                        </>
                    ) : allPublicRooms.length === 0 ? (
                        <GlassPanel className="p-16 text-center border-dashed border-2">
                            <div className="w-24 h-24 mx-auto rounded-full bg-muted/20 flex items-center justify-center mb-6">
                                <Tv className="w-12 h-12 text-muted-foreground/30" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">The Lobby is Empty</h3>
                            <p className="text-muted-foreground mb-8 max-w-md mx-auto text-sm">
                                Be the trendsetter! Create your own room and start a watch party for others to join.
                            </p>
                            {user && (
                                <Button onClick={() => setIsCreateOpen(true)} size="lg" className="rounded-full bg-primary px-8">
                                    Host a Room
                                </Button>
                            )}
                        </GlassPanel>
                    ) : null}
                </section>
            </main>

            <MobileNav />
        </div>
    );
}
