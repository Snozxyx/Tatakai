import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TierListEditor } from '@/components/tierlist/TierListEditor';
import { TierListGrid } from '@/components/tierlist/TierListCard';
import { TierListCommentsSection } from '@/components/tierlist/TierListCommentsSection';
import { useAuth } from '@/contexts/AuthContext';
import { useUserTierLists, usePublicTierLists, useTierListByShareCode, useDeleteTierList, DEFAULT_TIERS } from '@/hooks/useTierLists';
import { ArrowLeft, Plus, User, Trash2, Edit, Share2, Heart, Eye, Globe, Lock, MessageSquare } from 'lucide-react';
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
  const deleteMutation = useDeleteTierList();

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
              {isOwner && (
                <>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/tierlists/edit/${tierList.id}`)} className="gap-2">
                    <Edit className="w-4 h-4" />
                    Edit
                  </Button>
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
                      ? `/char/${charId}?name=${encodeURIComponent(item.anime_title)}`
                      : `/anime/${item.anime_id}`;

                    return (
                      <Link
                        key={item.anime_id}
                        to={linkTo}
                        className="group relative w-14 h-20 md:w-16 md:h-24 rounded-lg overflow-hidden"
                      >
                        <img
                          src={item.anime_image}
                          alt={item.anime_title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                          <p className="text-[10px] text-white text-center line-clamp-3">{item.anime_title}</p>
                        </div>
                      </Link>
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
