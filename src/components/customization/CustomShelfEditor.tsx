import { ThemedSelect } from '@/components/ui/themed-select';
import { customizationLabel as label } from '@/lib/customizationLabels';
import { useState } from 'react';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCustomHome, useCustomSources } from '@/hooks/api/useCustomSource';
import { useAniListGenres } from '@/hooks/api/useAniListGenres';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CustomShelf, ShelfSource } from '@/lib/customization';

const fieldClass = 'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm';
export function CustomShelfEditor({ initial, onSave, onCancel }: { initial?: CustomShelf; onSave(shelf: CustomShelf): void; onCancel(): void }) {
  useUiTranslation();
  const [title, setTitle] = useState(initial?.title || label("My section"));
  const [kind, setKind] = useState<ShelfSource['kind']>(initial?.source.kind || 'anime');
  const filters = initial?.source && 'filters' in initial.source ? initial.source.filters as Record<string, any> || {} : {};
  const [query, setQuery] = useState(initial?.source.kind === 'provider-search' ? initial.source.query : filters.query || '');
  const [genre, setGenre] = useState(filters.genre || filters.genres?.[0] || '');
  const [tags, setTags] = useState((filters.tags || []).join(', '));
  const [sort, setSort] = useState(filters.sortBy || filters.sort || 'POPULARITY_DESC');
  const [format, setFormat] = useState(filters.format?.[0] || filters.mangaType || '');
  const [year, setYear] = useState(filters.year?.min ? String(filters.year.min) : '');
  const [status, setStatus] = useState(filters.status?.[0] || '');
  const [origin, setOrigin] = useState(filters.origin || '');
  const [providerKey, setProviderKey] = useState(initial && ('namespace' in initial.source) ? JSON.stringify([initial.source.namespace, initial.source.sourceId]) : '');
  const [catalogKey, setCatalogKey] = useState(initial?.source.kind === 'provider-catalog' ? initial.source.catalogId || initial.source.sectionId || initial.source.sectionTitle || '' : '');
  const [providerFilters, setProviderFilters] = useState<Record<string, any>>(kind === 'provider-search' ? filters : {});
  const { genres } = useAniListGenres();
  const sources = useCustomSources();
  const selected = sources.data?.find(source => JSON.stringify([source.namespace, source.id]) === providerKey);
  const home = useCustomHome(selected?.namespace, selected?.id);
  const providerMode = kind.startsWith('provider-');
  function save() {
    if (!title.trim() || (providerMode && !selected)) return;
    const selectedTags = [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))];
    let source: ShelfSource;
    if (kind === 'provider-search') source = { kind, namespace: selected!.namespace, sourceId: selected!.id, query: query.trim(), filters: providerFilters };
    else if (kind === 'provider-catalog') {
      const section = home.data?.sections.find(section => (section.pagination?.catalogId || section.id || section.title) === catalogKey) || home.data?.sections[0];
      if (!section) return;
      source = { kind, namespace: selected!.namespace, sourceId: selected!.id, catalogId: section.pagination?.catalogId, sectionId: section.id, sectionTitle: section.title };
    } else source = { kind, filters: kind === 'anime'
      ? { query: query.trim(), genres: genre ? [genre] : undefined, tags: selectedTags.length ? selectedTags : undefined, format: format ? [format] : undefined, status: status ? [status] : undefined, year: year ? { min: Number(year), max: Number(year) } : undefined, sortBy: sort }
      : { query: query.trim(), genre: genre || undefined, tags: selectedTags.length ? selectedTags : undefined, tagSource: selectedTags.length ? 'anilist' : undefined, mangaType: kind === 'manga' && format ? format : undefined, origin: origin || undefined, sort: kind === 'manga' && selectedTags.length ? 'POPULARITY_DESC' : sort } };
    onSave({ id: initial?.id || `custom-${crypto.randomUUID()}`, title: title.trim(), source });
  }
  return <div className="rounded-2xl border border-border bg-card p-4 space-y-4" aria-label={label("Section source editor")}>
    <label className="block text-sm">{label("Section title")}<Input value={title} maxLength={100} onChange={event => setTitle(event.target.value)} /></label>
    <label className="block text-sm">{label("Source")}<ThemedSelect className={fieldClass} value={providerMode ? 'provider' : kind} onChange={event => { setKind(event.target.value === 'provider' ? 'provider-catalog' : event.target.value as ShelfSource['kind']); setFormat(''); setSort('POPULARITY_DESC'); }}>
      <option value="anime">{label("Anime")}</option><option value="manga">{label("Manga")}</option><option value="novel">{label("Novels")}</option><option value="provider">{label("Provider")}</option>
    </ThemedSelect></label>
    {providerMode ? <>
      <label className="block text-sm">{label("Provider")}<ThemedSelect className={fieldClass} value={providerKey} onChange={event => { setProviderKey(event.target.value); setCatalogKey(''); setProviderFilters({}); }}><option value="">{label("Choose a connected provider")}</option>{sources.data?.map(source => <option key={`${source.namespace}/${source.id}`} value={JSON.stringify([source.namespace, source.id])}>{source.name}</option>)}</ThemedSelect></label>
      {selected && <div className="flex gap-2"><Button type="button" size="sm" variant={kind === 'provider-catalog' ? 'default' : 'outline'} onClick={() => setKind('provider-catalog')}>{label('Catalog')}</Button><Button type="button" size="sm" disabled={selected.supportsSearch === false} variant={kind === 'provider-search' ? 'default' : 'outline'} onClick={() => setKind('provider-search')}>{label('Search')}</Button></div>}
      {kind === 'provider-catalog' ? <label className="block text-sm">{label("Catalog section")}<ThemedSelect className={fieldClass} value={catalogKey} onChange={event => setCatalogKey(event.target.value)}><option value="">{label("Choose a catalog")}</option>{home.data?.sections.map((section, index) => <option key={index} value={section.pagination?.catalogId || section.id || section.title}>{section.title}</option>)}</ThemedSelect></label> : <>
        <label className="block text-sm">{label("Search")}<Input value={query} onChange={event => setQuery(event.target.value)} /></label>
        {selected?.supportsSearch === false && <p className="text-sm text-muted-foreground">{label("This provider supports catalog browsing. Choose Provider catalog.")}</p>}
        <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{label('Filters')}</summary><div className="mt-3 space-y-3">
        {home.data?.filters?.groups?.map(group => <label key={group.key} className="block text-sm">{group.label}<ThemedSelect className={fieldClass} value={providerFilters[group.key] || ''} onChange={event => setProviderFilters(value => ({ ...value, [group.key]: event.target.value || undefined }))}><option value="">{label("Any")}</option>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</ThemedSelect></label>)}
        {home.data?.filters?.tags?.length ? <fieldset><legend className="text-sm">{label("Provider tags")}</legend><div className="flex flex-wrap gap-2">{home.data.filters.tags.map(tag => <label key={tag} className="rounded-lg border border-border p-2 text-sm"><input type="checkbox" className="mr-2" checked={providerFilters.tags?.includes(tag) || false} onChange={event => setProviderFilters(value => ({ ...value, tags: event.target.checked ? [...(value.tags || []), tag] : (value.tags || []).filter((item: string) => item !== tag) }))} />{tag}</label>)}</div></fieldset> : null}        </div></details>

      </>}
      {home.isError && <p role="alert" className="text-sm text-destructive">{label("Provider catalogs could not load.")}</p>}
    </> : <>
      <label className="block text-sm">{label("Search")}<Input value={query} onChange={event => setQuery(event.target.value)} placeholder={label("Optional title search")} /></label>
      <label className="block text-sm">{label("Genre")}<ThemedSelect className={fieldClass} value={genre} onChange={event => setGenre(event.target.value)}><option value="">{label("All genres")}</option>{genres.map(value => <option key={value} value={value}>{value}</option>)}</ThemedSelect></label>
      <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{label('Filters')}</summary><div className="mt-3 space-y-3">
      <label className="block text-sm">{label("AniList tags")}<Input value={tags} onChange={event => setTags(event.target.value)} placeholder={label("Comma-separated catalog tag names")} /></label>
      {kind === 'anime' ? <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">{label("Format")}<ThemedSelect className={fieldClass} value={format} onChange={event => setFormat(event.target.value)}><option value="">{label("All anime formats")}</option>{['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'].map(value => <option key={value}>{value}</option>)}</ThemedSelect></label>
        <label className="text-sm">{label("Status")}<ThemedSelect className={fieldClass} value={status} onChange={event => setStatus(event.target.value)}><option value="">{label("Any status")}</option>{['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'].map(value => <option key={value}>{value}</option>)}</ThemedSelect></label>
        <label className="text-sm">{label("Release year")}<Input type="number" min={1900} max={new Date().getFullYear() + 5} value={year} onChange={event => setYear(event.target.value)} /></label>
      </div> : <div className="grid grid-cols-2 gap-3">
        {kind === 'manga' && <label className="text-sm">{label("Type")}<ThemedSelect className={fieldClass} value={format} onChange={event => setFormat(event.target.value)}><option value="">{label("All manga")}</option>{['manga', 'manhwa', 'manhua', 'one_shot'].map(value => <option key={value}>{value}</option>)}</ThemedSelect></label>}
        <label className="text-sm">{label("Origin")}<ThemedSelect className={fieldClass} value={origin} onChange={event => setOrigin(event.target.value)}><option value="">{label("Any origin")}</option>{['JP', 'KR', 'CN', 'TW'].map(value => <option key={value}>{value}</option>)}</ThemedSelect></label>
      </div>}
      <label className="block text-sm">{label("Sort")}<ThemedSelect className={fieldClass} disabled={kind === 'manga' && Boolean(tags.trim())} value={kind === 'manga' && tags.trim() ? 'POPULARITY_DESC' : sort} onChange={event => setSort(event.target.value)}><option value="POPULARITY_DESC">{label("Popularity")}</option><option value="SCORE_DESC">{label("Top rated")}</option><option value="TRENDING_DESC">{label("Trending")}</option><option value="START_DATE_DESC">{label("Newest")}</option>{kind === 'anime' && <option value="TITLE_ROMAJI">{label("A–Z")}</option>}</ThemedSelect></label>      </div></details>

    </>}
    <div className="flex gap-2"><Button type="button" disabled={!title.trim() || (providerMode && !selected) || (kind === 'provider-search' && (selected?.supportsSearch === false || (!query.trim() && !Object.values(providerFilters).some(Boolean))))} onClick={save}>{initial ? label('Done') : label('Create section')}</Button><Button type="button" variant="outline" onClick={onCancel}>{label("Cancel")}</Button></div>
  </div>;
}
