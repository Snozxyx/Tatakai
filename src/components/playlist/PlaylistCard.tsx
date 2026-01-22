import { Link } from 'react-router-dom';
import { Playlist } from '@/hooks/usePlaylist';
import { getProxiedImageUrl } from '@/lib/api';
import { Music2, Globe, Lock, MoreVertical, Trash2, Edit2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PlaylistCardProps {
  playlist: Playlist;
  coverImages?: string[];
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export function PlaylistCard({ 
  playlist, 
  coverImages = [], 
  onEdit, 
  onDelete,
  showActions = true 
}: PlaylistCardProps) {
  // Create a grid of up to 4 cover images
  const displayImages = coverImages.slice(0, 4);

  return (
    <div className="group relative">
      <Link to={`/playlist/${playlist.id}`}>
        <div className="relative aspect-square rounded-xl overflow-hidden bg-muted mb-3 transition-all group-hover:ring-2 group-hover:ring-primary/50">
          {displayImages.length > 0 ? (
            <div className={cn(
              "grid w-full h-full",
              displayImages.length === 1 && "grid-cols-1",
              displayImages.length === 2 && "grid-cols-2",
              displayImages.length >= 3 && "grid-cols-2 grid-rows-2"
            )}>
              {displayImages.map((img, idx) => (
                <div key={idx} className="relative overflow-hidden">
                  <img
                    src={getProxiedImageUrl(img)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {displayImages.length === 3 && (
                <div className="bg-muted/50 flex items-center justify-center">
                  <Music2 className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Music2 className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
              <Play className="w-6 h-6 text-primary-foreground fill-current ml-1" />
            </div>
          </div>

          {/* Privacy badge */}
          <div className={cn(
            "absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1",
            playlist.is_public 
              ? "bg-green-500/20 text-green-400"
              : "bg-muted text-muted-foreground"
          )}>
            {playlist.is_public ? (
              <>
                <Globe className="w-3 h-3" />
                Public
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" />
                Private
              </>
            )}
          </div>
        </div>

        <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">
          {playlist.name}
        </h3>
        <p className="text-sm text-muted-foreground">
          {playlist.items_count} {playlist.items_count === 1 ? 'anime' : 'anime'}
        </p>
      </Link>

      {/* Actions menu */}
      {showActions && (onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 h-8 w-8"
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
          {playlist.items_count} anime
        </p>
      </div>
    </Link>
  );
}
