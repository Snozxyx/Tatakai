import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAddToPlaylist } from '@/hooks/user/usePlaylist';
import { useSearch } from '@/hooks/api/useAnimeData';
import { useMangaSearch } from '@/hooks/api/useMangaData';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Search, Loader2, Check, Plus, Tv, BookOpen } from 'lucide-react';

interface AddMediaToPlaylistDialogProps {
  playlistId: string;
  existingRefs: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AddMediaKind = 'anime' | 'manga';

interface MediaResult {
  ref: string;
  name: string;
  poster: string | null;
  kind: AddMediaKind;
  /** Precise media type stored on the playlist item, e.g. anime/manga/manhwa/manhua/comic/novel. */
  format: string;
}

/** Normalize a manga search row into a clean, storable format token. */
function resolveMangaFormat(row: { type?: string | null; format?: string | null }): string {
  const t = String(row.type || '').toLowerCase();
  if (t) return t === 'comics' ? 'comic' : t;
  const f = String(row.format || '').toUpperCase();
  if (f === 'NOVEL' || f === 'LIGHT_NOVEL') return 'novel';
  if (f === 'OEL') return 'comic';
  if (f === 'MANHWA') return 'manhwa';
  if (f === 'MANHUA') return 'manhua';
  return 'manga';
}

export function AddMediaToPlaylistDialog({
  playlistId,
  existingRefs,
  open,
  onOpenChange,
}: AddMediaToPlaylistDialogProps) {
  const [kind, setKind] = useState<AddMediaKind>('anime');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pendingRef, setPendingRef] = useState<string | null>(null);

  const addToPlaylist = useAddToPlaylist();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const animeSearch = useSearch(kind === 'anime' ? debouncedQuery : '');
  const mangaSearch = useMangaSearch(kind === 'manga' ? debouncedQuery : '');

  const results = useMemo<MediaResult[]>(() => {
    if (kind === 'anime') {
      const animes = (animeSearch.data?.animes || []) as Array<{ id: string; name?: string; poster?: string }>;
      return animes
        .filter((a) => a.id)
        .map((a) => ({ ref: String(a.id), name: a.name || 'Untitled', poster: a.poster || null, kind: 'anime' as const, format: 'anime' }));
    }
    const rows = (mangaSearch.data?.results || []) as Array<{
      id: string;
      anilistId?: number | null;
      malId?: number | null;
      canonicalTitle?: string;
      poster?: string | null;
      type?: string | null;
      format?: string | null;
    }>;
    return rows
      .map((row) => {
        const mediaId = String(row.anilistId || row.malId || row.id || '');
        return mediaId
          ? { ref: `manga:${mediaId}`, name: row.canonicalTitle || 'Untitled', poster: row.poster || null, kind: 'manga' as const, format: resolveMangaFormat(row) }
          : null;
      })
      .filter((r): r is MediaResult => r !== null);
  }, [kind, animeSearch.data, mangaSearch.data]);

  const isLoading = kind === 'anime' ? animeSearch.isFetching : mangaSearch.isFetching;

  const handleAdd = async (result: MediaResult) => {
    if (existingRefs.has(result.ref) || pendingRef) return;
    setPendingRef(result.ref);
    try {
      await addToPlaylist.mutateAsync({
        playlistId,
        animeId: result.ref,
        animeName: result.name,
        animePoster: result.poster || undefined,
        mediaFormat: result.format,
      });
    } catch {
      // Error surfaced by the mutation's toast.
    } finally {
      setPendingRef(null);
    }
  };

  const switchKind = (next: AddMediaKind) => {
    if (next === kind) return;
    setKind(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Add media to playlist
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted/40">
            <button
              type="button"
              onClick={() => switchKind('anime')}
              className={cn(
                'flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                kind === 'anime' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Tv className="w-4 h-4" /> Anime
            </button>
            <button
              type="button"
              onClick={() => switchKind('manga')}
              className={cn(
                'flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                kind === 'manga' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BookOpen className="w-4 h-4" /> Manga
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind === 'manga' ? 'manga' : 'anime'}...`}
              className="pl-9"
              autoFocus
            />
          </div>

          <ScrollArea className="h-[320px] -mr-3 pr-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !debouncedQuery ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                Start typing to search for {kind === 'manga' ? 'manga' : 'anime'}.
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No results found.</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {results.map((result) => {
                  const added = existingRefs.has(result.ref);
                  const pending = pendingRef === result.ref;
                  return (
                    <button
                      key={result.ref}
                      type="button"
                      onClick={() => handleAdd(result)}
                      disabled={added || pending}
                      className={cn(
                        'group relative rounded-lg overflow-hidden border text-left transition-colors',
                        added ? 'border-primary/60' : 'border-border/50 hover:border-primary/40'
                      )}
                    >
                      <div className="relative aspect-[2/3] bg-muted">
                        <img
                          src={getProxiedImageUrl(result.poster || '/placeholder.svg')}
                          alt={result.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                        <div
                          className={cn(
                            'absolute inset-0 flex items-center justify-center transition-opacity',
                            added ? 'bg-primary/30 opacity-100' : 'bg-black/40 opacity-0 group-hover:opacity-100'
                          )}
                        >
                          {pending ? (
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          ) : added ? (
                            <Check className="w-7 h-7 text-white" />
                          ) : (
                            <Plus className="w-7 h-7 text-white" />
                          )}
                        </div>
                        <p className="absolute inset-x-0 bottom-0 p-1.5 text-[11px] font-medium text-white line-clamp-2 leading-tight">
                          {result.name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
