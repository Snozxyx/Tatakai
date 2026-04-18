import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TierListEditor } from '@/components/tierlist/TierListEditor';
import { TierListGrid } from '@/components/tierlist/TierListCard';
import { TierListCommentsSection } from '@/components/tierlist/TierListCommentsSection';
import { useAuth } from '@/contexts/AuthContext';
import { useUserTierLists, usePublicTierLists, useTierListByShareCode, useDeleteTierList, DEFAULT_TIERS } from '@/hooks/useTierLists';
import {
  useAddTierListCollaborator,
  useRemoveTierListCollaborator,
  useTierListAccess,
  useTierListCollaborators,
  useUpdateTierListCollaboratorRole,
  TierCollaboratorRole
} from '@/hooks/useTierListCollaboration';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, User, Trash2, Edit, Share2, Heart, Eye, Globe, Lock, MessageSquare, Users, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Main Tier Lists page - list all public tier lists + user's own
export default function TierListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTierList, setEditingTierList] = useState<any>(null);

  const { data: userTierLists = [], isLoading: loadingUser } = useUserTierLists(user?.id);
  const { data: publicTierLists = [], isLoading: loadingPublic } = usePublicTierLists();

  const handleCreate = () => {
    setEditingTierList(null);
    setShowEditor(true);
  };

  const handleEdit = (tierList: any) => {
    setEditingTierList(tierList);
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

        <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={handleCloseEditor}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
              {editingTierList ? 'Edit Tier List' : 'Create Tier List'}
            </h1>
            <p className="text-muted-foreground">Rank your favorite anime</p>
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

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">Tier Lists</h1>
            <p className="text-muted-foreground">Rank and share your anime preferences</p>
          </div>
          {user && (
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Tier List
            </Button>
          )}
        </div>

        <Tabs defaultValue={user ? "my-lists" : "community"} className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            {user && (
              <TabsTrigger value="my-lists" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <User className="w-4 h-4" />
                My Lists
              </TabsTrigger>
            )}
            <TabsTrigger value="community" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="w-4 h-4" />
              Community
            </TabsTrigger>
          </TabsList>

          {user && (
            <TabsContent value="my-lists">
              {loadingUser ? (
                <div className="text-center py-12 text-muted-foreground">Loading...</div>
              ) : userTierLists.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">You haven't created any tier lists yet</p>
                  <Button onClick={handleCreate} className="gap-2">
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
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <TierListGrid
                tierLists={publicTierLists}
                emptyMessage="No public tier lists yet. Be the first to create one!"
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
  const { user } = useAuth();
  const { data: tierList, isLoading, error } = useTierListByShareCode(shareCode || '');
  const { data: tierListAccess } = useTierListAccess(tierList?.id);
  const { data: collaborators = [] } = useTierListCollaborators(tierList?.id);
  const deleteMutation = useDeleteTierList();
  const addCollaborator = useAddTierListCollaborator();
  const updateCollaboratorRole = useUpdateTierListCollaboratorRole();
  const removeCollaborator = useRemoveTierListCollaborator();

  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<TierCollaboratorRole>('editor');

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
    if (!tierList || !confirm('Are you sure you want to delete this tier list?')) return;

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

  const handleWatchWithFriends = (animeId: string, animeTitle: string, animeImage: string) => {
    if (animeId.startsWith('char-')) {
      toast.info('Watch rooms can only be launched for anime entries');
      return;
    }

    const params = new URLSearchParams({
      anime: animeId,
      title: animeTitle,
    });

    if (animeImage) {
      params.set('poster', animeImage);
    }

    navigate(`/isshoni?${params.toString()}`);
  };

  const isOwner = user?.id === tierList?.user_id;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !tierList) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Tier list not found or is private</p>
          <Button onClick={() => navigate('/tierlists')}>Browse Tier Lists</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
        </div>

        <GlassPanel className="p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {tierList.is_public ? (
                  <Globe className="w-4 h-4 text-green-500" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {tierList.is_public ? 'Public' : 'Private'}
                </span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">{tierList.name}</h1>
              {tierList.description && (
                <p className="text-muted-foreground">{tierList.description}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </Button>
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/tierlists/edit/${tierList.id}`)} className="gap-2">
                    <Edit className="w-4 h-4" />
                    Edit
                  </Button>
                </>
              )}
              {isOwner && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="gap-2 text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Author info */}
          {tierList.profiles && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-muted">
              <Link
                to={`/user/${tierList.profiles.username}`}
                className="flex items-center gap-3 hover:text-primary transition-colors"
              >
                <Avatar>
                  <AvatarImage src={tierList.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{tierList.profiles.username || tierList.profiles.display_name || 'Anonymous'}</p>
                  <p className="text-sm text-muted-foreground">
                    Created {formatDistanceToNow(new Date(tierList.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>

              <div className="flex items-center gap-6 text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  {tierList.views_count || 0} views
                </span>
                <span className="flex items-center gap-2">
                  <Heart className={cn("w-4 h-4", tierList.user_liked && "text-red-500 fill-current")} />
                  {tierList.likes_count || 0} likes
                </span>
              </div>
            </div>
          )}
        </GlassPanel>

        {(canManageCollaborators || collaborators.length > 0) && (
          <GlassPanel className="p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-lg">Collaborators</h2>
            </div>

            <div className="space-y-3">
              {collaborators.length === 0 ? (
                <p className="text-sm text-muted-foreground">No collaborators yet.</p>
              ) : (
                collaborators.map((collaborator) => {
                  const displayName = collaborator.profile?.display_name || collaborator.profile?.username || collaborator.user_id;

                  return (
                    <div key={collaborator.id} className="p-3 rounded-lg bg-muted/30 border border-border/50 flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={collaborator.profile?.avatar_url || undefined} />
                        <AvatarFallback>{(displayName?.[0] || 'U').toUpperCase()}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">@{collaborator.profile?.username || 'unknown'}</p>
                      </div>

                      {canManageCollaborators ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={collaborator.role}
                            onChange={(event) => handleUpdateCollaboratorRole(collaborator.id, event.target.value as TierCollaboratorRole)}
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                          >
                            <option value="viewer">viewer</option>
                            <option value="editor">editor</option>
                            <option value="owner">owner</option>
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
                        <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs uppercase">{collaborator.role}</span>
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
                    onChange={(event) => setNewCollaboratorRole(event.target.value as TierCollaboratorRole)}
                    className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="owner">owner</option>
                  </select>
                </div>

                {collaboratorSearch.trim().length >= 2 && (
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 divide-y divide-border/50">
                    {collaboratorSearchResults.length === 0 ? (
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
        )}

        {/* Tier Rows */}
        <div className="space-y-2">
          {DEFAULT_TIERS.map(tier => {
            const tierItems = tierList.items.filter(i => i.tier === tier.name);
            return (
              <div key={tier.name} className="flex border border-muted rounded-lg overflow-hidden bg-muted/10">
                <div
                  className="w-16 md:w-20 flex-shrink-0 flex items-center justify-center font-bold text-2xl md:text-3xl text-white"
                  style={{ backgroundColor: tier.color }}
                >
                  {tier.name}
                </div>
                <div className="flex-1 min-h-[80px] md:min-h-[100px] p-2 flex flex-wrap gap-2">
                  {tierItems.map(item => {
                    const isCharacter = item.anime_id.startsWith('char-');
                    const charId = item.anime_id.replace('char-', '');
                    const linkTo = isCharacter
                      ? `/char/${encodeURIComponent(charId)}?name=${encodeURIComponent(item.anime_title)}`
                      : `/anime/${item.anime_id}`;

                    return (
                      <div key={item.anime_id} className="group relative w-14 h-20 md:w-16 md:h-24 rounded-lg overflow-hidden">
                        <Link to={linkTo} className="block w-full h-full">
                          <img
                            src={item.anime_image}
                            alt={item.anime_title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                            <p className="text-[10px] text-white text-center line-clamp-3">{item.anime_title}</p>
                          </div>
                        </Link>

                        {!isCharacter && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleWatchWithFriends(item.anime_id, item.anime_title, item.anime_image);
                            }}
                            className="absolute top-1 left-1 h-6 w-6 rounded-full bg-black/70 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Watch with friends"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {tierItems.length === 0 && (
                    <div className="flex items-center justify-center w-full text-muted-foreground text-sm">
                      No anime in this tier
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Comments Section */}
        <GlassPanel className="p-6 mt-8">
          <TierListCommentsSection tierListId={tierList.id} />
        </GlassPanel>
      </main>

      <MobileNav />
    </div>
  );
}
