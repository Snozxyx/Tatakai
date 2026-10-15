import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Bookmark, TrendingUp, Star } from 'lucide-react';
import {
  trendingGifs,
  searchGifs,
  gifToAttachment,
  isGiphyConfigured,
  type GiphyGif,
} from '@/lib/giphy';
import { useGifBookmarks, useToggleGifBookmark } from '@/hooks/community/useGifBookmarks';
import type { CommentAttachment } from '@/lib/commentMedia';
import { cn } from '@/lib/utils';

type Tab = 'trending' | 'search' | 'saved';

interface GifPickerProps {
  onSelect: (attachment: CommentAttachment) => void;
  trigger: React.ReactNode;
}

function GifGrid({
  gifs,
  onSelect,
  bookmarkedUrls,
  onToggleBookmark,
  empty,
}: {
  gifs: GiphyGif[];
  onSelect: (g: GiphyGif) => void;
  bookmarkedUrls: Set<string>;
  onToggleBookmark: (g: GiphyGif, bookmarked: boolean) => void;
  empty: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (gifs.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {gifs.map((gif) => {
        const bookmarked = bookmarkedUrls.has(gif.url);
        return (
          <div key={gif.id || gif.url} className="group relative overflow-hidden rounded-lg bg-muted/40">
            <button type="button" onClick={() => onSelect(gif)} className="block w-full">
              <img
                src={gif.preview || gif.url}
                alt={gif.title}
                loading="lazy"
                className="h-24 w-full object-cover transition-transform group-hover:scale-105"
              />
            </button>
            <button
              type="button"
              onClick={() => onToggleBookmark(gif, bookmarked)}
              title={bookmarked ? t('comments.gifRemoveBookmark') : t('comments.gifSaveBookmark')}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Star className={cn('h-3.5 w-3.5', bookmarked && 'fill-yellow-400 text-yellow-400')} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function GifPicker({ onSelect, trigger }: GifPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('trending');
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');

  const configured = isGiphyConfigured();

  const { data: bookmarks = [] } = useGifBookmarks();
  const toggleBookmark = useToggleGifBookmark();
  const bookmarkedUrls = new Set(bookmarks.map((b) => b.gif_url));

  const trending = useQuery({
    queryKey: ['giphy', 'trending'],
    queryFn: () => trendingGifs(24),
    enabled: open && configured && tab === 'trending',
    staleTime: 5 * 60 * 1000,
  });

  const searchResults = useQuery({
    queryKey: ['giphy', 'search', query],
    queryFn: () => searchGifs(query, 24),
    enabled: open && configured && tab === 'search' && query.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const savedGifs: GiphyGif[] = bookmarks.map((b) => ({
    id: b.id,
    url: b.gif_url,
    preview: b.preview_url || b.gif_url,
    title: b.title || 'GIF',
    width: b.width || undefined,
    height: b.height || undefined,
  }));

  const pick = (g: GiphyGif) => {
    onSelect(gifToAttachment(g));
    setOpen(false);
  };

  const TabButton = ({ value, icon: Icon, label }: { value: Tab; icon: any; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
        tab === value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        {!configured ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('comments.gifNotConfigured')}
            <br />
            <span className="text-xs">{t('comments.gifNeedKey')}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
              <TabButton value="trending" icon={TrendingUp} label={t('anime.trending')} />
              <TabButton value="search" icon={Search} label={t('common.search')} />
              <TabButton value="saved" icon={Bookmark} label={t('comments.savedTab')} />
            </div>

            {tab === 'search' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(rawQuery);
                }}
                className="relative"
              >
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={rawQuery}
                  onChange={(e) => setRawQuery(e.target.value)}
                  placeholder={t('comments.gifSearchPlaceholder')}
                  className="h-9 pl-8 text-sm"
                />
              </form>
            )}

            <ScrollArea className="h-64 pr-2">
              {tab === 'trending' &&
                (trending.isLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <GifGrid
                    gifs={trending.data ?? []}
                    onSelect={pick}
                    bookmarkedUrls={bookmarkedUrls}
                    onToggleBookmark={(g, b) => toggleBookmark.mutate({ gif: g, bookmarked: b })}
                    empty={t('comments.gifNoTrending')}
                  />
                ))}

              {tab === 'search' &&
                (query.trim().length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">{t('comments.gifTypeToSearch')}</div>
                ) : searchResults.isLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <GifGrid
                    gifs={searchResults.data ?? []}
                    onSelect={pick}
                    bookmarkedUrls={bookmarkedUrls}
                    onToggleBookmark={(g, b) => toggleBookmark.mutate({ gif: g, bookmarked: b })}
                    empty={t('common.noResults')}
                  />
                ))}

              {tab === 'saved' && (
                <GifGrid
                  gifs={savedGifs}
                  onSelect={pick}
                  bookmarkedUrls={bookmarkedUrls}
                  onToggleBookmark={(g, b) => toggleBookmark.mutate({ gif: g, bookmarked: b })}
                  empty={t('comments.gifEmptySaved')}
                />
              )}
            </ScrollArea>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
