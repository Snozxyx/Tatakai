import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PlaylistComment {
	id: string;
	playlist_id: string;
	user_id: string;
	content: string;
	parent_id: string | null;
	likes_count: number;
	created_at: string;
	updated_at: string;
	profile?: {
		user_id: string;
		display_name: string | null;
		username: string | null;
		avatar_url: string | null;
	} | null;
}

export function usePlaylistComments(playlistId: string | undefined) {
	return useQuery({
		queryKey: ['playlist_comments', playlistId],
		queryFn: async () => {
			if (!playlistId) return [] as PlaylistComment[];

			const db = supabase as any;
			const { data: comments, error } = await db
				.from('playlist_comments')
				.select('*')
				.eq('playlist_id', playlistId)
				.order('created_at', { ascending: true });

			if (error) throw error;
			if (!comments || comments.length === 0) return [] as PlaylistComment[];

			const userIds = [...new Set(comments.map((comment: any) => comment.user_id).filter(Boolean))] as string[];
			const profileMap = new Map<string, any>();

			if (userIds.length > 0) {
				const { data: profiles } = await supabase
					.from('profiles')
					.select('user_id, display_name, username, avatar_url')
					.in('user_id', userIds);

				(profiles || []).forEach((profile: any) => {
					profileMap.set(profile.user_id, profile);
				});
			}

			return comments.map((comment: any) => ({
				...comment,
				profile: profileMap.get(comment.user_id) || null,
			})) as PlaylistComment[];
		},
		enabled: !!playlistId,
	});
}

export function useAddPlaylistComment() {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	return useMutation({
		mutationFn: async ({
			playlistId,
			content,
			parentId,
		}: {
			playlistId: string;
			content: string;
			parentId?: string | null;
		}) => {
			if (!user) throw new Error('Must be logged in');

			const db = supabase as any;
			const { error } = await db
				.from('playlist_comments')
				.insert({
					playlist_id: playlistId,
					user_id: user.id,
					content,
					parent_id: parentId || null,
				});

			if (error) throw error;
		},
		onSuccess: (_, { playlistId }) => {
			queryClient.invalidateQueries({ queryKey: ['playlist_comments', playlistId] });
			toast.success('Comment posted');
		},
		onError: (error: any) => {
			toast.error(error?.message || 'Failed to post comment');
		},
	});
}

export function useUpdatePlaylistComment() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			playlistId,
			commentId,
			content,
		}: {
			playlistId: string;
			commentId: string;
			content: string;
		}) => {
			const db = supabase as any;
			const { error } = await db
				.from('playlist_comments')
				.update({
					content,
					updated_at: new Date().toISOString(),
				})
				.eq('id', commentId)
				.eq('playlist_id', playlistId);

			if (error) throw error;
		},
		onSuccess: (_, { playlistId }) => {
			queryClient.invalidateQueries({ queryKey: ['playlist_comments', playlistId] });
			toast.success('Comment updated');
		},
		onError: (error: any) => {
			toast.error(error?.message || 'Failed to update comment');
		},
	});
}

export function useDeletePlaylistComment() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			playlistId,
			commentId,
		}: {
			playlistId: string;
			commentId: string;
		}) => {
			const db = supabase as any;
			const { error } = await db
				.from('playlist_comments')
				.delete()
				.eq('id', commentId)
				.eq('playlist_id', playlistId);

			if (error) throw error;
		},
		onSuccess: (_, { playlistId }) => {
			queryClient.invalidateQueries({ queryKey: ['playlist_comments', playlistId] });
			toast.success('Comment deleted');
		},
		onError: (error: any) => {
			toast.error(error?.message || 'Failed to delete comment');
		},
	});
}
