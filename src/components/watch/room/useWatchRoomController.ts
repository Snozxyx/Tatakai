import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
    useWatchRoom,
    useRoomParticipants,
    useRoomMessages,
    useRoomQueue,
    useAddQueueItem,
    useRemoveQueueItem,
    useReorderQueueItems,
    useActiveRoomPoll,
    useCreateRoomPoll,
    useVoteRoomPoll,
    useCloseRoomPoll,
    useJoinRoom,
    useHostSelfJoin,
    useLeaveRoom,
    useSendMessage,
    useUpdatePlayback,
    useCloseRoom,
    useUpdateRoom,
    useUpdateParticipantReady,
    useAdminDeleteRoom
} from '@/hooks/media/useWatchRoom';
import { useQueryClient } from '@tanstack/react-query';
import { useEpisodes, useAnimeInfo } from '@/hooks/api/useAnimeData';
import { useCombinedSourcesWithRefetch } from '@/hooks/media/useCombinedSources';
import { supabase } from '@/integrations/supabase/client';
import { useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { setActivity, clearActivity } from '@/core/activity/activity-monitor';
import { groupProviderServers } from './watchRoomShared';

/**
 * useWatchRoomController — the entire Watch2Together room logic (state, refs,
 * queries, realtime effects, source resolution, and handlers) extracted from the
 * old monolithic WatchRoomPage. The provider calls this once and hands the
 * returned object to every UI component via context, so hook order is preserved
 * and behavior is unchanged. New vs. the old page: a `showDrawer` UI flag for the
 * theater layout, plus `handleAnimeSelect`/`handleCloseAnimeSearch` (moved
 * verbatim out of the CustomVideoSourceModal JSX).
 */
export function useWatchRoomController() {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const isDesktopApp = useIsDesktopApp();
    const prefersReducedMotion = useReducedMotion();
    const { user, isModerator, isAdmin } = useAuth();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const joinedFlagKey = roomId ? `watch-room-joined-${roomId}` : null;
    // UI State
    const [message, setMessage] = useState('');
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [copied, setCopied] = useState(false);
    const [selectedServer, setSelectedServer] = useState<string>('hd-1');
    const [triedServers, setTriedServers] = useState<Set<string>>(new Set(['hd-1']));
    const [showSettings, setShowSettings] = useState(false);
    const [showAnimeSearch, setShowAnimeSearch] = useState(false);
    const [animeSearchMode, setAnimeSearchMode] = useState<'change-room' | 'queue'>('change-room');
    const [drift, setDrift] = useState(0);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isEditingCustomTimer, setIsEditingCustomTimer] = useState(false);
    const [customTimerMinutes, setCustomTimerMinutes] = useState('10');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [hostTransferTarget, setHostTransferTarget] = useState<string | null>(null);
    const [pollQuestion, setPollQuestion] = useState('');
    // Header poll maker (mirrors the community feed's poll composer): 2–4 choices
    // plus a days/hours/minutes duration.
    const [showPollDialog, setShowPollDialog] = useState(false);
    const [pollChoices, setPollChoices] = useState<string[]>(['', '']);
    const [pollDuration, setPollDuration] = useState<{ days: number; hours: number; minutes: number }>({ days: 0, hours: 0, minutes: 5 });
    // Which side-rail tab is showing in the cinema layout.
    const [sideTab, setSideTab] = useState<'chat' | 'queue' | 'polls' | 'viewers'>('chat');
    // Theater layout: the side rail lives in a slide-over drawer. Open by default
    // on wide screens (video + drawer side-by-side), closed on mobile.
    const [showDrawer, setShowDrawer] = useState<boolean>(
        () => typeof window !== 'undefined' && window.innerWidth >= 1024
    );

    // Local-file share (host streams a device file / offline-library episode into
    // the party). When set, the host plays `localStreamUrl` (loopback, no tunnel
    // round-trip) and the anime auto-publish effect stands down so it can't clobber
    // the published local source. Cleared when the host switches back to an anime.
    const [localShare, setLocalShare] = useState<
        { shareStreamUrl: string; localStreamUrl: string; fileName?: string } | null
    >(null);
    const [showLibraryPicker, setShowLibraryPicker] = useState(false);
    const [library, setLibrary] = useState<any[]>([]);
    const [loadingLibrary, setLoadingLibrary] = useState(false);
    const [publishingLocal, setPublishingLocal] = useState(false);
    const [selectedLibrarySeries, setSelectedLibrarySeries] = useState<any>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLVideoElement>(null);
    const lastUpdateRef = useRef<number>(0);
    const countdownIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptRef = useRef(0);
    const hasAutoJoinRef = useRef(false);
    const hostJoinRef = useRef(false);
    const presenceIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Queries & Hooks
    const { data: room, isLoading: loadingRoom } = useWatchRoom(roomId);
    const { data: participants = [] } = useRoomParticipants(roomId);
    const { data: messages = [], refetch: refetchMessages } = useRoomMessages(roomId);
    const { data: queueItems = [] } = useRoomQueue(roomId);
    const { data: activePoll } = useActiveRoomPoll(roomId);
    const { data: episodesData, isLoading: loadingEpisodes } = useEpisodes(room?.anime_id);

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
    const hostSelfJoin = useHostSelfJoin();
    const leaveRoom = useLeaveRoom();
    const sendMessage = useSendMessage();
    const addQueueItem = useAddQueueItem();
    const removeQueueItem = useRemoveQueueItem();
    const reorderQueueItems = useReorderQueueItems();
    const createRoomPoll = useCreateRoomPoll();
    const voteRoomPoll = useVoteRoomPoll();
    const closeRoomPoll = useCloseRoomPoll();
    const updatePlayback = useUpdatePlayback();
    const closeRoom = useCloseRoom();
    const updateRoom = useUpdateRoom();
    const updateParticipantReady = useUpdateParticipantReady();
    const adminDeleteRoom = useAdminDeleteRoom();
    // Auto-rejoin for transient disconnects (non-password rooms only).
    useEffect(() => {
        if (!roomId || !room || !user || !joinedFlagKey) return;
        if (room.access_type === 'password') return;
        if (isParticipant || joinRoom.isPending || hasAutoJoinRef.current) return;

        const shouldRecover = localStorage.getItem(joinedFlagKey) === '1';
        if (!shouldRecover) return;

        hasAutoJoinRef.current = true;
        setIsReconnecting(true);
        joinRoom.mutate(
            { roomId },
            {
                onSuccess: () => {
                    reconnectAttemptRef.current += 1;
                    toast.success('Reconnected to room');
                },
                onError: () => {
                    hasAutoJoinRef.current = false;
                },
                onSettled: () => {
                    setIsReconnecting(false);
                }
            }
        );
    }, [roomId, room, user, joinedFlagKey, isParticipant, joinRoom]);

    // create_watch_room() does not add the host to watch_room_participants, so a
    // host entering their own room is not a participant — the chat input is
    // replaced by "Join to Chat" and reactions/poll votes are gated off. Self-join
    // on entry (idempotent; the host-self-join RLS policy allows a direct insert,
    // so this works for password rooms without re-entering the password).
    useEffect(() => {
        if (!roomId || !room || !user || !isHost) return;
        if (isParticipant || hostSelfJoin.isPending || hostJoinRef.current) return;
        hostJoinRef.current = true;
        hostSelfJoin.mutate(roomId, {
            onError: () => {
                // Don't reset the ref — retrying would loop. The host is usually
                // already seated by create_watch_room(), so a failure here is
                // non-fatal (chat still loads via their participant row).
            },
        });
    }, [roomId, room, user, isHost, isParticipant, hostSelfJoin]);
    // Keep participant presence fresh for reconnect and host transfer decisions.
    useEffect(() => {
        if (!roomId || !user || !isParticipant) {
            if (presenceIntervalRef.current) {
                clearInterval(presenceIntervalRef.current);
                presenceIntervalRef.current = null;
            }
            return;
        }

        const heartbeat = async () => {
            await supabase
                .from('watch_room_participants')
                .update({
                    last_seen_at: new Date().toISOString(),
                    is_host: !!isHost,
                })
                .eq('room_id', roomId)
                .eq('user_id', user.id);
        };

        heartbeat();
        presenceIntervalRef.current = setInterval(heartbeat, 25000);

        return () => {
            if (presenceIntervalRef.current) {
                clearInterval(presenceIntervalRef.current);
                presenceIntervalRef.current = null;
            }
        };
    }, [roomId, user, isParticipant, isHost]);

    useEffect(() => {
        if (!joinedFlagKey) return;
        if (isParticipant) {
            localStorage.setItem(joinedFlagKey, '1');
        }
    }, [isParticipant, joinedFlagKey]);
    const { data: animeInfo, isLoading: loadingAnimeInfo } = useAnimeInfo(
        room?.anime_id && room.anime_id !== 'custom' ? room.anime_id : undefined
    );
    // Derive the resolver inputs from the ROOM ROW first, then fall back to the
    // fetched metadata. room.anime_id is normally the AniList id (bare numeric,
    // or an `anilist:`/`mal:` prefix) and room.anime_title is always stored at
    // creation — so a room made from lobby search, a URL deep-link, or a changed
    // anime resolves immediately by id + title instead of waiting on (or silently
    // failing when) a cold useAnimeInfo(getMedia) backfill. toko matches on
    // anilistId/title, so this is all it needs; useAnimeInfo just enriches it.
    const roomIdAnilist = (() => {
        const raw = String(room?.anime_id ?? '').trim();
        const m = raw.match(/^anilist[:_-]?(\d+)$/i) || raw.match(/^(\d+)$/);
        return m?.[1] ? Number(m[1]) : null;
    })();
    const roomIdMal = (() => {
        const raw = String(room?.anime_id ?? '').trim();
        const m = raw.match(/^mal[:_-]?(\d+)$/i);
        return m?.[1] ? Number(m[1]) : null;
    })();
    const anilistId = (animeInfo as any)?.anilistID || (animeInfo as any)?.moreInfo?.anilistId || roomIdAnilist || null;
    const malId = (animeInfo as any)?.malID || (animeInfo as any)?.moreInfo?.malId || roomIdMal || null;
    const animeName = (animeInfo as any)?.info?.name
        || (animeInfo as any)?.titleEnglish
        || (animeInfo as any)?.titleRomaji
        || room?.anime_title
        || undefined;

    // Live-activity: surface hosting (Streaming) / attending (Watching) a room
    // in the Dynamic Island for as long as this room page is mounted.
    useEffect(() => {
        if (!roomId || !room) { clearActivity('watchroom'); return; }
        const count = participants.length || room.participant_count || 0;
        setActivity('watchroom', {
            kind: isHost ? 'streaming' : 'watching',
            label: animeName || room.anime_title || 'Watch room',
            detail: count > 0 ? `${count} in room` : undefined,
        });
        return () => clearActivity('watchroom');
    }, [roomId, room, isHost, animeName, participants.length]);

    // episodeId is ONLY a client-side enablement gate for the stream hook —
    // toko resolves by anilistId/title + episode number, never by this id. So
    // when a freshly-changed anime hasn't produced an episode list yet (ani.zip
    // miss, or the room's own useEpisodes still loading), synthesize a gate id
    // from the anilistId/name so resolution still runs instead of the server
    // list sitting empty forever.
    const streamGateEpisodeId = currentEpisodeId
        || (anilistId ? `al:${anilistId}:${room?.episode_number || 1}` : undefined)
        || (animeName ? `nm:${animeName}:${room?.episode_number || 1}` : undefined);

    const isCustomRoom = room?.anime_id === 'custom';
    // Participants play the host's public tunnel URL; only the desktop host
    // resolves the real source locally through the toko extension.
    const isViewerOnShare = !isHost && !!room?.share_active && !!room?.share_stream_url;

    // Host-side source resolution — the same extension-backed hook WatchPage
    // uses (the legacy fetchCombinedSources returns [] under the toko model).
    // Disabled for participants and custom-URL rooms.
    const {
        data: resolvedSources,
        isLoading: loadingResolved,
        refetch: refetchSources,
        diagnostics: sourceDiagnostics,
    } = useCombinedSourcesWithRefetch(
        (isHost && !isCustomRoom) ? streamGateEpisodeId : undefined,
        animeName,
        room?.episode_number || 1,
        selectedServer,
        selectedCategory,
        user?.id,
        anilistId,
        malId,
    );
    // Custom-URL rooms: synthesize a direct source from room.episode_id.
    const customStreamingData = useMemo(() => {
        if (!isCustomRoom || !room?.episode_id) return null;
        const url = room.episode_id;
        return {
            sources: [{
                url,
                isM3U8: url.includes('.m3u8'),
                isEmbed: !url.includes('.m3u8') && !url.includes('.mp4') && !url.includes('.webm'),
                quality: 'default',
            }],
            headers: { Referer: window.location.origin, 'User-Agent': navigator.userAgent },
            subtitles: [], intro: null, outro: null, tracks: [], providerServers: [],
        } as any;
    }, [isCustomRoom, room?.episode_id]);

    // Participant path: build a synthetic source from the host's published
    // tunnel URL so the existing player wiring plays it unchanged.
    const viewerStreamingData = useMemo(() => {
        if (!isViewerOnShare || !room?.share_stream_url) return null;
        const url = room.share_stream_url;
        return {
            sources: [{
                url,
                isM3U8: room.share_stream_type === 'hls' || url.includes('.m3u8'),
                isEmbed: false,
                quality: 'auto',
            }],
            headers: {},
            subtitles: room.share_subtitle_url
                ? [{ lang: 'Default', url: room.share_subtitle_url, label: 'Subtitles' }]
                : [],
            tracks: [], intro: null, outro: null, providerServers: [],
        } as any;
    }, [isViewerOnShare, room?.share_stream_url, room?.share_stream_type, room?.share_subtitle_url]);

    // Host local-file path: the host plays its own picked file off the loopback
    // proxy (participants get the tunnel URL from the room row). Direct file, so
    // never HLS/embed. Takes precedence over resolved anime sources for the host.
    const localShareData = useMemo(() => {
        if (!localShare?.localStreamUrl) return null;
        const url = localShare.localStreamUrl;
        return {
            sources: [{ url, isM3U8: false, isEmbed: false, quality: 'local' }],
            headers: {},
            subtitles: [], intro: null, outro: null, tracks: [], providerServers: [],
        } as any;
    }, [localShare?.localStreamUrl]);
    const streamingData = isCustomRoom
        ? customStreamingData
        : isViewerOnShare
            ? viewerStreamingData
            : (isHost && localShareData)
                ? localShareData
                : resolvedSources;
    // "Resolving" covers both the extension source stream AND the upstream
    // anime metadata fetch. After a host changes the anime, `useAnimeInfo` /
    // `useEpisodes` refetch for the new id; until they land, `anilistId` /
    // `animeName` / `currentEpisodeId` are briefly empty and stream resolution
    // is gated off — without this the panel would flash "No servers found"
    // before resolution even had the inputs to start.
    const loadingSources =
        isHost && !isCustomRoom
            ? (loadingResolved || loadingAnimeInfo || loadingEpisodes)
            : false;

    const serversData = useMemo(
        () => groupProviderServers(streamingData?.providerServers || []),
        [streamingData?.providerServers]
    );

    // ── Host: publish the resolved stream to the watch party ──────────────────
    // Desktop host only: register the source as a persistent share source on the
    // local proxy, open the Cloudflare tunnel, and write the public URL to the
    // room row so every participant plays the host's single synced source.
    const publishTokenRef = useRef<string>('');
    useEffect(() => {
        if (!isHost || !roomId) return;
        if (isCustomRoom) return; // custom rooms already carry a shareable URL
        if (localShare) return;   // host is streaming a local file — don't overwrite it
        const rt = (window as any).tatakaiRuntime;
        if (!isDesktopApp || !rt?.publishShareSource) return;

        const primary = (resolvedSources?.sources || []).find((s: any) => !s.isEmbed);
        // Embed sources can't be tunneled or clock-synced — leave share inactive.
        if (!primary?.url) return;

        const subUrl = (() => {
            const all = [...(resolvedSources?.subtitles || []), ...(resolvedSources?.tracks || [])];
            const def = all.find((s: any) => /eng/i.test(s?.lang || s?.label || '')) || all[0];
            return def?.url || '';
        })();

        const token = `${currentEpisodeId}|${selectedServer}|${selectedCategory}|${primary.url}`;
        if (publishTokenRef.current === token) return;
        publishTokenRef.current = token;

        (async () => {
            // First run may need to download cloudflared (tens of MB), so this can
            // take a while — keep the host informed instead of a silent wait.
            const loadingId = toast.loading('Preparing watch party stream…');
            try {
                const res = await rt.publishShareSource({
                    streamUrl: primary.url,
                    headers: resolvedSources?.headers || {},
                    subtitleUrl: subUrl || undefined,
                    streamType: primary.isM3U8 ? 'hls' : 'direct',
                });
                if (res?.shareStreamUrl) {
                    updateRoom.mutate({
                        roomId,
                        updates: {
                            share_stream_url: res.shareStreamUrl,
                            share_stream_type: res.shareStreamType || (primary.isM3U8 ? 'hls' : 'direct'),
                            share_subtitle_url: res.shareSubtitleUrl || null,
                            share_active: true,
                            share_host_platform: 'desktop',
                        } as any,
                    });
                    toast.success('Watch party stream is live', { id: loadingId });
                } else if (res?.error) {
                    publishTokenRef.current = '';
                    // If cloudflared couldn't be found or auto-installed, guide the
                    // host to install it manually rather than a bare error string.
                    const needsCloudflared =
                        res.status?.installState === 'failed' || res.status?.binaryResolved === false;
                    if (needsCloudflared) {
                        toast.error('cloudflared is required to host a watch party', {
                            id: loadingId,
                            description:
                                "Couldn't install it automatically (you may be offline). Download cloudflared, add it to your PATH, then reopen the room.",
                            duration: 15000,
                            action: {
                                label: 'Download',
                                onClick: () =>
                                    (window as any).electron?.openExternal?.(
                                        'https://github.com/cloudflare/cloudflared/releases/latest',
                                    ),
                            },
                        });
                    } else {
                        toast.error(`Watch party stream failed: ${res.error}`, { id: loadingId });
                    }
                } else {
                    toast.dismiss(loadingId);
                }
            } catch (err: any) {
                publishTokenRef.current = '';
                toast.error(`Watch party stream failed: ${err?.message || err}`, { id: loadingId });
            }
        })();
    }, [isHost, isDesktopApp, roomId, isCustomRoom, localShare, resolvedSources, currentEpisodeId, selectedServer, selectedCategory]);
    // Stop the tunnel + clear share fields when the host leaves/unmounts.
    useEffect(() => {
        if (!isHost) return;
        return () => {
            const rt = (window as any).tatakaiRuntime;
            try { rt?.stopShareTunnel?.(); } catch (_) { /* noop */ }
            if (roomId) {
                updateRoom.mutate({ roomId, updates: { share_active: false } as any });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, roomId]);

    // Error Handling for Video Player
    const handlePlayerError = useCallback(() => {
        if (localShare) return; // local file — no server failover to attempt
        if (!serversData || !isHost) return;
        const allServers = serversData.all || [];
        const nextServer = allServers.find(s => !triedServers.has(s.serverName));

        if (nextServer) {
            toast.info(`Switching server to ${nextServer.serverName}...`);
            setTriedServers(prev => new Set([...prev, nextServer.serverName]));
            setSelectedServer(nextServer.serverName);
        } else {
            toast.error("No working servers found. Try another episode.");
        }
    }, [serversData, isHost, triedServers, localShare]);
    // ── Host: stream a local file (device pick or offline-library episode) ────
    // Serves the file off the loopback proxy, tunnels it, and publishes the public
    // URL to the room so every participant plays it synced to the host clock. The
    // file path never leaves the host — participants only see the tunnel token.
    const publishLocalFile = useCallback(async (filePath: string, label?: string) => {
        if (!roomId) return;
        const rt = (window as any).tatakaiRuntime;
        if (!isDesktopApp || !rt?.publishLocalFile) {
            toast.error('Streaming a local file needs the desktop app');
            return;
        }
        setPublishingLocal(true);
        const loadingId = toast.loading('Preparing your file for the watch party…');
        try {
            const res = await rt.publishLocalFile({ path: filePath });
            if (res?.shareStreamUrl && res?.localStreamUrl) {
                // Stop anime resolution from clobbering this, then publish.
                publishTokenRef.current = '';
                setLocalShare({
                    shareStreamUrl: res.shareStreamUrl,
                    localStreamUrl: res.localStreamUrl,
                    fileName: res.fileName || label,
                });
                await updateRoom.mutateAsync({
                    roomId,
                    updates: {
                        share_stream_url: res.shareStreamUrl,
                        share_stream_type: 'direct',
                        share_subtitle_url: null,
                        share_active: true,
                        share_host_platform: 'desktop',
                    } as any,
                });
                toast.success(`Now streaming ${res.fileName || label || 'your file'}`, { id: loadingId });
                setShowLibraryPicker(false);
            } else if (res?.error) {
                const needsCloudflared =
                    res.status?.installState === 'failed' || res.status?.binaryResolved === false;
                if (needsCloudflared) {
                    toast.error('cloudflared is required to host a watch party', {
                        id: loadingId,
                        description:
                            "Couldn't install it automatically (you may be offline). Download cloudflared, add it to your PATH, then try again.",
                        duration: 15000,
                        action: {
                            label: 'Download',
                            onClick: () =>
                                (window as any).electron?.openExternal?.(
                                    'https://github.com/cloudflare/cloudflared/releases/latest',
                                ),
                        },
                    });
                } else {
                    toast.error(`Couldn't stream that file: ${res.error}`, { id: loadingId });
                }
            } else {
                toast.dismiss(loadingId);
            }
        } catch (err: any) {
            toast.error(`Couldn't stream that file: ${err?.message || err}`, { id: loadingId });
        } finally {
            setPublishingLocal(false);
        }
    }, [roomId, isDesktopApp, updateRoom]);
    // Pick a video file from the device via the native dialog, then publish it.
    const handlePickLocalFile = useCallback(async () => {
        const electron = (window as any).electron;
        if (!electron?.selectFile) {
            toast.error('File picking needs the desktop app');
            return;
        }
        try {
            const filePath = await electron.selectFile({
                title: 'Choose a video to stream',
                filters: [
                    { name: 'Video', extensions: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'ogv', 'ogg', 'ts'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (filePath) await publishLocalFile(String(filePath));
        } catch (err: any) {
            toast.error(`Couldn't open the file picker: ${err?.message || err}`);
        }
    }, [publishLocalFile]);

    // Load the offline/downloaded library so the host can pick an episode to stream.
    const openLibraryPicker = useCallback(async () => {
        const electron = (window as any).electron;
        if (!electron?.getOfflineLibrary) {
            toast.error('The offline library needs the desktop app');
            return;
        }
        setShowLibraryPicker(true);
        setLoadingLibrary(true);
        setSelectedLibrarySeries(null);
        try {
            const lib = await electron.getOfflineLibrary();
            setLibrary(Array.isArray(lib) ? lib : []);
        } catch (err: any) {
            toast.error(`Couldn't read your library: ${err?.message || err}`);
            setLibrary([]);
        } finally {
            setLoadingLibrary(false);
        }
    }, []);

    // Switch back from a local file to normal anime resolution.
    const clearLocalShare = useCallback(() => {
        setLocalShare(null);
        publishTokenRef.current = '';
        if (roomId) {
            updateRoom.mutate({ roomId, updates: { share_active: false } as any });
        }
        const rt = (window as any).tatakaiRuntime;
        try { rt?.stopShareTunnel?.(); } catch (_) { /* noop */ }
    }, [roomId, updateRoom]);
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
            setSelectedServer('hd-1');
            setTriedServers(new Set(['hd-1']));
        }
    }, [currentEpisodeId]);

    // Removed inline search logic (moved to modal)

    // Participant Sync Logic (wall-clock + adaptive drift correction)
    useEffect(() => {
        if (isHost || !playerRef.current || !room || room.scheduled_start_at) return;
        const video = playerRef.current;

        if (!room.is_playing) {
            if (!video.paused) video.pause();
            if (video.playbackRate !== 1) video.playbackRate = 1;
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
        const signedDrift = liveHostTime - video.currentTime;
        const currentDrift = Math.abs(signedDrift);
        setDrift(currentDrift);

        // Large drift: hard seek to host.
        if (currentDrift > 2.5) {
            video.currentTime = liveHostTime;
            video.playbackRate = 1;
            return;
        }

        // Medium drift: gently speed up/slow down to reduce resync jumps.
        if (currentDrift > 0.35) {
            const maxDelta = 0.08;
            const rateDelta = Math.min(maxDelta, currentDrift / 8);
            video.playbackRate = signedDrift > 0 ? 1 + rateDelta : 1 - rateDelta;
            return;
        }

        if (video.playbackRate !== 1) {
            video.playbackRate = 1;
        }
    }, [room?.is_playing, room?.current_time_seconds, room?.updated_at, room?.scheduled_start_at, isHost]);
    // Real-time Subscriptions
    useEffect(() => {
        if (!roomId) return;
        // Ensure any previous room channel for this room is removed first.
        try {
            const existing = supabase.getChannels?.().find((c: any) => c.topic?.endsWith(`room-${roomId}`));
            if (existing) supabase.removeChannel(existing);
        } catch (e) {
            // ignore if getChannels not available
        }

        const channel = supabase.channel(`room-${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_messages', filter: `room_id=eq.${roomId}` }, () => refetchMessages())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'watch_rooms', filter: `id=eq.${roomId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['watch-room', roomId] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_participants', filter: `room_id=eq.${roomId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['watch-room-participants', roomId] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_queue', filter: `room_id=eq.${roomId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['watch-room-queue', roomId] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_polls', filter: `room_id=eq.${roomId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['watch-room-active-poll', roomId] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_poll_votes', filter: `room_id=eq.${roomId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['watch-room-active-poll', roomId] });
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setIsReconnecting(false);
                    return;
                }

                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setIsReconnecting(true);
                    queryClient.invalidateQueries({ queryKey: ['watch-room', roomId] });
                    queryClient.invalidateQueries({ queryKey: ['watch-room-participants', roomId] });
                    queryClient.invalidateQueries({ queryKey: ['watch-room-messages', roomId] });
                    queryClient.invalidateQueries({ queryKey: ['watch-room-queue', roomId] });
                    queryClient.invalidateQueries({ queryKey: ['watch-room-active-poll', roomId] });
                }
            });
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
        else {
            joinRoom.mutate(
                { roomId: roomId! },
                {
                    onSuccess: () => {
                        if (joinedFlagKey) localStorage.setItem(joinedFlagKey, '1');
                        if (user?.id) {
                            sendMessage.mutate({ roomId: roomId!, message: 'joined the room.', messageType: 'system' });
                        }
                    },
                    onError: (err: any) => toast.error(err?.message || 'Failed to join room'),
                }
            );
        }
    };

    const handlePasswordJoin = () => {
        joinRoom.mutate({ roomId: roomId!, password }, {
            onSuccess: () => {
                setShowPasswordDialog(false);
                setPassword('');
                if (joinedFlagKey) localStorage.setItem(joinedFlagKey, '1');
                if (user?.id) {
                    sendMessage.mutate({ roomId: roomId!, message: 'joined the room.', messageType: 'system' });
                }
            },
            onError: (err: any) => toast.error(err.message || "Invalid password")
        });
    };
    const handleLeave = async () => {
        if (isHost && participants.length > 1) {
            const nextHost = participants
                .filter(p => p.user_id !== user?.id)
                .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())[0];

            if (nextHost) {
                await updateRoom.mutateAsync({ roomId: roomId!, updates: { host_id: nextHost.user_id } as any });
                await supabase
                    .from('watch_room_participants')
                    .update({ is_host: false })
                    .eq('room_id', roomId!)
                    .eq('user_id', user!.id);
                await supabase
                    .from('watch_room_participants')
                    .update({ is_host: true })
                    .eq('room_id', roomId!)
                    .eq('user_id', nextHost.user_id);
                await sendMessage.mutateAsync({ roomId: roomId!, message: `Host left. ${nextHost.display_name} is now host.`, messageType: 'system' });
            }
        }
        if (joinedFlagKey) localStorage.removeItem(joinedFlagKey);
        if (user?.id) {
            sendMessage.mutate({ roomId: roomId!, message: 'left the room.', messageType: 'system' });
        }
        leaveRoom.mutate(roomId!, { onSuccess: () => navigate('/isshoni') });
    };

    const handleClose = async () => {
        if (await confirm({ title: 'Close this room?' })) {
            if (joinedFlagKey) localStorage.removeItem(joinedFlagKey);
            closeRoom.mutate(roomId!, { onSuccess: () => { toast.success('Room closed'); navigate('/isshoni'); } });
        }
    };

    // Admin-only: hard-delete any room (routes through the SECURITY DEFINER RPC,
    // which the host-only RLS DELETE policy would otherwise block).
    const handleAdminDelete = async () => {
        if (!isAdmin || !roomId) return;
        if (!(await confirm({
            title: 'Force-delete this room?',
            description: 'This permanently removes the room and all its messages, participants, queue, and polls. This cannot be undone.',
        }))) return;
        adminDeleteRoom.mutate(roomId, {
            onSuccess: () => { toast.success('Room deleted'); navigate('/isshoni'); },
            onError: (e: any) => toast.error(e?.message || 'Failed to delete room'),
        });
    };
    // Header poll maker — same shape as the community composer, wired to room polls.
    const handleCreatePollFromDialog = async () => {
        if (!isHost || !roomId) return;
        const normalizedQuestion = pollQuestion.trim();
        const normalizedOptions = pollChoices.map((c) => c.trim()).filter(Boolean);
        if (!normalizedQuestion) { toast.error('Add a poll question first'); return; }
        if (normalizedOptions.length < 2) { toast.error('Add at least two poll options'); return; }

        const totalMs = ((pollDuration.days * 24 + pollDuration.hours) * 60 + pollDuration.minutes) * 60 * 1000;
        const endsAt = new Date(Date.now() + (totalMs > 0 ? totalMs : 5 * 60 * 1000)).toISOString();

        try {
            await createRoomPoll.mutateAsync({ roomId, question: normalizedQuestion, options: normalizedOptions, endsAt });
            // The system message is a nicety — a failure here shouldn't discard a poll that was created.
            try {
                await sendMessage.mutateAsync({ roomId, message: `New poll: ${normalizedQuestion}`, messageType: 'system' });
            } catch { /* non-fatal */ }

            setPollQuestion('');
            setPollChoices(['', '']);
            setPollDuration({ days: 0, hours: 0, minutes: 5 });
            setShowPollDialog(false);
            toast.success('Poll started');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to start poll');
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        const text = message.trim();
        if (!text) return;
        setMessage('');
        sendMessage.mutate(
            { roomId: roomId!, message: text },
            {
                onError: (err: any) => {
                    setMessage(text); // restore so the user doesn't lose what they typed
                    toast.error(err?.message || 'Failed to send message');
                },
            }
        );
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Link copied!');
    };
    const handleTransferHost = async (targetUserId: string, displayName: string) => {
        if (!isHost || !roomId || !user || targetUserId === user.id) return;
        if (!(await confirm({ title: `Transfer host controls to ${displayName}?` }))) return;

        setHostTransferTarget(targetUserId);
        try {
            await updateRoom.mutateAsync({
                roomId,
                updates: { host_id: targetUserId } as any
            });

            await supabase
                .from('watch_room_participants')
                .update({ is_host: false })
                .eq('room_id', roomId)
                .eq('user_id', user.id);

            await supabase
                .from('watch_room_participants')
                .update({ is_host: true })
                .eq('room_id', roomId)
                .eq('user_id', targetUserId);

            await sendMessage.mutateAsync({
                roomId,
                message: `${displayName} is now the host.`,
                messageType: 'system'
            });

            toast.success(`Host transferred to ${displayName}`);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to transfer host');
        } finally {
            setHostTransferTarget(null);
        }
    };

    const handleExportChat = () => {
        if (!room) return;

        const lines = messages.map((entry) => {
            const timestamp = new Date(entry.created_at).toLocaleString();
            const prefix = entry.message_type === 'system'
                ? '[SYSTEM]'
                : `[${entry.display_name}]`;
            return `${timestamp} ${prefix} ${entry.message}`;
        });

        const safeRoomName = room.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${safeRoomName || 'watch-room'}-chat-log.txt`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        toast.success('Chat log exported');
    };
    const handleQueueCurrentEpisode = async () => {
        if (!isHost || !roomId || !room?.anime_id || room.anime_id === 'custom') return;

        try {
            await addQueueItem.mutateAsync({
                roomId,
                animeId: room.anime_id,
                animeTitle: room.anime_title || 'Untitled Anime',
                animePoster: room.anime_poster,
                episodeId: room.episode_id,
                episodeNumber: room.episode_number,
                episodeTitle: room.episode_title,
            });
            toast.success('Added current episode to queue');
        } catch (err: any) {
            toast.error(`Couldn't add to queue: ${err?.message || err}`);
        }
    };

    const handleQueueAnimeFromSearch = () => {
        if (!isHost) return;
        setAnimeSearchMode('queue');
        setShowAnimeSearch(true);
    };

    const handlePlayQueueItem = async (queueItemId: string) => {
        if (!isHost || !roomId) return;
        const item = queueItems.find((q) => q.id === queueItemId);
        if (!item) return;

        await updateRoom.mutateAsync({
            roomId,
            updates: {
                anime_id: item.anime_id,
                anime_title: item.anime_title,
                anime_poster: item.anime_poster,
                episode_id: item.episode_id,
                episode_number: item.episode_number,
                episode_title: item.episode_title,
                current_time_seconds: 0,
                is_playing: false,
                scheduled_start_at: null,
            } as any,
        });

        await sendMessage.mutateAsync({
            roomId,
            message: `Now queued to play: ${item.anime_title}${item.episode_number ? ` • Episode ${item.episode_number}` : ''}`,
            messageType: 'system',
        });
    };

    const handleMoveQueueItem = async (queueItemId: string, direction: 'up' | 'down') => {
        if (!isHost || !roomId) return;
        const currentIndex = queueItems.findIndex((q) => q.id === queueItemId);
        if (currentIndex < 0) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= queueItems.length) return;

        const reordered = [...queueItems];
        const [item] = reordered.splice(currentIndex, 1);
        reordered.splice(targetIndex, 0, item);

        await reorderQueueItems.mutateAsync({
            roomId,
            queueItemIds: reordered.map((entry) => entry.id),
        });
    };
    const handleVotePoll = async (optionIndex: number) => {
        if (!activePoll || !roomId || !isParticipant) return;
        try {
            await voteRoomPoll.mutateAsync({
                roomId,
                pollId: activePoll.id,
                optionIndex,
            });
        } catch (err: any) {
            toast.error(err?.message || 'Failed to record your vote');
        }
    };

    const handleReaction = (emoji: string) => {
        if (!roomId || !isParticipant) return;
        sendMessage.mutate(
            {
                roomId,
                message: emoji,
                messageType: 'reaction',
            },
            {
                onError: (err: any) => toast.error(err?.message || 'Failed to send reaction'),
            }
        );
    };

    // Broadcast status chip — reflects host tunnel state / viewer sync mode.
    // Null-safe: the controller runs before WatchRoomLayout's room-exists guard.
    const broadcastChip = (() => {
        if (!room) return { label: 'Synced', live: false };
        if (isHost) {
            if (isCustomRoom || room.manual_stream_url) return { label: 'Hosting · Custom', live: !!room.is_playing };
            if (!isDesktopApp) return { label: 'Manual Mode', live: false };
            if (room.share_active) return { label: 'Broadcasting', live: true };
            return { label: 'Starting Broadcast', live: false };
        }
        if (isViewerOnShare) return { label: 'Watching Host', live: !!room.is_playing };
        return { label: 'Synced', live: false };
    })();
    // CustomVideoSourceModal → pick an anime/episode. In 'queue' mode it appends
    // to the watch queue; otherwise it swaps the room's current title (resetting
    // resolution + dropping any local/host share so the new source republishes).
    const handleCloseAnimeSearch = useCallback(() => {
        setShowAnimeSearch(false);
        setAnimeSearchMode('change-room');
    }, []);

    const handleAnimeSearchSelect = useCallback(async (anime: any, ep: any) => {
        if (!roomId) return;

        if (animeSearchMode === 'queue') {
            if (!isHost) return;

            try {
                await addQueueItem.mutateAsync({
                    roomId,
                    animeId: anime.id,
                    animeTitle: anime.name,
                    animePoster: anime.poster,
                    episodeId: ep?.episodeId,
                    episodeNumber: ep?.number,
                    episodeTitle: ep?.title,
                });
                toast.success(`Queued ${anime.name}${ep?.number ? ` • Episode ${ep.number}` : ''}`);
                setShowAnimeSearch(false);
                setAnimeSearchMode('change-room');
            } catch (err: any) {
                toast.error(`Couldn't add to queue: ${err?.message || err}`);
            }
            return;
        }

        try {
            // Reset resolution state so the new title resolves cleanly:
            // drop to the default server and force the host to re-publish
            // a fresh tunnel source (the dedupe token keys off the URL,
            // but the old share URL points at the previous anime).
            setSelectedServer('hd-1');
            setTriedServers(new Set(['hd-1']));
            publishTokenRef.current = '';
            setLocalShare(null); // switching to an anime — drop any local file broadcast

            await updateRoom.mutateAsync({
                roomId,
                updates: {
                    anime_id: anime.id,
                    anime_title: anime.name,
                    anime_poster: anime.poster,
                    episode_id: ep?.episodeId || null,
                    episode_number: ep?.number || null,
                    episode_title: ep?.title || null,
                    // Stop participants playing the previous stream until
                    // the host resolves + republishes the new one.
                    share_active: false,
                } as any
            });
            toast.success(`Now playing ${anime.name}${ep?.number ? ` • Episode ${ep.number}` : ''}`);
            setShowAnimeSearch(false);
            setAnimeSearchMode('change-room');
        } catch (err: any) {
            toast.error(`Couldn't change the anime: ${err?.message || err}`);
        }
    }, [roomId, animeSearchMode, isHost, addQueueItem, updateRoom]);
    return {
        // Core identity / navigation
        roomId, navigate, user,
        room, loadingRoom,
        prefersReducedMotion,

        // Role / connection flags
        isHost, isParticipant, isParticipantReady, isModerator, isAdmin,
        isDesktopApp, isCustomRoom, isViewerOnShare, isReconnecting,

        // Source resolution
        streamingData, serversData, loadingSources,
        selectedServer, setSelectedServer,
        selectedCategory, setSelectedCategory,
        currentEpisodeId, sourceDiagnostics, refetchSources,
        triedServers, setTriedServers,

        // Collections
        participants, messages, queueItems, activePoll, episodesData,

        // Player + status
        playerRef, lastUpdateRef, messagesEndRef, drift, broadcastChip,

        // UI state + setters
        message, setMessage,
        password, setPassword,
        showPasswordDialog, setShowPasswordDialog,
        copied, setCopied,
        showSettings, setShowSettings,
        showAnimeSearch, setShowAnimeSearch,
        animeSearchMode, setAnimeSearchMode,
        countdown,
        isEditingCustomTimer, setIsEditingCustomTimer,
        customTimerMinutes, setCustomTimerMinutes,
        hostTransferTarget,
        pollQuestion, setPollQuestion,
        showPollDialog, setShowPollDialog,
        pollChoices, setPollChoices,
        pollDuration, setPollDuration,
        sideTab, setSideTab,
        showDrawer, setShowDrawer,

        // Local-file share
        localShare, library, loadingLibrary, publishingLocal,
        selectedLibrarySeries, setSelectedLibrarySeries,
        showLibraryPicker, setShowLibraryPicker,

        // Handlers
        handleSendMessage, handleReaction, handleJoin, handlePasswordJoin,
        handleLeave, handleClose, handleAdminDelete, handleCopyLink,
        handleTransferHost, handleExportChat, handleStartTimer, handleForceStart,
        handleToggleReady, handleCreatePollFromDialog, handleVotePoll,
        handleQueueCurrentEpisode, handleQueueAnimeFromSearch, handlePlayQueueItem,
        handleMoveQueueItem, handlePickLocalFile, openLibraryPicker, publishLocalFile,
        clearLocalShare, handlePlayerError, handleAnimeSearchSelect, handleCloseAnimeSearch,

        // Mutations referenced directly in JSX (pending/inline states)
        updateRoom, updatePlayback, removeQueueItem, closeRoomPoll,
        createRoomPoll, voteRoomPoll, adminDeleteRoom, addQueueItem,
    };
}
