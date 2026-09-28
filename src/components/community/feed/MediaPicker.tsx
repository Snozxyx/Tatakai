import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSearch } from '@/hooks/api/useAnimeData';
import { useAniListCharacterSearch } from '@/hooks/user/useProfileFeatures';
import { ANILIST_GRAPHQL_ENDPOINT } from '@/lib/api/backendOrigin';

export type MediaType = 'anime' | 'manga' | 'manhwa' | 'manhua' | 'comics' | 'character';
export interface SelectedMedia {
  id: string;
  name: string;
  poster: string | null;
  type: MediaType;
}

type Tab = 'anime' | 'manga' | 'character';

/** AniList classifies Korean/Chinese manga by country of origin, not format. */
function classifyManga(countryOfOrigin?: string, format?: string): MediaType {
  const c = (countryOfOrigin || '').toUpperCase();
  if (c === 'KR') return 'manhwa';
  if (c === 'CN') return 'manhua';
  if ((format || '').toUpperCase() === 'ONE_SHOT') return 'comics';
  return 'manga';
}

/**
 * AniList manga search — used directly (not the internal catalog API) so the
 * picker reliably returns manhwa/manhua/manga with correct classification,
 * independent of catalog-service availability. Ids are AniList ids, matching
 * what `/manga/:id` resolves against.
 */
async function searchAniListManga(query: string): Promise<SelectedMedia[]> {
  const gql = `
    query ($q: String) {
      Page(perPage: 20) {
        media(search: $q, type: MANGA, sort: SEARCH_MATCH) {
          id
          title { english romaji }
          countryOfOrigin
          format
          coverImage { large }
        }
      }
    }
  `;
  const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { q: query } }),
  });
  if (!res.ok) throw new Error('AniList manga search failed');
  const json = await res.json();
  const rows = Array.isArray(json?.data?.Page?.media) ? json.data.Page.media : [];
  return rows
    .map((m: any) => ({
      id: String(m.id),
      name: m.title?.english || m.title?.romaji || 'Untitled',
      poster: m.coverImage?.large || null,
      type: classifyManga(m.countryOfOrigin, m.format),
    }))
    .filter((m: SelectedMedia) => m.id && m.id !== '0');
}

export function MediaPicker({
  trigger,
  onSelect,
}: {
  trigger: React.ReactNode;
  onSelect: (media: SelectedMedia) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('anime');
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');

  // Live search, debounced — no Enter/submit needed.
  useEffect(() => {
    const id = setTimeout(() => setQuery(raw.trim()), 350);
    return () => clearTimeout(id);
  }, [raw]);

  const anime = useSearch(tab === 'anime' ? query : '', 1);
  const manga = useQuery({
    queryKey: ['media-picker-manga', query],
    queryFn: () => searchAniListManga(query),
    enabled: tab === 'manga' && query.length > 1,
    staleTime: 5 * 60 * 1000,
  });
  const characters = useAniListCharacterSearch(tab === 'character' ? query : '', tab === 'character');

  const loading = tab === 'anime' ? anime.isLoading : tab === 'manga' ? manga.isLoading : characters.isLoading;
  const rows: SelectedMedia[] =
    tab === 'anime'
      ? (anime.data?.animes ?? []).map((a: any) => ({ id: String(a.id), name: a.name, poster: a.poster || null, type: 'anime' as MediaType }))
      : tab === 'manga'
        ? (manga.data ?? [])
        : (characters.data ?? []).map((c: any) => ({
            id: String(c.id),
            name: c.name?.full || 'Unknown Character',
            poster: c.image?.large || c.image?.medium || null,
            type: 'character' as MediaType,
          }));

  const pick = (m: SelectedMedia) => {
    onSelect(m);
    setOpen(false);
    setRaw('');
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="mb-2 flex gap-1 rounded-lg bg-muted/40 p-1">
          {(['anime', 'manga', 'character'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors', tab === t ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              {t === 'manga' ? 'Manga' : t === 'character' ? 'Character' : 'Anime'}
            </button>
          ))}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={`Search ${tab}…`} className="h-9 pl-8 text-sm" />
        </div>
        <ScrollArea className="h-64 pr-2">
          {query.trim().length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Type to search {tab}.</p>
          ) : loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No results.</p>
          ) : (
            <div className="space-y-1">
              {rows.map((m) => (
                <button key={`${m.type}-${m.id}`} type="button" onClick={() => pick(m)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-white/5">
                  <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    {m.poster && <img src={getProxiedImageUrl(m.poster)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.type}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
