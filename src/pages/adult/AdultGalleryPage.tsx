import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { GalleryImageCache } from '@/lib/galleryImageCache';
import { ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, Heart, ImageOff, Images, LayoutGrid, Loader2, Shuffle, SlidersHorizontal, X } from 'lucide-react';
import { AdultPageShell } from '@/components/content/AdultPageShell';
import { GalleryFilterMenu, type GalleryFilterOption } from '@/components/content/GalleryFilterMenu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import { SlidingTabList } from '@/components/ui/sliding-tab-list';
import { adultApi, type AdultMedia } from '@/lib/adultApi';
import { galleryImageUrl, pornhwaIdentityFromMedia, pornhwaSeriesHref } from '@/lib/pornhwaIdentity';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { useModalTransition } from '@/hooks/ui/useModalTransition';
import { normalizeAdultCategories } from '@/lib/adultContentPolicy';

interface Panel {
  id: number;
  image_path: string;
  thumbnail_path?: string;
  pornhwa_title: string;
  pornhwa_id: number;
  panel_type: string;
  total_likes: number;
  chapter_start?: number;
  chapter_end?: number;
  gallery_chapter_number?: number;
  uploaded_at?: string;
}
interface GalleryPage { panels: Panel[]; pagination: { hasMore: boolean; nextCursor?: string; total?: number }; stale?: boolean }
interface Options { pornhwaTitles?: Array<{ id: number; title: string }>; characters?: Array<{ id: number; name: string }> }
interface Facets { tags?: Array<{ id: number; name: string }> }
const split = (value: string | null) => [...new Set((value || '').split(',').filter(Boolean))];
const panelTypes = ['panel', 'sticker', 'edit'];
const typeLabels: Record<string, string> = { panel: 'Panel', sticker: 'Sticker', edit: 'Edit' };
const uniquePanels = (pages: GalleryPage[]) => [...new Map(pages.flatMap(page => page.panels).map(panel => [panel.id, panel])).values()];
const chapter = (panel: Panel) => {
  const start = panel.chapter_start ?? panel.gallery_chapter_number;
  return start == null ? null : 'Chapter ' + start + (panel.chapter_end != null && panel.chapter_end !== start ? '–' + panel.chapter_end : '');
};

export default function AdultGalleryPage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Panel | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'masonry'>('masonry');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [randomSeed] = useState(() => String(Date.now()));
  const queryClient = useQueryClient();
  const imageCache = useMemo(() => new GalleryImageCache(), []);
  const navigation = useRef(0);
  const pendingIndex = useRef<number | null>(null);
  const [displayImage, setDisplayImage] = useState('');
  useEffect(() => () => { navigation.current++; imageCache.clear(); }, [imageCache]);
  const { settings } = useContentSafetySettings();
  const { openSettings } = useSettingsModal();
  const enabled = normalizeAdultCategories(settings.adultCategories).explicit;
  const lightbox = useModalTransition(lightboxOpen && enabled);
  const filters: Record<string, string> = { ...Object.fromEntries(params), ...(params.get('sort') === 'random' ? { randomSeed: params.get('randomSeed') || randomSeed } : {}) };
  const selectedTitles = split(params.get('pornhwaIds'));
  const selectedCharacters = split(params.get('characterIds'));
  const selectedTags = split(params.get('tagIds'));
  const activeTypes = params.has('panelTypes') ? split(params.get('panelTypes')) : panelTypes;
  const filterCount = ['pornhwaIds', 'characterIds', 'tagIds', 'chapters', 'search', 'orientation', 'uploadedFrom', 'uploadedTo', 'panelTypes'].filter(key => params.has(key)).length;
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value || key === 'panelTypes' ? next.set(key, value) : next.delete(key);
    next.delete('cursor');
    next.delete('offset');
    if (key === 'pornhwaIds') { next.delete('characterIds'); next.delete('chapters'); }
    setLightboxOpen(false);
    navigation.current++;
    pendingIndex.current = null;
    setParams(next, { replace: true });
  };
  const clear = () => { setLightboxOpen(false); setParams({}); };
  const optionsQuery = useQuery({
    queryKey: ['adult-gallery-options', selectedTitles.join(',')],
    queryFn: ({ signal }) => adultApi<Options>('gallery/options', { pornhwaIds: selectedTitles.join(',') }, signal),
    enabled: enabled && (filtersOpen || selectedTitles.length > 0 || selectedCharacters.length > 0),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const facetsQuery = useQuery({
    queryKey: ['adult-gallery-facets', selectedTitles.join(',')],
    queryFn: ({ signal }) => adultApi<Facets>('gallery/facets', { pornhwaId: selectedTitles[0] }, signal),
    enabled: enabled && filtersOpen,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const query = useInfiniteQuery({
    queryKey: ['adult-gallery', params.toString(), filters.randomSeed],
    queryFn: ({ pageParam, signal }) => adultApi<GalleryPage>('gallery', { ...filters, ...pageParam, limit: '30' }, signal),
    initialPageParam: {} as Record<string, string>,
    getNextPageParam: (last, pages) => last.pagination.hasMore
      ? filters.sort === 'random'
        ? { offset: String(pages.reduce((count, page) => count + page.panels.length, 0)), randomSeed: filters.randomSeed || randomSeed }
        : last.pagination.nextCursor ? { cursor: last.pagination.nextCursor } : undefined
      : undefined,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const panels = useMemo(() => uniquePanels(query.data?.pages || []), [query.data]);
  const total = query.data?.pages[0]?.pagination.total;
  const fullQuery = useQuery({
    queryKey: ['adult-gallery-panel', selected?.id, params.get('hd') || 'false'],
    queryFn: ({ signal }) => adultApi<Panel>('gallery/' + selected!.id, { hd: params.get('hd') || 'false' }, signal),
    enabled: lightboxOpen && !!selected && enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const identityQuery = useQuery({
    queryKey: ['adult-gallery-series', selected?.pornhwa_id],
    queryFn: ({ signal }) => adultApi<AdultMedia>('media/' + encodeURIComponent('pornhwadb:' + selected!.pornhwa_id), {}, signal),
    enabled: lightboxOpen && !!selected && enabled,
    retry: false,
  });
  const seriesIdentity = identityQuery.data && pornhwaIdentityFromMedia(identityQuery.data);
  const seriesHref = pornhwaSeriesHref(seriesIdentity || { pornhwaId: String(selected?.pornhwa_id || '') });
  const index = selected ? panels.findIndex(panel => panel.id === selected.id) : -1;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const nextPageTrigger = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled || !nextPageTrigger.current || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void fetchNextPage(); }, { rootMargin: '600px' });
    observer.observe(nextPageTrigger.current);
    return () => observer.disconnect();
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage]);
  const preparePanel = useCallback(async (panel: Panel) => {
    const full = await queryClient.fetchQuery({
      queryKey: ['adult-gallery-panel', panel.id, params.get('hd') || 'false'],
      queryFn: ({ signal }) => adultApi<Panel>('gallery/' + panel.id, { hd: params.get('hd') || 'false' }, signal),
      staleTime: 5 * 60_000,
    }).catch(() => panel);
    const prepared = { ...panel, ...full };
    const url = galleryImageUrl(prepared.image_path || panel.image_path);
    const image = await imageCache.prepare(url).catch(() => imageCache.prepare(galleryImageUrl(panel.thumbnail_path || panel.image_path)));
    return { panel: prepared, image };
  }, [queryClient, params, imageCache]);
  const openPanel = (panel: Panel) => {
    const ticket = ++navigation.current;
    pendingIndex.current = null;
    setSelected(panel);
    setDisplayImage(galleryImageUrl(panel.thumbnail_path || panel.image_path));
    setLightboxOpen(true);
    void preparePanel(panel).then(prepared => { if (ticket === navigation.current) setDisplayImage(prepared.image); }).catch(() => undefined);
  };
  useEffect(() => {
    if (!lightboxOpen || index < 0) return;
    for (const offset of [-1, 1, 2]) {
      const panel = panels[index + offset];
      if (panel) void preparePanel(panel).catch(() => undefined);
    }
    if (index >= panels.length - 3 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [lightboxOpen, index, panels, preparePanel, hasNextPage, isFetchingNextPage, fetchNextPage]);
  const move = useCallback(async (direction: number) => {
    const next = (pendingIndex.current ?? index) + direction;
    if (next < 0) return;
    const ticket = ++navigation.current;
    pendingIndex.current = next;
    let panel = panels[next];
    if (!panel && direction > 0 && hasNextPage) {
      const result = await fetchNextPage();
      const extended = uniquePanels(result.data?.pages || []);
      panel = extended[next];
    }
    if (!panel || ticket !== navigation.current) return;
    const prepared = await preparePanel(panel).catch(() => null);
    if (prepared && ticket === navigation.current) { setSelected(prepared.panel); setDisplayImage(prepared.image); pendingIndex.current = null; }
  }, [index, panels, fetchNextPage, hasNextPage, preparePanel]);
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); void move(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, move]);
  const titleOptions: GalleryFilterOption[] = (optionsQuery.data?.pornhwaTitles || []).map(row => ({ id: String(row.id), label: row.title }));
  const characterOptions: GalleryFilterOption[] = (optionsQuery.data?.characters || []).map(row => ({ id: String(row.id), label: row.name }));
  const tagOptions: GalleryFilterOption[] = (facetsQuery.data?.tags || []).map(row => ({ id: String(row.id), label: row.name }));
  const chips = [
    ...selectedTitles.map(id => ({ key: 'pornhwaIds', id, label: titleOptions.find(row => row.id === id)?.label || 'Series ' + id })),
    ...selectedCharacters.map(id => ({ key: 'characterIds', id, label: characterOptions.find(row => row.id === id)?.label || 'Character ' + id })),
    ...selectedTags.map(id => ({ key: 'tagIds', id, label: tagOptions.find(row => row.id === id)?.label || 'Tag ' + id })),
  ];

  return <>
    <AdultPageShell header={{ providerSearch: { name: 'Gallery', query: params.get('search') || '', onSearch: value => update('search', value) } }}>
      <div className="gallery-heading">
        <div><h1>Gallery</h1>{total != null && <p className="gallery-count">{total.toLocaleString()} images</p>}</div>
        {enabled && <div className="gallery-toolbar">
          <Button variant="outline" aria-expanded={filtersOpen} aria-controls="gallery-filters" onClick={() => setFiltersOpen(value => !value)}>
            <SlidersHorizontal size={16} strokeWidth={1.5} /> Filters{filterCount > 0 && <span className="ml-1 tabular-nums">{filterCount}</span>}
          </Button>
          <ThemedSelect aria-label="Gallery sort" value={params.get('sort') || 'newest'} onChange={event => update('sort', event.target.value)}>
            <option value="newest">Newest uploads</option><option value="oldest">Oldest uploads</option><option value="popular_all">Most liked</option>
            <option value="random">Random</option><option value="chapter_asc">Chapter order</option><option value="chapter_desc">Latest chapters</option>
          </ThemedSelect>
          <SlidingTabList className="gallery-layout-switch" role="group" aria-label="Gallery layout">
            <button type="button" aria-label="Masonry layout" aria-pressed={layout === 'masonry'} onClick={() => setLayout('masonry')}><Images size={16} strokeWidth={1.5} /></button>
            <button type="button" aria-label="Grid layout" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={16} strokeWidth={1.5} /></button>
          </SlidingTabList>
          {params.get('sort') === 'random' && <Button variant="ghost" onClick={() => update('randomSeed', String(Date.now()))}><Shuffle size={16} strokeWidth={1.5} /> Shuffle</Button>}
        </div>}
      </div>
      {!enabled ? <div className="gallery-state">
        <Images size={24} strokeWidth={1.5} /><h2>Gallery is hidden</h2><p>Enable the explicit category to browse images</p><Button variant="outline" onClick={() => openSettings('nsfw')}>Content settings</Button>
      </div> : <>
        {filtersOpen && <section id="gallery-filters" aria-label="Gallery filters" className="gallery-filter-surface">
          <div className="gallery-filter-grid">
            <GalleryFilterMenu label="Titles" options={titleOptions} selected={selectedTitles} onChange={ids => update('pornhwaIds', ids.join(','))} disabled={optionsQuery.isPending} />
            <GalleryFilterMenu label="Characters" options={characterOptions} selected={selectedCharacters} onChange={ids => update('characterIds', ids.join(','))} disabled={optionsQuery.isPending} />
            <GalleryFilterMenu label="Tags" options={tagOptions} selected={selectedTags} onChange={ids => update('tagIds', ids.join(','))} disabled={facetsQuery.isPending} />
            <label className="gallery-filter-field"><span>Chapters</span><Input aria-label="Chapters" placeholder="1, 2, 3" value={params.get('chapters') || ''} onChange={event => update('chapters', event.target.value)} /></label>
            <label className="gallery-filter-field"><span>Uploaded from</span><Input type="date" aria-label="Uploaded from" value={params.get('uploadedFrom') || ''} onChange={event => update('uploadedFrom', event.target.value)} /></label>
            <label className="gallery-filter-field"><span>Uploaded until</span><Input type="date" aria-label="Uploaded until" value={params.get('uploadedTo') || ''} onChange={event => update('uploadedTo', event.target.value)} /></label>
            <label className="gallery-filter-field"><span>Orientation</span><ThemedSelect aria-label="Orientation" value={params.get('orientation') || ''} onChange={event => update('orientation', event.target.value)}>
              <option value="">All orientations</option><option value="yaoi">Yaoi</option><option value="yuri">Yuri</option>
            </ThemedSelect></label>
          </div>
          <div className="gallery-filter-options">
            {panelTypes.map(type => <label key={type}><Checkbox checked={activeTypes.includes(type)} onCheckedChange={checked => {
              const selectedTypes = new Set(activeTypes);
              checked ? selectedTypes.add(type) : selectedTypes.delete(type);
              update('panelTypes', panelTypes.filter(value => selectedTypes.has(value)).join(','));
            }} />{typeLabels[type] + 's'}</label>)}
            <label><Checkbox checked={params.get('hd') === 'true'} onCheckedChange={checked => update('hd', checked ? 'true' : '')} />High resolution</label>
            <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>
          </div>
          {optionsQuery.error && <p role="status" className="mt-4 text-sm text-muted-foreground">Title filters are unavailable <button className="underline" onClick={() => optionsQuery.refetch()}>Retry</button></p>}
        </section>}
        {chips.length > 0 && <div className="gallery-active-filters" aria-label="Selected filters">
          {chips.map(item => <button key={item.key + item.id} type="button" className="gallery-active-filter" aria-label={'Remove ' + item.label} onClick={() => update(item.key, split(params.get(item.key)).filter(id => id !== item.id).join(','))}><span>{item.label}</span><X size={12} strokeWidth={1.5} /></button>)}
        </div>}
        {query.error ? <div role="alert" className="gallery-state"><ImageOff size={24} strokeWidth={1.5} /><h2>Gallery is unavailable</h2><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Try again</Button></div>
          : query.isPending ? <div className="gallery-grid" role="status" aria-label="Loading Gallery">{Array.from({ length: 10 }, (_, i) => <div key={i} className="gallery-loading-card" />)}</div>
          : <>
            {query.data?.pages[0]?.stale && <p role="status" className="mb-4 text-sm text-muted-foreground">Showing saved results while PornhwaDB is unavailable</p>}
            <div className={layout === 'masonry' ? 'gallery-masonry' : 'gallery-grid'} data-gallery-layout={layout}>
              {panels.map(panel => <article key={panel.id} className="gallery-card" data-gallery-panel={panel.id}>
                <button type="button" className="gallery-panel-open" aria-label={'Open image from ' + panel.pornhwa_title} onClick={() => openPanel(panel)}>
                  <img data-image-original loading="lazy" decoding="async" className="gallery-card-image" src={galleryImageUrl(panel.thumbnail_path || panel.image_path)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/placeholder.svg'; }} />
                </button>
                <div className="gallery-card-caption">
                  <Link className="gallery-card-title" to={pornhwaSeriesHref({ pornhwaId: String(panel.pornhwa_id) })}>{panel.pornhwa_title}</Link>
                  <div className="gallery-card-meta"><span>{chapter(panel) || typeLabels[panel.panel_type] || 'Image'}</span><span><Heart size={12} strokeWidth={1.5} />{Number(panel.total_likes || 0).toLocaleString()}</span></div>
                </div>
              </article>)}
            </div>
            {!panels.length && <div className="gallery-state"><Images size={24} strokeWidth={1.5} /><h2>No images match these filters</h2><Button variant="outline" onClick={clear}>Clear filters</Button></div>}
            {query.hasNextPage && <div ref={nextPageTrigger} className="gallery-load-more"><Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage && <Loader2 size={16} className="animate-spin" />}Load more</Button></div>}
          </>}
      </>}
    </AdultPageShell>
    <Dialog open={lightbox.visible && enabled} onOpenChange={open => { if (!open) setLightboxOpen(false); }}>
      <DialogContent className="gallery-dialog z-[400]" overlayClassName="z-[399]" showCloseButton={false}>
        <div className={'t-modal gallery-lightbox ' + lightbox.motionClass}>
          <div className="gallery-lightbox-image">
            {selected && <img data-image-original src={displayImage || galleryImageUrl(selected.thumbnail_path || selected.image_path)} alt={'Gallery image from ' + selected.pornhwa_title} />}
          </div>
          <div className="gallery-lightbox-info">
            <button type="button" className="gallery-lightbox-close" aria-label="Close image" onClick={() => setLightboxOpen(false)}><X size={16} strokeWidth={1.5} /></button>
            <div><p className="mb-2 text-xs text-muted-foreground">{selected ? typeLabels[selected.panel_type] || 'Image' : 'Image'}</p><DialogTitle>{selected?.pornhwa_title || 'Gallery image'}</DialogTitle></div>
            <DialogDescription className="gallery-lightbox-meta">
              {selected && chapter(selected) && <span>{chapter(selected)}</span>}
              {selected && <span>{Number(selected.total_likes || 0).toLocaleString()} likes</span>}
              {index >= 0 && <span>{index + 1} of {(total || panels.length).toLocaleString()} images</span>}
            </DialogDescription>
            <Link to={seriesHref} className="gallery-lightbox-series">Open series <ArrowUpRight size={16} strokeWidth={1.5} /></Link>
            {fullQuery.error && <p role="status" className="text-xs text-muted-foreground">The full image is unavailable</p>}
            <div className="gallery-lightbox-actions">
              <Button variant="outline" aria-label="Previous image" disabled={index <= 0} onClick={() => void move(-1)}><ChevronLeft size={16} strokeWidth={1.5} />Previous</Button>
              <Button variant="outline" aria-label="Next image" disabled={index < 0 || (index >= panels.length - 1 && !query.hasNextPage) || query.isFetchingNextPage} onClick={() => void move(1)}>Next<ChevronRight size={16} strokeWidth={1.5} /></Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
