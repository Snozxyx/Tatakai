import { Link } from 'react-router-dom';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, Share2, Eye, Lock, Globe, User } from 'lucide-react';
import { useLikeTierList, DEFAULT_TIERS, type TierList } from '@/hooks/useTierLists';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TierListCardProps {
  tierList: TierList;
  showAuthor?: boolean;
  onShare?: () => void;
}

export function TierListCard({ tierList, showAuthor = true, onShare }: TierListCardProps) {
  const { user } = useAuth();
  const likeMutation = useLikeTierList();

  const handleLike = async () => {
    if (!user) {
      toast.error('Sign in to like tier lists');
      return;
    }

    try {
      await likeMutation.mutateAsync({ tierListId: tierList.id, liked: tierList.user_liked || false });
    } catch {
      toast.error('Failed to like tier list');
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/tierlist/${tierList.share_code}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
    onShare?.();
  };

  // Get preview items (first 3-4 from each tier)
  const previewItems = tierList.items.slice(0, 12);

  return (
    <GlassPanel className="overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all">
      <Link to={`/tierlist/${tierList.share_code}`}>
        {/* Preview Grid */}
        <div className="relative h-32 bg-muted/20 overflow-hidden">
          <div className="absolute inset-0 flex">
            {DEFAULT_TIERS.slice(0, 4).map(tier => {
              const tierItems = previewItems.filter(i => i.tier === tier.name).slice(0, 3);
              return (
                <div key={tier.name} className="flex-1 flex">
                  <div 
                    className="w-6 flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: tier.color }}
                  >
                    {tier.name}
                  </div>
                  <div className="flex-1 flex flex-wrap gap-0.5 p-0.5">
                    {tierItems.map(item => (
                      <img
                        key={item.anime_id}
                        src={item.anime_image}
                        alt={item.anime_title}
                        className="w-6 h-9 object-cover rounded-sm"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          
          {/* Privacy indicator */}
          <div className="absolute top-2 right-2">
            {tierList.is_public ? (
              <Globe className="w-4 h-4 text-green-500" />
            ) : (
              <Lock className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className="p-4">
        <Link to={`/tierlist/${tierList.share_code}`}>
          <h3 className="font-semibold text-lg line-clamp-1 hover:text-primary transition-colors">
            {tierList.name}
          </h3>
        </Link>
        
        {tierList.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {tierList.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-4">
          {showAuthor && tierList.profiles && (
            <Link 
              to={`/@${tierList.profiles.username}`}
              className="flex items-center gap-2 hover:text-primary transition-colors"
            >
              <Avatar className="w-6 h-6">
                <AvatarImage src={tierList.profiles.avatar_url || undefined} />
                <AvatarFallback>
                  <User className="w-3 h-3" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                {tierList.profiles.username || tierList.profiles.display_name || 'Anonymous'}
              </span>
            </Link>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {tierList.views_count || 0}
            </span>
            <span className="text-xs">
              {formatDistanceToNow(new Date(tierList.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-muted">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={likeMutation.isPending}
            className={cn(
              "gap-2",
              tierList.user_liked && "text-red-500"
            )}
          >
            <Heart className={cn("w-4 h-4", tierList.user_liked && "fill-current")} />
            {tierList.likes_count || 0}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>

          <div className="flex-1 text-right text-sm text-muted-foreground">
            {tierList.items.length} anime
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

interface TierListGridProps {
  tierLists: TierList[];
  showAuthor?: boolean;
  emptyMessage?: string;
}

export function TierListGrid({ tierLists, showAuthor = true, emptyMessage = 'No tier lists yet' }: TierListGridProps) {
  if (tierLists.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {tierLists.map(tierList => (
        <TierListCard key={tierList.id} tierList={tierList} showAuthor={showAuthor} />
      ))}
    </div>
  );
}
