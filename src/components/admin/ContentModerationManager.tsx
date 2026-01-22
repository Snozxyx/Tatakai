import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { 
  Trash2, Search, MessageSquare, Music2, Layers, 
  Eye, AlertTriangle, ExternalLink 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function ContentModerationManager() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('forum');

  // Fetch forum posts
  const { data: forumPosts = [], isLoading: loadingForum } = useQuery({
    queryKey: ['admin_forum_posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forum_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      const userIds = [...new Set(data.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      return data.map(p => ({
        ...p,
        profile: profileMap.get(p.user_id),
      }));
    },
  });

  // Fetch playlists
  const { data: playlists = [], isLoading: loadingPlaylists } = useQuery({
    queryKey: ['admin_playlists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      const userIds = [...new Set(data.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      return data.map(p => ({
        ...p,
        profile: profileMap.get(p.user_id),
      }));
    },
  });

  // Fetch tier lists
  const { data: tierLists = [], isLoading: loadingTierLists } = useQuery({
    queryKey: ['admin_tier_lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tier_lists')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      const userIds = [...new Set(data.map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      return data.map(t => ({
        ...t,
        profile: profileMap.get(t.user_id),
      }));
    },
  });

  // Delete forum post
  const deleteForumPost = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_forum_posts'] });
      toast.success('Forum post deleted');
    },
    onError: () => {
      toast.error('Failed to delete forum post');
    },
  });

  // Delete playlist
  const deletePlaylist = useMutation({
    mutationFn: async (playlistId: string) => {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_playlists'] });
      toast.success('Playlist deleted');
    },
    onError: () => {
      toast.error('Failed to delete playlist');
    },
  });

  // Delete tier list
  const deleteTierList = useMutation({
    mutationFn: async (tierListId: string) => {
      const { error } = await supabase
        .from('tier_lists')
        .delete()
        .eq('id', tierListId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_tier_lists'] });
      toast.success('Tier list deleted');
    },
    onError: () => {
      toast.error('Failed to delete tier list');
    },
  });

  const filteredForumPosts = forumPosts.filter((p: any) =>
    p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.profile?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPlaylists = playlists.filter((p: any) =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.profile?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTierLists = tierLists.filter((t: any) =>
    t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.profile?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-primary" />
          Content Moderation
        </h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-muted/50"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="forum" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Forum ({forumPosts.length})
          </TabsTrigger>
          <TabsTrigger value="playlists" className="gap-2">
            <Music2 className="w-4 h-4" />
            Playlists ({playlists.length})
          </TabsTrigger>
          <TabsTrigger value="tierlists" className="gap-2">
            <Layers className="w-4 h-4" />
            Tier Lists ({tierLists.length})
          </TabsTrigger>
        </TabsList>

        {/* Forum Posts */}
        <TabsContent value="forum" className="mt-4">
          {loadingForum ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filteredForumPosts.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredForumPosts.map((post: any) => (
                <div
                  key={post.id}
                  className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {post.is_spoiler && (
                          <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-500 text-xs">
                            Spoiler
                          </span>
                        )}
                        {post.flair && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
                            {post.flair}
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium truncate">{post.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{post.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>By @{post.profile?.username || 'unknown'}</span>
                        <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.views_count}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link to={`/community/forum/${post.id}`} target="_blank">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this forum post?')) {
                            deleteForumPost.mutate(post.id);
                          }
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No forum posts found
            </div>
          )}
        </TabsContent>

        {/* Playlists */}
        <TabsContent value="playlists" className="mt-4">
          {loadingPlaylists ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filteredPlaylists.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredPlaylists.map((playlist: any) => (
                <div
                  key={playlist.id}
                  className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {playlist.is_public ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-xs">
                            Public
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                            Private
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium truncate">{playlist.name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                        {playlist.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>By @{playlist.profile?.username || 'unknown'}</span>
                        <span>{playlist.items_count || 0} items</span>
                        <span>{formatDistanceToNow(new Date(playlist.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link to={`/playlist/${playlist.id}`} target="_blank">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this playlist?')) {
                            deletePlaylist.mutate(playlist.id);
                          }
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No playlists found
            </div>
          )}
        </TabsContent>

        {/* Tier Lists */}
        <TabsContent value="tierlists" className="mt-4">
          {loadingTierLists ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filteredTierLists.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredTierLists.map((tierList: any) => (
                <div
                  key={tierList.id}
                  className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {tierList.is_public ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-xs">
                            Public
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                            Private
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium truncate">{tierList.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                        {tierList.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>By @{tierList.profile?.username || 'unknown'}</span>
                        <span>{formatDistanceToNow(new Date(tierList.created_at), { addSuffix: true })}</span>
                        {tierList.views_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {tierList.views_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tierList.share_code && (
                        <Link to={`/tierlist/${tierList.share_code}`} target="_blank">
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this tier list?')) {
                            deleteTierList.mutate(tierList.id);
                          }
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No tier lists found
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
