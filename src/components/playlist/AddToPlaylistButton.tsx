import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  usePlaylists, 
  useCreatePlaylist, 
  useAddToPlaylist,
  useAnimeInPlaylists,
  Playlist 
} from '@/hooks/usePlaylist';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';
import { 
  ListPlus, Plus, Check, Music2, Globe, Lock, 
  ChevronRight, Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AddToPlaylistButtonProps {
  animeId: string;
  animeName: string;
  animePoster?: string;
  variant?: 'default' | 'icon' | 'mini';
  className?: string;
}

export function AddToPlaylistButton({ 
  animeId, 
  animeName, 
  animePoster,
  variant = 'default',
  className 
}: AddToPlaylistButtonProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [newPlaylistPublic, setNewPlaylistPublic] = useState(false);

  const { data: playlists = [], isLoading: loadingPlaylists } = usePlaylists();
  const { data: inPlaylists = [] } = useAnimeInPlaylists(animeId);
  const createPlaylist = useCreatePlaylist();
  const addToPlaylist = useAddToPlaylist();

  // Show a visual indication if this anime is already in any of the user's playlists
  const isInAnyPlaylist = (inPlaylists || []).length > 0;

  if (!user) {
    return (
      <Button 
        variant="outline" 
        size={variant === 'icon' ? 'icon' : variant === 'mini' ? 'sm' : 'default'}
        className={className}
        onClick={() => navigate('/auth')}
      >
        {variant === 'icon' || variant === 'mini' ? (
          <ListPlus className="w-4 h-4" />
        ) : (
          <>
            <ListPlus className="w-4 h-4 mr-2" />
            Add to Playlist
          </>
        )}
      </Button>
    );
  }

  const handleCreateAndAdd = async () => {
    if (!newPlaylistName.trim()) return;

    try {
      const playlist = await createPlaylist.mutateAsync({
        name: newPlaylistName.trim(),
        description: newPlaylistDesc.trim() || undefined,
        isPublic: newPlaylistPublic,
      });

      await addToPlaylist.mutateAsync({
        playlistId: playlist.id,
        animeId,
        animeName,
        animePoster,
      });

      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setNewPlaylistPublic(false);
      setShowCreate(false);
      setOpen(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleAddToPlaylist = async (playlist: Playlist) => {
    if (inPlaylists.includes(playlist.id)) return;

    await addToPlaylist.mutateAsync({
      playlistId: playlist.id,
      animeId,
      animeName,
      animePoster,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size={variant === 'icon' ? 'icon' : variant === 'mini' ? 'sm' : 'default'}
          className={cn(
            variant === 'mini' && 'h-8 px-2 text-xs',
            variant === 'icon' && 'h-14 w-14 rounded-full',
            className
          )}
        >
          {variant === 'icon' || variant === 'mini' ? (
            isInAnyPlaylist ? (
              <Check className={variant === 'icon' ? "w-6 h-6" : "w-4 h-4"} />
            ) : (
              <ListPlus className={variant === 'icon' ? "w-6 h-6" : "w-4 h-4"} />
            )
          ) : (
            <>
              {isInAnyPlaylist ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <ListPlus className="w-4 h-4 mr-2" />
              )}
              {isInAnyPlaylist ? 'Added' : 'Add to Playlist'}
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="w-5 h-5 text-primary" />
            Add to Playlist
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Anime preview */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-white/5">
            {animePoster && (
              <img 
                src={getProxiedImageUrl(animePoster)} 
                alt={animeName}
                className="w-12 h-16 object-cover rounded"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium line-clamp-2">{animeName}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {showCreate ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Playlist Name</Label>
                  <Input
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="My awesome playlist"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={newPlaylistDesc}
                    onChange={(e) => setNewPlaylistDesc(e.target.value)}
                    placeholder="What's this playlist about?"
                    rows={2}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {newPlaylistPublic ? (
                      <Globe className="w-4 h-4 text-green-500" />
                    ) : (
                      <Lock className="w-4 h-4 text-muted-foreground" />
                    )}
                    <Label>Public playlist</Label>
                  </div>
                  <Switch
                    checked={newPlaylistPublic}
                    onCheckedChange={setNewPlaylistPublic}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreate(false)}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleCreateAndAdd}
                    disabled={!newPlaylistName.trim() || createPlaylist.isPending}
                    className="flex-1"
                  >
                    {createPlaylist.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Create & Add'
                    )}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {/* Create new playlist button */}
                <Button
                  variant="outline"
                  onClick={() => setShowCreate(true)}
                  className="w-full justify-start gap-2 h-12"
                >
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  Create new playlist
                </Button>

                {/* Existing playlists */}
                {loadingPlaylists ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : playlists.length > 0 ? (
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-1 pr-4">
                      {playlists.map((playlist) => {
                        const isInPlaylist = inPlaylists.includes(playlist.id);
                        return (
                          <button
                            key={playlist.id}
                            onClick={() => handleAddToPlaylist(playlist)}
                            disabled={isInPlaylist || addToPlaylist.isPending}
                            className={cn(
                              "w-full flex items-center gap-3 p-2 rounded-lg transition-all text-left",
                              isInPlaylist 
                                ? "bg-primary/10 cursor-default" 
                                : "hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded flex items-center justify-center flex-shrink-0",
                              isInPlaylist ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}>
                              {isInPlaylist ? (
                                <Check className="w-5 h-5" />
                              ) : (
                                <Music2 className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium line-clamp-1">{playlist.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {playlist.items_count} {playlist.items_count === 1 ? 'anime' : 'anime'}
                                {playlist.is_public && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    <Globe className="w-3 h-3" /> Public
                                  </span>
                                )}
                              </p>
                            </div>
                            {!isInPlaylist && (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Music2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No playlists yet</p>
                    <p className="text-xs">Create your first playlist above!</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
