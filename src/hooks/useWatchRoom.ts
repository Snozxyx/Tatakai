import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
