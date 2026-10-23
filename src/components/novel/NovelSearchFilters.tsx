import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
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
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">{uiI18n.t('app.novel_filters_44dcf40d')}</h3>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-origin" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.origin_44ab85a2')}</label>
        <ThemedSelect id="filter-novel-origin" className={selectClass} value={value.origin || ''} onChange={event => update({ origin: event.target.value || undefined })}>
          <option value="">{uiI18n.t('app.all_origins_8b645e03')}</option>
          <option value="JP">{uiI18n.t('app.japan_fcf29f6c')}</option><option value="KR">{uiI18n.t('app.south_korea_04653e65')}</option><option value="CN">{uiI18n.t('app.china_d2eaf2aa')}</option>
        </ThemedSelect>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-status" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.status_bae7d5be')}</label>
        <ThemedSelect id="filter-novel-status" className={selectClass} value={value.statuses?.[0] || ''} onChange={event => update({ statuses: event.target.value ? [event.target.value] : undefined })}>
          <option value="">{uiI18n.t('app.any_status_55201ac9')}</option><option value="ongoing">{uiI18n.t('app.ongoing_2e0254c2')}</option><option value="completed">{uiI18n.t('app.completed_1798b3ba')}</option>
          <option value="hiatus">{uiI18n.t('app.hiatus_f6eb2b71')}</option><option value="cancelled">{uiI18n.t('app.cancelled_a1bf92ef')}</option><option value="unreleased">{uiI18n.t('app.unreleased_81dd1756')}</option>
        </ThemedSelect>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-genre" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.genre_2aa31fca')}</label>
        <ThemedSelect id="filter-novel-genre" className={selectClass} value={value.genre || ''} onChange={event => update({ genre: event.target.value || undefined })}>
          <option value="">{uiI18n.t('app.any_genre_a2ae9cce')}</option>
          {value.genre && !genres.includes(value.genre) && <option value={value.genre}>{value.genre}</option>}
          {genres.map(genre => <option key={genre} value={genre}>{genre}</option>)}
        </ThemedSelect>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="filter-novel-sort" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.sort_method_7ae019e9')}</label>
        <ThemedSelect id="filter-novel-sort" className={selectClass} value={value.sort || ''} onChange={event => update({ sort: event.target.value || undefined })}>
          <option value="">{uiI18n.t('app.best_match_86f686f8')}</option><option value="POPULARITY_DESC">{uiI18n.t('app.popular_9bc2c5b3')}</option><option value="SCORE_DESC">{uiI18n.t('app.top_rated_fa405956')}</option>
          <option value="START_DATE_DESC">{uiI18n.t('app.newest_d0442824')}</option><option value="TITLE_ROMAJI">{uiI18n.t('app.name_a_z_5d3eb278')}</option>
        </ThemedSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="filter-novel-tag-source" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.tag_catalog_be9c0f1e')}</label>
        <ThemedSelect id="filter-novel-tag-source" className={selectClass} value={source} onChange={event => update({ tagSource: event.target.value as 'anilist' | 'mangabaka', tags: [] })}>
          <option value="anilist">{uiI18n.t('app.anilist_c03a6787')}</option><option value="mangabaka">{uiI18n.t('app.mangabaka_c4dfa49b')}</option>
        </ThemedSelect>
        <Input aria-label={uiI18n.t('app.search_novel_tags_4d3b76c1')} value={tagSearch} onChange={event => setTagSearch(event.target.value)} placeholder={uiI18n.t('app.search_novel_tags_07f81dee')} className="h-9 rounded-xl bg-background/80 border-white/10 text-xs" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <ThemedCheckbox type="checkbox" checked={showSpoilers} onChange={event => setShowSpoilers(event.target.checked)} className="accent-primary" />{uiI18n.t('app.show_spoiler_tags_de6453df')}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {value.tags?.map(tag => <button key={tag} type="button" aria-label={uiI18n.t('app.remove_novel_tag_i18n_value_0_94338df9', { value0: tag })} onClick={() => update({ tags: value.tags!.filter(name => name !== tag) })} className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary">{tag} ×</button>)}
        </div>
        {error ? <div role="alert" className="text-xs text-destructive">{error.message} <button type="button" className="underline" onClick={() => void refetch()}>{uiI18n.t('app.retry_tags_55aa8994')}</button></div>
          : isLoading ? <p className="text-xs text-muted-foreground">{uiI18n.t('app.loading_novel_tags_2fb405de')}</p>
          : <TagGroupCloud groups={groups} selected={value.tags || []} onToggle={name => update({ tags: value.tags?.includes(name) ? value.tags.filter(tag => tag !== name) : [...(value.tags || []), name] })} maxHeightClass="max-h-40" emptyText={uiI18n.t('app.no_tags_match_that_search_b5b4f8be')} />}
      </div>
      <label className="flex items-center gap-2 p-3 rounded-xl bg-background/70 border border-white/10 text-xs font-semibold">
        <ThemedCheckbox type="checkbox" checked={Boolean(value.adult)} onChange={event => update({ adult: event.target.checked })} className="w-4 h-4 accent-primary" />{uiI18n.t('app.18_adult_content_9017958f')}
      </label>
    </div>
  );
}
