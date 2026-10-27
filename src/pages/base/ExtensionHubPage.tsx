import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import './extension-hub.css';
import { ExtensionStacks } from '@/components/extensions/ExtensionStacks';

import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { isMangaExtension } from '@/core/extensions/store-category';
import { ECOSYSTEMS } from "@/core/extensions/ecosystems";


import { InstalledCompatibilityExtensions } from '@/components/extensions/InstalledCompatibilityExtensions';
/** Extension workspace: discover the catalogue, manage the device library, and
 * configure source connections without stacking every tool into one screen. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ExternalLink,
  FolderUp,
  Puzzle,
  Library,
  SlidersHorizontal,
  Cable,
  Search,
  ShieldCheck,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsDesktopApp, useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { isIOS } from '@/lib/platform/platform';

import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import {
  ExtensionHeroCard,
  ExtensionRow,
  ExtensionTile,
  StoreShelf,
} from '@/components/extensions/store/StorePrimitives';
import { formatCompact } from '@/components/extensions/store/extensionVisuals';
import { useExtensionInstaller, useStoreCatalogue, useStoreExtensionDetail } from '@/hooks/api/useExtensionStore';
import {
  EXTENSION_PORTAL_URL,
  type StoreExtension,
  type StoreExtensionType,
} from '@/core/extensions/store-api';

const ExtensionServerStatus = lazy(() => import('@/components/extensions/ExtensionServerStatus').then(module => ({ default: module.ExtensionServerStatus })));
const ExtensionServersSettings = lazy(() => import('@/components/settings/ExtensionServersSettings').then(module => ({ default: module.ExtensionServersSettings })));
const RemoteExtensionsPanel = lazy(() => import('@/components/extensions/RemoteExtensionsPanel').then(module => ({ default: module.RemoteExtensionsPanel })));
const CompatibilityExtensionsPanel = lazy(() => import('@/components/extensions/CompatibilityExtensionsPanel').then(module => ({ default: module.CompatibilityExtensionsPanel })));
const SideloadExtensionModal = lazy(() => import('@/components/extensions/SideloadExtensionModal').then(module => ({ default: module.SideloadExtensionModal })));

/**
 * The manifest shape the runtime, the sideload modal and `extension_manifests`
 * all speak. It lives here for historical reasons — several modules import it
 * from this path — so it stays exported even though the store now renders
 * `StoreExtension`.
 */
export interface ExtensionManifest {
  upstreamType?: string;
  ecosystem?: import("@/core/extensions/ecosystems").ExtensionEcosystem;
  manifestUrl?: string;
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon?: string;
  banner?: string;
  screenshots?: string[];
  categories: string[];
  permissions: string[];
  isApproved: boolean;
  downloads?: number;
  rating?: number;
  updatedAt?: string;
  type?: 'torrent' | 'onlinestream' | 'custom';
  status?: 'pending' | 'approved' | 'rejected';
  user_id?: string;
  /** Entry-point script URL. Required by extension_manifests.main_url, and
   *  supplied by PublishExtensionModal (:277) — it was missing from this type,
   *  so useExtensions.submitExtension read it as undefined and inserted ''. */
  mainUrl?: string;
}

type TypeFilter = StoreExtensionType | 'all' | 'manga';

const TYPE_FILTERS: ReadonlyArray<PillOption<TypeFilter>> = [
  { id: 'all', get label() { return uiI18n.t('app.all_6a720856'); } },
  { id: 'onlinestream', get label() { return uiI18n.t('app.streaming_1e832552'); } },
  { id: 'manga', get label() { return uiI18n.t('app.manga_87db0f99'); } },
  { id: 'torrent', get label() { return uiI18n.t('app.torrent_4d15a5de'); } },
  { id: 'custom', get label() { return uiI18n.t('app.utilities_18fdc5ee'); } },
];

/** Rows per column in a shelf page — four is what fills the Store's panels. */
const SHELF_PAGE_SIZE = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

/**
 * A shelf of rows, paged into columns so the carousel advances a full panel at a
 * time instead of a single row — the Store's own behaviour for "Trending apps".
 */
function RowShelf({
  title,
  eyebrow,
  items,
  ranked = false,
  installer,
  onInstall,
}: {
  title: string;
  eyebrow?: string;
  items: StoreExtension[];
  ranked?: boolean;
  installer: ReturnType<typeof useExtensionInstaller>;
  onInstall: (extension: StoreExtension) => void;
}) {
  useUiTranslation();
  if (items.length === 0) return null;
  const pages = chunk(items.slice(0, SHELF_PAGE_SIZE * 3), SHELF_PAGE_SIZE);

  return (
    <StoreShelf title={title} eyebrow={eyebrow} scrollable={pages.length > 1}>
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className={cn(
            'shrink-0 snap-start rounded-[1.25rem] border border-border bg-muted/30 p-2',
            pages.length > 1 ? 'w-[min(100%,30rem)]' : 'w-full',
          )}
        >
          {page.map((extension, rowIndex) => (
            <ExtensionRow
              key={extension.id}
              extension={extension}
              state={installer.stateFor(extension)}
              onInstall={() => onInstall(extension)}
              rank={ranked ? pageIndex * SHELF_PAGE_SIZE + rowIndex + 1 : undefined}
            />
          ))}
        </div>
      ))}
    </StoreShelf>
  );
}

function TileSkeleton() {
  useUiTranslation();
  return (
    <div className="h-[11.5rem] animate-pulse rounded-[1.25rem] border border-border bg-white/[0.03]" />
  );
}

export default function ExtensionHubPage() {
  useUiTranslation();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isIos = isIOS();

  const [view, setView] = useState('browse');
  const [visited, setVisited] = useState(() => new Set(['browse']));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [serversOpen, setServersOpen] = useState(false);
  const [language, setLanguage] = useState('all');
  const [ecosystem, setEcosystem] = useState('all');
  const [compatibility, setCompatibility] = useState('all');
  const activeFilters = [language, ecosystem, compatibility].filter(value => value !== 'all').length;
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [sideloadOpen, setSideloadOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);
  useEffect(() => setVisibleCount(48), [search, type, ecosystem, compatibility, language]);
  const [searchParams, setSearchParams] = useSearchParams();
  const installId = searchParams.get('install')?.trim() || undefined;
  const requestedExtension = useStoreExtensionDetail(installId);
  const handledInstallId = useRef<string | null>(null);

  const catalogue = useStoreCatalogue({ search, type: type === 'manga' ? 'all' : type, ecosystem, compatibility, language });
  const installer = useExtensionInstaller();

  // Links from extensions.tatakai.me use `tatakai://extensions?install=<id>`.
  // Resolve the public catalog record inside the app and pass it through the
  // same validated installer used by the in-app store. This keeps package
  // downloads and remote Stremio/Seanime manifests on their normal code paths.
  useEffect(() => {
    if (!installId) {
      handledInstallId.current = null;
      return;
    }
    if (handledInstallId.current === installId || requestedExtension.isLoading) return;
    handledInstallId.current = installId;

    void (async () => {
      try {
        if (!requestedExtension.extension) {
          toast.error(requestedExtension.error?.message || 'This extension is not available in the Tatakai catalog.');
          return;
        }
        await installer.install.mutateAsync({ extension: requestedExtension.extension });
      } catch {
        // The installer mutation reports its own error to the user.
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete('install');
        setSearchParams(next, { replace: true });
      }
    })();
  }, [installId, requestedExtension.isLoading, requestedExtension.extension, requestedExtension.error, installer.install, searchParams, setSearchParams]);

  const typeFilters = isIos ? TYPE_FILTERS.filter((option) => option.id !== 'torrent') : TYPE_FILTERS;
  const visibleItems = useMemo(
    () => (isIos ? catalogue.items.filter((item) => item.type !== 'torrent') : catalogue.items).filter(item => (type !== 'manga' || isMangaExtension(item)) && (ecosystem === 'all' || (item.ecosystem || 'tatakai') === ecosystem) && (compatibility === 'all' || (item.compatibility || 'supported') === compatibility)),
    [catalogue.items, isIos, ecosystem, compatibility, type],
  );
  const visibleFeatured = useMemo(
    () => visibleItems.filter(item => item.isFeatured),
    [visibleItems],
  );

  const isSearching = search.trim().length > 0;

  const handleInstall = (extension: StoreExtension) => installer.toggle(extension);

  const { spotlight, streaming, manga, torrent, utilities, installed } = useMemo(() => {
    const items = visibleItems;
    const featured = visibleFeatured;
    const bannerExtension = featured.find(item => item.banner) || items.find(item => item.banner);
    const hero = bannerExtension || featured[0];
    return {
      spotlight: hero,
      streaming: items.filter((item) => item.type === 'onlinestream'),
      torrent: items.filter((item) => item.type === 'torrent'),
      manga: items.filter(isMangaExtension),
      utilities: items.filter((item) => item.type === 'custom' && !isMangaExtension(item)),
      installed: items.filter((item) => installer.isInstalled(item)),
    };
  }, [visibleItems, visibleFeatured, installer]);

  return (
    <div className="extension-hub relative min-h-screen bg-background text-foreground">
      <div
        className={cn(
          'relative z-10 mx-auto max-w-[1440px] px-4 py-6 pb-24 sm:px-6 md:pb-6',
          isDesktopApp ? 'md:pl-6' : 'md:pl-32',
        )}
      >
        <Link
          to="/"
          aria-label={uiI18n.t('app.back_to_home_34ac37f5')}
          className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold active:scale-95 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> {uiI18n.t('app.home_70f8bb9a')}
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display mt-1.5 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {uiI18n.t('app.extensions_656bcfe2')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {isIos
                ? uiI18n.t('app.streaming_sources_and_utilities_that_plug_into_t_9c54ee02')
                : uiI18n.t('app.streaming_sources_torrent_providers_and_utilitie_f25474a9')}
              {' '}
              {visibleItems.length > 0
                ? uiI18n.t('app.i18n_value_0_available_2f7caac8', { value0: visibleItems.length })
                : ''}
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <div className="relative w-full min-w-0 flex-none lg:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={uiI18n.t('app.search_extensions_11c1d47d')}
                placeholder={uiI18n.t('app.search_extensions_11c1d47d')}
                className="h-11 w-full rounded-xl border-border bg-muted/30 pl-9 pr-9 text-sm sm:w-72"
              />
              {isSearching ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={uiI18n.t('app.clear_search_67300d0f')}
                  className="absolute right-1 top-1/2 flex h-9 w-9 items-center justify-center rounded-full -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
              <Button
                variant="outline"
                onClick={() => setSideloadOpen(true)}
                className="h-11 gap-2 rounded-xl border-border bg-muted/30"
              >
                <FolderUp className="h-4 w-4" />
                {uiI18n.t('app.add_extension_11500bcc')}
              </Button>
            {/*
              Publishing happens on the portal, not in the app: the service owns
              the review queue, the asset uploads and the release wiring, and none
              of that is reachable from here. An anchor rather than a click handler
              because App.tsx already routes external hrefs through
              `electron.openExternal`, so this opens the system browser on desktop
              and a new tab on the web with no branch of its own.
            */}
            <Button asChild variant="ghost" className="h-11 gap-2 rounded-xl">
              <a
                href={EXTENSION_PORTAL_URL}
                target="_blank"
                rel="noreferrer noopener"
                title={uiI18n.t('app.publish_an_extension_on_extension_tatakai_me_8c4ac9c4')}
              >
                <Upload className="h-4 w-4" />
                {uiI18n.t('app.publish_56564005')}
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </div>
        </header>
      
        <Tabs value={view} onValueChange={next => { if (!['browse', 'library', 'sources'].includes(next)) return; setView(next); setVisited(previous => new Set([...previous, next])); }} className="mt-7">
          <TabsList aria-label={uiI18n.t('extensionWorkspace.workspace')} className="grid h-12 w-full grid-cols-3 sm:w-auto sm:min-w-[28rem]">
            <TabsTrigger value="browse" className="min-h-10"><Puzzle className="size-4" />{uiI18n.t('extensionWorkspace.browse')}</TabsTrigger>
            <TabsTrigger value="library" className="min-h-10"><Library className="size-4" />{uiI18n.t('extensionWorkspace.library')}</TabsTrigger>
            <TabsTrigger value="sources" className="min-h-10"><Cable className="size-4" />{uiI18n.t('extensionWorkspace.sources')}</TabsTrigger>
          </TabsList>
          {view !== 'sources' && <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <PillGroup<TypeFilter> options={typeFilters} value={type} onChange={setType} label={uiI18n.t('app.extension_type_3071e179')} />
            <Button variant="outline" className="min-h-11 gap-2" aria-expanded={filtersOpen} aria-controls="extension-filters" onClick={() => setFiltersOpen(open => !open)}><SlidersHorizontal className="size-4" />{uiI18n.t('extensionWorkspace.filters')}{activeFilters ? ` (${activeFilters})` : ''}</Button>
          </div>}
          {view !== 'sources' && filtersOpen && <div id="extension-filters" className="extension-filters mt-4 grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5 text-sm">Language <ThemedSelect value={language} onChange={e=>setLanguage(e.target.value)}><option value="all">All languages</option>{['en','es','ja','hi','fr','de','pt','it','ar','ru','ko','zh','mul','und'].map(code=><option key={code} value={code}>{code==='mul'?'Multilingual':code==='und'?'Not specified':new Intl.DisplayNames(['en'],{type:'language'}).of(code)}</option>)}</ThemedSelect></label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm">{uiI18n.t('app.ecosystem_9f12cdfc')} <ThemedSelect className="w-full rounded-lg" value={ecosystem} onChange={e => setEcosystem(e.target.value)}><option value="all">{uiI18n.t('app.all_ecosystems_73e7f63d')}</option>{ECOSYSTEMS.map(e => <option key={e} value={e}>{e}</option>)}</ThemedSelect></label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm">{uiI18n.t('app.compatibility_5d60c7dd')} <ThemedSelect className="w-full rounded-lg" value={compatibility} onChange={e => setCompatibility(e.target.value)}><option value="all">{uiI18n.t('app.all_compatibility_376b79c8')}</option>{['supported','limited','external','unavailable'].map(e => <option key={e} value={e}>{uiI18n.t(({"supported":"app.supported_2a5e9b1b","limited":"app.limited_1eb7d5c2","external":"app.external_59d8f3ec","unavailable":"app.unavailable_1d5ee313"})[e])}</option>)}</ThemedSelect></label>
      </div>}
          {view !== 'sources' && activeFilters > 0 && <Button variant="ghost" className="mt-2" onClick={() => { setLanguage('all'); setEcosystem('all'); setCompatibility('all'); }}>{uiI18n.t('extensionWorkspace.reset')}</Button>}
          <TabsContent value="browse" forceMount className="data-[state=inactive]:hidden">
        {catalogue.serviceError || !catalogue.isServiceConfigured ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber/25 bg-amber/10 p-4">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <div className="text-sm">
              <p className="font-bold text-amber">
                {catalogue.isServiceConfigured
                  ? uiI18n.t('app.extension_service_unreachable_6d092582')
                  : uiI18n.t('app.extension_service_not_configured_02e2a292')}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {catalogue.isServiceConfigured
                  ? uiI18n.t('app.showing_installed_extensions_only_the_catalogue__508fbcdd')
                  : uiI18n.t('app.set_vite_extension_api_url_to_browse_the_publish_2da70b68')}
              </p>
            </div>
          </div>
        ) : null}

        {!isNative ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-bold text-foreground">{uiI18n.t('app.browsing_on_the_web_05ee3a58')}</p>
              <p className="mt-0.5 text-muted-foreground">
                {uiI18n.t('app.extensions_run_inside_the_desktop_app_s_sandbox__5ddfcf31')}
              </p>
            </div>
          </div>
        ) : null}

        {searchParams.has('stack') && <div className="mt-8"><ExtensionStacks installer={installer} /></div>}
        {catalogue.isLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <TileSkeleton key={index} />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-border bg-muted/30 py-24 text-center">
            <Puzzle className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 font-bold text-foreground">
              {isSearching ? uiI18n.t('app.nothing_matches_i18n_value_0_7e8c1289', { value0: search.trim() }) : uiI18n.t('app.no_extensions_yet_5d69b08e')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSearching
                ? uiI18n.t('app.try_a_shorter_search_or_clear_it_to_browse_every_65be823f')
                : uiI18n.t('app.published_extensions_will_appear_here_933fdf96')}
            </p>
          </div>
        ) : isSearching ? (
          <section className="mt-8 space-y-4">
            <SectionHeading
              title={uiI18n.t('app.search_results_0144dae8')}
              meta={`${visibleItems.length} ${visibleItems.length === 1 ? 'match' : 'matches'}`}
            />
            <div className="extension-catalogue grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.slice(0, visibleCount).map((extension) => (
                <ExtensionTile
                  key={extension.id}
                  extension={extension}
                  state={installer.stateFor(extension)}
                  onInstall={() => handleInstall(extension)}
                />
              ))}
            </div>
            {visibleItems.length > visibleCount && <Button variant="outline" onClick={() => setVisibleCount(count => count + 48)}>Show more extensions</Button>}
          </section>
        ) : (
          <div className="mt-8 flex flex-col gap-8">
            {visibleFeatured.some(item=>item.banner) ? <StoreShelf title="Featured extensions" scrollable>
              {visibleFeatured.filter(item=>item.banner).slice(0,8).map(extension=><ExtensionHeroCard key={extension.id} extension={extension} state={installer.stateFor(extension)} onInstall={()=>handleInstall(extension)} className="w-[min(85vw,42rem)] shrink-0 snap-start"/>)}
            </StoreShelf> : spotlight ? <ExtensionHeroCard extension={spotlight} state={installer.stateFor(spotlight)} onInstall={()=>handleInstall(spotlight)}/> : null}


            <details className="extension-discovery border-y border-border py-4"><summary className="cursor-pointer rounded-lg py-2 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{uiI18n.t('extensionWorkspace.explore')}</summary><div className="mt-5 flex flex-col gap-8">            <RowShelf
              title={uiI18n.t('app.trending_streaming_sources_7fabd4cd')}
              eyebrow="Most installed"
              items={streaming}
              ranked
              installer={installer}
              onInstall={handleInstall}
            />

            <RowShelf title={uiI18n.t('app.manga_sources_5ca5b368')} eyebrow="Reading" items={manga} installer={installer} onInstall={handleInstall} />

            {!isIos ? (
              <RowShelf
                title={uiI18n.t('app.torrent_providers_7ebdd4fe')}
                eyebrow="Discovery"
                items={torrent}
                ranked
                installer={installer}
                onInstall={handleInstall}
              />
            ) : null}

            <RowShelf
              title={uiI18n.t('app.utilities_18fdc5ee')}
              eyebrow="Everything else"
              items={utilities}
              installer={installer}
              onInstall={handleInstall}
            />
</div></details>
            <section className="space-y-4">
              <SectionHeading
                title={uiI18n.t('app.all_extensions_9a2ff26b')}
                meta={`${visibleItems.length} total · ${formatCompact(
                  visibleItems.reduce((sum, item) => sum + item.installs + item.downloads, 0),
                )} installs`}
              />
              <div className="extension-catalogue grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleItems.slice(0, visibleCount).map((extension) => (
                  <ExtensionTile
                    key={extension.id}
                    extension={extension}
                    state={installer.stateFor(extension)}
                    onInstall={() => handleInstall(extension)}
                  />
                ))}
              </div>
              {visibleItems.length > visibleCount && <Button variant="outline" onClick={() => setVisibleCount(count => count + 48)}>Show more extensions</Button>}
            </section>
          </div>
        )}
          {!searchParams.has('stack') && <div className="mt-10 extension-deferred-section"><ExtensionStacks installer={installer} /></div>}
          </TabsContent>
          {visited.has('library') && <TabsContent value="library" forceMount className="data-[state=inactive]:hidden">
            <div className="mt-6"><h2 className="text-xl font-semibold">{uiI18n.t('extensionWorkspace.yourExtensions')}</h2><p className="mt-1 text-sm text-muted-foreground">{uiI18n.t('extensionWorkspace.libraryDescription')}</p></div>
            <InstalledCompatibilityExtensions search={search} ecosystem={ecosystem} type={type} compatibility={compatibility} />
            <div className="mt-6">            {installed.length > 0 ? (
              <RowShelf
                title={uiI18n.t('app.your_library_41bb0474')}
                eyebrow="Installed"
                items={installed}
                installer={installer}
                onInstall={handleInstall}
              />
            ) : null}

</div>
            <Suspense fallback={<p role="status" className="py-6 text-sm text-muted-foreground">{uiI18n.t('extensionWorkspace.loadingRemote')}</p>}><RemoteExtensionsPanel /></Suspense>
            {installed.length === 0 && <p className="my-6 text-sm text-muted-foreground">{uiI18n.t('extensionWorkspace.emptyLibrary')}</p>}
          </TabsContent>}
          {visited.has('sources') && <TabsContent value="sources" forceMount className="data-[state=inactive]:hidden">
            <div className="my-6"><h2 className="text-xl font-semibold">{uiI18n.t('extensionWorkspace.connections')}</h2><p className="mt-1 text-sm text-muted-foreground">{uiI18n.t('extensionWorkspace.sourcesDescription')}</p></div>
            <Suspense fallback={<p role="status" className="py-6 text-sm text-muted-foreground">{uiI18n.t('extensionWorkspace.loadingSources')}</p>}>
              <CompatibilityExtensionsPanel embedded />
              <div className="mt-8 border-t border-border pt-6"><ExtensionServerStatus /></div>
              <details className="mt-6 rounded-xl border border-border p-4" onToggle={event => { if (event.currentTarget.open) setServersOpen(true); }}><summary className="cursor-pointer font-semibold">Extension Servers</summary>{serversOpen && <div className="mt-4"><ExtensionServersSettings /></div>}</details>
            </Suspense>
          </TabsContent>}
        </Tabs>
      </div>
      {sideloadOpen && <Suspense fallback={<p role="status" className="px-6 py-4">{uiI18n.t('extensionWorkspace.loadingInstaller')}</p>}><SideloadExtensionModal isOpen={sideloadOpen} onClose={() => setSideloadOpen(false)} /></Suspense>}
    </div>
  );
}
