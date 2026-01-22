import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import {
  Plus, Trash2, Edit2, Server, Search, Film, Globe, CheckCircle, XCircle, ExternalLink, Play, Link2, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface CustomVideoSource {
  id: string;
  anime_id: string;
  anime_title: string;
  episode_number: number;
  server_name: string;
  video_url: string;
  quality: string;
  is_active: boolean;
  priority: number;
  subtitle_url: string;
  subtitle_lang: string;
  created_at: string;
  added_by: string;
}

interface NewVideoSource {
  anime_id: string;
  anime_title: string;
  episode_number: number;
  server_name: string;
  video_url: string;
  quality: string;
  subtitle_url: string;
  subtitle_lang: string;
  is_active: boolean;
  priority: number;
}

export function VideoServerManager() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<CustomVideoSource | null>(null);
  const [newSource, setNewSource] = useState<NewVideoSource>({
    anime_id: '',
    anime_title: '',
    episode_number: 1,
    server_name: '',
    video_url: '',
    quality: '1080p',
    subtitle_url: '',
    subtitle_lang: 'English',
    is_active: true,
    priority: 1,
  });

  // Fetch all custom video sources
  const { data: videoSources = [], isLoading } = useQuery({
    queryKey: ['custom-video-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_video_sources')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CustomVideoSource[];
    },
  });

  // Add new video source
  const addMutation = useMutation({
    mutationFn: async (source: NewVideoSource) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('custom_video_sources')
        .insert({
          ...source,
          added_by: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-video-sources'] });
      toast.success('Video source added successfully');
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to add video source: ' + error.message);
    },
  });

  // Update video source
  const updateMutation = useMutation({
    mutationFn: async (source: Partial<CustomVideoSource> & { id: string }) => {
      const { error } = await supabase
        .from('custom_video_sources')
        .update(source)
        .eq('id', source.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-video-sources'] });
      toast.success('Video source updated');
      setEditingSource(null);
    },
    onError: (error) => {
      toast.error('Failed to update: ' + error.message);
    },
  });

  // Delete video source
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_video_sources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-video-sources'] });
      toast.success('Video source deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });

  // Search anime for autocomplete - prioritize internal API for correct Tatakai IDs
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; image?: string; source: 'internal' | 'jikan' }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchAnime = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      toast.error('Please enter at least 2 characters');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      // Try internal HiAnime API first (for correct Tatakai IDs)
      const internalRes = await fetch(`https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime/search?q=${encodeURIComponent(query)}&page=1`);
      if (internalRes.ok) {
        const internalData = await internalRes.json();
        const animes = internalData.data?.animes || internalData.animes || [];
        if (animes.length > 0) {
          const results = animes.slice(0, 8).map((anime: any) => ({
            id: anime.id,
            name: anime.name,
            image: anime.poster,
            source: 'internal' as const,
          }));
          setSearchResults(results);
          toast.success(`Found ${results.length} anime (Tatakai IDs)`);
          return;
        }
      }

      // Fallback to Jikan API (for reference only - IDs won't link correctly in Tatakai)
      const jikanRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
      if (jikanRes.ok) {
        const jikanData = await jikanRes.json();
        if (jikanData.data?.length > 0) {
          const results = jikanData.data.map((anime: any) => ({
            id: `mal-${anime.mal_id}`,
            name: anime.title,
            image: anime.images?.jpg?.small_image_url,
            source: 'jikan' as const,
          }));
          setSearchResults(results);
          toast.info('Results from MAL - anime may not link correctly in player');
          return;
        }
      }

      toast.error('No anime found');
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed - try entering the anime ID manually');
    } finally {
      setIsSearching(false);
    }
  };

  const selectAnime = (anime: { id: string; name: string }) => {
    setNewSource(prev => ({
      ...prev,
      anime_id: anime.id,
      anime_title: anime.name,
    }));
    setSearchResults([]);
    toast.success(`Selected: ${anime.name}`);
  };

  const resetForm = () => {
    setNewSource({
      anime_id: '',
      anime_title: '',
      episode_number: 1,
      server_name: '',
      video_url: '',
      quality: '1080p',
      subtitle_url: '',
      subtitle_lang: 'English',
      is_active: true,
      priority: 1,
    });
  };

  const handleAdd = () => {
    if (!newSource.anime_id || !newSource.video_url || !newSource.server_name) {
      toast.error('Please fill in all required fields');
      return;
    }
    addMutation.mutate(newSource);
  };

  const handleToggleActive = (source: CustomVideoSource) => {
    updateMutation.mutate({
      id: source.id,
      is_active: !source.is_active,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this video source?')) {
      deleteMutation.mutate(id);
    }
  };

  // Filter sources by search query
  const filteredSources = videoSources.filter(source =>
    source.anime_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    source.server_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group sources by anime
  const groupedSources = filteredSources.reduce((acc, source) => {
    if (!acc[source.anime_id]) {
      acc[source.anime_id] = {
        anime_title: source.anime_title,
        sources: [],
      };
    }
    acc[source.anime_id].sources.push(source);
    return acc;
  }, {} as Record<string, { anime_title: string; sources: CustomVideoSource[] }>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Video Server Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add custom video sources for any anime episode
          </p>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Video Source
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Custom Video Source</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Anime Search */}
              <div className="space-y-2">
                <Label>Search Anime</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter anime name..."
                    value={newSource.anime_title}
                    onChange={(e) => setNewSource({ ...newSource, anime_title: e.target.value, anime_id: '' })}
                    onKeyDown={(e) => e.key === 'Enter' && searchAnime(newSource.anime_title)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => searchAnime(newSource.anime_title)}
                    disabled={isSearching}
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && !newSource.anime_id && (
                  <div className="border border-border rounded-lg overflow-hidden bg-card">
                    {searchResults.map((anime) => (
                      <button
                        key={anime.id}
                        onClick={() => selectAnime(anime)}
                        className="w-full flex items-center gap-3 p-2 hover:bg-primary/10 transition-colors text-left border-b border-border/50 last:border-b-0"
                      >
                        {anime.image && (
                          <img src={anime.image} alt="" className="w-10 h-14 object-cover rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{anime.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {anime.id}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {newSource.anime_id && (
                  <p className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Selected: {newSource.anime_title} (ID: {newSource.anime_id})
                  </p>
                )}

                {/* Manual ID input */}
                <div className="pt-2 border-t border-border/50">
                  <Label className="text-xs text-muted-foreground">Or enter Anime ID manually:</Label>
                  <Input
                    placeholder="Enter anime ID..."
                    value={newSource.anime_id}
                    onChange={(e) => setNewSource({ ...newSource, anime_id: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Episode Number */}
              <div className="space-y-2">
                <Label>Episode Number</Label>
                <Input
                  type="number"
                  min={1}
                  value={newSource.episode_number}
                  onChange={(e) => setNewSource({ ...newSource, episode_number: parseInt(e.target.value) || 1 })}
                />
              </div>

              {/* Server Name */}
              <div className="space-y-2">
                <Label>Server Name</Label>
                <Input
                  placeholder="e.g., Custom HD, Backup Server"
                  value={newSource.server_name}
                  onChange={(e) => setNewSource({ ...newSource, server_name: e.target.value })}
                />
              </div>

              {/* Video URL */}
              <div className="space-y-2">
                <Label>Video URL</Label>
                <Textarea
                  placeholder="Direct video URL or embed URL"
                  value={newSource.video_url}
                  onChange={(e) => setNewSource({ ...newSource, video_url: e.target.value })}
                  rows={2}
                />
              </div>

              {/* Subtitle URL */}
              <div className="space-y-2">
                <Label>Subtitle URL (Optional)</Label>
                <Textarea
                  placeholder="VTT or SRT URL"
                  value={newSource.subtitle_url}
                  onChange={(e) => setNewSource({ ...newSource, subtitle_url: e.target.value })}
                  rows={2}
                />
              </div>

              {/* Subtitle Language */}
              <div className="space-y-2">
                <Label>Subtitle Language</Label>
                <Input
                  placeholder="e.g., English, Spanish, Arabic"
                  value={newSource.subtitle_lang}
                  onChange={(e) => setNewSource({ ...newSource, subtitle_lang: e.target.value })}
                />
              </div>

              {/* Quality */}
              <div className="space-y-2">
                <Label>Quality</Label>
                <Select
                  value={newSource.quality}
                  onValueChange={(val) => setNewSource({ ...newSource, quality: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="360p">360p</SelectItem>
                    <SelectItem value="480p">480p</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                    <SelectItem value="4K">4K</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority (lower = higher priority)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={newSource.priority}
                  onChange={(e) => setNewSource({ ...newSource, priority: parseInt(e.target.value) || 1 })}
                />
              </div>

              {/* Active */}
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={newSource.is_active}
                  onCheckedChange={(val) => setNewSource({ ...newSource, is_active: val })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Adding...' : 'Add Source'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by anime or server name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sources List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : Object.keys(groupedSources).length === 0 ? (
        <div className="text-center py-12">
          <Server className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No custom video sources yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click "Add Video Source" to add a custom video server for any anime
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedSources).map(([animeId, { anime_title, sources }]) => (
            <GlassPanel key={animeId} className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Film className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-semibold">{anime_title}</h3>
                    <p className="text-xs text-muted-foreground">{sources.length} custom source(s)</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/anime/${animeId}`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {sources
                  .sort((a, b) => a.episode_number - b.episode_number)
                  .map((source) => (
                    <div
                      key={source.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4" />
                          <span className="font-medium">EP {source.episode_number}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{source.server_name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{source.quality}</span>
                            <span>•</span>
                            <span>Priority: {source.priority}</span>
                            <span>•</span>
                            <span className={source.subtitle_url ? 'text-primary' : ''}>
                              {source.subtitle_url ? `Sub: ${source.subtitle_lang || 'Yes'}` : 'No Sub'}
                            </span>
                            <span>•</span>
                            <span>{formatDistanceToNow(new Date(source.created_at), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={source.is_active}
                          onCheckedChange={() => handleToggleActive(source)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(source.video_url, '_blank')}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(source.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassPanel className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{videoSources.length}</p>
          <p className="text-sm text-muted-foreground">Total Sources</p>
        </GlassPanel>
        <GlassPanel className="p-4 text-center">
          <p className="text-2xl font-bold text-green-500">
            {videoSources.filter(s => s.is_active).length}
          </p>
          <p className="text-sm text-muted-foreground">Active</p>
        </GlassPanel>
        <GlassPanel className="p-4 text-center">
          <p className="text-2xl font-bold text-secondary">
            {Object.keys(groupedSources).length}
          </p>
          <p className="text-sm text-muted-foreground">Anime</p>
        </GlassPanel>
        <GlassPanel className="p-4 text-center">
          <p className="text-2xl font-bold">
            {new Set(videoSources.map(s => s.server_name)).size}
          </p>
          <p className="text-sm text-muted-foreground">Servers</p>
        </GlassPanel>
      </div>
    </div>
  );
}
