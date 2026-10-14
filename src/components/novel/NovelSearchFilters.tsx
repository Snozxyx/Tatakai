import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TagGroupCloud } from '@/components/manga/TagGroupCloud';
import { getMangaTagOptions } from '@/core/content/manga-tag-search';
import type { NovelSearchOptions } from '@/core/content/novel-client';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';

const selectClass = 'w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/60 focus:ring-2 focus:ring-primary/20';

export function NovelSearchFilters({ value, onChange, genres }: {
  value: NovelSearchOptions;
  onChange: (value: NovelSearchOptions) => void;
  genres: string[];
}) {
  const [tagSearch, setTagSearch] = useState('');
  const [showSpoilers, setShowSpoilers] = useState(false);
  const { settings } = useContentSafetySettings();
  const source = value.tagSource || 'anilist';
  const { data: tags = [], isLoading, error, refetch } = useQuery({
    queryKey: [source === 'anilist' ? 'anilist-media-tags' : 'mangabaka-tags'],
    queryFn: () => getMangaTagOptions(source),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const groups = useMemo(() => {
    const buckets = new Map<string, typeof tags>();
    tags.filter(tag => (!tag.isAdult || settings.showAdultEverywhere || value.adult)
      && (showSpoilers || !tag.isGeneralSpoiler)
      && tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase()))
      .forEach(tag => {
        const category = tag.category || 'Other';
        buckets.set(category, [...(buckets.get(category) || []), tag]);
      });
    return Array.from(buckets, ([category, tags]) => ({ category, tags })).sort((a, b) => a.category.localeCompare(b.category));
  }, [tags, tagSearch, showSpoilers, settings.showAdultEverywhere, value.adult]);
  const update = (patch: Partial<NovelSearchOptions>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
      <div className="flex items-center gap-2 pb-2 border-b border-white/5">
        <BookOpen className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Novel Filters</h3>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-origin" className="text-xs text-muted-foreground font-semibold">Origin</label>
        <select id="filter-novel-origin" className={selectClass} value={value.origin || ''} onChange={event => update({ origin: event.target.value || undefined })}>
          <option value="">All origins</option>
          <option value="JP">Japan</option><option value="KR">South Korea</option><option value="CN">China</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-status" className="text-xs text-muted-foreground font-semibold">Status</label>
        <select id="filter-novel-status" className={selectClass} value={value.statuses?.[0] || ''} onChange={event => update({ statuses: event.target.value ? [event.target.value] : undefined })}>
          <option value="">Any status</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option>
          <option value="hiatus">Hiatus</option><option value="cancelled">Cancelled</option><option value="unreleased">Unreleased</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-genre" className="text-xs text-muted-foreground font-semibold">Genre</label>
        <select id="filter-novel-genre" className={selectClass} value={value.genre || ''} onChange={event => update({ genre: event.target.value || undefined })}>
          <option value="">Any genre</option>
          {value.genre && !genres.includes(value.genre) && <option value={value.genre}>{value.genre}</option>}
          {genres.map(genre => <option key={genre} value={genre}>{genre}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-sort" className="text-xs text-muted-foreground font-semibold">Sort Method</label>
        <select id="filter-novel-sort" className={selectClass} value={value.sort || ''} onChange={event => update({ sort: event.target.value || undefined })}>
          <option value="">Best match</option><option value="POPULARITY_DESC">Popular</option><option value="SCORE_DESC">Top rated</option>
          <option value="START_DATE_DESC">Newest</option><option value="TITLE_ROMAJI">Name A–Z</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="filter-novel-tag-source" className="text-xs text-muted-foreground font-semibold">Tag catalog</label>
        <select id="filter-novel-tag-source" className={selectClass} value={source} onChange={event => update({ tagSource: event.target.value as 'anilist' | 'mangabaka', tags: [] })}>
          <option value="anilist">AniList</option><option value="mangabaka">MangaBaka</option>
        </select>
        <Input aria-label="Search novel tags" value={tagSearch} onChange={event => setTagSearch(event.target.value)} placeholder="Search novel tags..." className="h-9 rounded-xl bg-background/80 border-white/10 text-xs" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showSpoilers} onChange={event => setShowSpoilers(event.target.checked)} className="accent-primary" />Show spoiler tags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {value.tags?.map(tag => <button key={tag} type="button" aria-label={`Remove novel tag ${tag}`} onClick={() => update({ tags: value.tags!.filter(name => name !== tag) })} className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary">{tag} ×</button>)}
        </div>
        {error ? <div role="alert" className="text-xs text-destructive">{error.message} <button type="button" className="underline" onClick={() => void refetch()}>Retry tags</button></div>
          : isLoading ? <p className="text-xs text-muted-foreground">Loading novel tags...</p>
          : <TagGroupCloud groups={groups} selected={value.tags || []} onToggle={name => update({ tags: value.tags?.includes(name) ? value.tags.filter(tag => tag !== name) : [...(value.tags || []), name] })} maxHeightClass="max-h-40" emptyText="No tags match that search." />}
      </div>
      <label className="flex items-center gap-2 p-3 rounded-xl bg-background/70 border border-white/10 text-xs font-semibold">
        <input type="checkbox" checked={Boolean(value.adult)} onChange={event => update({ adult: event.target.checked })} className="w-4 h-4 accent-primary" />18+ Adult Content
      </label>
    </div>
  );
}
