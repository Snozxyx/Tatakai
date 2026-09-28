import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, Share2, Eye, Lock, Globe, User, Layers } from 'lucide-react';
import { useLikeTierList, DEFAULT_TIERS, type TierList } from '@/hooks/user/useTierLists';
import { useAuth } from '@/contexts/AuthContext';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { UserBadges } from '@/components/ui/UserBadges';
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
  const { data: authorBadges } = useUserBadges(tierList.user_id);

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
    navigator.clipboard.writeText(`${window.location.origin}/tierlist/${tierList.share_code}`);
    toast.success('Link copied to clipboard!');
    onShare?.();
  };

  const items = tierList.items || [];

  return (
    <div className="group relative flex flex-col rounded-[1.75rem] border border-border/40 bg-card/20 backdrop-blur-xl overflow-hidden shadow-lg hover:border-primary/80 hover:shadow-xl hover:shadow-primary/200 transition-all duration-300">
      <Link to={`/tierlist/${tierList.share_code}`} className="block">
        {/* Tier preview stack */}
        <div className="relative h-36 overflow-hidden bg-gradient-to-br from-muted/30 to-background/40">
          <div className="absolute inset-0 flex flex-col py-1">
            {DEFAULT_TIERS.slice(0, 4).map((tier) => {
              const tierItems = items.filter((i) => i.tier === tier.name).slice(0, 6);
              return (
                <div key={tier.name} className="flex-1 flex items-center gap-1 px-2">
                  <span
                    className="w-7 shrink-0 h-6 rounded-md flex items-center justify-center text-[11px] font-black text-white/95"
                    style={{ backgroundColor: tier.color, textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
                  >
                    {tier.name}
                  </span>
                  <div className="flex-1 flex gap-1 overflow-hidden">
                    {tierItems.map((item) => (
                      <img
                        key={item.anime_id}
                        src={item.anime_image}
                        alt=""
                        className="w-6 h-8 object-cover rounded-[3px] shrink-0 ring-1 ring-white/10"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent pointer-events-none" />

          <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white/90">
            {tierList.is_public ? (
              <>
                <Globe className="w-3 h-3 text-emerald-400" />
                Public
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-amber-400" />
                Private
              </>
            )}
          </span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15  text-primary text-xs font-semibold">
            <Layers className="w-3.5 h-3.5" />
            {items.length} {items.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </Link>

      <div className="flex flex-col flex-1 p-5">
        <Link to={`/tierlist/${tierList.share_code}`}>
          <h3 className="font-display text-lg font-bold tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
            {tierList.name}
          </h3>
        </Link>
        {tierList.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{tierList.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 mt-4">
          {showAuthor && tierList.profiles ? (
            <div className="flex items-center gap-2 min-w-0">
              <Link to={`/@${tierList.profiles.username}`} className="flex items-center gap-2 group/author min-w-0">
                <Avatar className="w-6 h-6 ring-1 ring-border/50">
                  <AvatarImage src={tierList.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    <User className="w-3 h-3" />
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground truncate group-hover/author:text-foreground transition-colors">
                  {tierList.profiles.username || tierList.profiles.display_name || 'Anonymous'}
                </span>
              </Link>
              <UserBadges badges={authorBadges} size={14} max={3} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(tierList.created_at), { addSuffix: true })}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Eye className="w-3.5 h-3.5" />
            {tierList.views_count || 0}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-4 pt-4 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={likeMutation.isPending}
            className={cn(
              'rounded-full gap-1.5 hover:bg-rose-500/10',
              tierList.user_liked ? 'text-rose-500' : 'text-muted-foreground'
            )}
          >
            <Heart className={cn('w-4 h-4 transition-transform', tierList.user_liked && 'fill-current scale-110')} />
            {tierList.likes_count || 0}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="rounded-full gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>
        </div>
      </div>
    </div>
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
      {tierLists.map((tierList) => (
        <TierListCard key={tierList.id} tierList={tierList} showAuthor={showAuthor} />
      ))}
    </div>
  );
}
