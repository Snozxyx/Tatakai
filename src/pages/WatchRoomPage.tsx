import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import {
    useWatchRoom,
    useRoomParticipants,
    useRoomMessages,
    useJoinRoom,
    useLeaveRoom,
    useSendMessage,
    useUpdatePlayback,
    useCloseRoom,
    useUpdateRoom,
    useUpdateParticipantReady
} from '@/hooks/useWatchRoom';
import { getProxiedImageUrl, fetchStreamingSources, fetchEpisodeServers, searchAnime, fetchCombinedSources, fetchAnimeInfo } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import {
    Search, ChevronRight, PlayCircle, ArrowLeft, Users, Send,
    Crown, LogOut, Lock, MessageSquare, Film, Settings, X, Subtitles,
    Copy, Check, Timer, Zap, Play, Pause
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEpisodes, useAnimeInfo } from '@/hooks/useAnimeData';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { EmbedPlayer } from '@/components/video/EmbedPlayer';
import { CustomVideoSourceModal } from '@/components/video/CustomVideoSourceModal'; // Import the new modal
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function WatchRoomPage() {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const { user, isModerator, isAdmin } = useAuth();
    const queryClient = useQueryClient();

    // UI State
    const [message, setMessage] = useState('');
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [copied, setCopied] = useState(false);
    const [selectedServer, setSelectedServer] = useState<string>('hd-2');
    const [triedServers, setTriedServers] = useState<Set<string>>(new Set(['hd-2']));
    const [showSettings, setShowSettings] = useState(false);
    const [showAnimeSearch, setShowAnimeSearch] = useState(false);
    const [drift, setDrift] = useState(0);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isEditingCustomTimer, setIsEditingCustomTimer] = useState(false);
    const [customTimerMinutes, setCustomTimerMinutes] = useState('10');

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLVideoElement>(null);
    const lastUpdateRef = useRef<number>(0);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Queries & Hooks
    const { data: room, isLoading: loadingRoom } = useWatchRoom(roomId);
    const { data: participants = [] } = useRoomParticipants(roomId);
    const { data: messages = [], refetch: refetchMessages } = useRoomMessages(roomId);
    const { data: episodesData } = useEpisodes(room?.anime_id);

    const isHost = room?.host_id === user?.id;
    const isParticipant = participants.some(p => p.user_id === user?.id);
    const isParticipantReady = participants.find(p => p.user_id === user?.id)?.is_ready;
    const currentEpisodeId = room?.episode_id || (episodesData?.episodes[0]?.episodeId);

    // Use room category as source of truth
    const selectedCategory = room?.category || 'sub';
    const setSelectedCategory = (cat: 'sub' | 'dub') => {
        if (isHost && roomId) {
            updateRoom.mutate({ roomId, updates: { category: cat } as any });
        }
    };

    const joinRoom = useJoinRoom();
    const leaveRoom = useLeaveRoom();
    const sendMessage = useSendMessage();
    const updatePlayback = useUpdatePlayback();
    const closeRoom = useCloseRoom();
    const updateRoom = useUpdateRoom();
    const updateParticipantReady = useUpdateParticipantReady();

    const { data: serversData } = useQuery({
        queryKey: ['episode-servers', currentEpisodeId],
        queryFn: () => (currentEpisodeId && room?.anime_id !== 'custom') ? fetchEpisodeServers(currentEpisodeId) : null,
        enabled: !!currentEpisodeId && room?.anime_id !== 'custom'
    });

    const { data: animeInfo } = useQuery({
        queryKey: ['anime-info', room?.anime_id],
        queryFn: () => room?.anime_id && room.anime_id !== 'custom' ? fetchAnimeInfo(room.anime_id) : null,
        enabled: !!room?.anime_id && room.anime_id !== 'custom'
    });

    const { data: streamingData, isLoading: loadingSources } = useQuery({
        queryKey: ['streaming', currentEpisodeId, selectedServer, selectedCategory, room?.anime_id],
        queryFn: async () => {
            if (room?.anime_id === 'custom' && room.episode_id) {
                return {
                    sources: [{
                        url: room.episode_id,
                        isM3U8: room.episode_id.includes('.m3u8'),
                        isEmbed: !room.episode_id.includes('.m3u8') && !room.episode_id.includes('.mp4') && !room.episode_id.includes('.webm'),
                        quality: 'default'
                    }],
                    headers: {
                        Referer: window.location.origin,
                        "User-Agent": navigator.userAgent
                    },
                    subtitles: [],
                    intro: null,
                    outro: null,
                    tracks: []
                };
            }

            if (!currentEpisodeId) return null;

            return fetchCombinedSources(
                currentEpisodeId,
                animeInfo?.anime.info.name,
                room?.episode_number || 1,
                selectedServer,
                selectedCategory
            );
        },
        enabled: (!!currentEpisodeId || (room?.anime_id === 'custom' && !!room.episode_id)) && (room?.anime_id === 'custom' || !!animeInfo)
    });

    // Error Handling for Video Player
    const handlePlayerError = useCallback(() => {
        if (!serversData || !isHost) return;
        const allServers = [...(serversData.sub || []), ...(serversData.dub || [])]
            .filter(s => s.serverName !== 'hd-1');
        const nextServer = allServers.find(s => !triedServers.has(s.serverName));

        if (nextServer) {
            toast.info(`Switching server to ${nextServer.serverName}...`);
            setTriedServers(prev => new Set([...prev, nextServer.serverName]));
            setSelectedServer(nextServer.serverName);
        } else {
            toast.error("No working servers found. Try another episode.");
        }
    }, [serversData, isHost, triedServers]);

    // Host: Auto-sync episode data
    useEffect(() => {
        if (isHost && room?.anime_id && room.anime_id !== 'custom' && !room.episode_id && episodesData?.episodes[0]) {
            updateRoom.mutate({
                roomId: roomId!,
                updates: {
                    episode_id: episodesData.episodes[0].episodeId,
                    episode_number: episodesData.episodes[0].number
                }
            });
        }
    }, [isHost, room?.anime_id, room?.episode_id, episodesData]);

    // Reset servers on episode change
    useEffect(() => {
        if (currentEpisodeId) {
            setSelectedServer('hd-2');
            setTriedServers(new Set(['hd-2']));
        }
    }, [currentEpisodeId]);

    // Reset servers on episode change
    useEffect(() => {
        if (currentEpisodeId) {
            setSelectedServer('hd-2');
            setTriedServers(new Set(['hd-2']));
        }
    }, [currentEpisodeId]);

    // Removed inline search logic (moved to modal)

    // Participant Sync Logic (Wall-clock based)
    useEffect(() => {
        if (isHost || !playerRef.current || !room || room.scheduled_start_at) return;
        const video = playerRef.current;

        if (!room.is_playing) {
            if (!video.paused) video.pause();
            const currentDrift = Math.abs(video.currentTime - room.current_time_seconds);
            setDrift(currentDrift);
            if (currentDrift > 2) video.currentTime = room.current_time_seconds;
            return;
        }

        const now = Date.now();
        const updatedAt = new Date(room.updated_at).getTime();
        const elapsedSinceUpdate = (now - updatedAt) / 1000;
        const liveHostTime = room.current_time_seconds + Math.max(0, elapsedSinceUpdate);

        if (video.paused) video.play().catch(() => { });
        const currentDrift = Math.abs(video.currentTime - liveHostTime);
        setDrift(currentDrift);

        if (currentDrift > 1.5) {
            video.currentTime = liveHostTime;
        }
    }, [room?.is_playing, room?.current_time_seconds, room?.updated_at, room?.scheduled_start_at, isHost]);

    // Real-time Subscriptions
    useEffect(() => {
        if (!roomId) return;
        const channel = supabase.channel(`room-${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_messages', filter: `room_id=eq.${roomId}` }, () => refetchMessages())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'watch_rooms', filter: `id=eq.${roomId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['watch-room', roomId] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_participants', filter: `room_id=eq.${roomId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['watch-room-participants', roomId] });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [roomId, refetchMessages, queryClient]);

    // Auto-scroll chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Countdown Logic
    useEffect(() => {
        if (!room?.scheduled_start_at) {
            setCountdown(null);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            return;
        }

        const updateCountdown = () => {
            const now = Date.now();
            const target = new Date(room.scheduled_start_at!).getTime();
            const diff = Math.max(0, Math.floor((target - now) / 1000));
            setCountdown(diff);

            if (diff <= 0) {
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                if (isHost) {
                    updatePlayback.mutate({ roomId: roomId!, isPlaying: true });
                    updateRoom.mutate({ roomId: roomId!, updates: { scheduled_start_at: null } as any });
                }
            }
        };

        updateCountdown();
        countdownIntervalRef.current = setInterval(updateCountdown, 1000);
        return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
    }, [room?.scheduled_start_at, isHost, roomId]);

    // Handlers
    const handleStartTimer = (seconds: number) => {
        const scheduledTime = new Date(Date.now() + seconds * 1000).toISOString();
        updateRoom.mutate({
            roomId: roomId!,
            updates: { scheduled_start_at: scheduledTime, is_playing: false } as any
        });
        toast.info(`Starting in ${seconds} seconds...`);
    };

    const handleForceStart = () => {
        updateRoom.mutate({
            roomId: roomId!,
            updates: { scheduled_start_at: null, is_playing: true } as any
        });
        toast.success("Broadcast started!");
    };

    const handleToggleReady = () => {
        updateParticipantReady.mutate({ roomId: roomId!, isReady: !isParticipantReady });
    };

    const handleJoin = () => {
        if (!user) return navigate('/auth');
        if (room?.access_type === 'password') setShowPasswordDialog(true);
        else joinRoom.mutate({ roomId: roomId! });
    };

    const handlePasswordJoin = () => {
        joinRoom.mutate({ roomId: roomId!, password }, {
            onSuccess: () => { setShowPasswordDialog(false); setPassword(''); },
            onError: (err: any) => toast.error(err.message || "Invalid password")
        });
    };

    const handleLeave = async () => {
        if (isHost && participants.length > 1) {
            const nextHost = participants.find(p => p.user_id !== user?.id);
            if (nextHost) {
                await updateRoom.mutateAsync({ roomId: roomId!, updates: { host_id: nextHost.user_id } as any });
                await sendMessage.mutateAsync({ roomId: roomId!, message: `Host left. ${nextHost.display_name} is now host.`, messageType: 'system' });
            }
        }
        leaveRoom.mutate(roomId!, { onSuccess: () => navigate('/isshoni') });
    };

    const handleClose = () => {
        if (confirm('Close this room?')) {
            closeRoom.mutate(roomId!, { onSuccess: () => { toast.success('Room closed'); navigate('/isshoni'); } });
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;
        sendMessage.mutate({ roomId: roomId!, message: message.trim() });
        setMessage('');
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Link copied!');
    };

    if (loadingRoom) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary" /></div>;
    if (!room || !room.is_active) return <div className="min-h-screen bg-background flex items-center justify-center"><GlassPanel className="p-8 text-center max-w-md"><Film className="w-16 h-16 mx-auto mb-4 opacity-30" /><h2 className="text-2xl font-bold mb-2">Room Not Found</h2><Button onClick={() => navigate('/isshoni')}>Browse Rooms</Button></GlassPanel></div>;

    return (
        <div className="min-h-screen bg-background text-foreground overflow-y-auto">
            <Background />
            <Sidebar />

            <main className="relative z-10 pl-4 md:pl-28 pr-4 md:pr-6 py-4 md:py-6 min-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-4 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/isshoni')} className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-5 h-5" /></button>
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                                {room.name}
                                {room.is_playing && <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-black animate-pulse">LIVE</span>}
                            </h1>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                {room.anime_title} {room.episode_number && `• Ep ${room.episode_number}`}
                                {room.episode_title && <span className="opacity-60">• {room.episode_title}</span>}
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${selectedCategory === 'sub' ? 'bg-primary/20 text-primary' : 'bg-orange-500/20 text-orange-400'}`}>
                                    {selectedCategory}
                                </span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            <span className="hidden sm:inline">Share</span>
                        </Button>
                        {isHost && (
                            <>
                                <Button variant={showSettings ? "default" : "outline"} size="sm" onClick={() => setShowSettings(!showSettings)} className="gap-2">
                                    <Settings className={`w-4 h-4 ${showSettings ? 'animate-spin' : ''}`} />
                                    <span className="hidden sm:inline">Settings</span>
                                </Button>
                                <Button variant="destructive" size="sm" onClick={handleClose} className="gap-2">
                                    <X className="w-4 h-4" />
                                    <span className="hidden sm:inline">Close</span>
                                </Button>
                            </>
                        )}
                        {isParticipant && !isHost && (
                            <Button variant="outline" size="sm" onClick={handleLeave} className="gap-2"><LogOut className="w-4 h-4 text-red-400" /><span className="hidden sm:inline">Leave</span></Button>
                        )}
                    </div>
                </div>

                {/* Host Settings */}
                <AnimatePresence>
                    {showSettings && isHost && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-4 overflow-hidden">
                            <GlassPanel className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <h3 className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2"><Search className="w-3 h-3" /> Change Anime</h3>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start text-xs bg-black/20 border-white/10 hover:bg-white/10"
                                        onClick={() => setShowAnimeSearch(true)}
                                    >
                                        <Search className="w-4 h-4 mr-2 opacity-50" />
                                        Search & Select Anime...
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2"><PlayCircle className="w-3 h-3" /> Episodes</h3>
                                    <ScrollArea className="h-[200px] bg-black/20 rounded-lg p-2"><div className="grid grid-cols-3 gap-1">{episodesData?.episodes.map(e => <Button key={e.episodeId} size="sm" variant={room.episode_id === e.episodeId ? "default" : "outline"} className="h-8 text-[10px]" onClick={() => updateRoom.mutate({ roomId: roomId!, updates: { episode_id: e.episodeId, episode_number: e.number, episode_title: e.title } as any })}>Ep {e.number}</Button>)}</div></ScrollArea>
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2"><Settings className="w-3 h-3" /> Servers</h3>

                                    {serversData?.sub && serversData.sub.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase opacity-30 px-2">Subtitled</p>
                                            {serversData.sub.filter(s => s.serverName !== 'hd-1').map((s, i) => (
                                                <Button
                                                    key={`sub-${i}`}
                                                    variant={selectedServer === s.serverName && selectedCategory === 'sub' ? "default" : "outline"}
                                                    className="w-full justify-start h-8 text-[11px]"
                                                    onClick={() => {
                                                        setSelectedServer(s.serverName);
                                                        setSelectedCategory('sub');
                                                        setTriedServers(new Set([s.serverName]));
                                                    }}
                                                >
                                                    {s.serverName}
                                                </Button>
                                            ))}
                                        </div>
                                    )}

                                    {serversData?.dub && serversData.dub.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase opacity-30 px-2">Dubbed</p>
                                            {serversData.dub.filter(s => s.serverName !== 'hd-1').map((s, i) => (
                                                <Button
                                                    key={`dub-${i}`}
                                                    variant={selectedServer === s.serverName && selectedCategory === 'dub' ? "default" : "outline"}
                                                    className="w-full justify-start h-8 text-[11px]"
                                                    onClick={() => {
                                                        setSelectedServer(s.serverName);
                                                        setSelectedCategory('dub');
                                                        setTriedServers(new Set([s.serverName]));
                                                    }}
                                                >
                                                    {s.serverName}
                                                </Button>
                                            ))}
                                        </div>
                                    )}

                                    {/* External Providers (Animeya, Animelok, Custom) */}
                                    {streamingData?.sources && streamingData.sources.some(s => s.providerName) && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase opacity-30 px-2">External Sources</p>
                                            <ScrollArea className="h-[120px] bg-black/20 rounded-lg p-2">
                                                <div className="space-y-1">
                                                    {streamingData.sources.filter(s => s.providerName).map((s, i) => (
                                                        <Button
                                                            key={`ext-${i}`}
                                                            variant={room.manual_stream_url === s.url ? "default" : "outline"}
                                                            className="w-full justify-start h-8 text-[11px] gap-2"
                                                            onClick={() => {
                                                                updateRoom.mutate({
                                                                    roomId: roomId!,
                                                                    updates: {
                                                                        manual_stream_url: s.url,
                                                                        manual_stream_type: s.isEmbed ? 'embed' : 'direct',
                                                                        selected_server: s.providerName
                                                                    } as any
                                                                });
                                                            }}
                                                        >
                                                            <Zap className="w-3 h-3 text-yellow-400" />
                                                            <span className="truncate">{s.providerName} ({s.quality})</span>
                                                        </Button>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    )}
                                </div>

                                {/* Manual Stream & Subtitle */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2"><Film className="w-3 h-3" /> Custom Stream URL</h3>
                                        <Input
                                            placeholder="Paste M3U8 or MP4 URL..."
                                            value={room.manual_stream_url || ''}
                                            onChange={(e) => updateRoom.mutate({ roomId: roomId!, updates: { manual_stream_url: e.target.value } as any })}
                                            className="bg-black/20 text-xs"
                                        />
                                        <p className="text-[10px] text-muted-foreground italic">Overrides server selection. Supports direct links.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2"><Subtitles className="w-3 h-3" /> Manual Subtitle</h3>
                                        <Input
                                            placeholder="Paste VTT or SRT URL..."
                                            value={room.manual_subtitle_url || ''}
                                            onChange={(e) => updateRoom.mutate({ roomId: roomId!, updates: { manual_subtitle_url: e.target.value } as any })}
                                            className="bg-black/20 text-xs"
                                        />
                                        <p className="text-[10px] text-muted-foreground italic">Useful for custom servers without built-in subs.</p>
                                    </div>
                                </div>
                            </GlassPanel>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Host Timer Controls */}
                {isHost && (
                    <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/5 flex items-center flex-wrap gap-4">
                        <div className="flex items-center gap-2 pr-4 border-r border-white/10"><Users className="w-4 h-4 text-emerald-400" /><span className="text-xs font-bold">{participants.filter(p => p.is_ready).length}/{participants.length} Ready</span></div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase opacity-50">Start Timer:</span>
                            {[30, 60, 300].map(s => <Button key={s} variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => handleStartTimer(s)}>{s >= 60 ? `${s / 60}m` : `${s}s`}</Button>)}
                            {!isEditingCustomTimer ? <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setIsEditingCustomTimer(true)}>Custom</Button> : <div className="flex items-center gap-1"><Input type="number" value={customTimerMinutes} onChange={e => setCustomTimerMinutes(e.target.value)} className="h-7 w-12 text-[10px] bg-black/40" /><Button size="sm" className="h-7 text-[10px]" onClick={() => { handleStartTimer(parseInt(customTimerMinutes) * 60); setIsEditingCustomTimer(false); }}>Go</Button></div>}
                            {room.scheduled_start_at && <><Button className="h-7 text-[10px] bg-emerald-500" onClick={handleForceStart}>Start Now</Button><Button variant="destructive" className="h-7 text-[10px]" onClick={() => updateRoom.mutate({ roomId: roomId!, updates: { scheduled_start_at: null } as any })}>Cancel</Button></>}
                        </div>
                    </div>
                )}

                {/* Content Grid: moderators (non-host) see restricted view */}
                {isModerator && !isHost && !isAdmin ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-16">
                        <GlassPanel className="max-w-md p-8 text-center">
                            <Lock className="w-14 h-14 mx-auto mb-4 text-muted-foreground opacity-50" />
                            <h2 className="text-xl font-bold mb-2">Restricted Access</h2>
                            <p className="text-sm text-muted-foreground mb-6">
                                Moderators have restricted access to watch rooms. You cannot view the broadcast, participants, or chat.
                            </p>
                            <Button onClick={() => navigate('/isshoni')} variant="outline" className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Watch Rooms
                            </Button>
                        </GlassPanel>
                    </div>
                ) : (
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
                        {/* Video / Countdown */}
                        <div className="lg:col-span-3 flex flex-col gap-4">
                            <div className="aspect-video bg-black rounded-xl overflow-hidden relative group/video border border-white/5">
                                {room.scheduled_start_at ? (
                                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-black">
                                        {room.anime_poster && <div className="absolute inset-0 opacity-20 blur-3xl scale-125" style={{ backgroundImage: `url(${getProxiedImageUrl(room.anime_poster)})`, backgroundSize: 'cover' }} />}
                                        <div className="relative z-10 flex flex-col items-center text-center">
                                            <div className="p-4 rounded-3xl bg-primary/20 border border-primary/30 mb-8"><Timer className="w-12 h-12 text-primary animate-pulse" /></div>
                                            <h2 className="text-3xl font-black uppercase tracking-[0.4em] text-white mb-2 drop-shadow-2xl">Starting Soon</h2>
                                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-8">The broadcast begins in:</p>
                                            <div className="flex gap-4 mb-10">
                                                <div className="text-center"><div className="text-7xl font-black font-mono text-primary tabular-nums">{countdown !== null ? Math.floor(countdown / 60) : '0'}</div><div className="text-[10px] font-black uppercase opacity-50">Min</div></div>
                                                <div className="text-7xl font-black font-mono text-primary opacity-50">:</div>
                                                <div className="text-center"><div className="text-7xl font-black font-mono text-primary tabular-nums">{(countdown !== null ? countdown % 60 : 0).toString().padStart(2, '0')}</div><div className="text-[10px] font-black uppercase opacity-50">Sec</div></div>
                                            </div>
                                            <div className="px-6 py-2 rounded-full bg-white/5 border border-white/10 flex items-center gap-4">
                                                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-emerald-400" /><span className="text-xs font-bold uppercase">{participants.length} Ready</span></div>
                                                {isHost && <><div className="w-px h-4 bg-white/20" /><button onClick={handleForceStart} className="text-xs font-black text-primary hover:text-white transition-colors uppercase">Start Now</button></>}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full relative">
                                        {(room.manual_stream_url || (streamingData?.sources && room.anime_id && currentEpisodeId)) ? (
                                            ((room.manual_stream_url ? ((room as any).manual_stream_type === 'embed' || (!room.manual_stream_url.includes('.m3u8') && !room.manual_stream_url.includes('.mp4') && !room.manual_stream_url.includes('.webm'))) : streamingData?.sources?.[0]?.isEmbed)) ? (
                                                <div className="w-full h-full relative">
                                                    <EmbedPlayer
                                                        url={room.manual_stream_url || streamingData?.sources?.[0]?.url || ''}
                                                        poster={room.anime_poster || undefined}
                                                        language="Embed"
                                                    />
                                                    <div className="absolute top-4 inset-x-0 flex justify-center z-50 pointer-events-none">
                                                        <div className="bg-red-500/90 backdrop-blur-md rounded-full px-4 py-2 border border-white/20 shadow-2xl flex items-center gap-2">
                                                            <span className="text-[10px] font-black uppercase text-white tracking-widest">⚠️ Embed sources cannot be synced across rooms</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <VideoPlayer
                                                    key={`${currentEpisodeId}-${selectedServer}-${room.manual_stream_url}`}
                                                    externalRef={playerRef}
                                                    sources={room.manual_stream_url ? [{
                                                        url: room.manual_stream_url,
                                                        isM3U8: room.manual_stream_url.includes('.m3u8'),
                                                        quality: 'Custom',
                                                        isEmbed: false
                                                    }] : streamingData?.sources!}
                                                    headers={room.manual_stream_url ? {} : streamingData?.headers}
                                                    subtitles={[
                                                        ...((sData) => {
                                                            const all = [...(sData?.subtitles || []), ...(sData?.tracks || [])];
                                                            const seen = new Set();
                                                            return all.filter(s => {
                                                                if (seen.has(s.url)) return false;
                                                                seen.add(s.url);
                                                                return true;
                                                            });
                                                        })(streamingData || { subtitles: [], tracks: [] }),
                                                        ...(room.manual_subtitle_url ? [{ lang: 'Manual', url: room.manual_subtitle_url, label: 'Manual' }] : [])
                                                    ]}
                                                    isLive={!isHost}
                                                    initialSeekSeconds={room.current_time_seconds}
                                                    onPlay={isHost ? () => updatePlayback.mutate({ roomId: roomId!, isPlaying: true }) : undefined}
                                                    onPause={isHost ? () => updatePlayback.mutate({ roomId: roomId!, isPlaying: false }) : undefined}
                                                    onProgressUpdate={isHost ? (t) => {
                                                        if (Math.abs(t - lastUpdateRef.current) > 5) {
                                                            lastUpdateRef.current = t;
                                                            updatePlayback.mutate({ roomId: roomId!, currentTime: t });
                                                        }
                                                    } : undefined}
                                                    onError={handlePlayerError}
                                                    animeId={room.anime_id}
                                                    animeName={room.anime_title}
                                                    animePoster={room.anime_poster}
                                                    episodeNumber={room.episode_number}
                                                    episodeTitle={room.episode_title}
                                                />
                                            )
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                                {loadingSources ? <div className="animate-spin h-10 w-10 border-t-2 border-primary rounded-full mb-4" /> : <><Film className="w-12 h-12 mb-2 opacity-20" /><p className="text-sm font-medium uppercase tracking-widest">{room.anime_title ? 'Loading...' : 'Waiting for Host...'}</p></>}
                                            </div>
                                        )}

                                        {/* Live Indicator Overlay */}
                                        {!isHost && room.is_playing && (
                                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                                                <div className="px-4 py-1.5 bg-background/60 backdrop-blur-xl rounded-full border border-primary/30 flex items-center gap-3 shadow-2xl">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                                        <span className="text-[10px] font-black text-white/90 uppercase tracking-[0.2em]">Live Broadcast</span>
                                                    </div>
                                                    <div className="w-px h-3 bg-white/20" />
                                                    <span className="text-sm font-mono font-bold text-primary tracking-wider">
                                                        {Math.floor((playerRef.current?.currentTime || 0) / 60)}:
                                                        {Math.floor((playerRef.current?.currentTime || 0) % 60).toString().padStart(2, '0')}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Sync Pulse */}
                                        {!isHost && room.is_playing && drift < 1.0 && (
                                            <div className="absolute top-4 right-4 z-50 p-2 bg-emerald-500/20 backdrop-blur-md rounded-full border border-emerald-500/30 text-emerald-400">
                                                <Zap className="w-3 h-3 fill-current" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Video Info Bottom Bar */}
                            <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <img src={room.anime_poster || ''} className="w-10 h-14 object-cover rounded shadow-lg" alt="" />
                                    <div><h2 className="font-bold text-sm truncate max-w-[200px]">{room.anime_title}</h2><p className="text-[10px] text-muted-foreground font-black uppercase">Episode {room.episode_number}</p></div>
                                </div>
                                {!isHost && (
                                    <Button variant={isParticipantReady ? "default" : "outline"} size="sm" onClick={handleToggleReady} className={`gap-2 h-9 px-4 ${isParticipantReady ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}`}>
                                        {isParticipantReady ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                                        <span className="font-black uppercase tracking-widest text-[10px]">{isParticipantReady ? "I'm Ready!" : "Mark Ready"}</span>
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Sidebar: Viewers & Chat */}
                        <div className="lg:col-span-1 flex flex-col gap-4 min-h-[400px]">
                            <GlassPanel className="p-4 flex flex-col gap-3">
                                <h3 className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-2"><Users className="w-3 h-3 text-primary" /> Viewers ({participants.length})</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {participants.map(p => (
                                        <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/5" title={p.display_name}>
                                            <Avatar className="w-5 h-5"><AvatarImage src={p.avatar_url || ''} /><AvatarFallback className="text-[8px]">{p.display_name[0]}</AvatarFallback></Avatar>
                                            <span className="text-[10px] font-medium truncate max-w-[60px]">{p.display_name}</span>
                                            {p.is_ready && <Zap className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400" />}
                                            {p.is_host && <Crown className="w-2.5 h-2.5 text-yellow-500" />}
                                        </div>
                                    ))}
                                </div>
                            </GlassPanel>

                            <GlassPanel className="flex-1 flex flex-col p-4 overflow-hidden">
                                <h3 className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-2 mb-4"><MessageSquare className="w-3 h-3 text-primary" /> Live Chat</h3>
                                <ScrollArea className="flex-1 -mr-2 pr-2">
                                    <div className="space-y-4">
                                        {messages.map(m => (
                                            <div key={m.id} className={`flex gap-3 ${m.message_type === 'system' ? 'justify-center py-2' : ''}`}>
                                                {m.message_type === 'system' ? (
                                                    <p className="text-[10px] text-muted-foreground italic opacity-60 px-4 text-center">{m.message}</p>
                                                ) : (
                                                    <>
                                                        <Avatar className="w-7 h-7 flex-shrink-0 border border-white/10"><AvatarImage src={m.avatar_url || ''} /><AvatarFallback className="text-[10px]">{m.display_name[0]}</AvatarFallback></Avatar>
                                                        <div className="min-w-0"><p className="text-[10px] font-black text-primary uppercase tracking-tighter mb-0.5">{m.display_name}</p><p className="text-sm leading-relaxed opacity-90 break-words">{m.message}</p></div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>
                                </ScrollArea>
                                {isParticipant ? (
                                    <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t border-white/5 flex gap-2">
                                        <Input value={message} onChange={e => setMessage(e.target.value)} placeholder="Say something..." className="bg-black/20 text-sm h-10" />
                                        <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!message.trim()}><Send className="w-4 h-4" /></Button>
                                    </form>
                                ) : (
                                    <div className="mt-4 pt-4 border-t border-white/5"><Button className="w-full h-10 font-black uppercase tracking-widest text-[10px]" onClick={handleJoin}>Join to Chat</Button></div>
                                )}
                            </GlassPanel>
                        </div>
                    </div>
                )}
            </main>

            <AnimatePresence>
                {showPasswordDialog && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                        <GlassPanel className="p-6 max-w-sm w-full space-y-4">
                            <div className="flex items-center gap-4"><div className="p-3 bg-orange-500/20 rounded-2xl"><Lock className="w-6 h-6 text-orange-500" /></div><div><h3 className="font-bold">Password Required</h3><p className="text-xs text-muted-foreground">Enter room password to join</p></div></div>
                            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password..." className="bg-black/20" autoFocus />
                            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setShowPasswordDialog(false)}>Cancel</Button><Button className="flex-1" onClick={handlePasswordJoin}>Join Room</Button></div>
                        </GlassPanel>
                    </div>
                )}
            </AnimatePresence>

            <CustomVideoSourceModal
                isOpen={showAnimeSearch}
                onClose={() => setShowAnimeSearch(false)}
                onSelect={(anime, ep) => {
                    updateRoom.mutate({
                        roomId: roomId!,
                        updates: {
                            anime_id: anime.id,
                            anime_title: anime.name,
                            anime_poster: anime.poster,
                            episode_id: ep?.episodeId || null,
                            episode_number: ep?.number || null,
                            episode_title: ep?.title || null
                        } as any
                    });
                }}
            />

            <MobileNav />
        </div>
    );
}
