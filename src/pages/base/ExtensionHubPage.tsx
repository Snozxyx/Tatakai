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
import { useMemo, useState } from 'react';
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
import { Background } from '@/components/layout/Background';
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

type TypeFilter = StoreExtensionType | 'all';

const TYPE_FILTERS: ReadonlyArray<PillOption<TypeFilter>> = [
  { id: 'all', label: 'All' },
  { id: 'onlinestream', label: 'Streaming' },
  { id: 'torrent', label: 'Torrent' },
  { id: 'custom', label: 'Utilities' },
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
  if (items.length === 0) return null;
  const pages = chunk(items, SHELF_PAGE_SIZE);

  return (
    <StoreShelf title={title} eyebrow={eyebrow} scrollable={pages.length > 1}>
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className={cn(
            'shrink-0 snap-start rounded-[1.25rem] border border-white/[0.07] bg-white/[0.02] p-2',
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
  return (
    <div className="h-[11.5rem] animate-pulse rounded-[1.25rem] border border-white/[0.07] bg-white/[0.03]" />
  );
}

export default function ExtensionHubPage() {
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isIos = isIOS();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [sideloadOpen, setSideloadOpen] = useState(false);

  const catalogue = useStoreCatalogue({ search, type });
  const installer = useExtensionInstaller();
  const typeFilters = isIos ? TYPE_FILTERS.filter((option) => option.id !== 'torrent') : TYPE_FILTERS;
  const visibleItems = useMemo(
    () => (isIos ? catalogue.items.filter((item) => item.type !== 'torrent') : catalogue.items),
    [catalogue.items, isIos],
  );
  const visibleFeatured = useMemo(
    () => (isIos ? catalogue.featured.filter((item) => item.type !== 'torrent') : catalogue.featured),
    [catalogue.featured, isIos],
  );

  const isSearching = search.trim().length > 0;

  const handleInstall = (extension: StoreExtension) => installer.toggle(extension);

  const { spotlight, promos, streaming, torrent, utilities, installed } = useMemo(() => {
    const items = visibleItems;
    const featured = visibleFeatured;
    return {
      spotlight: featured[0],
      promos: featured.slice(1, 3),
      streaming: items.filter((item) => item.type === 'onlinestream'),
      torrent: items.filter((item) => item.type === 'torrent'),
      utilities: items.filter((item) => item.type === 'custom'),
      installed: items.filter((item) => installer.isInstalled(item)),
    };
  }, [visibleItems, visibleFeatured, installer]);

  return (
    <div className="relative min-h-screen">
      <Background />

      <div
        className={cn(
          'relative z-10 mx-auto max-w-[1800px] px-4 py-6 pb-24 sm:px-6 md:pb-6',
          isDesktopApp ? 'md:pl-6' : 'md:pl-32',
        )}
      >
        <Link
          to="/"
          aria-label="Back to home"
          className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold active:scale-95 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
              Tatakai store
            </p>
            <h1 className="font-display mt-1.5 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Extensions
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/50">
              {isIos
                ? 'Streaming sources and utilities that plug into the player.'
                : 'Streaming sources, torrent providers and utilities that plug into the player.'}
              {visibleItems.length > 0
                ? ` ${visibleItems.length} available.`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search extensions"
                className="h-10 w-full rounded-full border-white/10 bg-white/[0.04] pl-9 pr-9 text-sm sm:w-72"
              />
              {isSearching ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {isNative ? (
              <Button
                variant="outline"
                onClick={() => setSideloadOpen(true)}
                className="h-10 gap-2 rounded-full border-white/10 bg-white/[0.04]"
              >
                <FolderUp className="h-4 w-4" />
                Sideload
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
                title="Publish an extension on extension.tatakai.me"
              >
                <Upload className="h-4 w-4" />
                Publish
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </div>
        </header>

        {catalogue.serviceError || !catalogue.isServiceConfigured ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber/25 bg-amber/10 p-4">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <div className="text-sm">
              <p className="font-bold text-amber">
                {catalogue.isServiceConfigured
                  ? 'Extension service unreachable'
                  : 'Extension service not configured'}
              </p>
              <p className="mt-0.5 text-white/55">
                {catalogue.isServiceConfigured
                  ? 'Showing sideloaded extensions only. The catalogue will fill in once the service responds.'
                  : 'Set VITE_EXTENSION_API_URL to browse the published catalogue. Sideloaded extensions still work.'}
              </p>
            </div>
          </div>
        ) : null}

        {!isNative ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-bold text-white/85">Browsing on the web</p>
              <p className="mt-0.5 text-white/55">
                Extensions run inside the desktop app's sandbox. You can browse and install here,
                but nothing loads until you open Tatakai on desktop.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <PillGroup
            options={typeFilters}
            value={type}
            onChange={(next) => setType(next)}
            label="Extension type"
          />
        </div>

        {catalogue.isLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <TileSkeleton key={index} />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-white/[0.07] bg-white/[0.02] py-24 text-center">
            <Puzzle className="mx-auto h-10 w-10 text-white/20" />
            <p className="mt-4 font-bold text-white/80">
              {isSearching ? `Nothing matches “${search.trim()}”` : 'No extensions yet'}
            </p>
            <p className="mt-1 text-sm text-white/45">
              {isSearching
                ? 'Try a shorter search, or clear it to browse everything.'
                : 'Published extensions will appear here.'}
            </p>
          </div>
        ) : isSearching ? (
          <section className="mt-8 space-y-4">
            <SectionHeading
              title="Search results"
              meta={`${visibleItems.length} ${visibleItems.length === 1 ? 'match' : 'matches'}`}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map((extension) => (
                <ExtensionTile
                  key={extension.id}
                  extension={extension}
                  state={installer.stateFor(extension)}
                  onInstall={() => handleInstall(extension)}
                />
              ))}
            </div>
          </section>
        ) : (
          <div className="mt-8 space-y-12">
            {spotlight ? (
              <section className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
                <ExtensionHeroCard
                  extension={spotlight}
                  state={installer.stateFor(spotlight)}
                  onInstall={() => handleInstall(spotlight)}
                />
                {promos.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {promos.map((extension) => (
                      <ExtensionPromoTile
                        key={extension.id}
                        extension={extension}
                        state={installer.stateFor(extension)}
                        onInstall={() => handleInstall(extension)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {installed.length > 0 ? (
              <RowShelf
                title="Your library"
                eyebrow="Installed"
                items={installed}
                installer={installer}
                onInstall={handleInstall}
              />
            ) : null}

            <RowShelf
              title="Trending streaming sources"
              eyebrow="Most installed"
              items={streaming}
              ranked
              installer={installer}
              onInstall={handleInstall}
            />

            {!isIos ? (
              <RowShelf
                title="Torrent providers"
                eyebrow="Discovery"
                items={torrent}
                ranked
                installer={installer}
                onInstall={handleInstall}
              />
            ) : null}

            <RowShelf
              title="Utilities"
              eyebrow="Everything else"
              items={utilities}
              installer={installer}
              onInstall={handleInstall}
            />

            <section className="space-y-4">
              <SectionHeading
                eyebrow="Catalogue"
                title="All extensions"
                meta={`${visibleItems.length} total · ${formatCompact(
                  visibleItems.reduce((sum, item) => sum + item.installs + item.downloads, 0),
                )} installs`}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleItems.map((extension) => (
                  <ExtensionTile
                    key={extension.id}
                    extension={extension}
                    state={installer.stateFor(extension)}
                    onInstall={() => handleInstall(extension)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <SideloadExtensionModal isOpen={sideloadOpen} onClose={() => setSideloadOpen(false)} />
    </div>
  );
}
