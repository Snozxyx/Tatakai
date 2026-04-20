import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
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
import { PlaylistCard } from '@/components/playlist/PlaylistCard';
import {
  usePlaylists,
  usePlaylist,
  usePlaylistItems,
  useCreatePlaylist,
  useUpdatePlaylist,
  useDeletePlaylist,
  useRemoveFromPlaylist
} from '@/hooks/usePlaylist';
import {
  CollaboratorRole,
  useAddCollaborator,
  useCanEditPlaylist,
  usePlaylistCollaborators,
  useRemoveCollaborator,
  useUpdateCollaborator
} from '@/hooks/usePlaylistCollaboration';
import {
  useAddPlaylistComment,
  useDeletePlaylistComment,
  usePlaylistComments
} from '@/hooks/usePlaylistComments';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, Plus, Music2, Globe, Lock, Play,
  Trash2, Edit2, Share2, GripVertical,
  Loader2, Calendar, Users, UserPlus, Send, MessageSquare, BookOpen
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type PlaylistMediaKind = 'anime' | 'manga';

function parsePlaylistMediaRef(value: string): { kind: PlaylistMediaKind; id: string } {
  const raw = String(value || '').trim();
  if (raw.toLowerCase().startsWith('manga:')) {
    return { kind: 'manga', id: raw.slice(6) };
  }
  if (raw.toLowerCase().startsWith('anime:')) {
    return { kind: 'anime', id: raw.slice(6) };
  }
  return { kind: 'anime', id: raw };
}

function getPlaylistItemHref(animeId: string): string {
  const media = parsePlaylistMediaRef(animeId);
  if (media.kind === 'manga') {
    return `/manga/${encodeURIComponent(media.id)}`;
  }
  return `/anime/${encodeURIComponent(media.id)}`;
}

const PLAYLIST_COLLAB_SEARCH_DEBOUNCE_MS = 300;
const PLAYLIST_EDIT_DRAFT_SAVE_DEBOUNCE_MS = 500;
const PLAYLIST_EDIT_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PLAYLIST_EDIT_DRAFT_STORAGE_PREFIX = 'tatakai_playlist_edit_draft_v1';

interface PlaylistEditDraft {
  name: string;
  description: string;
  isPublic: boolean;
  shareSlug?: string;
  shareDescription?: string;
  embedAllowed: boolean;
  savedAt: number;
}

function getPlaylistEditDraftStorageKey(playlistId?: string): string | null {
  if (!playlistId) return null;
  return `${PLAYLIST_EDIT_DRAFT_STORAGE_PREFIX}:${playlistId}`;
}

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
        <Sidebar />
        <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-20 text-center">
            <Music2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Sign in to create playlists</h1>
            <p className="text-muted-foreground mb-6">Create and manage your anime and manga playlists</p>
            <Button onClick={() => navigate('/auth')}>Sign In</Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
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
                Create your first playlist to start organizing your anime and manga!
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
  const { data: canEdit = false } = useCanEditPlaylist(playlistId);
  const { data: collaborators = [] } = usePlaylistCollaborators(playlistId);
  const { data: comments = [] } = usePlaylistComments(playlistId);
  const { data: ownerProfile } = useQuery({
    queryKey: ['playlist_owner_profile', playlist?.user_id],
    queryFn: async () => {
      if (!playlist?.user_id) return null as null | {
        user_id: string;
        display_name: string | null;
        username: string | null;
      };

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .eq('user_id', playlist.user_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!playlist?.user_id,
  });

  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const removeFromPlaylist = useRemoveFromPlaylist();
  const addCollaborator = useAddCollaborator();
  const updateCollaborator = useUpdateCollaborator();
  const removeCollaborator = useRemoveCollaborator();
  const addComment = useAddPlaylistComment();
  const deleteComment = useDeletePlaylistComment();

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [editShareSlug, setEditShareSlug] = useState<string | undefined>(undefined);
  const [editShareDesc, setEditShareDesc] = useState<string | undefined>(undefined);
  const [editEmbedAllowed, setEditEmbedAllowed] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [debouncedCollaboratorSearch, setDebouncedCollaboratorSearch] = useState('');
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<CollaboratorRole>('editor');
  const [newComment, setNewComment] = useState('');
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const playlistEditDraftStorageKey = useMemo(
    () => getPlaylistEditDraftStorageKey(playlist?.id),
    [playlist?.id]
  );

  const isOwner = !!user && !!playlist && user.id === playlist.user_id;
  const myCollaboratorRole = collaborators.find((collaborator) => collaborator.user_id === user?.id)?.role;
  const canManageCollaborators = isOwner || myCollaboratorRole === 'admin';
  const canModerateComments = isOwner || myCollaboratorRole === 'admin';
  const ownerDisplayName = ownerProfile?.display_name?.trim() || ownerProfile?.username?.trim() || (playlist?.user_id && !isUuidLike(playlist.user_id) ? playlist.user_id : 'Unknown');

  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parent_id),
    [comments]
  );

  const repliesByParent = useMemo(() => {
    return comments.reduce<Record<string, typeof comments>>((acc, comment) => {
      if (!comment.parent_id) return acc;
      if (!acc[comment.parent_id]) acc[comment.parent_id] = [];
      acc[comment.parent_id].push(comment);
      return acc;
    }, {});
  }, [comments]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedCollaboratorSearch(collaboratorSearch);
    }, PLAYLIST_COLLAB_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [collaboratorSearch]);

  useEffect(() => {
    if (!showEdit || !playlistEditDraftStorageKey || typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      const payload: PlaylistEditDraft = {
        name: editName,
        description: editDesc,
        isPublic: editPublic,
        shareSlug: editShareSlug,
        shareDescription: editShareDesc,
        embedAllowed: editEmbedAllowed,
        savedAt: Date.now(),
      };

      try {
        window.localStorage.setItem(playlistEditDraftStorageKey, JSON.stringify(payload));
      } catch {
        // Ignore storage write failures.
      }
    }, PLAYLIST_EDIT_DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    editDesc,
    editEmbedAllowed,
    editName,
    editPublic,
    editShareDesc,
    editShareSlug,
    playlistEditDraftStorageKey,
    showEdit,
  ]);

  const { data: collaboratorSearchResults = [], isFetching: isSearchingCollaborators } = useQuery({
    queryKey: ['playlist-collaborator-search', playlistId, debouncedCollaboratorSearch, collaborators.length],
    enabled: !!playlist && canManageCollaborators && debouncedCollaboratorSearch.trim().length >= 2,
    queryFn: async () => {
      const searchTerm = debouncedCollaboratorSearch.trim();
      if (!searchTerm || !playlist) return [] as Array<{
        user_id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }>;

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(10);

      if (error) throw error;

      const existingUserIds = new Set(collaborators.map((collaborator) => collaborator.user_id));
      existingUserIds.add(playlist.user_id);

      return (data || []).filter((profile) => !existingUserIds.has(profile.user_id));
    },
  });

  const openEdit = () => {
    if (!playlist) return;
    if (!canEdit) {
      toast.error('You do not have edit access to this playlist');
      return;
    }

    const fallbackDraft: PlaylistEditDraft = {
      name: playlist.name,
      description: playlist.description || '',
      isPublic: playlist.is_public,
      shareSlug: playlist.share_slug ?? undefined,
      shareDescription: playlist.share_description ?? undefined,
      embedAllowed: !!playlist.embed_allowed,
      savedAt: Date.now(),
    };

    let resolvedDraft = fallbackDraft;

    if (playlistEditDraftStorageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(playlistEditDraftStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PlaylistEditDraft>;
          const savedAt = Number(parsed?.savedAt || 0);
          if (savedAt && Date.now() - savedAt <= PLAYLIST_EDIT_DRAFT_MAX_AGE_MS) {
            resolvedDraft = {
              name: typeof parsed.name === 'string' ? parsed.name : fallbackDraft.name,
              description: typeof parsed.description === 'string' ? parsed.description : fallbackDraft.description,
              isPublic: typeof parsed.isPublic === 'boolean' ? parsed.isPublic : fallbackDraft.isPublic,
              shareSlug: typeof parsed.shareSlug === 'string' ? parsed.shareSlug : fallbackDraft.shareSlug,
              shareDescription: typeof parsed.shareDescription === 'string' ? parsed.shareDescription : fallbackDraft.shareDescription,
              embedAllowed: typeof parsed.embedAllowed === 'boolean' ? parsed.embedAllowed : fallbackDraft.embedAllowed,
              savedAt,
            };
          } else {
            window.localStorage.removeItem(playlistEditDraftStorageKey);
          }
        }
      } catch {
        // Ignore malformed drafts and fall back to server values.
      }
    }

    setEditName(resolvedDraft.name);
    setEditDesc(resolvedDraft.description);
    setEditPublic(resolvedDraft.isPublic);
    setEditShareSlug(resolvedDraft.shareSlug ?? undefined);
    setEditShareDesc(resolvedDraft.shareDescription ?? undefined);
    setEditEmbedAllowed(resolvedDraft.embedAllowed);
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
    if (!canEdit) {
      toast.error('You do not have edit access to this playlist');
      return;
    }

    await updatePlaylist.mutateAsync({
      id: playlist.id,
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      isPublic: editPublic,
      shareSlug: editShareSlug ?? undefined,
      shareDescription: editShareDesc ?? undefined,
      embedAllowed: editEmbedAllowed,
    });

    if (playlistEditDraftStorageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(playlistEditDraftStorageKey);
      } catch {
        // Ignore storage remove failures.
      }
    }

    setShowEdit(false);
  };

  const handleDelete = async () => {
    if (!playlist) return;
    await deletePlaylist.mutateAsync(playlist.id);
    navigate('/playlists');
  };

  const handleRemoveItem = async (animeId: string) => {
    if (!playlist) return;
    if (!canEdit) {
      toast.error('You do not have permission to edit this playlist');
      return;
    }

    await removeFromPlaylist.mutateAsync({
      playlistId: playlist.id,
      animeId,
    });
  };

  const handleLaunchWatchRoom = (animeId: string, animeName: string, animePoster?: string | null) => {
    const media = parsePlaylistMediaRef(animeId);
    if (media.kind !== 'anime' || !media.id) {
      toast.error('Watch rooms currently support anime items only.');
      return;
    }

    const params = new URLSearchParams({
      anime: media.id,
      title: animeName,
    });

    if (animePoster) {
      params.set('poster', animePoster);
    }

    navigate(`/isshoni?${params.toString()}`);
  };

  const handleAddCollaborator = async (targetUserId: string) => {
    if (!playlist) return;

    await addCollaborator.mutateAsync({
      playlistId: playlist.id,
      userId: targetUserId,
      role: newCollaboratorRole,
    });

    setCollaboratorSearch('');
    setDebouncedCollaboratorSearch('');
  };

  const handleUpdateCollaboratorRole = async (collaboratorId: string, role: CollaboratorRole) => {
    if (!playlist) return;

    await updateCollaborator.mutateAsync({
      playlistId: playlist.id,
      collaboratorId,
      role,
    });
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!playlist) return;

    await removeCollaborator.mutateAsync({
      playlistId: playlist.id,
      collaboratorId,
    });
  };

  const handlePostComment = async () => {
    if (!playlist || !newComment.trim()) return;

    await addComment.mutateAsync({
      playlistId: playlist.id,
      content: newComment.trim(),
    });

    setNewComment('');
  };

  const handlePostReply = async (parentId: string) => {
    if (!playlist) return;
    const draft = replyDrafts[parentId]?.trim();
    if (!draft) return;

    await addComment.mutateAsync({
      playlistId: playlist.id,
      content: draft,
      parentId,
    });

    setReplyDrafts((previous) => ({
      ...previous,
      [parentId]: '',
    }));
    setOpenReplyFor(null);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!playlist) return;

    await deleteComment.mutateAsync({
      playlistId: playlist.id,
      commentId,
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
  const firstItem = items[0];
  const firstItemMedia = firstItem ? parsePlaylistMediaRef(firstItem.anime_id) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
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
                {playlist.items_count} {playlist.items_count === 1 ? 'item' : 'items'}
              </p>

              <div className="flex flex-wrap gap-3">
                {firstItem && (
                  <Button
                    className="gap-2"
                    onClick={() => navigate(getPlaylistItemHref(firstItem.anime_id))}
                  >
                    {firstItemMedia?.kind === 'manga' ? <BookOpen className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {firstItemMedia?.kind === 'manga' ? 'Start Reading' : 'Start Watching'}
                  </Button>
                )}

                {firstItem && firstItemMedia?.kind === 'anime' && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => handleLaunchWatchRoom(firstItem.anime_id, firstItem.anime_name, firstItem.anime_poster)}
                  >
                    <Users className="w-4 h-4" />
                    Watch With Friends
                  </Button>
                )}

                {playlist.is_public && (
                  <Button variant="outline" onClick={handleShare} className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                )}

                {canEdit && (
                  <>
                    <Button variant="outline" onClick={openEdit} className="gap-2">
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </Button>
                  </>
                )}

                {isOwner && (
                  <>
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
              Items in this playlist
            </h2>

            {loadingItems ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, index) => {
                  const itemMedia = parsePlaylistMediaRef(item.anime_id);
                  const itemHref = getPlaylistItemHref(item.anime_id);

                  return (
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

                    <Link to={itemHref} className="flex items-center gap-4 flex-1 min-w-0">
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
                          {itemMedia.kind === 'manga' ? 'Manga' : 'Anime'} •
                          {' '}
                          Added {new Date(item.added_at).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {itemMedia.kind === 'anime' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleLaunchWatchRoom(item.anime_id, item.anime_name, item.anime_poster);
                          }}
                          className="text-muted-foreground hover:text-primary"
                        >
                          <Users className="w-4 h-4" />
                        </Button>
                      )}

                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.anime_id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Music2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">This playlist is empty</p>
                {canEdit && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Add anime or manga from any detail page using the Add to Playlist button
                  </p>
                )}
              </div>
            )}
          </GlassPanel>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
            <GlassPanel className="p-6 xl:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">Collaborators</h2>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {(playlist.name?.[0] || 'O').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Playlist Owner</p>
                      <p className="text-xs text-muted-foreground truncate">{ownerDisplayName}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">Owner</span>
                </div>

                {collaborators.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No collaborators added yet.</p>
                ) : (
                  collaborators.map((collaborator) => {
                    const displayName = collaborator.profile?.display_name || collaborator.profile?.username || collaborator.user_id;

                    return (
                      <div key={collaborator.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={collaborator.profile?.avatar_url || undefined} />
                          <AvatarFallback>
                            {(displayName?.[0] || 'U').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">@{collaborator.profile?.username || 'unknown'}</p>
                        </div>

                        {canManageCollaborators ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={collaborator.role}
                              onChange={(event) => handleUpdateCollaboratorRole(collaborator.id, event.target.value as CollaboratorRole)}
                              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                            >
                              <option value="viewer">viewer</option>
                              <option value="editor">editor</option>
                              <option value="admin">admin</option>
                            </select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveCollaborator(collaborator.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs uppercase">
                            {collaborator.role}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {canManageCollaborators && (
                <div className="mt-5 pt-5 border-t border-border space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <UserPlus className="w-4 h-4 text-primary" />
                    Add collaborator
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={collaboratorSearch}
                      onChange={(event) => setCollaboratorSearch(event.target.value)}
                      placeholder="Search username or display name"
                    />
                    <select
                      value={newCollaboratorRole}
                      onChange={(event) => setNewCollaboratorRole(event.target.value as CollaboratorRole)}
                      className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  {collaboratorSearch.trim().length >= 2 && (
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 divide-y divide-border/50">
                      {isSearchingCollaborators ? (
                        <p className="text-sm text-muted-foreground p-3">Searching users...</p>
                      ) : collaboratorSearchResults.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3">No matching users found.</p>
                      ) : (
                        collaboratorSearchResults.map((profile) => {
                          const displayName = profile.display_name || profile.username || profile.user_id;

                          return (
                            <div key={profile.user_id} className="p-3 flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={profile.avatar_url || undefined} />
                                <AvatarFallback>{(displayName?.[0] || 'U').toUpperCase()}</AvatarFallback>
                              </Avatar>

                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{displayName}</p>
                                <p className="text-xs text-muted-foreground truncate">@{profile.username || 'unknown'}</p>
                              </div>

                              <Button size="sm" onClick={() => handleAddCollaborator(profile.user_id)}>
                                Add
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>

            <GlassPanel className="p-6 xl:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">Playlist Discussion</h2>
                <span className="text-sm text-muted-foreground">({comments.length})</span>
              </div>

              {user ? (
                <div className="space-y-3 mb-6">
                  <Textarea
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    placeholder="Share your thoughts about this playlist..."
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handlePostComment} disabled={!newComment.trim() || addComment.isPending} className="gap-2">
                      {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Post Comment
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-4 rounded-lg border border-border/60 bg-muted/30 text-sm text-muted-foreground">
                  Sign in to join the playlist discussion.
                </div>
              )}

              <div className="space-y-4">
                {topLevelComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
                ) : (
                  topLevelComments.map((comment) => {
                    const displayName = comment.profile?.display_name || comment.profile?.username || 'Anonymous';
                    const canDelete = !!user && (user.id === comment.user_id || canModerateComments);
                    const replies = repliesByParent[comment.id] || [];

                    return (
                      <div key={comment.id} className="p-4 rounded-lg border border-border/60 bg-muted/20 space-y-3">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={comment.profile?.avatar_url || undefined} />
                            <AvatarFallback>{(displayName?.[0] || 'A').toUpperCase()}</AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">{displayName}</p>
                              <span className="text-xs text-muted-foreground">
                                {new Date(comment.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm mt-1 whitespace-pre-wrap break-words">{comment.content}</p>

                            <div className="flex items-center gap-2 mt-2">
                              {user && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setOpenReplyFor(openReplyFor === comment.id ? null : comment.id)}
                                >
                                  Reply
                                </Button>
                              )}

                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteComment(comment.id)}
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {openReplyFor === comment.id && user && (
                          <div className="ml-11 space-y-2">
                            <Textarea
                              value={replyDrafts[comment.id] || ''}
                              onChange={(event) => setReplyDrafts((previous) => ({
                                ...previous,
                                [comment.id]: event.target.value,
                              }))}
                              placeholder="Write a reply..."
                              rows={2}
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => setOpenReplyFor(null)}>
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handlePostReply(comment.id)}
                                disabled={!replyDrafts[comment.id]?.trim() || addComment.isPending}
                              >
                                Reply
                              </Button>
                            </div>
                          </div>
                        )}

                        {replies.length > 0 && (
                          <div className="ml-11 space-y-2 pt-2 border-t border-border/50">
                            {replies.map((reply) => {
                              const replyName = reply.profile?.display_name || reply.profile?.username || 'Anonymous';
                              const canDeleteReply = !!user && (user.id === reply.user_id || canModerateComments);

                              return (
                                <div key={reply.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/20">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={reply.profile?.avatar_url || undefined} />
                                    <AvatarFallback>{(replyName?.[0] || 'A').toUpperCase()}</AvatarFallback>
                                  </Avatar>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-semibold truncate">{replyName}</p>
                                      <span className="text-[11px] text-muted-foreground">{new Date(reply.created_at).toLocaleString()}</span>
                                    </div>
                                    <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{reply.content}</p>
                                  </div>

                                  {canDeleteReply && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => handleDeleteComment(reply.id)}
                                    >
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </GlassPanel>
          </div>
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
