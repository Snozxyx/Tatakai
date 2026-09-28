import { Link } from 'react-router-dom';
import { Playlist, usePlaylistItems } from '@/hooks/user/usePlaylist';
import { getProxiedImageUrl } from '@/lib/api';
import { Music2, Globe, Lock, MoreVertical, Trash2, Edit2, Play, Heart, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { UserBadges } from '@/components/ui/UserBadges';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PlaylistAuthor {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface PlaylistCardProps {
  playlist: Playlist;
  coverImages?: string[];
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  /** Show the author row + like count (used on the Discover grid). */
  author?: PlaylistAuthor | null;
}

export function PlaylistCard({
  playlist,
  coverImages,
  onEdit,
  onDelete,
  showActions = true,
  author,
}: PlaylistCardProps) {
  // Fall back to deriving covers from the playlist's items when none are supplied.
  const needsFetch = !coverImages || coverImages.length === 0;
  const { data: fetchedItems = [] } = usePlaylistItems(needsFetch ? playlist.id : undefined);
  const derived = fetchedItems
    .slice(0, 4)
    .map((i) => i.anime_poster)
    .filter(Boolean) as string[];
  const displayImages = (needsFetch ? derived : coverImages).slice(0, 4);
  const { data: authorBadges } = useUserBadges(playlist.user_id);

  return (
    <div className="group relative flex flex-col rounded-[1.5rem] border border-border/40 bg-card/20 backdrop-blur-xl overflow-hidden shadow-lg   transition-all duration-300">
      <Link to={`/playlist/${playlist.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-muted/40 to-background/40">
          {displayImages.length > 0 ? (
            <div
              className={cn(
                'grid w-full h-full',
                displayImages.length === 1 && 'grid-cols-1',
                displayImages.length === 2 && 'grid-cols-2',
                displayImages.length >= 3 && 'grid-cols-2 grid-rows-2'
              )}
            >
              {displayImages.map((img, idx) => (
                <div key={idx} className="relative overflow-hidden">
                  <img src={getProxiedImageUrl(img)} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {displayImages.length === 3 && (
                <div className="flex items-center justify-center bg-muted/40">
                  <Music2 className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Music2 className="w-12 h-12 text-muted-foreground" />
            </div>
          )}

          {/* Hover play overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Play className="w-6 h-6 text-primary-foreground fill-current ml-1" />
            </div>
          </div>

          {/* Privacy badge */}
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white/90">
            {playlist.is_public ? (
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
        </div>
      </Link>

      <div className="flex flex-col flex-1 p-4">
        <Link to={`/playlist/${playlist.id}`}>
          <h3 className="font-display text-base font-bold tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
            {playlist.name}
          </h3>
        </Link>

        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-sm text-muted-foreground">
            {playlist.items_count} {playlist.items_count === 1 ? 'item' : 'items'}
          </span>
          {typeof playlist.likes_count === 'number' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Heart className="w-3.5 h-3.5" />
              {playlist.likes_count}
            </span>
          )}
        </div>

        {author && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40 min-w-0">
            <Link
              to={`/@${author.username}`}
              className="flex items-center gap-2 group/author min-w-0"
            >
              <Avatar className="w-6 h-6 ring-1 ring-border/50">
                <AvatarImage src={author.avatar_url || undefined} />
                <AvatarFallback>
                  <User className="w-3 h-3" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground truncate group-hover/author:text-foreground transition-colors">
                {author.username || author.display_name || 'Anonymous'}
              </span>
            </Link>
            <UserBadges badges={authorBadges} size={14} max={3} />
          </div>
        )}
      </div>

      {/* Actions menu */}
      {showActions && (onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 backdrop-blur-md h-8 w-8 rounded-full"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Compact version for sidebars
export function PlaylistCardCompact({ playlist }: { playlist: Playlist }) {
  return (
    <Link
      to={`/playlist/${playlist.id}`}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
    >
      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
        <Music2 className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium line-clamp-1 group-hover:text-primary transition-colors">
          {playlist.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {playlist.items_count} {playlist.items_count === 1 ? 'item' : 'items'}
        </p>
      </div>
    </Link>
  );
}
