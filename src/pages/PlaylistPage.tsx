import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatusVideoBackground } from '@/components/layout/StatusVideoBackground';
import { PlaylistCard } from '@/components/playlist/PlaylistCard';
import { 
  usePlaylists, 
  usePlaylist, 
  usePlaylistItems,
  useCreatePlaylist,
  useUpdatePlaylist,
  useDeletePlaylist,
  useRemoveFromPlaylist,
  Playlist
} from '@/hooks/usePlaylist';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';
import { 
  ArrowLeft, Plus, Music2, Globe, Lock, Play, 
  Trash2, Edit2, Share2, MoreVertical, GripVertical,
  Loader2, Calendar
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Playlists list page
export default function PlaylistsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: playlists = [], isLoading } = usePlaylists();
  const createPlaylist = useCreatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPublic, setNewPublic] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    
    await createPlaylist.mutateAsync({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      isPublic: newPublic,
    });
    
    setNewName('');
    setNewDesc('');
    setNewPublic(false);
    setShowCreate(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deletePlaylist.mutateAsync(deleteId);
    setDeleteId(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <StatusVideoBackground />
        <Sidebar />
        <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-20 text-center">
            <Music2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Sign in to create playlists</h1>
            <p className="text-muted-foreground mb-6">Create and manage your anime playlists</p>
            <Button onClick={() => navigate('/auth')}>Sign In</Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusVideoBackground />
      <Sidebar />
      
      <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                  <Music2 className="w-8 h-8 text-primary" />
                  My Playlists
                </h1>
                <p className="text-muted-foreground mt-1">
                  {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
                </p>
              </div>
            </div>
            
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Playlist
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Playlist</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="My awesome playlist"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="What's this playlist about?"
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {newPublic ? (
                        <Globe className="w-4 h-4 text-green-500" />
                      ) : (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Label>Make public</Label>
                    </div>
                    <Switch
                      checked={newPublic}
                      onCheckedChange={setNewPublic}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreate}
                    disabled={!newName.trim() || createPlaylist.isPending}
                  >
                    {createPlaylist.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Create'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Playlists grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="aspect-square bg-muted rounded-xl animate-pulse" />
                  <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : playlists.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {playlists.map((playlist, index) => (
                <motion.div
                  key={playlist.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <PlaylistCard
                    playlist={playlist}
                    onDelete={() => setDeleteId(playlist.id)}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <GlassPanel className="p-12 text-center">
              <Music2 className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-bold mb-2">No playlists yet</h2>
              <p className="text-muted-foreground mb-6">
                Create your first playlist to start organizing your anime!
              </p>
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Playlist
              </Button>
            </GlassPanel>
          )}
        </div>
      </main>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this playlist and all its items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileNav />
    </div>
  );
}

// Single playlist view page
export function PlaylistViewPage() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { data: playlist, isLoading: loadingPlaylist } = usePlaylist(playlistId);
  const { data: items = [], isLoading: loadingItems } = usePlaylistItems(playlistId);
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const removeFromPlaylist = useRemoveFromPlaylist();

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [editShareSlug, setEditShareSlug] = useState<string | undefined>(undefined);
  const [editShareDesc, setEditShareDesc] = useState<string | undefined>(undefined);
  const [editEmbedAllowed, setEditEmbedAllowed] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const isOwner = user && playlist && user.id === playlist.user_id;

  const openEdit = () => {
    if (!playlist) return;
    setEditName(playlist.name);
    setEditDesc(playlist.description || '');
    setEditPublic(playlist.is_public);
    setEditShareSlug(playlist.share_slug ?? undefined);
    setEditShareDesc(playlist.share_description ?? undefined);
    setEditEmbedAllowed(!!playlist.embed_allowed);
    setShowEdit(true);
  };

  // Try to update playlist with optional share fields; handle slug collisions by retrying
  const handleGenerateSlug = async () => {
    if (!playlist) return;
    const { generateShortSlug } = await import('@/lib/slug');

    // Try up to 3 times to avoid unique index collisions
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateShortSlug(8);
      try {
        await updatePlaylist.mutateAsync({ id: playlist.id, shareSlug: candidate, isPublic: true });
        setEditShareSlug(candidate);
        setEditPublic(true);
        return;
      } catch (err: any) {
        // Unique violation code 23505
        if (err?.message?.includes('23505') || /unique/i.test(err?.message || '')) {
          continue; // try another
        }
        throw err;
      }
    }
    // If we reach here, failed to generate
    toast.error('Failed to generate a unique share link. Try again later.');
  };

  const handleUpdate = async () => {
    if (!playlist || !editName.trim()) return;
    
    await updatePlaylist.mutateAsync({
      id: playlist.id,
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      isPublic: editPublic,
      shareSlug: editShareSlug ?? undefined,
      shareDescription: editShareDesc ?? undefined,
      embedAllowed: editEmbedAllowed,
    });
    
    setShowEdit(false);
  };

  const handleDelete = async () => {
    if (!playlist) return;
    await deletePlaylist.mutateAsync(playlist.id);
    navigate('/playlists');
  };

  const handleRemoveItem = async (animeId: string) => {
    if (!playlist) return;
    await removeFromPlaylist.mutateAsync({
      playlistId: playlist.id,
      animeId,
    });
  };

  const handleShare = () => {
    const url = playlist?.share_slug ? `${window.location.origin}/p/${playlist.share_slug}` : window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

  if (loadingPlaylist) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <StatusVideoBackground />
        <Sidebar />
        <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-20 text-center">
            <Music2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Playlist not found</h1>
            <p className="text-muted-foreground mb-6">
              This playlist may be private or doesn't exist.
            </p>
            <Button onClick={() => navigate('/playlists')}>Go to Playlists</Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  // Get cover images from first 4 items
  const coverImages = items.slice(0, 4).map(item => item.anime_poster).filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusVideoBackground />
      <Sidebar />
      
      <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row gap-8 mb-12">
            {/* Cover */}
            <div className="w-full md:w-64 flex-shrink-0">
              <div className="aspect-square rounded-2xl overflow-hidden bg-muted shadow-2xl">
                {coverImages.length > 0 ? (
                  <div className={cn(
                    "grid w-full h-full",
                    coverImages.length === 1 && "grid-cols-1",
                    coverImages.length === 2 && "grid-cols-2",
                    coverImages.length >= 3 && "grid-cols-2 grid-rows-2"
                  )}>
                    {coverImages.map((img, idx) => (
                      <img
                        key={idx}
                        src={getProxiedImageUrl(img)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
                    <Music2 className="w-20 h-20 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center gap-2 mb-2">
                {playlist.is_public ? (
                  <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-xs flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    Public
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Private
                  </span>
                )}
              </div>

              <h1 className="text-4xl font-black mb-2">{playlist.name}</h1>
              
              {playlist.description && (
                <p className="text-muted-foreground mb-4">{playlist.description}</p>
              )}
              
              <p className="text-sm text-muted-foreground flex items-center gap-2 mb-6">
                <Calendar className="w-4 h-4" />
                Created {new Date(playlist.created_at).toLocaleDateString()}
                <span>•</span>
                {playlist.items_count} {playlist.items_count === 1 ? 'anime' : 'anime'}
              </p>

              <div className="flex flex-wrap gap-3">
                {items.length > 0 && (
                  <Button 
                    className="gap-2"
                    onClick={() => navigate(`/anime/${items[0].anime_id}`)}
                  >
                    <Play className="w-4 h-4" />
                    Start Watching
                  </Button>
                )}
                
                {playlist.is_public && (
                  <Button variant="outline" onClick={handleShare} className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                )}
                
                {isOwner && (
                  <>
                    <Button variant="outline" onClick={openEdit} className="gap-2">
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowDelete(true)}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Items list */}
          <GlassPanel className="p-6">
            <h2 className="text-xl font-bold mb-6">
              Anime in this playlist
            </h2>

            {loadingItems ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors group"
                  >
                    <span className="text-muted-foreground w-8 text-center font-mono">
                      {index + 1}
                    </span>
                    
                    <Link to={`/anime/${item.anime_id}`} className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="relative w-16 h-20 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')}
                          alt={item.anime_name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                          {item.anime_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Added {new Date(item.added_at).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>

                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(item.anime_id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Music2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">This playlist is empty</p>
                {isOwner && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Add anime from any anime page using the "Add to Playlist" button
                  </p>
                )}
              </div>
            )}
          </GlassPanel>
        </div>
      </main>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Share description (optional)</Label>
              <Textarea
                value={editShareDesc}
                onChange={(e) => setEditShareDesc(e.target.value)}
                rows={2}
                placeholder="A short blurb shown on public pages"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {editPublic ? (
                  <Globe className="w-4 h-4 text-green-500" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
                <Label>Public</Label>
              </div>
              <Switch
                checked={editPublic}
                onCheckedChange={async (val) => {
                  setEditPublic(val);
                  // If making public and no slug exists, generate one
                  if (val && !editShareSlug) {
                    await handleGenerateSlug();
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Allow embed</Label>
              </div>
              <Switch checked={editEmbedAllowed} onCheckedChange={setEditEmbedAllowed} />
            </div>

            <div className="flex items-center gap-2">
              <Input value={editShareSlug || ''} readOnly placeholder="No share link yet" />
              <Button variant="outline" onClick={handleGenerateSlug} className="gap-2">
                <GripVertical className="w-4 h-4" />
                Generate
              </Button>
              {editShareSlug && (
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${editShareSlug}`); toast.success('Share link copied'); }} className="gap-2">
                  <Share2 className="w-4 h-4" />
                  Copy Link
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdate}
              disabled={!editName.trim() || updatePlaylist.isPending}
            >
              {updatePlaylist.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{playlist.name}" and all its items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileNav />
    </div>
  );
}
