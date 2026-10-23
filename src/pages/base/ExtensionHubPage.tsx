import { ExtensionServerStatus } from '@/components/extensions/ExtensionServerStatus';
import { ExtensionStacks } from '@/components/extensions/ExtensionStacks';
import { ExtensionServersSettings } from '@/components/settings/ExtensionServersSettings';
import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { isMangaExtension } from '@/core/extensions/store-category';
import { ECOSYSTEMS } from "@/core/extensions/ecosystems";
import { RemoteExtensionsPanel } from "@/components/extensions/RemoteExtensionsPanel";
import { CompatibilityExtensionsPanel } from '@/components/extensions/CompatibilityExtensionsPanel';
import { InstalledCompatibilityExtensions } from '@/components/extensions/InstalledCompatibilityExtensions';
/**
 * The extension store (`/extensions`), laid out the way the Microsoft Store lays
 * out its home page: a wide spotlight card with stacked promo tiles beside it,
 * then shelves of compact icon + name + action rows, then the full catalogue as a
 * grid — all in Tatakai's own tokens rather than the Store's blues.
 *
 * The catalogue is one merged list from `useStoreCatalogue`: everything the
 * extension service publishes, plus anything the user has sideloaded on this
 * machine. There is no bundled-extension list any more — a curated array in the
 * source could not track versions, counts or a readme, and it shadowed the
 * service's own row for the same extension. That is also why this page holds no
 * `TYPE_COLORS` map and no install routine of its own: the visuals live in
 * `store/extensionVisuals.ts` and the install path in `useExtensionInstaller`, so
 * the detail page reports the same state for the same extension.
 *
 * Everything shown here is real service data. The previous version padded the
 * page with a hardcoded "Recent Activity" feed and an Unsplash backdrop; both are
 * gone rather than reimplemented, because inventing activity in a store that
 * tracks real install counts is worse than an emptier page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  FolderUp,
  Puzzle,
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
import { SideloadExtensionModal } from '@/components/extensions/SideloadExtensionModal';
import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import {
  ExtensionHeroCard,
  ExtensionPromoTile,
  ExtensionRow,
  ExtensionTile,
  StoreShelf,
} from '@/components/extensions/store/StorePrimitives';
import { formatCompact } from '@/components/extensions/store/extensionVisuals';
import { useExtensionInstaller, useStoreCatalogue } from '@/hooks/api/useExtensionStore';
import {
  EXTENSION_PORTAL_URL,
  type StoreExtension,
  type StoreExtensionType,
} from '@/core/extensions/store-api';

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

  const [language, setLanguage] = useState('all');
  const [ecosystem, setEcosystem] = useState('all');
  const [compatibility, setCompatibility] = useState('all');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [sideloadOpen, setSideloadOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);
  useEffect(() => setVisibleCount(48), [search, type, ecosystem, compatibility, language]);

  const catalogue = useStoreCatalogue({ search, type: type === 'manga' ? 'all' : type, ecosystem, compatibility, language });
  const installer = useExtensionInstaller();
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

  const { spotlight, promos, streaming, manga, torrent, utilities, installed } = useMemo(() => {
    const items = visibleItems;
    const featured = visibleFeatured;
    const bannerExtension = featured.find(item => item.banner) || items.find(item => item.banner);
    const hero = bannerExtension || featured[0];
    return {
      spotlight: hero,
      promos: featured.filter(item => item.id !== hero?.id).slice(0, 2),
      streaming: items.filter((item) => item.type === 'onlinestream'),
      torrent: items.filter((item) => item.type === 'torrent'),
      manga: items.filter(isMangaExtension),
      utilities: items.filter((item) => item.type === 'custom' && !isMangaExtension(item)),
      installed: items.filter((item) => installer.isInstalled(item)),
    };
  }, [visibleItems, visibleFeatured, installer]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        className={cn(
          'relative z-10 mx-auto max-w-[1800px] px-4 py-6 pb-24 sm:px-6 md:pb-6',
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
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
              {uiI18n.t('app.tatakai_store_8985bb10')}
            </p>
            <h1 className="font-display mt-1.5 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {uiI18n.t('app.extensions_656bcfe2')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {isIos
                ? uiI18n.t('app.streaming_sources_and_utilities_that_plug_into_t_9c54ee02')
                : uiI18n.t('app.streaming_sources_torrent_providers_and_utilitie_f25474a9')}
              {visibleItems.length > 0
                ? uiI18n.t('app.i18n_value_0_available_2f7caac8', { value0: visibleItems.length })
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={uiI18n.t('app.search_extensions_11c1d47d')}
                placeholder={uiI18n.t('app.search_extensions_11c1d47d')}
                className="h-10 w-full rounded-full border-border bg-muted/30 pl-9 pr-9 text-sm sm:w-72"
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
            {true ? (
              <Button
                variant="outline"
                onClick={() => setSideloadOpen(true)}
                className="h-10 gap-2 rounded-full border-border bg-muted/30"
              >
                <FolderUp className="h-4 w-4" />
                {uiI18n.t('app.add_extension_11500bcc')}
              </Button>
            ) : null}
            {/*
              Publishing happens on the portal, not in the app: the service owns
              the review queue, the asset uploads and the release wiring, and none
              of that is reachable from here. An anchor rather than a click handler
              because App.tsx already routes external hrefs through
              `electron.openExternal`, so this opens the system browser on desktop
              and a new tab on the web with no branch of its own.
            */}
            <Button asChild className="h-10 gap-2 rounded-full">
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
      
      <div className="mt-5 space-y-4"><div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1.5 text-sm">Language <ThemedSelect value={language} onChange={e=>setLanguage(e.target.value)}><option value="all">All languages</option>{['en','es','ja','hi','fr','de','pt','it','ar','ru','ko','zh','mul','und'].map(code=><option key={code} value={code}>{code==='mul'?'Multilingual':code==='und'?'Not specified':new Intl.DisplayNames(['en'],{type:'language'}).of(code)}</option>)}</ThemedSelect></label>
        <label className="flex flex-col gap-1.5 text-sm">{uiI18n.t('app.ecosystem_9f12cdfc')} <ThemedSelect className="min-w-[10rem] rounded-full" value={ecosystem} onChange={e => setEcosystem(e.target.value)}><option value="all">{uiI18n.t('app.all_ecosystems_73e7f63d')}</option>{ECOSYSTEMS.map(e => <option key={e} value={e}>{e}</option>)}</ThemedSelect></label>
        <label className="flex flex-col gap-1.5 text-sm">{uiI18n.t('app.compatibility_5d60c7dd')} <ThemedSelect className="min-w-[10rem] rounded-full" value={compatibility} onChange={e => setCompatibility(e.target.value)}><option value="all">{uiI18n.t('app.all_compatibility_376b79c8')}</option>{['supported','limited','external','unavailable'].map(e => <option key={e} value={e}>{uiI18n.t(({"supported":"app.supported_2a5e9b1b","limited":"app.limited_1eb7d5c2","external":"app.external_59d8f3ec","unavailable":"app.unavailable_1d5ee313"})[e])}</option>)}</ThemedSelect></label>
      </div></div>

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

        <div className="mt-6">
          <PillGroup
            options={typeFilters}
            value={type}
            onChange={(next) => setType(next)}
            label={uiI18n.t('app.extension_type_3071e179')}
          />
        </div>

        <InstalledCompatibilityExtensions search={search} ecosystem={ecosystem} type={type} compatibility={compatibility} />

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <div className="mt-8 space-y-12">
            {visibleFeatured.some(item=>item.banner) ? <StoreShelf title="Featured extensions" eyebrow="Showcase" scrollable>
              {visibleFeatured.filter(item=>item.banner).slice(0,8).map(extension=><ExtensionHeroCard key={extension.id} extension={extension} state={installer.stateFor(extension)} onInstall={()=>handleInstall(extension)} className="w-[min(85vw,42rem)] shrink-0 snap-start"/>)}
            </StoreShelf> : spotlight ? <ExtensionHeroCard extension={spotlight} state={installer.stateFor(spotlight)} onInstall={()=>handleInstall(spotlight)}/> : null}
            <ExtensionStacks installer={installer}/>

            {installed.length > 0 ? (
              <RowShelf
                title={uiI18n.t('app.your_library_41bb0474')}
                eyebrow="Installed"
                items={installed}
                installer={installer}
                onInstall={handleInstall}
              />
            ) : null}

            <RowShelf
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
  <ExtensionServerStatus/>
                <details className="mb-6 rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold">Extension Servers</summary><div className="mt-4"><ExtensionServersSettings /></div></details>

            <section className="space-y-4">
              <SectionHeading
                eyebrow="Catalogue"
                title={uiI18n.t('app.all_extensions_9a2ff26b')}
                meta={`${visibleItems.length} total · ${formatCompact(
                  visibleItems.reduce((sum, item) => sum + item.installs + item.downloads, 0),
                )} installs`}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-8"><RemoteExtensionsPanel /></div>
      <CompatibilityExtensionsPanel />
      <SideloadExtensionModal isOpen={sideloadOpen} onClose={() => setSideloadOpen(false)} />
    </div>
  );
}
