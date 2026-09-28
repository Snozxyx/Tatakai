import { Link } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GripVertical, Play, BookOpen, Users, Trash2 } from 'lucide-react';
import type { PlaylistItem } from '@/hooks/user/usePlaylist';

export type PlaylistViewMode = 'list' | 'grid';

const MEDIA_LABELS: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua',
  comic: 'Comic', comics: 'Comic', novel: 'Novel', light_novel: 'Novel',
  one_shot: 'One-shot',
};

/** Prefer the stored per-item media_format; fall back to the playlist's coarse kind. */
function formatMediaLabel(mediaFormat: string | null | undefined, mediaKind: 'anime' | 'manga'): string {
  const f = String(mediaFormat || '').trim().toLowerCase();
  if (f) return MEDIA_LABELS[f] || f.charAt(0).toUpperCase() + f.slice(1);
  return mediaKind === 'manga' ? 'Manga' : 'Anime';
}

interface SortablePlaylistItemProps {
  item: PlaylistItem;
  index: number;
  viewMode: PlaylistViewMode;
  canEdit: boolean;
  mediaKind: 'anime' | 'manga';
  href: string;
  onRemove: (animeId: string) => void;
  onLaunchWatchRoom: (animeId: string, animeName: string, animePoster?: string | null) => void;
}

export function SortablePlaylistItem({
  item,
  index,
  viewMode,
  canEdit,
  mediaKind,
  href,
  onRemove,
  onLaunchWatchRoom,
}: SortablePlaylistItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const typeLabel = formatMediaLabel(item.media_format, mediaKind);

  if (viewMode === 'grid') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'group relative rounded-xl overflow-hidden border border-border/50 bg-muted/20 hover:border-primary/40 transition-colors',
          isDragging && 'ring-2 ring-primary/50 shadow-xl'
        )}
      >
        <Link to={href} className="block">
          <div className="relative aspect-[2/3] overflow-hidden">
            <img
              src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')}
              alt={item.anime_name}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <span className="absolute top-2 left-2 h-6 min-w-6 px-1.5 rounded-full bg-black/60 backdrop-blur text-white text-xs font-mono flex items-center justify-center">
              {index + 1}
            </span>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <h3 className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                {item.anime_name}
              </h3>
              <p className="text-[11px] text-white/70 mt-0.5">{typeLabel}</p>
            </div>
          </div>
        </Link>

        {canEdit && (
          <button
            type="button"
            className="absolute top-2 right-2 h-6 w-6 rounded-md bg-black/50 backdrop-blur text-white/80 hover:text-white flex items-center justify-center cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {mediaKind === 'anime' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onLaunchWatchRoom(item.anime_id, item.anime_name, item.anime_poster);
              }}
              className="h-7 w-7 rounded-md bg-black/50 backdrop-blur text-white/80 hover:text-primary"
            >
              <Users className="w-3.5 h-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove(item.anime_id);
              }}
              className="h-7 w-7 rounded-md bg-black/50 backdrop-blur text-white/80 hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group',
        isDragging && 'bg-muted/60 ring-2 ring-primary/40 shadow-lg'
      )}
    >
      {canEdit ? (
        <button
          type="button"
          className="text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none w-6 flex items-center justify-center"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      ) : (
        <span className="text-muted-foreground w-6 text-center font-mono text-sm">{index + 1}</span>
      )}

      <Link to={href} className="flex items-center gap-4 flex-1 min-w-0">
        <div className="relative w-16 h-20 rounded-lg overflow-hidden flex-shrink-0">
          <img
            src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')}
            alt={item.anime_name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {mediaKind === 'manga' ? (
              <BookOpen className="w-6 h-6 text-white" />
            ) : (
              <Play className="w-6 h-6 text-white" />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">
            {item.anime_name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {typeLabel} • Added {new Date(item.added_at).toLocaleDateString()}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {mediaKind === 'anime' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onLaunchWatchRoom(item.anime_id, item.anime_name, item.anime_poster);
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
            onClick={() => onRemove(item.anime_id)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
