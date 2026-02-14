import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Layout, Star, List, Clock, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

interface UserActivityLogsProps {
    userId: string;
}

export function UserActivityLogs({ userId }: UserActivityLogsProps) {
    // Fetch Comments
    const { data: comments, isLoading: loadingComments } = useQuery({
        queryKey: ['user_activity_comments', userId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return data;
        }
    });

    // Fetch Forum Posts
    const { data: posts, isLoading: loadingPosts } = useQuery({
        queryKey: ['user_activity_posts', userId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('forum_posts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return data;
        }
    });

    // Fetch Tier Lists
    const { data: tierLists, isLoading: loadingTierLists } = useQuery({
        queryKey: ['user_activity_tierlists', userId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tier_lists')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return data;
        }
    });

    // Fetch Playlists
    const { data: playlists, isLoading: loadingPlaylists } = useQuery({
        queryKey: ['user_activity_playlists', userId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('playlists')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return data;
        }
    });

    const formatDate = (date: string) => {
        try {
            return formatDistanceToNow(new Date(date), { addSuffix: true });
        } catch (e) {
            return 'recently';
        }
    };

    return (
        <Tabs defaultValue="comments" className="w-full">
            <TabsList className="grid grid-cols-4 bg-muted/30 mb-4">
                <TabsTrigger value="comments" className="gap-2">
                    <MessageSquare className="w-4 h-4" />
                    <span className="hidden sm:inline">Comments</span>
                </TabsTrigger>
                <TabsTrigger value="posts" className="gap-2">
                    <Layout className="w-4 h-4" />
                    <span className="hidden sm:inline">Posts</span>
                </TabsTrigger>
                <TabsTrigger value="tierlists" className="gap-2">
                    <Star className="w-4 h-4" />
                    <span className="hidden sm:inline">Tier Lists</span>
                </TabsTrigger>
                <TabsTrigger value="playlists" className="gap-2">
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline">Playlists</span>
                </TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="mt-0">
                <div className="space-y-3">
                    {loadingComments ? (
                        <div className="py-8 text-center text-muted-foreground">Loading comments...</div>
                    ) : comments?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">No recent comments</div>
                    ) : (
                        comments?.map((comment: any) => (
                            <GlassPanel key={comment.id} className="p-3 bg-muted/20 border-white/5">
                                <p className="text-sm line-clamp-2 mb-2">{comment.content}</p>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatDate(comment.created_at)}
                                    </span>
                                    <span>{comment.anime_id}</span>
                                </div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>

            <TabsContent value="posts" className="mt-0">
                <div className="space-y-3">
                    {loadingPosts ? (
                        <div className="py-8 text-center text-muted-foreground">Loading posts...</div>
                    ) : posts?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">No recent posts</div>
                    ) : (
                        posts?.map((post: any) => (
                            <GlassPanel key={post.id} className="p-3 bg-muted/20 border-white/5">
                                <div className="flex items-center justify-between gap-4 mb-1">
                                    <h4 className="font-bold text-sm truncate">{post.title}</h4>
                                    <Link to={`/community/forum/${post.id}`} target="_blank">
                                        <ExternalLink className="w-3 h-3 text-primary hover:text-primary/80" />
                                    </Link>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                    <span>{formatDate(post.created_at)}</span>
                                    <span>{post.views_count} views</span>
                                    {post.is_pinned && <span className="text-primary">Pinned</span>}
                                </div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>

            <TabsContent value="tierlists" className="mt-0">
                <div className="space-y-3">
                    {loadingTierLists ? (
                        <div className="py-8 text-center text-muted-foreground">Loading tier lists...</div>
                    ) : tierLists?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">No tier lists</div>
                    ) : (
                        tierLists?.map((list: any) => (
                            <GlassPanel key={list.id} className="p-3 bg-muted/20 border-white/5">
                                <div className="flex items-center justify-between gap-4 mb-1">
                                    <h4 className="font-bold text-sm truncate">{list.title}</h4>
                                    {list.share_code && (
                                        <Link to={`/tierlist/${list.share_code}`} target="_blank">
                                            <ExternalLink className="w-3 h-3 text-primary" />
                                        </Link>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{list.description || 'No description'}</p>
                                <div className="text-[10px] text-muted-foreground font-bold">{formatDate(list.created_at)}</div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>

            <TabsContent value="playlists" className="mt-0">
                <div className="space-y-3">
                    {loadingPlaylists ? (
                        <div className="py-8 text-center text-muted-foreground">Loading playlists...</div>
                    ) : playlists?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">No playlists</div>
                    ) : (
                        playlists?.map((playlist: any) => (
                            <GlassPanel key={playlist.id} className="p-3 bg-muted/20 border-white/5">
                                <div className="flex items-center justify-between gap-4 mb-1">
                                    <h4 className="font-bold text-sm truncate">{playlist.name}</h4>
                                    <Link to={`/playlist/${playlist.id}`} target="_blank">
                                        <ExternalLink className="w-3 h-3 text-primary" />
                                    </Link>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                    <span>{formatDate(playlist.created_at)}</span>
                                    <span>{playlist.items_count || 0} items</span>
                                    {playlist.is_public ? <span className="text-emerald-500">Public</span> : <span>Private</span>}
                                </div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>
        </Tabs>
    );
}
