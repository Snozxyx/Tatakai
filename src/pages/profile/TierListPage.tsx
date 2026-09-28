import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TierListEditor } from '@/components/tierlist/TierListEditor';
import { TierListGrid } from '@/components/tierlist/TierListCard';
import { Comments } from '@/components/comments/Comments';
import { Seo } from '@/components/seo/Seo';
import { useAuth } from '@/contexts/AuthContext';
import { useUserTierLists, usePublicTierLists, useTierListByShareCode, useDeleteTierList, DEFAULT_TIERS } from '@/hooks/user/useTierLists';
import {
  useAddTierListCollaborator,
  useRemoveTierListCollaborator,
  useTierListAccess,
  useTierListCollaborators,
  useUpdateTierListCollaboratorRole,
  TierCollaboratorRole
} from '@/hooks/user/useTierListCollaboration';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, User, Trash2, Edit, Share2, Heart, Eye, Globe, Lock, Users, UserPlus, Layers, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

// Helper function to resolve item type & link target reliably
function getItemDetails(item: any) {
  const rawId = String(item.anime_id || item.id || '');
  const itemType = String(item.type || item.item_type || item.media_type || '').toLowerCase();
  const image = String(item.anime_image || item.image || item.poster || '');

  // Legacy items were saved as a bare numeric id with no type marker, so a
  // character is indistinguishable from an anime by id alone. AniList serves
  // character art from /anilistcdn/character/... and anime/manga covers from
  // /anilistcdn/media/... — use that to classify older rows.
  const imageLooksLikeCharacter = /\/character\//i.test(image);

  const isCharacter =
    itemType === 'character' ||
    itemType === 'char' ||
    /^(char[-_:/]|character[-_:/])/i.test(rawId) ||
    imageLooksLikeCharacter;

  const isManga =
    !isCharacter && (
      itemType === 'manga' ||
      /^(manga[-_:/])/i.test(rawId)
    );

  const cleanCharId = rawId.replace(/^(char[-_:/]|character[-_:/])/i, '');
  const cleanMangaId = rawId.replace(/^manga[-_:/]/i, '');
  const title = item.anime_title || item.title || item.name || '';

  let linkTo = `/anime/${rawId}`;
  if (isCharacter) {
    linkTo = `/char/${encodeURIComponent(cleanCharId)}?name=${encodeURIComponent(title)}`;
  } else if (isManga) {
    linkTo = `/manga/${encodeURIComponent(cleanMangaId)}`;
  }

  return { isCharacter, isManga, linkTo, title };
}

// Main Tier Lists page - list all public tier lists + user's own
export default function TierListPage() {
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const { user } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTierList, setEditingTierList] = useState<any>(null);

  const { data: userTierLists = [], isLoading: loadingUser } = useUserTierLists(user?.id);
  const { data: publicTierLists = [], isLoading: loadingPublic } = usePublicTierLists();

  const handleCreate = () => {
    setEditingTierList(null);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingTierList(null);
  };

  if (showEditor) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Background />
        <Sidebar />

        <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6`}>
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseEditor}
              className="rounded-full gap-2 text-muted-foreground hover:text-foreground hover:bg-card/40"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {editingTierList ? 'Edit Tier List' : 'Create Tier List'}
            </h1>
            <p className="text-muted-foreground text-base">Rank, reorganize, and refine your anime tier lists.</p>
          </div>

          <TierListEditor
            initialData={editingTierList}
            onClose={handleCloseEditor}
          />
        </main>

        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6`}>
        {/* Navigation Bar */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="rounded-full gap-2 text-muted-foreground hover:text-foreground hover:bg-card/40"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Tier Lists
            </h1>
            <p className="text-muted-foreground text-base">Explore community rankings or publish your own custom tiers.</p>
          </div>
          {user && (
            <Button 
              onClick={handleCreate} 
              className="rounded-full gap-2 px-6 h-11 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Create Tier List
            </Button>
          )}
        </div>

        <Tabs defaultValue={user ? "my-lists" : "community"} className="space-y-6">
          <TabsList className="bg-card/30 backdrop-blur-xl border border-border/40 p-1.5 rounded-full inline-flex">
            {user && (
              <TabsTrigger 
                value="my-lists" 
                className="rounded-full px-5 py-2 text-sm gap-2 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                <User className="w-4 h-4" />
                My Lists
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="community" 
              className="rounded-full px-5 py-2 text-sm gap-2 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <Globe className="w-4 h-4" />
              Community
            </TabsTrigger>
          </TabsList>

          {user && (
            <TabsContent value="my-lists">
              {loadingUser ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span className="text-sm font-medium">Fetching your tier lists...</span>
                </div>
              ) : userTierLists.length === 0 ? (
                <div className="w-full flex flex-col items-center justify-center py-24 px-4 text-center bg-card/10 backdrop-blur-sm border border-dashed border-border/50 rounded-[2rem]">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
                    <Layers className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">No Tier Lists Yet</h3>
                  <p className="text-muted-foreground max-w-sm mb-6 text-sm">
                    Create custom rankings for your favorite anime, characters, or manga series.
                  </p>
                  <Button onClick={handleCreate} className="rounded-full gap-2 px-6 h-11">
                    <Plus className="w-4 h-4" />
                    Create Your First Tier List
                  </Button>
                </div>
              ) : (
                <TierListGrid
                  tierLists={userTierLists}
                  showAuthor={false}
                />
              )}
            </TabsContent>
          )}

          <TabsContent value="community">
            {loadingPublic ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="text-sm font-medium">Loading community tier lists...</span>
              </div>
            ) : (
              <TierListGrid
                tierLists={publicTierLists}
                emptyMessage="No community tier lists found."
              />
            )}
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav />
    </div>
  );
}

// View a single tier list by share code
export function TierListViewPage() {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const { user } = useAuth();
  const { data: tierList, isLoading, error } = useTierListByShareCode(shareCode || '');
  const { data: tierListAccess } = useTierListAccess(tierList?.id);
  const { data: collaborators = [] } = useTierListCollaborators(tierList?.id);
  const deleteMutation = useDeleteTierList();
  const addCollaborator = useAddTierListCollaborator();
  const updateCollaboratorRole = useUpdateTierListCollaboratorRole();
  const removeCollaborator = useRemoveTierListCollaborator();
  const confirm = useConfirm();

  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<TierCollaboratorRole>('editor');
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);

  const canEdit = user?.id === tierList?.user_id || !!tierListAccess?.canEdit;
  const canManageCollaborators = user?.id === tierList?.user_id || !!tierListAccess?.canManage;

  const { data: collaboratorSearchResults = [] } = useQuery({
    queryKey: ['tier-list-collaborator-search', tierList?.id, collaboratorSearch, collaborators.length],
    enabled: !!tierList && canManageCollaborators && collaboratorSearch.trim().length >= 2,
    queryFn: async () => {
      if (!tierList) return [] as Array<{
        user_id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }>;

      const searchTerm = collaboratorSearch.trim();
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(10);

      if (error) throw error;

      const existingUserIds = new Set(collaborators.map((collaborator) => collaborator.user_id));
      existingUserIds.add(tierList.user_id);

      return (data || []).filter((profile) => !existingUserIds.has(profile.user_id));
    },
  });

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

  const handleDelete = async () => {
    if (!tierList || !(await confirm({ title: 'Are you sure you want to delete this tier list?', destructive: true }))) return;

    try {
      await deleteMutation.mutateAsync(tierList.id);
      toast.success('Tier list deleted');
      navigate('/tierlists');
    } catch {
      toast.error('Failed to delete tier list');
    }
  };

  const handleAddCollaborator = async (userId: string) => {
    if (!tierList) return;

    await addCollaborator.mutateAsync({
      tierListId: tierList.id,
      userId,
      role: newCollaboratorRole,
    });

    setCollaboratorSearch('');
  };

  const handleUpdateCollaboratorRole = async (collaboratorId: string, role: TierCollaboratorRole) => {
    if (!tierList) return;

    await updateCollaboratorRole.mutateAsync({
      tierListId: tierList.id,
      collaboratorId,
      role,
    });
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!tierList) return;

    await removeCollaborator.mutateAsync({
      tierListId: tierList.id,
      collaboratorId,
    });
  };

  const handleWatchWithFriends = (item: any) => {
    const { isCharacter, isManga, title } = getItemDetails(item);
    
    if (isCharacter || isManga) {
      toast.info('Watch rooms can only be launched for anime entries');
      return;
    }

    const params = new URLSearchParams({
      anime: String(item.anime_id),
      title: title,
    });

    if (item.anime_image) {
      params.set('poster', item.anime_image);
    }

    navigate(`/isshoni?${params.toString()}`);
  };

  const isOwner = user?.id === tierList?.user_id;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm font-medium">Loading tier list...</span>
        </div>
      </div>
    );
  }

  if (error || !tierList) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card/20 backdrop-blur-xl border border-border/40 p-8 rounded-[2rem] text-center max-w-md w-full shadow-2xl">
          <div className="w-12 h-12 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold mb-2">Tier List Unavailable</h2>
          <p className="text-muted-foreground text-sm mb-6">
            This tier list might be private or may have been deleted.
          </p>
          <Button onClick={() => navigate('/tierlists')} className="rounded-full px-6 w-full">
            Browse Tier Lists
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6`}>
        {/* Navigation Bar */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="rounded-full gap-2 text-muted-foreground hover:text-foreground hover:bg-card/40"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>
        </div>

        {/* Tier List Card Header */}
        {tierList && (
          <Seo
            title={tierList.name || (tierList as any).title || 'Tier List'}
            description={tierList.description || `A tier list by ${tierList.profiles?.display_name || tierList.profiles?.username || 'a Tatakai member'}.`}
            canonicalPath={`/tierlist/${shareCode}`}
            kind="website"
            suffix=" — Tatakai Tier List"
          />
        )}
        <div className="bg-card/20 backdrop-blur-xl border border-border/40 p-6 md:p-8 rounded-[2rem] mb-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-white/5 text-xs font-semibold text-muted-foreground">
                {tierList.is_public ? (
                  <>
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Public Tier List</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Private Tier List</span>
                  </>
                )}
              </div>

              <h1 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight">
                {tierList.name}
              </h1>

              {tierList.description && (
                <p className="text-muted-foreground text-base leading-relaxed">
                  {tierList.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Collaborators Modal Icon Trigger */}
              {(canManageCollaborators || collaborators.length > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCollaboratorsModal(true)}
                  className="rounded-full gap-2 bg-card/30 border-border/50 hover:bg-card/60 backdrop-blur-md relative"
                  title="Manage Collaborators"
                >
                  <Users className="w-4 h-4 text-primary" />
                  <span>Collaborators</span>
                  {collaborators.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold">
                      {collaborators.length}
                    </span>
                  )}
                </Button>
              )}

              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleShare} 
                className="rounded-full gap-2 bg-card/30 border-border/50 hover:bg-card/60 backdrop-blur-md"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </Button>

              {canEdit && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate(`/tierlists/edit/${tierList.id}`)} 
                  className="rounded-full gap-2 bg-card/30 border-border/50 hover:bg-card/60 backdrop-blur-md"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit</span>
                </Button>
              )}

              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="rounded-full gap-2 bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 backdrop-blur-md"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </Button>
              )}
            </div>
          </div>

          {/* Author Meta */}
          {tierList.profiles && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8 pt-6 border-t border-border/30">
              <Link
                to={`/user/${tierList.profiles.username}`}
                className="flex items-center gap-3 group"
              >
                <Avatar className="w-10 h-10 ring-2 ring-primary/20">
                  <AvatarImage src={tierList.profiles.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                    {tierList.profiles.username || tierList.profiles.display_name || 'Anonymous'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(tierList.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>

              <div className="flex items-center gap-5 text-xs font-medium text-muted-foreground bg-muted/20 px-4 py-2 rounded-full border border-white/5 self-start sm:self-auto">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  {tierList.views_count || 0} views
                </span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span className="flex items-center gap-1.5">
                  <Heart className={cn("w-4 h-4", tierList.user_liked && "text-rose-500 fill-current")} />
                  {tierList.likes_count || 0} likes
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Collaborators Pop-up Modal */}
        {showCollaboratorsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div 
              className="fixed inset-0" 
              onClick={() => setShowCollaboratorsModal(false)} 
            />
            
            <GlassPanel className="relative z-10 w-full max-w-lg p-6 rounded-[2rem] border-border/40 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-lg">Manage Collaborators</h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCollaboratorsModal(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Existing Collaborators */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Current Collaborators
                </p>

                {collaborators.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-2">No collaborators added yet.</p>
                ) : (
                  collaborators.map((collaborator) => {
                    const displayName = collaborator.profile?.display_name || collaborator.profile?.username || collaborator.user_id;

                    return (
                      <div key={collaborator.id} className="p-3.5 rounded-2xl bg-card/40 border border-border/40 flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={collaborator.profile?.avatar_url || undefined} />
                          <AvatarFallback>{(displayName?.[0] || 'U').toUpperCase()}</AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">@{collaborator.profile?.username || 'unknown'}</p>
                        </div>

                        {canManageCollaborators ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={collaborator.role}
                              onChange={(event) => handleUpdateCollaboratorRole(collaborator.id, event.target.value as TierCollaboratorRole)}
                              className="h-8 rounded-full border border-border/60 bg-background/80 px-3 text-xs font-medium focus:ring-1 focus:ring-primary"
                            >
                              <option value="viewer">viewer</option>
                              <option value="editor">editor</option>
                              <option value="owner">owner</option>
                            </select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                              onClick={() => handleRemoveCollaborator(collaborator.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
                            {collaborator.role}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add New Collaborators */}
              {canManageCollaborators && (
                <div className="pt-4 border-t border-border/30 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <UserPlus className="w-4 h-4 text-primary" />
                    Add New Collaborator
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={collaboratorSearch}
                      onChange={(event) => setCollaboratorSearch(event.target.value)}
                      placeholder="Search username or display name..."
                      className="rounded-full bg-background/50 border-border/50"
                    />
                    <select
                      value={newCollaboratorRole}
                      onChange={(event) => setNewCollaboratorRole(event.target.value as TierCollaboratorRole)}
                      className="h-10 rounded-full border border-border/50 bg-background/50 px-3 text-sm font-medium focus:ring-1 focus:ring-primary"
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="owner">owner</option>
                    </select>
                  </div>

                  {collaboratorSearch.trim().length >= 2 && (
                    <div className="max-h-44 overflow-y-auto rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md divide-y divide-border/30">
                      {collaboratorSearchResults.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3.5 text-center">No matching users found.</p>
                      ) : (
                        collaboratorSearchResults.map((profile) => {
                          const displayName = profile.display_name || profile.username || profile.user_id;

                          return (
                            <div key={profile.user_id} className="p-3 flex items-center gap-3 hover:bg-card/80 transition-colors">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={profile.avatar_url || undefined} />
                                <AvatarFallback>{(displayName?.[0] || 'U').toUpperCase()}</AvatarFallback>
                              </Avatar>

                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{displayName}</p>
                                <p className="text-xs text-muted-foreground truncate">@{profile.username || 'unknown'}</p>
                              </div>

                              <Button size="sm" onClick={() => handleAddCollaborator(profile.user_id)} className="rounded-full px-4 h-8 text-xs">
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
          </div>
        )}

        {/* Tier List Grid Display */}
        <div className="space-y-3">
          {DEFAULT_TIERS.map(tier => {
            const tierItems = tierList.items.filter(i => i.tier === tier.name);
            return (
              <div 
                key={tier.name} 
                className="flex border border-border/40 rounded-2xl overflow-hidden bg-card/20 backdrop-blur-xl shadow-lg min-h-[96px]"
              >
                {/* Tier Color Label */}
                <div
                  className="w-20 md:w-28 flex-shrink-0 flex items-center justify-center font-black text-2xl md:text-4xl shadow-inner relative"
                  style={{ 
                    backgroundColor: tier.color, 
                    color: 'rgba(255,255,255,0.95)',
                    textShadow: '0 2px 6px rgba(0,0,0,0.35)'
                  }}
                >
                  {tier.name}
                </div>

                {/* Tier Content Grid */}
                <div className="flex-1 p-3 flex flex-wrap items-center gap-2.5">
                  {tierItems.map(item => {
                    const { isCharacter, isManga, linkTo, title } = getItemDetails(item);

                    return (
                      <div 
                        key={item.anime_id} 
                        className="group relative w-16 h-24 md:w-20 md:h-28 rounded-xl overflow-hidden bg-background/50 shadow-md border border-white/10 hover:border-primary/50 transition-all duration-300"
                      >
                        <Link to={linkTo} className="block w-full h-full">
                          <img
                            src={item.anime_image}
                            alt={title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-1.5">
                            <p className="text-[10px] leading-tight font-medium text-white text-center w-full line-clamp-3">
                              {title}
                            </p>
                          </div>
                        </Link>

                        {!isCharacter && !isManga && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleWatchWithFriends(item);
                            }}
                            className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:border-primary shadow-lg"
                            title="Watch with friends"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {tierItems.length === 0 && (
                    <div className="flex items-center justify-center w-full h-full text-muted-foreground/40 text-xs font-medium italic">
                      No items in this tier
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Comments Section */}
        <GlassPanel className="p-6 md:p-8 mt-8 rounded-[2rem] border-border/40">
          <Comments entityType="tier_list" entityId={tierList.id} entityName={tierList.name} />
        </GlassPanel>
      </main>

      <MobileNav />
    </div>
  );
}