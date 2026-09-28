import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Explicit, non-secret column list for `watch_rooms` reads. The
// 20260924000001 migration revokes table-level SELECT and grants column-level
// SELECT on every column EXCEPT `password_hash`. PostgREST expands `select('*')`
// to all columns (including password_hash), which the role can't read -> 403.
// Selecting these columns explicitly keeps the hash server-side and works.
export const WATCH_ROOM_COLUMNS =
    'id,name,host_id,anime_id,anime_title,anime_poster,episode_id,episode_number,episode_title,category,access_type,current_time_seconds,is_playing,is_active,max_participants,created_at,updated_at,expires_at,scheduled_start_at,manual_subtitle_url,manual_stream_url,manual_stream_type,selected_server,share_stream_url,share_stream_type,share_subtitle_url,share_active,share_host_platform';

export interface WatchRoom {
    id: string;
    name: string;
    host_id: string;
    anime_id: string | null;
    anime_title: string | null;
    anime_poster: string | null;
    episode_id: string | null;
    episode_number: number | null;
    episode_title: string | null;
    category: 'sub' | 'dub';
    access_type: 'public' | 'invite' | 'password';
    current_time_seconds: number;
    is_playing: boolean;
    is_active: boolean;
    max_participants: number;
    manual_subtitle_url: string | null;
    manual_stream_url: string | null;
    created_at: string;
    updated_at: string;
    expires_at: string;
    scheduled_start_at: string | null;
    participant_count?: number;
    host_profile?: {
        username: string;
        display_name: string;
        avatar_url: string | null;
    };
}

export interface RoomParticipant {
    id: string;
    room_id: string;
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    is_host: boolean;
    is_ready: boolean;
    joined_at: string;
    last_seen_at: string;
}

export interface RoomMessage {
    id: string;
    room_id: string;
    user_id: string | null;
    display_name: string;
    avatar_url: string | null;
    message: string;
    message_type: 'chat' | 'system' | 'reaction';
    created_at: string;
}

export interface WatchRoomQueueItem {
    id: string;
    room_id: string;
    anime_id: string;
    anime_title: string;
    anime_poster: string | null;
    episode_id: string | null;
    episode_number: number | null;
    episode_title: string | null;
    added_by: string | null;
    position: number;
    created_at: string;
    added_by_profile?: {
        user_id: string;
        username: string | null;
        display_name: string | null;
    } | null;
}

export interface WatchRoomPoll {
    id: string;
    room_id: string;
    question: string;
    options: string[];
    created_by: string;
    is_active: boolean;
    ends_at: string | null;
    created_at: string;
    votes_count: number;
    user_vote: number | null;
    results: Array<{
        option: string;
        votes: number;
        percent: number;
    }>;
}

export interface CreateRoomInput {
    name: string;
    access_type: 'public' | 'invite' | 'password';
    password?: string;
    anime_id?: string;
    anime_title?: string;
    anime_poster?: string;
    episode_id?: string;
    episode_number?: number;
    episode_title?: string;
    category?: 'sub' | 'dub';
    max_participants?: number;
    scheduled_start_at?: string | null;
    manual_subtitle_url?: string;
    manual_stream_url?: string;
}

// Fetch public active rooms with infinite loading
export function useInfinitePublicWatchRooms() {
    return useInfiniteQuery({
        queryKey: ['watch-rooms-public-infinite'],
        queryFn: async ({ pageParam = 0 }) => {
            const pageSize = 12;
            // Opportunistic reap of idle (>5 min) rooms, first page only, so the
            // public list hides dead rooms without a scheduler. No-op pre-migration.
            if (pageParam === 0) {
                try { await (supabase as any).rpc('close_inactive_watch_rooms'); } catch { /* unapplied */ }
            }
            const { data: rooms, error } = await supabase
                .from('watch_rooms')
                .select(WATCH_ROOM_COLUMNS)
                .eq('is_active', true)
                .in('access_type', ['public', 'password'])
                .order('created_at', { ascending: false })
                .range(pageParam * pageSize, (pageParam + 1) * pageSize - 1);

            if (error) throw error;
            if (!rooms || rooms.length === 0) return [];

            // Get participant counts
            const roomIds = rooms.map(r => r.id);
            const { data: participants } = await supabase
                .from('watch_room_participants')
                .select('room_id')
                .in('room_id', roomIds);

            // Get host profiles
            const hostIds = [...new Set(rooms.map(r => r.host_id))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('user_id, username, display_name, avatar_url')
                .in('user_id', hostIds);

            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
            const countMap = new Map<string, number>();
            participants?.forEach(p => {
                countMap.set(p.room_id, (countMap.get(p.room_id) || 0) + 1);
            });

            return rooms.map(room => ({
                ...room,
                participant_count: countMap.get(room.id) || 0,
                host_profile: profileMap.get(room.host_id),
            })) as WatchRoom[];
        },
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.length === 12 ? allPages.length : undefined;
        },
        initialPageParam: 0,
    });
}

// Fetch public active rooms (legacy/simple version)
export function usePublicWatchRooms() {
    return useQuery({
        queryKey: ['watch-rooms-public'],
        queryFn: async () => {
            // Opportunistic reap of idle (>5 min) rooms; no-op pre-migration.
            try { await (supabase as any).rpc('close_inactive_watch_rooms'); } catch { /* unapplied */ }
            const { data: rooms, error } = await supabase
                .from('watch_rooms')
                .select(WATCH_ROOM_COLUMNS)
                .eq('is_active', true)
                .in('access_type', ['public', 'password'])
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            if (!rooms || rooms.length === 0) return [];

            // Get participant counts
            const roomIds = rooms.map(r => r.id);
            const { data: participants } = await supabase
                .from('watch_room_participants')
                .select('room_id')
                .in('room_id', roomIds);

            // Get host profiles
            const hostIds = [...new Set(rooms.map(r => r.host_id))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('user_id, username, display_name, avatar_url')
                .in('user_id', hostIds);

            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
            const countMap = new Map<string, number>();
            participants?.forEach(p => {
                countMap.set(p.room_id, (countMap.get(p.room_id) || 0) + 1);
            });

            return rooms.map(room => ({
                ...room,
                participant_count: countMap.get(room.id) || 0,
                host_profile: profileMap.get(room.host_id),
            })) as WatchRoom[];
        },
        refetchInterval: 30000,
    });
}
// Fetch user's own rooms (including private and invite-only)
export function useUserWatchRooms() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['watch-rooms-user', user?.id],
        queryFn: async () => {
            if (!user) return [];

            const { data: rooms, error } = await supabase
                .from('watch_rooms')
                .select(WATCH_ROOM_COLUMNS)
                .eq('host_id', user.id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            if (!rooms || rooms.length === 0) return [];

            // Get participant counts
            const roomIds = rooms.map(r => r.id);
            const { data: participants } = await supabase
                .from('watch_room_participants')
                .select('room_id')
                .in('room_id', roomIds);

            const countMap = new Map<string, number>();
            participants?.forEach(p => {
                countMap.set(p.room_id, (countMap.get(p.room_id) || 0) + 1);
            });

            return rooms.map(room => ({
                ...room,
                participant_count: countMap.get(room.id) || 0,
            })) as WatchRoom[];
        },
        enabled: !!user,
        refetchInterval: 30000,
    });
}

// Fetch a single room by ID
export function useWatchRoom(roomId: string | undefined) {
    return useQuery({
        queryKey: ['watch-room', roomId],
        queryFn: async () => {
            if (!roomId) return null;

            const { data: room, error } = await supabase
                .from('watch_rooms')
                .select(WATCH_ROOM_COLUMNS)
                .eq('id', roomId)
                .single();

            if (error) throw error;
            return room as WatchRoom;
        },
        enabled: !!roomId,
    });
}

// Fetch room participants
export function useRoomParticipants(roomId: string | undefined) {
    return useQuery({
        queryKey: ['watch-room-participants', roomId],
        queryFn: async () => {
            if (!roomId) return [];

            const { data, error } = await supabase
                .from('watch_room_participants')
                .select('*')
                .eq('room_id', roomId)
                .order('joined_at', { ascending: true });

            if (error) throw error;
            return data as RoomParticipant[];
        },
        enabled: !!roomId,
        refetchInterval: 10000,
    });
}

// Fetch room messages
export function useRoomMessages(roomId: string | undefined) {
    return useQuery({
        queryKey: ['watch-room-messages', roomId],
        queryFn: async () => {
            if (!roomId) return [];

            const { data, error } = await supabase
                .from('watch_room_messages')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true })
                .limit(100);

            if (error) throw error;
            return data as RoomMessage[];
        },
        enabled: !!roomId,
        // Realtime postgres_changes is best-effort and RLS-gated, so a viewer can
        // miss inserts they never get a change event for (chat appears "stuck").
        // Poll as a safety net so every client converges within a few seconds.
        refetchInterval: 3000,
        refetchOnWindowFocus: true,
    });
}

// Fetch room queue (host queue feature)
export function useRoomQueue(roomId: string | undefined) {
    return useQuery({
        queryKey: ['watch-room-queue', roomId],
        queryFn: async () => {
            if (!roomId) return [];

            const db = supabase as any;
            const { data, error } = await db
                .from('watch_room_queue')
                .select('*')
                .eq('room_id', roomId)
                .order('position', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) throw error;
            if (!data || data.length === 0) return [] as WatchRoomQueueItem[];

            const addedByIds = [...new Set(data.map((item: any) => item.added_by).filter(Boolean))] as string[];
            const profileMap = new Map<string, any>();

            if (addedByIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('user_id, username, display_name')
                    .in('user_id', addedByIds);

                (profiles || []).forEach((profile: any) => {
                    profileMap.set(profile.user_id, profile);
                });
            }

            return data.map((item: any) => ({
                ...item,
                added_by_profile: item.added_by ? (profileMap.get(item.added_by) || null) : null,
            })) as WatchRoomQueueItem[];
        },
        enabled: !!roomId,
    });
}

// Add item to host queue
export function useAddQueueItem() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({
            roomId,
            animeId,
            animeTitle,
            animePoster,
            episodeId,
            episodeNumber,
            episodeTitle,
        }: {
            roomId: string;
            animeId: string;
            animeTitle: string;
            animePoster?: string | null;
            episodeId?: string | null;
            episodeNumber?: number | null;
            episodeTitle?: string | null;
        }) => {
            if (!user) throw new Error('Must be logged in');

            const db = supabase as any;
            const { data: lastItem } = await db
                .from('watch_room_queue')
                .select('position')
                .eq('room_id', roomId)
                .order('position', { ascending: false })
                .limit(1)
                .maybeSingle();

            const nextPosition = typeof lastItem?.position === 'number' ? lastItem.position + 1 : 0;

            const { error } = await db
                .from('watch_room_queue')
                .insert({
                    room_id: roomId,
                    anime_id: animeId,
                    anime_title: animeTitle,
                    anime_poster: animePoster || null,
                    episode_id: episodeId || null,
                    episode_number: episodeNumber ?? null,
                    episode_title: episodeTitle || null,
                    added_by: user.id,
                    position: nextPosition,
                });

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-queue', roomId] });
        },
    });
}

// Remove queue item
export function useRemoveQueueItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ roomId, queueItemId }: { roomId: string; queueItemId: string }) => {
            const db = supabase as any;
            const { error } = await db
                .from('watch_room_queue')
                .delete()
                .eq('id', queueItemId)
                .eq('room_id', roomId);

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-queue', roomId] });
        },
    });
}

// Reorder queue items
export function useReorderQueueItems() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ roomId, queueItemIds }: { roomId: string; queueItemIds: string[] }) => {
            const db = supabase as any;
            const updates = queueItemIds.map((queueItemId, index) =>
                db
                    .from('watch_room_queue')
                    .update({ position: index })
                    .eq('id', queueItemId)
                    .eq('room_id', roomId)
            );

            await Promise.all(updates);
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-queue', roomId] });
        },
    });
}

// Fetch currently active poll and computed vote breakdown
export function useActiveRoomPoll(roomId: string | undefined) {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['watch-room-active-poll', roomId, user?.id],
        queryFn: async () => {
            if (!roomId) return null;

            const db = supabase as any;
            const { data: poll, error: pollError } = await db
                .from('watch_room_polls')
                .select('*')
                .eq('room_id', roomId)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (pollError) throw pollError;
            if (!poll) return null;

            if (poll.ends_at && new Date(poll.ends_at).getTime() <= Date.now()) {
                await db.from('watch_room_polls').update({ is_active: false }).eq('id', poll.id);
                return null;
            }

            const options = Array.isArray(poll.options) ? poll.options : [];
            const { data: votes, error: votesError } = await db
                .from('watch_room_poll_votes')
                .select('user_id, option_index')
                .eq('poll_id', poll.id);

            if (votesError) throw votesError;

            const counts = new Array(options.length).fill(0);
            let userVote: number | null = null;

            (votes || []).forEach((vote: any) => {
                if (typeof vote.option_index === 'number' && vote.option_index >= 0 && vote.option_index < counts.length) {
                    counts[vote.option_index] += 1;
                }

                if (user?.id && vote.user_id === user.id && typeof vote.option_index === 'number') {
                    userVote = vote.option_index;
                }
            });

            const totalVotes = counts.reduce((sum, count) => sum + count, 0);
            const results = options.map((option: string, index: number) => ({
                option,
                votes: counts[index] || 0,
                percent: totalVotes > 0 ? Math.round(((counts[index] || 0) / totalVotes) * 100) : 0,
            }));

            return {
                ...poll,
                options,
                votes_count: totalVotes,
                user_vote: userVote,
                results,
            } as WatchRoomPoll;
        },
        enabled: !!roomId,
    });
}

// Host: create a poll in room
export function useCreateRoomPoll() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({
            roomId,
            question,
            options,
            endsAt,
        }: {
            roomId: string;
            question: string;
            options: string[];
            endsAt?: string | null;
        }) => {
            if (!user) throw new Error('Must be logged in');

            const db = supabase as any;

            // Ensure only one active poll at a time.
            await db
                .from('watch_room_polls')
                .update({ is_active: false })
                .eq('room_id', roomId)
                .eq('is_active', true);

            const { error } = await db
                .from('watch_room_polls')
                .insert({
                    room_id: roomId,
                    question,
                    options,
                    created_by: user.id,
                    is_active: true,
                    ends_at: endsAt || null,
                });

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-active-poll', roomId] });
        },
    });
}

// Participant: vote on active poll
export function useVoteRoomPoll() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({
            roomId,
            pollId,
            optionIndex,
        }: {
            roomId: string;
            pollId: string;
            optionIndex: number;
        }) => {
            if (!user) throw new Error('Must be logged in');

            const db = supabase as any;
            const { error } = await db
                .from('watch_room_poll_votes')
                .upsert({
                    room_id: roomId,
                    poll_id: pollId,
                    user_id: user.id,
                    option_index: optionIndex,
                    created_at: new Date().toISOString(),
                }, { onConflict: 'poll_id,user_id' });

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-active-poll', roomId] });
        },
    });
}

// Host: close poll
export function useCloseRoomPoll() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ roomId, pollId }: { roomId: string; pollId: string }) => {
            const db = supabase as any;
            const { error } = await db
                .from('watch_room_polls')
                .update({ is_active: false })
                .eq('id', pollId)
                .eq('room_id', roomId);

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-active-poll', roomId] });
        },
    });
}

// Create a new room
export function useCreateRoom() {
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

    return useMutation({
        mutationFn: async (input: CreateRoomInput) => {
            if (!user) throw new Error('Must be logged in');

            // Room creation goes through a SECURITY DEFINER RPC that hashes the
            // password server-side; password_hash is never sent from the client.
            const { data: room, error } = await supabase
                .rpc('create_watch_room', {
                    p_name: input.name,
                    p_access_type: input.access_type,
                    p_password: input.password || null,
                    p_anime_id: input.anime_id || null,
                    p_anime_title: input.anime_title || null,
                    p_anime_poster: input.anime_poster || null,
                    p_episode_id: input.episode_id || null,
                    p_episode_number: input.episode_number ?? null,
                    p_episode_title: input.episode_title || null,
                    p_category: input.category || 'sub',
                    p_max_participants: input.max_participants || 10,
                    p_scheduled_start_at: input.scheduled_start_at || null,
                    p_manual_subtitle_url: input.manual_subtitle_url || null,
                    p_manual_stream_url: input.manual_stream_url || null,
                })
                .select()
                .single();

            if (error) throw error;

            // create_watch_room() already inserts the host into
            // watch_room_participants (ON CONFLICT DO NOTHING). Refresh the
            // placeholder name/avatar with the real profile via the host
            // self-join RPC — a direct client insert here would hit the
            // cross-table "Host can self-join their room" RLS check and fail.
            await supabase.rpc('host_self_join_watch_room', {
                p_room_id: room.id,
                p_display_name: profile?.display_name || profile?.username || 'Host',
                p_avatar_url: profile?.avatar_url || null,
            });

            return room as WatchRoom;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public'] });
        },
    });
}

// Join a room
export function useJoinRoom() {
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

    return useMutation({
        mutationFn: async ({ roomId, password }: { roomId: string; password?: string }) => {
            if (!user) throw new Error('Must be logged in');

            // Joining goes through a SECURITY DEFINER RPC that verifies the
            // password, enforces capacity, and inserts the participant. The
            // password check cannot be bypassed by inserting a participant row
            // directly (RLS only permits a host to self-join).
            const { data: room, error } = await supabase
                .rpc('join_watch_room', {
                    p_room_id: roomId,
                    p_password: password || null,
                    p_display_name: profile?.display_name || profile?.username || 'Guest',
                    p_avatar_url: profile?.avatar_url || null,
                })
                .select()
                .single();

            if (error) throw error;

            return room as WatchRoom;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-participants', roomId] });
        },
    });
}

// Host self-join. create_watch_room() adds the host to watch_room_participants
// on creation, but a host re-entering a room they left (or an older room) is not
// a participant — which hides the chat input and, via the participant-gated
// message SELECT policy, makes messages appear not to load. This goes through
// the host_self_join_watch_room() SECURITY DEFINER RPC rather than a direct
// insert: the "Host can self-join their room" RLS policy gates the insert on a
// cross-table EXISTS over watch_rooms (subject to watch_rooms' own RLS + column
// grants), which fails when the host cannot see their own room row. The RPC
// verifies host ownership server-side and bypasses that check, working for
// every access type without a password. Idempotent (ON CONFLICT in the RPC).
export function useHostSelfJoin() {
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

    return useMutation({
        mutationFn: async (roomId: string) => {
            if (!user) throw new Error('Must be logged in');

            const { error } = await supabase.rpc('host_self_join_watch_room', {
                p_room_id: roomId,
                p_display_name: profile?.display_name || profile?.username || 'Host',
                p_avatar_url: profile?.avatar_url || null,
            });

            if (!error) return;

            // The RPC may be absent (its migration is unapplied on this DB). Fall
            // back to a direct upsert — the "Host can self-join their room" INSERT
            // policy permits it for the room owner. create_watch_room() usually
            // already seats the host, so this only matters for legacy rooms.
            const { error: upsertError } = await supabase
                .from('watch_room_participants')
                .upsert(
                    {
                        room_id: roomId,
                        user_id: user.id,
                        display_name: profile?.display_name || profile?.username || 'Host',
                        avatar_url: profile?.avatar_url || null,
                        is_host: true,
                        last_seen_at: new Date().toISOString(),
                    },
                    { onConflict: 'room_id,user_id' }
                );

            if (upsertError) throw upsertError;
        },
        onSuccess: (_, roomId) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-participants', roomId] });
        },
    });
}

// Leave a room
export function useLeaveRoom() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async (roomId: string) => {
            if (!user) throw new Error('Must be logged in');

            const { error } = await supabase
                .from('watch_room_participants')
                .delete()
                .eq('room_id', roomId)
                .eq('user_id', user.id);

            if (error) throw error;
        },
        onSuccess: (_, roomId) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-participants', roomId] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public'] });
        },
    });
}

// Send a message
export function useSendMessage() {
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

    return useMutation({
        mutationFn: async ({ roomId, message, messageType = 'chat' }: { roomId: string; message: string; messageType?: 'chat' | 'system' | 'reaction' }) => {
            if (!user) throw new Error('Must be logged in');

            const { error } = await supabase.from('watch_room_messages').insert({
                room_id: roomId,
                user_id: user.id,
                display_name: profile?.display_name || profile?.username || 'Anonymous',
                avatar_url: profile?.avatar_url,
                message,
                message_type: messageType,
            });

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-messages', roomId] });
        },
    });
}

// Update room playback state (host only)
export function useUpdatePlayback() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ roomId, isPlaying, currentTime }: { roomId: string; isPlaying?: boolean; currentTime?: number }) => {
            const updates: Record<string, any> = {};
            if (isPlaying !== undefined) updates.is_playing = isPlaying;
            if (currentTime !== undefined) updates.current_time_seconds = currentTime;

            const { error } = await supabase
                .from('watch_rooms')
                .update(updates)
                .eq('id', roomId);

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room', roomId] });
        },
    });
}

// Close a room (host only)
export function useCloseRoom() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (roomId: string) => {
            const { error } = await supabase
                .from('watch_rooms')
                .update({ is_active: false })
                .eq('id', roomId);

            if (error) throw error;
        },
        onSuccess: (_, roomId) => {
            // Every surface that lists rooms filters on is_active, so all of them
            // must drop the just-closed room — not only the legacy public list.
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public'] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public-infinite'] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-user'] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-admin-all'] });
            queryClient.invalidateQueries({ queryKey: ['watch-room', roomId] });
            queryClient.invalidateQueries({ queryKey: ['feed'] });
        },
    });
}

// Update room details (host only)
export function useUpdateRoom() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ roomId, updates }: { roomId: string; updates: Partial<WatchRoom> }) => {
            const { error } = await supabase
                .from('watch_rooms')
                .update(updates)
                .eq('id', roomId);

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room', roomId] });
        },
    });
}

// Update participant ready status
export function useUpdateParticipantReady() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ roomId, isReady }: { roomId: string; isReady: boolean }) => {
            if (!user) throw new Error('Must be logged in');

            const { error } = await supabase
                .from('watch_room_participants')
                .update({ is_ready: isReady })
                .eq('room_id', roomId)
                .eq('user_id', user.id);

            if (error) throw error;
        },
        onSuccess: (_, { roomId }) => {
            queryClient.invalidateQueries({ queryKey: ['watch-room-participants', roomId] });
        },
    });
}

// Admin: Fetch all watch rooms (including inactive)
export function useAllWatchRooms() {
    const { user, isAdmin } = useAuth();

    return useQuery({
        queryKey: ['watch-rooms-admin-all'],
        queryFn: async () => {
            // Opportunistic reap: close rooms idle > 5 min so the admin list
            // (30s poll) stays fresh without a scheduler. No-op pre-migration.
            try { await (supabase as any).rpc('close_inactive_watch_rooms'); } catch { /* unapplied */ }
            const { data: rooms, error } = await supabase
                .from('watch_rooms')
                .select(WATCH_ROOM_COLUMNS)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            if (!rooms || rooms.length === 0) return [];

            // Get host profiles
            const hostIds = [...new Set(rooms.map(r => r.host_id))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('user_id, username, display_name, avatar_url')
                .in('user_id', hostIds);

            // Get participant counts
            const roomIds = rooms.map(r => r.id);
            const { data: participants } = await supabase
                .from('watch_room_participants')
                .select('room_id')
                .in('room_id', roomIds);

            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
            const countMap = new Map<string, number>();
            participants?.forEach(p => {
                countMap.set(p.room_id, (countMap.get(p.room_id) || 0) + 1);
            });

            return rooms.map(room => ({
                ...room,
                participant_count: countMap.get(room.id) || 0,
                host_profile: profileMap.get(room.host_id),
            })) as WatchRoom[];
        },
        enabled: !!user && isAdmin,
        refetchInterval: 30000,
    });
}

// Admin: Delete any watch room
export function useAdminDeleteRoom() {
    const queryClient = useQueryClient();
    const { user, isAdmin } = useAuth();

    return useMutation({
        mutationFn: async (roomId: string) => {
            if (!user || !isAdmin) throw new Error('Admin access required');

            // Client-side deletes are blocked by the host-only RLS DELETE policy,
            // so a non-host admin's delete silently affected 0 rows. Route through
            // the SECURITY DEFINER RPC, which verifies admin server-side, cascades
            // the child tables, and writes the admin_logs entry itself.
            const { error } = await supabase.rpc('admin_delete_watch_room', {
                p_room_id: roomId,
            });

            if (error) throw error;

            return roomId;
        },
        onSuccess: (roomId) => {
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-admin-all'] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public'] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public-infinite'] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-user'] });
            queryClient.invalidateQueries({ queryKey: ['watch-room', roomId] });
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
        },
        onError: (error: Error) => {
            console.error('Failed to delete watch room:', error);
        },
    });
}
