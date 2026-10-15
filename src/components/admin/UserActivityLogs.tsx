import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Layout, Star, List, Clock, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { Link } from 'react-router-dom';
import { CommentContent } from '@/components/comments/CommentContent';
import { CommentAttachments } from '@/components/comments/CommentAttachments';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';

interface UserActivityLogsProps {
    userId: string;
}

export function UserActivityLogs({ userId }: UserActivityLogsProps) {
  useUiTranslation();
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
                    <span className="hidden sm:inline">{uiI18n.t('app.comments_fce06e20')}</span>
                </TabsTrigger>
                <TabsTrigger value="posts" className="gap-2">
                    <Layout className="w-4 h-4" />
                    <span className="hidden sm:inline">{uiI18n.t('app.posts_a0ca0c31')}</span>
                </TabsTrigger>
                <TabsTrigger value="tierlists" className="gap-2">
                    <Star className="w-4 h-4" />
                    <span className="hidden sm:inline">{uiI18n.t('app.tier_lists_86752701')}</span>
                </TabsTrigger>
                <TabsTrigger value="playlists" className="gap-2">
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline">{uiI18n.t('app.playlists_77b69f32')}</span>
                </TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="mt-0">
                <div className="space-y-3">
                    {loadingComments ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.loading_comments_4b98e940')}</div>
                    ) : comments?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.no_recent_comments_58445cf1')}</div>
                    ) : (
                        comments?.map((comment: any) => (
                            <GlassPanel key={comment.id} className="p-3 bg-muted/20 border-white/5">
                                <CommentContent content={comment.content} clamp className="text-sm mb-2" />
                                <CommentAttachments attachments={comment.attachments} className="mb-2" />
                                <CommentEmbeds embeds={comment.embeds} poll={comment.poll} />
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-2">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatDate(comment.created_at)}
                                    </span>
                                    <span>{comment.entity_type}</span>
                                </div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>

            <TabsContent value="posts" className="mt-0">
                <div className="space-y-3">
                    {loadingPosts ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.loading_posts_855628a1')}</div>
                    ) : posts?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.no_recent_posts_a5fd406d')}</div>
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
                                    <span>{post.views_count} {uiI18n.t('app.views_81f33187')}</span>
                                    {post.is_pinned && <span className="text-primary">{uiI18n.t('app.pinned_f9312169')}</span>}
                                </div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>

            <TabsContent value="tierlists" className="mt-0">
                <div className="space-y-3">
                    {loadingTierLists ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.loading_tier_lists_be2d6fab')}</div>
                    ) : tierLists?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.no_tier_lists_0f8a064c')}</div>
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
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{list.description || uiI18n.t('app.no_description_f354c94f')}</p>
                                <div className="text-[10px] text-muted-foreground font-bold">{formatDate(list.created_at)}</div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>

            <TabsContent value="playlists" className="mt-0">
                <div className="space-y-3">
                    {loadingPlaylists ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.loading_playlists_b13e8ca4')}</div>
                    ) : playlists?.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">{uiI18n.t('app.no_playlists_d1f610bb')}</div>
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
                                    <span>{playlist.items_count || 0} {uiI18n.t('app.items_7316c8b2')}</span>
                                    {playlist.is_public ? <span className="text-emerald-500">{uiI18n.t('app.public_dc5eb704')}</span> : <span>{uiI18n.t('app.private_237dfa0a')}</span>}
                                </div>
                            </GlassPanel>
                        ))
                    )}
                </div>
            </TabsContent>
        </Tabs>
    );
}
