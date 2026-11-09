import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { HeroSection } from '@/components/anime/HeroSection';
import { MangaHeroSection } from '@/components/manga/MangaHeroSection';
import { NovelHeroSection } from '@/components/novel/NovelHeroSection';
import { TVCinematicHero } from '@/components/tv/TVCinematicHero';
import { Header } from '@/components/layout/Header';
import { SpotlightControls } from '@/components/customization/SpotlightControls';
import { SpotlightPresentationProvider } from '@/components/customization/SpotlightPresentation';
import { CardDesignPreviewProvider } from '@/components/customization/CardDesignContext';
import { ThemedSelect } from '@/components/ui/themed-select';
import { Button } from '@/components/ui/button';
import { useHomeData } from '@/hooks/api/useAnimeData';
import { useMangaHome } from '@/hooks/api/useMangaHome';
import { useNovelHome } from '@/hooks/api/useNovelData';
import { useMobileConfig } from '@/hooks/ui/useMobileConfig';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { CustomizationScopeProvider, useCustomizationScope } from '@/hooks/ui/useCustomization';
import { customizationLabel as label } from '@/lib/customizationLabels';
import { toMangaSpotlight } from '@/lib/mangaSpotlight';
import type { LayoutTarget, SpotlightPresentation } from '@/lib/customization';
import type { SpotlightAnime } from '@/types/anime';
import type { UnifiedMediaCardProps } from '@/components/UnifiedMediaCard';

type Medium = 'anime' | 'manga' | 'novel';
function readingCard(row: any, kind: 'manga' | 'novel'): UnifiedMediaCardProps['item'] {
  return { id: String(row.id || row.anilistId || row.malId), name: row.canonicalTitle || row.title?.english || row.title?.romaji || '', poster: row.poster || '', banner: row.banner,
    description: row.description || row.synopsis || '', mediaType: kind, type: row.type || row.format || kind, status: row.status, chapters: row.chapters, year: row.year, rating: row.score ? row.score / 10 : undefined, anilistId: row.anilistId, malId: row.malId };
}
function PreviewState({ loading, failed, retry }: { loading?: boolean; failed?: boolean; retry(): void }) {
  return <div className="grid min-h-[320px] place-items-center rounded-2xl border border-border p-6 text-center text-muted-foreground"><div><p>{loading ? label('Loading preview') : failed ? label('Spotlight preview could not load') : label('No spotlight content is available')}</p>{!loading && <Button variant="outline" className="mt-3" onClick={retry}>{label('Retry')}</Button>}</div></div>;
}
function ContentPreview({ medium, target }: { medium: Medium; target: LayoutTarget }) {
  return medium === 'anime' ? <AnimePreview target={target} /> : <ReadingPreview kind={medium} target={target} />;
}
function AnimePreview({ target }: { target: LayoutTarget }) {
  const result = useHomeData();
  const items = result.data?.spotlightAnimes || [];
  if (!items.length) return <PreviewState loading={result.isLoading} failed={Boolean(result.error)} retry={() => void result.refetch()} />;
  return target === 'tv' ? <TVPreview item={items[0]} /> : <HeroSection spotlight={items[0]} spotlights={items} hideCatalogActions />;
}
function ReadingPreview({ kind, target }: { kind: 'manga' | 'novel'; target: LayoutTarget }) {
  return kind === 'manga' ? <MangaPreview target={target} /> : <NovelPreview target={target} />;
}
function MangaPreview({ target }: { target: LayoutTarget }) {
  const result = useMangaHome();
  const items = (result.data?.spotlight?.length ? result.data.spotlight : result.data?.topRated || []).map(row => readingCard(row, 'manga')).filter(item => item.name);
  if (!items.length) return <PreviewState loading={result.isLoading} failed={Boolean(result.error)} retry={() => void result.refetch()} />;
  return target === 'tv' ? <TVPreview item={toMangaSpotlight(items[0])} /> : <MangaHeroSection spotlight={items[0]} spotlights={items} />;
}
function NovelPreview({ target }: { target: LayoutTarget }) {
  const result = useNovelHome();
  const items = (result.data?.spotlight?.length ? result.data.spotlight : result.data?.topRated || []).map(row => readingCard(row, 'novel')).filter(item => item.name);
  if (!items.length) return <PreviewState loading={result.isLoading} failed={Boolean(result.error)} retry={() => void result.refetch()} />;
  return target === 'tv' ? <TVPreview item={toMangaSpotlight(items[0])} /> : <NovelHeroSection spotlight={items[0]} spotlights={items} />;
}
function TVPreview({ item }: { item: SpotlightAnime }) {
  return <TVCinematicHero title={item.name} artwork={item.banner || item.poster} logo={item.titleLogo || item.logo} facts={item.otherInfo} description={item.description} actions={<button className="tv-primary">{label('Open title')}</button>} />;
}
function DevicePreview({ target, children }: { target: LayoutTarget; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 720 });
  const width = target === 'mobile' ? 420 : target === 'tv' ? 1280 : 1120;
  useLayoutEffect(() => {
    const measure = () => {
      if (!container.current || !canvas.current) return;
      const scale = Math.min(1, (container.current.clientWidth || width) / width);
      setSize({ scale, height: (canvas.current.offsetHeight || 720) * scale });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure); observer.observe(container.current!); observer.observe(canvas.current!);
    return () => observer.disconnect();
  }, [width]);
  return <div ref={container} className="spotlight-preferences-preview relative w-full overflow-hidden rounded-2xl border border-border" data-preview-target={target} style={{ height: size.height }}><div ref={canvas} data-spotlight-page className="spotlight-preview-page relative origin-top-left p-6" style={{ width, transform: `scale(${size.scale})` }}>
    {target !== 'tv' && <div aria-hidden="true" {...({ inert: '' } as any)} onClickCapture={event => { event.preventDefault(); event.stopPropagation(); }}><Header alignWithPage /></div>}{children}
  </div></div>;
}

/** The same controls and actual home renderers, shared across every content home. */
export function SpotlightCustomizationEditor({ value, onChange, target, themeId }: { value?: SpotlightPresentation | null; onChange(value: SpotlightPresentation | null): void; target?: LayoutTarget; themeId?: string }) {
  useUiTranslation();
  const scope = useCustomizationScope();
  const device = target || scope.target;
  const [medium, setMedium] = useState<Medium>('anime');
  const { config: mobile } = useMobileConfig();
  const previewValue = !value?.variant || value.variant === 'default' ? { ...value, variant: device === 'mobile' && mobile.mobileLayout === 'refreshed' ? 'cinematic' as const : device === 'tv' ? 'default' as const : 'classic' as const } : value;
  return <div className="space-y-5" data-spotlight-preferences-editor>
    <p className="text-sm text-muted-foreground">{label('One Spotlight template for every home on this device.')}</p>
    <SpotlightControls value={value} onChange={onChange} />
    <div className="flex flex-wrap items-end gap-3"><label className="mr-auto text-sm">{label('Preview content')}<ThemedSelect className="mt-1 min-w-[160px]" value={medium} onChange={event => setMedium(event.target.value as Medium)}><option value="anime">{label('Anime')}</option><option value="manga">{label('Manga')}</option><option value="novel">{label('Novels')}</option></ThemedSelect></label><Button variant="ghost" onClick={() => onChange({ variant: 'default' })}>{label('Reset Spotlight')}</Button></div>
    <CustomizationScopeProvider themeId={themeId || scope.themeId} target={device}><CardDesignPreviewProvider design={null} readOnly><SpotlightPresentationProvider presentation={previewValue} editing onChange={change => onChange({ ...value, ...change })}><DevicePreview target={device}><ContentPreview medium={medium} target={device} /></DevicePreview></SpotlightPresentationProvider></CardDesignPreviewProvider></CustomizationScopeProvider>
  </div>;
}
