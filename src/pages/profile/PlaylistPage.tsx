import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useRemoveFromPlaylist,
  useReorderPlaylistItems,
  useDiscoverPlaylists,
  type DiscoverSort,
} from '@/hooks/user/usePlaylist';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortablePlaylistItem, type PlaylistViewMode } from '@/components/playlist/SortablePlaylistItem';
import { AddMediaToPlaylistDialog } from '@/components/playlist/AddMediaToPlaylistDialog';
import { Progress } from '@/components/ui/progress';
import {
  usePlaylistLikeState,
  useTogglePlaylistLike,
  useIsPlaylistSaved,
  useToggleSavePlaylist,
  useSavedPlaylists,
  usePlaylistProgress,
} from '@/hooks/user/usePlaylistSocial';
import { formatDistanceToNow } from '@/lib/localeFormat';
import {
  CollaboratorRole,
  useAddCollaborator,
  useCanEditPlaylist,
  usePlaylistCollaborators,
  useRemoveCollaborator,
  useUpdateCollaborator
} from '@/hooks/user/usePlaylistCollaboration';
import { Comments } from '@/components/comments/Comments';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, Plus, Music2, Globe, Lock, Play,
  Trash2, Edit2, Share2, GripVertical,
  Loader2, Calendar, Clock, Users, UserPlus, Send, MessageSquare, BookOpen,
  LayoutList, LayoutGrid, Heart, Bookmark, BookmarkCheck, Search, Compass, TrendingUp, X, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type PlaylistMediaKind = 'anime' | 'manga' | 'novel';

function parsePlaylistMediaRef(value: string): { kind: PlaylistMediaKind; id: string } {
  const raw = String(value || '').trim();
  if (raw.toLowerCase().startsWith('novel:')) {
    return { kind: 'novel', id: raw.slice(6) };
  }
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
  if (media.kind === 'novel') {
    return `/novel/${encodeURIComponent(media.id)}`;
  }
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

// Compact card for a saved (followed) playlist
function SavedPlaylistCard({ playlist }: { playlist: Playlist }) {
  useUiTranslation();
  const { data: items = [] } = usePlaylistItems(playlist.id);
  const progress = usePlaylistProgress(items);
  const covers = items.slice(0, 4).map((item) => item.anime_poster).filter(Boolean) as string[];

  return (
    <Link
      to={`/playlist/${playlist.id}`}
      className="group relative flex gap-4 p-4 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm hover:bg-card/80 hover:border-primary/40 transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-muted shadow-md">
        {covers.length > 0 ? (
          <div className={cn(
            'grid w-full h-full transform group-hover:scale-105 transition-transform duration-500',
            covers.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
            covers.length >= 3 && 'grid-rows-2'
          )}>
            {covers.map((img, idx) => (
              <img key={idx} src={getProxiedImageUrl(img)} alt="" className="w-full h-full object-cover" />
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20 group-hover:scale-105 transition-transform duration-500">
            <Music2 className="w-8 h-8 text-muted-foreground/70" />
          </div>
        )}
      </div>

      <div className="relative flex-1 min-w-0 flex flex-col justify-center py-1">
        <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">{playlist.name}</h3>
        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" />
          {playlist.items_count} {playlist.items_count === 1 ? uiI18n.t('app.item_3a7d9767') : uiI18n.t('app.items_7316c8b2')}
        </p>
        <div className="flex items-center gap-3">
          <Progress value={progress.percent} className="h-2 flex-1 bg-background" />
          <span className="text-xs font-semibold text-muted-foreground w-16 text-right">
            {progress.percent}%
          </span>
        </div>
      </div>
    </Link>
  );
}

// Quick helper icon for layers
function Layers(props: any) {
  useUiTranslation();
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 12 12 17 22 12" />
      <polyline points="2 17 12 22 22 17" />
    </svg>
  );
}

export default function PlaylistsPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: playlists = [], isLoading } = usePlaylists();
  const { data: savedPlaylists = [] } = useSavedPlaylists();
  const createPlaylist = useCreatePlaylist();
  const deletePlaylist = useDeletePlaylist();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPublic, setNewPublic] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [discoverInput, setDiscoverInput] = useState('');
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [discoverSort, setDiscoverSort] = useState<DiscoverSort>('trending');
  
  useEffect(() => {
    const t = setTimeout(() => setDiscoverSearch(discoverInput.trim()), 300);
    return () => clearTimeout(t);
  }, [discoverInput]);
  
  const { data: discoverPlaylists = [], isLoading: discoverLoading } = useDiscoverPlaylists({
    search: discoverSearch,
    sort: discoverSort,
  });

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


  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Ambient Top Glow */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/5 via-primary/5 to-transparent pointer-events-none -z-10" />
      
      <Sidebar />

      <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full pb-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                  <Music2 className="w-6 h-6" />
                </div>
                <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight">
                  {user?uiI18n.t('app.my_playlists_f67e00ef'):'Public playlists'}
                </h1>
              </div>
              {user?<p className="text-muted-foreground text-lg ml-1">
                {playlists.length} {playlists.length === 1 ? uiI18n.t('app.collection_2037de43') : uiI18n.t('app.collections_fa4b9d69')} {uiI18n.t('app.crafted_by_you_337389c4')}
              </p>:<p className="text-muted-foreground text-lg">Explore community collections. Sign in to create and save playlists.</p>}
            </div>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild disabled={!user}>
                <Button size="lg" className="gap-2 rounded-full shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                  <Plus className="w-5 h-5" />
                  {uiI18n.t('app.create_playlist_86374904')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-3xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">{uiI18n.t('app.new_playlist_e45051eb')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{uiI18n.t('app.name_709a2322')}</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={uiI18n.t('app.e_g_summer_2024_binge_58a44042')}
                      className="h-12 text-lg bg-muted/50 border-transparent focus-visible:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{uiI18n.t('app.description_optional_388de6fa')}</Label>
                    <Textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder={uiI18n.t('app.what_is_this_collection_about_95b22f5d')}
                      rows={3}
                      className="resize-none bg-muted/50 border-transparent focus-visible:border-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-full", newPublic ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground")}>
                        {newPublic ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                      </div>
                      <div>
                        <Label className="text-base font-semibold cursor-pointer" htmlFor="public-toggle">{uiI18n.t('app.public_visibility_2da7d9f1')}</Label>
                        <p className="text-xs text-muted-foreground">{uiI18n.t('app.allow_others_to_discover_this_playlist_f861ef93')}</p>
                      </div>
                    </div>
                    <Switch
                      id="public-toggle"
                      checked={newPublic}
                      onCheckedChange={setNewPublic}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setShowCreate(false)} className="rounded-full">{uiI18n.t('app.cancel_77dfd213')}</Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!newName.trim() || createPlaylist.isPending}
                    className="rounded-full px-8"
                  >
                    {createPlaylist.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : uiI18n.t('app.create_6e157c5d')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* User's Playlists Grid */}
          {user && (isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="aspect-square bg-muted/50 rounded-2xl animate-pulse" />
                  <div className="h-4 bg-muted/50 rounded-full animate-pulse w-3/4" />
                  <div className="h-3 bg-muted/50 rounded-full animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : playlists.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              <AnimatePresence>
                {playlists.map((playlist, index) => (
                  <motion.div
                    key={playlist.id}
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                  >
                    <PlaylistCard
                      playlist={playlist}
                      onDelete={() => setDeleteId(playlist.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="w-full p-12 text-center rounded-3xl border-2 border-dashed border-border/50 bg-muted/10">
              <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{uiI18n.t('app.it_s_a_little_quiet_here_4e56c2b9')}</h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                {uiI18n.t('app.create_your_first_playlist_to_start_organizing_y_592f3e95')}
              </p>
              <Button onClick={() => user ? setShowCreate(true) : navigate("/auth")} className="gap-2 rounded-full">
                <Plus className="w-5 h-5" />
                {uiI18n.t('app.create_your_first_playlist_2f9f306a')}
              </Button>
            </div>
          ))}

          {/* Saved Playlists */}
          {savedPlaylists.length > 0 && (
            <div className="mt-20">
              <div className="flex items-center gap-3 mb-6 border-b border-border/30 pb-4">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                  <BookmarkCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{uiI18n.t('app.saved_playlists_fb1bd3db')}</h2>
                  <p className="text-sm text-muted-foreground">{savedPlaylists.length} {uiI18n.t('app.collections_from_the_community_cc653348')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {savedPlaylists.map((playlist) => (
                  <SavedPlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </div>
            </div>
          )}

          {/* Discover Section */}
          <div className="mt-24">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 border-b border-border/30 pb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                    <Compass className="w-6 h-6" />
                  </div>
                  <h2 className="font-display text-3xl font-bold tracking-tight">{uiI18n.t('app.discover_4827ea22')}</h2>
                </div>
                <p className="text-muted-foreground">{uiI18n.t('app.explore_public_collections_created_by_the_commun_902f670a')}</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={discoverInput}
                    onChange={(e) => setDiscoverInput(e.target.value)}
                    placeholder={uiI18n.t('app.search_titles_themes_bab3c5e6')}
                    className="pl-10 h-11 rounded-full bg-card/50 backdrop-blur border-border/50 focus-visible:ring-purple-500/30"
                  />
                </div>
                <Select value={discoverSort} onValueChange={(v) => setDiscoverSort(v as DiscoverSort)}>
                  <SelectTrigger className="w-full sm:w-[160px] h-11 rounded-full bg-card/50 backdrop-blur border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="trending" className="rounded-lg cursor-pointer">
                      <span className="flex items-center gap-2 py-1"><TrendingUp className="w-4 h-4 text-orange-500" /> {uiI18n.t('app.trending_8a12d562')}</span>
                    </SelectItem>
                    <SelectItem value="most_liked" className="rounded-lg cursor-pointer">
                      <span className="flex items-center gap-2 py-1"><Heart className="w-4 h-4 text-pink-500" /> {uiI18n.t('app.most_liked_1471ef25')}</span>
                    </SelectItem>
                    <SelectItem value="newest" className="rounded-lg cursor-pointer">
                      <span className="flex items-center gap-2 py-1"><Clock className="w-4 h-4 text-blue-500" /> {uiI18n.t('app.newest_d0442824')}</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {discoverLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-3">
                    <div className="aspect-square bg-muted/50 rounded-2xl animate-pulse" />
                    <div className="h-4 bg-muted/50 rounded-full animate-pulse w-3/4" />
                  </div>
                ))}
              </div>
            ) : discoverPlaylists.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {discoverPlaylists.map((playlist, index) => (
                  <motion.div
                    key={playlist.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.05 }}
                  >
                    <PlaylistCard
                      playlist={playlist}
                      author={playlist.author}
                      showActions={false}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="w-full p-12 text-center rounded-3xl border border-border/40 bg-card/20 backdrop-blur">
                <Compass className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-semibold mb-2">{uiI18n.t('app.no_results_found_658e79f9')}</h3>
                <p className="text-muted-foreground">
                  {discoverSearch ? uiI18n.t('app.try_adjusting_your_search_for_i18n_value_0_4ce4da69', { value0: discoverSearch }) : uiI18n.t('app.no_public_playlists_to_discover_right_now_034dbc46')}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">{uiI18n.t('app.delete_playlist_e480e36f')}</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {uiI18n.t('app.this_will_permanently_delete_this_playlist_and_r_20b68266')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-full">{uiI18n.t('app.cancel_77dfd213')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {uiI18n.t('app.yes_delete_4cf9c973')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileNav />
    </div>
  );
}

export function PlaylistViewPage() {
  useUiTranslation();
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: playlist, isLoading: loadingPlaylist } = usePlaylist(playlistId);
  const { data: items = [], isLoading: loadingItems } = usePlaylistItems(playlistId);
  const { data: canEdit = false } = useCanEditPlaylist(playlistId);
  const { data: collaborators = [] } = usePlaylistCollaborators(playlistId);
  const { data: ownerProfile } = useQuery({
    queryKey: ['playlist_owner_profile', playlist?.user_id],
    queryFn: async () => {
      if (!playlist?.user_id) return null as null | {
        user_id: string;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      };

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
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
  const reorderItems = useReorderPlaylistItems();
  const addCollaborator = useAddCollaborator();
  const updateCollaborator = useUpdateCollaborator();
  const removeCollaborator = useRemoveCollaborator();

  const { data: hasLiked = false } = usePlaylistLikeState(playlistId);
  const toggleLike = useTogglePlaylistLike();
  const { data: isSaved = false } = useIsPlaylistSaved(playlistId);
  const toggleSave = useToggleSavePlaylist();
  const progress = usePlaylistProgress(items);

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
  const [viewMode, setViewMode] = useState<PlaylistViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    return window.localStorage.getItem('tatakai_playlist_view') === 'list' ? 'list' : 'grid';
  });
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [orderedItems, setOrderedItems] = useState(items);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const existingItemRefs = useMemo(() => new Set(items.map((item) => item.anime_id)), [items]);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('tatakai_playlist_view', viewMode);
  }, [viewMode]);

  const handleReorderItems = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !playlist) return;
    const oldIndex = orderedItems.findIndex((item) => item.id === active.id);
    const newIndex = orderedItems.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(next);
    reorderItems.mutate({ playlistId: playlist.id, itemIds: next.map((item) => item.id) });
  };

  const playlistEditDraftStorageKey = useMemo(
    () => getPlaylistEditDraftStorageKey(playlist?.id),
    [playlist?.id]
  );

  const isOwner = !!user && !!playlist && user.id === playlist.user_id;
  const myCollaboratorRole = collaborators.find((collaborator) => collaborator.user_id === user?.id)?.role;
  const canManageCollaborators = isOwner || myCollaboratorRole === 'admin';
  const ownerDisplayName = ownerProfile?.display_name?.trim() || ownerProfile?.username?.trim() || (playlist?.user_id && !isUuidLike(playlist.user_id) ? playlist.user_id : 'Unknown');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedCollaboratorSearch(collaboratorSearch);
    }, PLAYLIST_COLLAB_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
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
      try { window.localStorage.setItem(playlistEditDraftStorageKey, JSON.stringify(payload)); } catch {}
    }, PLAYLIST_EDIT_DRAFT_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [editDesc, editEmbedAllowed, editName, editPublic, editShareDesc, editShareSlug, playlistEditDraftStorageKey, showEdit]);

  const { data: collaboratorSearchResults = [], isFetching: isSearchingCollaborators } = useQuery({
    queryKey: ['playlist-collaborator-search', playlistId, debouncedCollaboratorSearch, collaborators.length],
    enabled: !!playlist && canManageCollaborators && debouncedCollaboratorSearch.trim().length >= 2,
    queryFn: async () => {
      const searchTerm = debouncedCollaboratorSearch.trim();
      if (!searchTerm || !playlist) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(10);
      if (error) throw error;
      const existingUserIds = new Set(collaborators.map((c) => c.user_id));
      existingUserIds.add(playlist.user_id);
      return (data || []).filter((profile) => !existingUserIds.has(profile.user_id));
    },
  });

  const openEdit = () => {
    if (!playlist) return;
    if (!canEdit) return toast.error(uiI18n.t('app.you_do_not_have_edit_access_to_this_playlist_1c85f1c7'));
    
    let resolvedDraft: PlaylistEditDraft = {
      name: playlist.name,
      description: playlist.description || '',
      isPublic: playlist.is_public,
      shareSlug: playlist.share_slug ?? undefined,
      shareDescription: playlist.share_description ?? undefined,
      embedAllowed: !!playlist.embed_allowed,
      savedAt: Date.now(),
    };

    if (playlistEditDraftStorageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(playlistEditDraftStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const savedAt = Number(parsed?.savedAt || 0);
          if (savedAt && Date.now() - savedAt <= PLAYLIST_EDIT_DRAFT_MAX_AGE_MS) {
            resolvedDraft = { ...resolvedDraft, ...parsed };
          } else {
            window.localStorage.removeItem(playlistEditDraftStorageKey);
          }
        }
      } catch {}
    }

    setEditName(resolvedDraft.name);
    setEditDesc(resolvedDraft.description);
    setEditPublic(resolvedDraft.isPublic);
    setEditShareSlug(resolvedDraft.shareSlug);
    setEditShareDesc(resolvedDraft.shareDescription);
    setEditEmbedAllowed(resolvedDraft.embedAllowed);
    setShowEdit(true);
  };

  const handleGenerateSlug = async () => {
    if (!playlist) return;
    const { generateShortSlug } = await import('@/lib/slug');
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateShortSlug(8);
      try {
        await updatePlaylist.mutateAsync({ id: playlist.id, shareSlug: candidate, isPublic: true });
        setEditShareSlug(candidate);
        setEditPublic(true);
        return;
      } catch (err: any) {
        if (err?.message?.includes('23505') || /unique/i.test(err?.message || '')) continue;
        throw err;
      }
    }
    toast.error(uiI18n.t('app.failed_to_generate_a_unique_share_link_try_again_ea9e14f2'));
  };

  const handleUpdate = async () => {
    if (!playlist || !editName.trim()) return;
    if (!canEdit) return toast.error(uiI18n.t('app.you_do_not_have_edit_access_to_this_playlist_1c85f1c7'));
    
    await updatePlaylist.mutateAsync({
      id: playlist.id,
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      isPublic: editPublic,
      shareSlug: editShareSlug,
      shareDescription: editShareDesc,
      embedAllowed: editEmbedAllowed,
    });
    
    if (playlistEditDraftStorageKey && typeof window !== 'undefined') {
      try { window.localStorage.removeItem(playlistEditDraftStorageKey); } catch {}
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
    if (!canEdit) return toast.error(uiI18n.t('app.you_do_not_have_permission_to_edit_this_playlist_7578ae12'));
    await removeFromPlaylist.mutateAsync({ playlistId: playlist.id, animeId });
  };

  const handleLaunchWatchRoom = (animeId: string, animeName: string, animePoster?: string | null) => {
    const media = parsePlaylistMediaRef(animeId);
    if (media.kind !== 'anime' || !media.id) return toast.error(uiI18n.t('app.watch_rooms_currently_support_anime_items_only_79dec5ac'));
    const params = new URLSearchParams({ anime: media.id, title: animeName });
    if (animePoster) params.set('poster', animePoster);
    navigate(`/isshoni?${params.toString()}`);
  };

  const handleAddCollaborator = async (targetUserId: string) => {
    if (!playlist) return;
    await addCollaborator.mutateAsync({ playlistId: playlist.id, userId: targetUserId, role: newCollaboratorRole });
    setCollaboratorSearch('');
  };

  if (loadingPlaylist) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-medium animate-pulse">{uiI18n.t('app.loading_playlist_4c5c7814')}</p>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full flex items-center justify-center min-h-[80vh]">
          <GlassPanel className="max-w-md mx-auto p-10 text-center rounded-3xl">
            <Music2 className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h1 className="text-2xl font-bold mb-2">{uiI18n.t('app.playlist_not_found_38ca712b')}</h1>
            <p className="text-muted-foreground mb-8">{uiI18n.t('app.this_playlist_might_be_private_deleted_or_the_li_44e8030b')}</p>
            <Button size="lg" className="rounded-full" onClick={() => navigate('/playlists')}>{uiI18n.t('app.return_to_playlists_724a13bf')}</Button>
          </GlassPanel>
        </main>
        <MobileNav />
      </div>
    );
  }

  const coverImages = items.slice(0, 4).map(item => item.anime_poster).filter(Boolean) as string[];
  const heroBgImage = coverImages[0] ? getProxiedImageUrl(coverImages[0]) : null;
  const firstItem = items[0];
  const firstItemMedia = firstItem ? parsePlaylistMediaRef(firstItem.anime_id) : null;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {playlist && (
        <Seo
          title={playlist.name || uiI18n.t('app.playlist_cd95b41f')}
          description={playlist.share_description || playlist.description || uiI18n.t('app.a_playlist_with_i18n_value_0_titles_on_tatakai_d1560bb7', { value0: playlist.items_count ?? items.length })}
          image={coverImages[0] || undefined}
          canonicalPath={`/p/${playlist.share_slug || playlist.id}`}
          kind="website"
          suffix=" — Tatakai Playlist"
        />
      )}

      {/* Immersive Hero Background */}
      {heroBgImage && (
        <div className="absolute top-0 left-0 w-full h-[60vh] md:h-[500px] pointer-events-none -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-background/80 dark:bg-background/90 z-10 backdrop-blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background z-10" />
          <img src={heroBgImage} alt="" className="w-full h-full object-cover scale-110 opacity-60 dark:opacity-40 blur-2xl" />
        </div>
      )}

      <Sidebar />

      <main className="relative z-10 pl-0 md:pl-20 lg:pl-24 w-full pb-32">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
          
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors w-fit px-3 py-1.5 rounded-full hover:bg-muted/50"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            {uiI18n.t('app.back_b52b36b7')}
          </button>

          {/* Hero Content */}
          <div className="flex flex-col md:flex-row gap-8 md:gap-12 mb-16">
            
            {/* Playlist Cover Art */}
            <div className="w-48 h-48 sm:w-64 sm:h-64 md:w-72 md:h-72 flex-shrink-0 mx-auto md:mx-0">
              <div className="w-full h-full rounded-2xl md:rounded-3xl overflow-hidden bg-muted shadow-2xl shadow-black/20 dark:shadow-black/50 border border-white/10 dark:border-white/5 relative group">
                <div className="absolute inset-0 ring-1 ring-inset ring-black/10 dark:ring-white/10 rounded-2xl md:rounded-3xl z-10 pointer-events-none" />
                {coverImages.length > 0 ? (
                  <div className={cn(
                    "grid w-full h-full",
                    coverImages.length === 1 && "grid-cols-1",
                    coverImages.length === 2 && "grid-cols-2",
                    coverImages.length >= 3 && "grid-cols-2 grid-rows-2"
                  )}>
                    {coverImages.map((img, idx) => (
                      <img key={idx} src={getProxiedImageUrl(img)} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
                    <Music2 className="w-24 h-24 text-muted-foreground/50" />
                  </div>
                )}
              </div>
            </div>

            {/* Playlist Info */}
            <div className="flex-1 flex flex-col justify-end text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
                <span className="px-3 py-1 rounded-full bg-background/50 backdrop-blur-md border border-border/50 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  {playlist.is_public ? <Globe className="w-3.5 h-3.5 text-green-500" /> : <Lock className="w-3.5 h-3.5 text-amber-500" />}
                  {playlist.is_public ? uiI18n.t('app.public_dc5eb704') : uiI18n.t('app.private_237dfa0a')}
                </span>
                <span className="px-3 py-1 rounded-full bg-background/50 backdrop-blur-md border border-border/50 text-xs font-semibold uppercase tracking-wider">
                  {uiI18n.t('app.playlist_cd95b41f')}
                </span>
                {ownerDisplayName && (
                  <span className="px-3 py-1 rounded-full bg-background/50 backdrop-blur-md border border-border/50 text-xs font-semibold flex items-center gap-2">
                    <Avatar className="w-4 h-4 border border-border">
                      <AvatarImage src={ownerProfile?.avatar_url || undefined} />
                      <AvatarFallback className="text-[8px]">{ownerDisplayName[0]}</AvatarFallback>
                    </Avatar>
                    {ownerDisplayName}
                  </span>
                )}
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-4 tracking-tight leading-tight">
                {playlist.name}
              </h1>

              {playlist.description && (
                <p className="text-muted-foreground text-lg mb-6 max-w-2xl mx-auto md:mx-0 line-clamp-3">
                  {playlist.description}
                </p>
              )}

              <div className="text-sm text-muted-foreground font-medium flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 mb-8">
                <span className="text-foreground">{playlist.items_count} {uiI18n.t('app.items_7316c8b2')}</span>
                <span className="hidden sm:inline text-border">•</span>
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {uiI18n.t('app.created_accf40c8')} {new Date(playlist.created_at).getFullYear()}</span>
                <span className="hidden sm:inline text-border">•</span>
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {uiI18n.t('app.updated_f2f8570d')} {formatDistanceToNow(new Date(playlist.updated_at))} {uiI18n.t('app.ago_f03c0a59')}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                {firstItem && (
                  <Button
                    size="lg"
                    className="gap-2 rounded-full font-bold shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
                    onClick={() => navigate(getPlaylistItemHref(firstItem.anime_id))}
                  >
                    {firstItemMedia?.kind === 'manga' ? <BookOpen className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    {uiI18n.t('app.play_5d12bd53')}
                  </Button>
                )}

                {firstItem && firstItemMedia?.kind === 'anime' && (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="gap-2 rounded-full font-semibold hover:bg-secondary/80"
                    onClick={() => handleLaunchWatchRoom(firstItem.anime_id, firstItem.anime_name, firstItem.anime_poster)}
                  >
                    <Users className="w-5 h-5" />
                    {uiI18n.t('app.watch_party_0c134c5e')}
                  </Button>
                )}

                {/* Secondary Actions Row */}
                <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-2 p-1.5 bg-muted/40 rounded-full border border-border/40 backdrop-blur-sm">
                  {user && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full w-10 h-10 hover:bg-background/80 hover:text-pink-500 transition-colors"
                      onClick={() => toggleLike.mutate({ playlistId: playlist.id, liked: hasLiked })}
                    >
                      <Heart className={cn('w-5 h-5 transition-transform', hasLiked && 'fill-pink-500 text-pink-500 scale-110')} />
                    </Button>
                  )}

                  {user && !isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full w-10 h-10 hover:bg-background/80 hover:text-blue-500 transition-colors"
                      onClick={() => toggleSave.mutate({ playlistId: playlist.id, saved: isSaved })}
                    >
                      {isSaved ? <BookmarkCheck className="w-5 h-5 text-blue-500" /> : <Bookmark className="w-5 h-5" />}
                    </Button>
                  )}

                  {playlist.is_public && (
                    <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${playlist.share_slug || playlist.id}`); toast.success(uiI18n.t('app.link_copied_88fe9d21')); }} className="rounded-full w-10 h-10 hover:bg-background/80">
                      <Share2 className="w-4 h-4" />
                    </Button>
                  )}

                  {(canManageCollaborators || collaborators.length > 0) && (
                    <Button variant="ghost" size="icon" onClick={() => setShowCollaborators(true)} className="rounded-full w-10 h-10 hover:bg-background/80 relative">
                      <Users className="w-4 h-4" />
                      {collaborators.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                          {collaborators.length}
                        </span>
                      )}
                    </Button>
                  )}

                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={openEdit} className="rounded-full w-10 h-10 hover:bg-background/80">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  )}
                  
                  {isOwner && (
                    <Button variant="ghost" size="icon" onClick={() => setShowDelete(true)} className="rounded-full w-10 h-10 hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Bar (if saved) */}
              {user && isSaved && items.length > 0 && (
                <div className="mt-8 max-w-sm mx-auto md:mx-0 p-4 rounded-2xl bg-muted/30 border border-border/40 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-sm mb-2 font-medium">
                    <span className="flex items-center gap-2">
                      <BookmarkCheck className="w-4 h-4 text-blue-500" />
                      {uiI18n.t('app.completion_2ff25568')}
                    </span>
                    <span>{progress.percent}%</span>
                  </div>
                  <Progress value={progress.percent} className="h-2 bg-background" />
                </div>
              )}
            </div>
          </div>

          {/* Items Section */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-tight">{uiI18n.t('app.content_4f9be057')}</h2>
              
              <div className="flex items-center gap-3">
                {canEdit && (
                  <Button size="sm" onClick={() => setShowAddMedia(true)} className="gap-2 rounded-full">
                    <Plus className="w-4 h-4" />
                    {uiI18n.t('app.add_media_ac5a720f')}
                  </Button>
                )}
                
                <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/40 backdrop-blur-sm">
                  <button
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'p-2 rounded-lg transition-all duration-200',
                      viewMode === 'list' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LayoutList className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'p-2 rounded-lg transition-all duration-200',
                      viewMode === 'grid' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {loadingItems ? (
              <div className={cn(viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" : "space-y-3")}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={cn("bg-muted/40 animate-pulse rounded-2xl", viewMode === 'grid' ? "aspect-[2/3]" : "h-24")} />
                ))}
              </div>
            ) : orderedItems.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorderItems}>
                <SortableContext items={orderedItems.map((item) => item.id)} strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
                  <div className={cn(
                    viewMode === 'grid'
                      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6'
                      : 'flex flex-col gap-3'
                  )}>
                    {orderedItems.map((item, index) => (
                      <SortablePlaylistItem
                        key={item.id}
                        item={item}
                        index={index}
                        viewMode={viewMode}
                        canEdit={canEdit}
                        mediaKind={parsePlaylistMediaRef(item.anime_id).kind}
                        href={getPlaylistItemHref(item.anime_id)}
                        onRemove={handleRemoveItem}
                        onLaunchWatchRoom={handleLaunchWatchRoom}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="w-full py-20 text-center rounded-[2rem] border-2 border-dashed border-border/40 bg-muted/10">
                <div className="w-20 h-20 bg-muted/40 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold mb-2">{uiI18n.t('app.this_collection_is_empty_5d21e262')}</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  {canEdit ? uiI18n.t('app.start_building_your_playlist_by_adding_your_favo_cb2ba3f1') : uiI18n.t('app.the_owner_hasn_t_added_any_items_to_this_playlis_46105bd5')}
                </p>
                {canEdit && (
                  <Button size="lg" onClick={() => setShowAddMedia(true)} className="gap-2 rounded-full">
                    <Plus className="w-5 h-5" />
                    {uiI18n.t('app.add_first_item_6739a1c2')}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Discussion Section */}
          <div className="mt-16 pt-8 border-t border-border/20">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{uiI18n.t('app.discussion_8fb937b6')}</h2>
            </div>
            <div className="bg-card/30 border border-border/40 rounded-3xl p-6 sm:p-8 backdrop-blur-sm">
              <Comments entityType="playlist" entityId={playlist.id} entityName={playlist.name} />
            </div>
          </div>
        </div>
      </main>

      {/* Dialogs and Modals (Edit, Delete, Add Media, Collaborators) remain structurally the same but styled better */}
      
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl">{uiI18n.t('app.edit_playlist_99909470')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">{uiI18n.t('app.playlist_name_26f3e33f')}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-12 bg-muted/50 border-none" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">{uiI18n.t('app.description_55f8ebc8')}</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} className="bg-muted/50 border-none resize-none" />
            </div>

            <div className="grid gap-4 p-5 bg-muted/30 rounded-2xl border border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">{uiI18n.t('app.public_access_678731c9')}</Label>
                  <p className="text-sm text-muted-foreground">{uiI18n.t('app.anyone_can_view_this_playlist_18fc6fee')}</p>
                </div>
                <Switch checked={editPublic} onCheckedChange={async (val) => { setEditPublic(val); if (val && !editShareSlug) await handleGenerateSlug(); }} />
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div>
                  <Label className="text-base font-semibold">{uiI18n.t('app.allow_embedding_d01bd45a')}</Label>
                  <p className="text-sm text-muted-foreground">{uiI18n.t('app.allow_others_to_embed_this_on_their_sites_08a50e75')}</p>
                </div>
                <Switch checked={editEmbedAllowed} onCheckedChange={setEditEmbedAllowed} />
              </div>
            </div>

            {editPublic && (
              <div className="space-y-3">
                <Label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">{uiI18n.t('app.share_link_ef050958')}</Label>
                <div className="flex items-center gap-2">
                  <Input value={editShareSlug ? `${window.location.origin}/p/${editShareSlug}` : ''} readOnly placeholder={uiI18n.t('app.no_link_generated_5e54909c')} className="bg-muted/50 border-none text-muted-foreground" />
                  <Button variant="secondary" onClick={handleGenerateSlug} className="shrink-0"><GripVertical className="w-4 h-4 mr-2"/> {uiI18n.t('app.generate_fc45f9b7')}</Button>
                  {editShareSlug && (
                    <Button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${editShareSlug}`); toast.success(uiI18n.t('app.link_copied_c2e98476')); }} className="shrink-0">
                      {uiI18n.t('app.copy_af74f7c5')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEdit(false)} className="rounded-full">{uiI18n.t('app.cancel_77dfd213')}</Button>
            <Button onClick={handleUpdate} disabled={!editName.trim() || updatePlaylist.isPending} className="rounded-full px-8">
              {updatePlaylist.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : uiI18n.t('app.save_changes_fa2984b3')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> {uiI18n.t('app.delete_playlist_3163212e')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base pt-2">
              {uiI18n.t('app.are_you_absolutely_sure_this_will_permanently_de_500d55d9')} <strong>{playlist.name}</strong> {uiI18n.t('app.and_all_its_content_this_action_cannot_be_revers_ade928bd')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-full">{uiI18n.t('app.keep_playlist_d5b250d3')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {uiI18n.t('app.yes_delete_it_710a239c')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Media Dialog uses existing component, just ensure it inherits styles properly if possible */}
      {canEdit && (
        <AddMediaToPlaylistDialog
          playlistId={playlist.id}
          existingRefs={existingItemRefs}
          open={showAddMedia}
          onOpenChange={setShowAddMedia}
        />
      )}

      {/* Collaborators Modal - styled up */}
      {showCollaborators && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md" onClick={() => setShowCollaborators(false)}>
          <div className="w-full max-w-md bg-card border border-border shadow-2xl rounded-[2rem] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> {uiI18n.t('app.collaborators_6eb695e5')}</h2>
                <Button variant="ghost" size="icon" className="rounded-full bg-muted/50 hover:bg-muted" onClick={() => setShowCollaborators(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {/* Owner Row */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-background">
                      <AvatarImage src={ownerProfile?.avatar_url || undefined} />
                      <AvatarFallback>{(ownerDisplayName?.[0] || 'O').toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold">{ownerDisplayName}</p>
                      <p className="text-xs text-muted-foreground">@{ownerProfile?.username || uiI18n.t('app.owner_579233b2')}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-[10px] uppercase font-bold tracking-wider">{uiI18n.t('app.owner_89ff3122')}</span>
                </div>

                {collaborators.map((collaborator) => {
                  const displayName = collaborator.profile?.display_name || collaborator.profile?.username || collaborator.user_id;
                  return (
                    <div key={collaborator.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={collaborator.profile?.avatar_url || undefined} />
                          <AvatarFallback>{(displayName?.[0] || 'U').toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">@{collaborator.profile?.username || uiI18n.t('app.unknown_50d8b4a9')}</p>
                        </div>
                      </div>

                      {canManageCollaborators ? (
                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <ThemedSelect
                            value={collaborator.role}
                            onChange={(e) => handleUpdateCollaboratorRole(collaborator.id, e.target.value as CollaboratorRole)}
                            className="h-8 rounded-lg bg-background border border-border text-xs font-medium px-2 outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="viewer">{uiI18n.t('app.viewer_dbad9f12')}</option>
                            <option value="editor">{uiI18n.t('app.editor_c7e9fb2e')}</option>
                            <option value="admin">{uiI18n.t('app.admin_4e7afebc')}</option>
                          </ThemedSelect>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemoveCollaborator(collaborator.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-[10px] uppercase font-bold tracking-wider">{collaborator.role}</span>
                      )}
                    </div>
                  );
                })}
                {collaborators.length === 0 && <p className="text-sm text-center py-4 text-muted-foreground">{uiI18n.t('app.no_collaborators_added_yet_1edbfbf2')}</p>}
              </div>

              {canManageCollaborators && (
                <div className="mt-6 pt-6 border-t border-border/50">
                  <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-3 block">{uiI18n.t('app.add_collaborator_b363c6da')}</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={collaboratorSearch}
                        onChange={(e) => setCollaboratorSearch(e.target.value)}
                        placeholder={uiI18n.t('app.search_users_8cdc4c09')}
                        className="pl-9 h-10 bg-muted/50 border-transparent focus-visible:border-primary rounded-xl"
                      />
                    </div>
                    <ThemedSelect
                      value={newCollaboratorRole}
                      onChange={(e) => setNewCollaboratorRole(e.target.value as CollaboratorRole)}
                      className="h-10 rounded-xl bg-muted/50 border-transparent px-3 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="viewer">{uiI18n.t('app.viewer_dbad9f12')}</option>
                      <option value="editor">{uiI18n.t('app.editor_c7e9fb2e')}</option>
                      <option value="admin">{uiI18n.t('app.admin_4e7afebc')}</option>
                    </ThemedSelect>
                  </div>

                  {collaboratorSearch.trim().length >= 2 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-border/50 bg-background shadow-lg absolute w-[calc(100%-3rem)] z-10 custom-scrollbar">
                      {isSearchingCollaborators ? (
                        <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                        </div>
                      ) : collaboratorSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">{uiI18n.t('app.no_users_found_e611ef57')}</div>
                      ) : (
                        collaboratorSearchResults.map((profile) => (
                          <div key={profile.user_id} className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 cursor-pointer" onClick={() => handleAddCollaborator(profile.user_id)}>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8"><AvatarImage src={profile.avatar_url || undefined} /><AvatarFallback>U</AvatarFallback></Avatar>
                              <div>
                                <p className="text-sm font-semibold">{profile.display_name || profile.username}</p>
                                <p className="text-xs text-muted-foreground">@{profile.username}</p>
                              </div>
                            </div>
                            <Plus className="w-4 h-4 text-primary" />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <MobileNav />
    </div>
  );
}