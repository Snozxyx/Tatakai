import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
            const { data: rooms, error } = await supabase
                .from('watch_rooms')
                .select('*')
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
            const { data: rooms, error } = await supabase
                .from('watch_rooms')
                .select('*')
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
                .select('*')
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
                .select('*')
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

            const { data: room, error } = await supabase
                .from('watch_rooms')
                .insert({
                    name: input.name,
                    host_id: user.id,
                    access_type: input.access_type,
                    password_hash: input.password || null, // In production, hash this
                    anime_id: input.anime_id || null,
                    anime_title: input.anime_title || null,
                    anime_poster: input.anime_poster || null,
                    episode_id: input.episode_id || null,
                    episode_number: input.episode_number || null,
                    episode_title: input.episode_title || null,
                    category: input.category || 'sub',
                    max_participants: input.max_participants || 10,
                    scheduled_start_at: input.scheduled_start_at || null,
                    is_playing: !input.scheduled_start_at,
                })
                .select()
                .single();

            if (error) throw error;

            // Auto-join as host
            await supabase.from('watch_room_participants').insert({
                room_id: room.id,
                user_id: user.id,
                display_name: profile?.display_name || profile?.username || 'Host',
                avatar_url: profile?.avatar_url,
                is_host: true,
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

            // Check if room exists and validate password if needed
            const { data: room, error: roomError } = await supabase
                .from('watch_rooms')
                .select('*')
                .eq('id', roomId)
                .single();

            if (roomError || !room) throw new Error('Room not found');
            if (!room.is_active) throw new Error('Room is no longer active');

            if (room.access_type === 'password' && room.password_hash) {
                if (!password || password !== room.password_hash) {
                    throw new Error('Invalid password');
                }
            }

            // Check participant count
            const { count } = await supabase
                .from('watch_room_participants')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', roomId);

            if (count && count >= room.max_participants) {
                throw new Error('Room is full');
            }

            // Join room
            const { error } = await supabase.from('watch_room_participants').upsert({
                room_id: roomId,
                user_id: user.id,
                display_name: profile?.display_name || profile?.username || 'Guest',
                avatar_url: profile?.avatar_url,
                is_host: false,
                last_seen_at: new Date().toISOString(),
            }, { onConflict: 'room_id,user_id' });

            if (error) throw error;

            return room as WatchRoom;
        },
        onSuccess: (_, { roomId }) => {
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public'] });
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
            const { data: rooms, error } = await supabase
                .from('watch_rooms')
                .select('*')
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

            // Delete all messages first
            await supabase
                .from('watch_room_messages')
                .delete()
                .eq('room_id', roomId);

            // Delete all participants
            await supabase
                .from('watch_room_participants')
                .delete()
                .eq('room_id', roomId);

            // Delete the room
            const { error } = await supabase
                .from('watch_rooms')
                .delete()
                .eq('id', roomId);

            if (error) throw error;

            // Log admin action
            await supabase.from('admin_logs').insert({
                user_id: user.id,
                action: 'delete_watch_room',
                entity_type: 'watch_room',
                entity_id: roomId,
            });

            return roomId;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-admin-all'] });
            queryClient.invalidateQueries({ queryKey: ['watch-rooms-public'] });
            queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
        },
        onError: (error: Error) => {
            console.error('Failed to delete watch room:', error);
        },
    });
}
