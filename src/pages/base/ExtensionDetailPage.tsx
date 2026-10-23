import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * One extension's product page (`/extensions/:extensionId`), in the Microsoft
 * Store's product layout — banner header, install action, a stats strip, tabbed
 * body, and a details rail — using Tatakai's tokens.
 *
 * Every figure on this page comes from the service now. The version this replaces
 * shipped a hardcoded two-entry changelog ("Optimized resolution engine…") and
 * href-less "Inspect Repository" / "Publisher Portfolio" buttons; the changelog
 * is `versions[].changelog` and the repository link is `github_repo_url`, so a
 * publisher who ships neither gets an empty state instead of fiction.
 *
 * Install state is `useExtensionInstaller`, shared with the store grid, so both
 * surfaces agree about what is installed and both land in the same `not_loaded`
 * state in a browser — the bundle downloads, but there is no sandbox to load it.
 */
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bug,
  Check,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  Github,
  HeartPulse,
  Loader2,
  Puzzle,
  Shield,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Background } from '@/components/layout/Background';
import { useIsDesktopApp, useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { ExtensionDebugWindow } from '@/components/extensions/ExtensionDebugWindow';
import { MarkdownBlock } from '@/components/extensions/store/MarkdownBlock';
import {
  ExtensionChips,
  ExtensionIcon,
  InstallButton,
} from '@/components/extensions/store/StorePrimitives';
import {
  formatBytes,
  formatCompact,
  formatHealth,
  formatRelative,
  typeVisual,
} from '@/components/extensions/store/extensionVisuals';
import { useExtensionInstaller, useStoreExtensionDetail } from '@/hooks/api/useExtensionStore';
import { githubRawBase, type StoreVersion } from '@/core/extensions/store-api';

type DetailTab = 'overview' | 'versions' | 'permissions' | 'source';

interface SourceCodeResult {
  success: boolean;
  content?: string;
  truncated?: boolean;
  totalBytes?: number;
  error?: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  useUiTranslation();
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </p>
      <p className="mt-1.5 font-display text-xl font-black tracking-tight text-foreground">{value}</p>
    </div>
  );
}

/** Key/value line for the details rail. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  useUiTranslation();
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-white/75">{children}</span>
    </div>
  );
}

/**
 * The runtime's own view of the loaded bundle. Desktop-only: the query is not
 * enabled unless `getExtensionSourceCode` exists, so the web build never calls
 * into a runtime that is not there.
 */
function SourceCodeTab({ extensionId }: { extensionId: string }) {
  useUiTranslation();
  const hasRuntime =
    typeof window !== 'undefined' &&
    typeof (window as any).tatakaiRuntime?.getExtensionSourceCode === 'function';

  const { data, isLoading, error } = useQuery<SourceCodeResult>({
    queryKey: ['extension-source-code', extensionId],
    queryFn: () => (window as any).tatakaiRuntime.getExtensionSourceCode(extensionId),
    enabled: hasRuntime,
    staleTime: Infinity,
  });

  if (!hasRuntime) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
        <FileCode2 className="mx-auto h-8 w-8 text-white/20" />
        <p className="mt-3 font-bold text-white/80">{uiI18n.t('app.source_view_needs_the_desktop_app_133858eb')}</p>
        <p className="mt-1 text-sm text-white/45">
          {uiI18n.t('app.the_bundle_is_read_from_the_extension_sandbox_wh_446ab71d')}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-white/50">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {uiI18n.t('app.reading_bundle_7dc1857d')}
      </div>
    );
  }

  if (error || !data?.success) {
    const message = data?.error ?? (error instanceof Error ? error.message : uiI18n.t('app.unknown_error_e5fd9aa2'));
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-6">
        <p className="flex items-center gap-2 font-bold text-destructive">
          <TriangleAlert className="h-4 w-4" />
          {uiI18n.t('app.source_unavailable_3775ebbd')}
        </p>
        <p className="mt-1 text-sm text-white/55">{message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.truncated ? (
        <p className="flex items-start gap-2 rounded-2xl border border-amber/25 bg-amber/10 px-4 py-3 text-sm font-semibold text-amber">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {uiI18n.t('app.truncated_to_50_kb_the_full_bundle_is_d3f74e0d')}{' '}
          {formatBytes(data.totalBytes) ?? uiI18n.t('app.larger_than_the_display_limit_839a5ab3')}.
        </p>
      ) : null}
      <pre className="max-h-[32rem] overflow-auto rounded-2xl border border-white/[0.07] bg-black/40 p-4 text-xs leading-relaxed text-white/70">
        <code className="whitespace-pre-wrap font-mono">{data.content}</code>
      </pre>
    </div>
  );
}

/** One release. `changelog` is often empty on the service; say so rather than fill it. */
function VersionEntry({
  version,
  isLatest,
  onInstall,
  canInstall,
  baseUrl,
}: {
  version: StoreVersion;
  isLatest: boolean;
  onInstall: () => void;
  canInstall: boolean;
  /** Raw-content base for relative image paths in the changelog. */
  baseUrl?: string;
}) {
  useUiTranslation();
  const published = formatRelative(version.publishedAt);
  const size = formatBytes(version.sizeBytes);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-black text-primary">
            v{version.version}
          </span>
          {isLatest ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-white/55">
              {uiI18n.t('app.latest_decd7ca8')}
            </span>
          ) : null}
          {version.isStable ? null : (
            <span className="rounded-full border border-amber/30 bg-amber/15 px-2.5 py-1 text-[11px] font-bold text-amber">
              {uiI18n.t('app.pre_release_96308068')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-white/35">
          {size ? <span>{size}</span> : null}
          {published ? <span>{published}</span> : null}
          {canInstall ? (
            <button
              type="button"
              onClick={onInstall}
              className="font-bold text-primary hover:underline"
            >
              {uiI18n.t('app.install_this_version_96a20bc5')}
            </button>
          ) : null}
        </div>
      </div>

      {version.changelog ? (
        <MarkdownBlock source={version.changelog} className="mt-3" baseUrl={baseUrl} />
      ) : (
        <p className="mt-3 text-sm text-white/40">{uiI18n.t('app.no_release_notes_for_this_version_f8e199f0')}</p>
      )}

      {version.releaseUrl ? (
        <a
          href={version.releaseUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white/50 hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {uiI18n.t('app.release_page_51540b51')}
        </a>
      ) : null}
    </div>
  );
}

const TABS: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: 'overview', get label() { return uiI18n.t('app.overview_0efc2e6b'); } },
  { id: 'versions', get label() { return uiI18n.t('app.what_s_new_4d8dc5fe'); } },
  { id: 'permissions', get label() { return uiI18n.t('app.permissions_d06d5557'); } },
  { id: 'source', get label() { return uiI18n.t('app.source_6da13add'); } },
];

export default function ExtensionDetailPage() {
  useUiTranslation();
  const { extensionId } = useParams<{ extensionId: string }>();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();

  const [tab, setTab] = useState<DetailTab>('overview');
  const [debugOpen, setDebugOpen] = useState(false);

  const { extension, isLoading, error, isFromService } = useStoreExtensionDetail(extensionId);
  const installer = useExtensionInstaller();

  const visual = typeVisual(extension?.type);
  const state = extension ? installer.stateFor(extension) : 'idle';
  const [requestParams]=useSearchParams();
  const installRequested=requestParams.get('install')==='1';

  const versions = useMemo<StoreVersion[]>(() => {
    if (!extension) return [];
    const list = [...extension.versions];
    if (extension.latestVersion && !list.some((item) => item.id === extension.latestVersion!.id)) {
      list.unshift(extension.latestVersion);
    }
    return list;
  }, [extension]);

  /**
   * A readme written for GitHub refers to its own repo by relative path
   * (`./icon.png`, `docs/screenshot.png`). Those only resolve against
   * raw.githubusercontent.com, so the renderer needs the repo's raw base to turn
   * them into something loadable; without it, `MarkdownBlock` drops the image
   * rather than request it off the app's own origin. Undefined for a publisher
   * who gave no GitHub URL, which is the same as "leave relative paths alone".
   */
  const readmeBase = useMemo(
    () => githubRawBase(extension?.githubRepoUrl),
    [extension?.githubRepoUrl],
  );

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4">
        <Background />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/40">
          {uiI18n.t('app.loading_extension_93b7191b')}
        </p>
      </div>
    );
  }

  if (error || !extension) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Background />
        <Puzzle className="h-12 w-12 text-white/15" />
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight">{uiI18n.t('app.extension_not_found_221eb169')}</h1>
          <p className="mt-1 max-w-md text-sm text-white/45">
            {error?.message ??
              uiI18n.t('app.it_may_have_been_unpublished_or_the_id_in_this_l_de1c8dbc')}
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/extensions">{uiI18n.t('app.back_to_the_store_1f19a0ca')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <Background />

      <div
        className={cn(
          'relative z-10 mx-auto max-w-[1500px] px-4 py-6 pb-24 sm:px-6 md:pb-6',
          isDesktopApp ? 'md:pl-6' : 'md:pl-32',
        )}
      >
        <Link
          to="/extensions"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {uiI18n.t('app.store_0d8a7046')}
        </Link>

        <header className="relative mt-4 overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-surface p-6 sm:p-8">
          {extension.banner ? (
            <img
              src={extension.banner}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-35"
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <div className={cn('absolute inset-0 bg-gradient-to-br', visual.glowClass)} />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <ExtensionIcon extension={extension} size="xl" />
              <div className="min-w-0">
                <ExtensionChips extension={extension} />
                <h1 className="font-display mt-3 text-3xl font-black leading-tight tracking-tight text-foreground sm:text-5xl">
                  {extension.name}
                </h1>
                <p className="mt-2 text-sm font-semibold text-white/55">
                  {extension.author}
                  <span className="mx-2 text-white/20">·</span>
                  v{extension.version}
                  {formatRelative(extension.updatedAt) ? (
                    <>
                      <span className="mx-2 text-white/20">·</span>
                      {uiI18n.t('app.updated_13a1891a')} {formatRelative(extension.updatedAt)}
                    </>
                  ) : null}
                </p>
                {extension.categories.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {extension.categories.map((category) => (
                      <span
                        key={category}
                        className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/45"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              <InstallButton
                state={state}
                onClick={() => { if(installRequested && installer.isInstalled(extension))return; installer.toggle(extension); }}
                size="lg"
                label={
                  extension.capabilities?.includes('extension-server')?'Connect to server':state === 'installed'
                    ? uiI18n.t('app.remove_e963907d')
                    : state === 'installing'
                      ? uiI18n.t('app.working_13b7bfca')
                      : state === 'not_loaded'
                        ? uiI18n.t('app.installed_not_loaded_4d492f51')
                        : uiI18n.t('app.get_bfffd736')
                }
                className="min-w-[11rem]"
              />
              {!isNative ? (
                <p className="text-xs font-semibold text-white/40">
                  {uiI18n.t('app.runs_in_the_desktop_app_s_sandbox_979dfacc')}
                </p>
              ) : null}
              {isNative && state !== 'idle' ? (
                <button
                  type="button"
                  onClick={() => setDebugOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-white/40 hover:text-white"
                >
                  <Bug className="h-3.5 w-3.5" />
                  {uiI18n.t('app.open_debug_window_fee66f7b')}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Download} label={uiI18n.t('app.installs_671fb4cc')} value={formatCompact(extension.installs)} />
          <StatCard icon={Check} label={uiI18n.t('app.downloads_a862c2b2')} value={formatCompact(extension.downloads)} />
          <StatCard icon={Eye} label={uiI18n.t('app.views_24be6128')} value={formatCompact(extension.views)} />
          <StatCard
            icon={HeartPulse}
            label={uiI18n.t('app.health_3703cd21')}
            value={formatHealth(extension.healthScore) ?? '—'}
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/[0.07] bg-white/[0.03] p-1 scrollbar-none">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-pressed={tab === entry.id}
                  className={cn(
                    'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                    tab === entry.id
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                      : 'text-white/55 hover:text-white',
                  )}
                >
                  {entry.id === 'source' ? <FileCode2 className="h-3.5 w-3.5" /> : null}
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {tab === 'overview' ? (
                <div className="space-y-6">
                  <p className="text-base leading-relaxed text-white/70">
                    {extension.description || uiI18n.t('app.the_publisher_did_not_provide_a_description_170a5438')}
                  </p>
                  {extension.readme ? (
                    <MarkdownBlock source={extension.readme} baseUrl={readmeBase} />
                  ) : (
                    <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 text-sm text-white/40">
                      {uiI18n.t('app.no_readme_published_for_this_extension_d7ea3ca2')}
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'versions' ? (
                <div className="space-y-3">
                  {versions.length > 0 ? (
                    versions.map((version, index) => (
                      <VersionEntry
                        key={version.id || version.version}
                        version={version}
                        isLatest={index === 0}
                        canInstall={index !== 0}
                        baseUrl={readmeBase}
                        onInstall={() => installer.install.mutate({ extension, version })}
                      />
                    ))
                  ) : (
                    <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 text-sm text-white/40">
                      {isFromService
                        ? uiI18n.t('app.no_releases_published_yet_d6d5bb0f')
                        : uiI18n.t('app.this_extension_was_sideloaded_from_a_local_bundl_7b64a66f')}
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'permissions' ? (
                <div className="space-y-6">
                  <section>
                    <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground">
                      <Shield className="h-4 w-4 text-primary" />
                      {uiI18n.t('app.requested_permissions_3046be39')}
                    </h2>
                    {extension.permissions.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {extension.permissions.map((permission) => (
                          <li
                            key={permission}
                            className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 font-mono text-xs text-white/70"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            {permission}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-white/40">
                        {uiI18n.t('app.this_extension_requests_no_special_permissions_cd25ea37')}
                      </p>
                    )}
                  </section>

                  {extension.capabilities.length > 0 ? (
                    <section>
                      <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
                        {uiI18n.t('app.capabilities_ca09c54b')}
                      </h2>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {extension.capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-white/60"
                          >
                            {capability}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm leading-relaxed text-white/65">
                      {uiI18n.t('app.extensions_run_in_a_sandbox_with_no_filesystem_a_d68852cd')}
                    </p>
                  </div>
                </div>
              ) : null}

              {tab === 'source' && extensionId ? <SourceCodeTab extensionId={extensionId} /> : null}
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                {uiI18n.t('app.details_dc3decbb')}
              </h2>
              <div className="mt-2 divide-y divide-white/[0.05]">
                <DetailRow label={uiI18n.t('app.publisher_61d70d6e')}>{extension.author}</DetailRow>
                <DetailRow label={uiI18n.t('app.type_3deb7456')}>{visual.label}</DetailRow>
                <DetailRow label={uiI18n.t('app.version_2da600bf')}>v{extension.version}</DetailRow>
                <DetailRow label={uiI18n.t('app.status_bae7d5be')} >
                  <span className="capitalize">{extension.status}</span>
                </DetailRow>
                {extension.latestVersion?.sizeBytes ? (
                  <DetailRow label={uiI18n.t('app.size_b7152342')}>
                    {formatBytes(extension.latestVersion.sizeBytes)}
                  </DetailRow>
                ) : null}
                {formatRelative(extension.updatedAt) ? (
                  <DetailRow label={uiI18n.t('app.updated_f2f8570d')}>{formatRelative(extension.updatedAt)}</DetailRow>
                ) : null}
                {formatRelative(extension.createdAt) ? (
                  <DetailRow label={uiI18n.t('app.published_483bf207')}>{formatRelative(extension.createdAt)}</DetailRow>
                ) : null}
                <DetailRow label={uiI18n.t('app.identifier_06b6ace8')}>
                  <span className="break-all font-mono text-xs">{extension.slug}</span>
                </DetailRow>
              </div>
            </section>

            {extension.tags.length > 0 ? (
              <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  {uiI18n.t('app.tags_848eed0f')}
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {extension.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-white/55"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {extension.sourceUrl && <a href={extension.sourceUrl} target="_blank" rel="noreferrer" className="block break-all rounded-xl border border-border p-4 text-sm text-primary">{uiI18n.t('app.imported_from_upstream_catalog_cb28636d')}</a>}
            {extension.compatibilityReason && <p className="text-sm text-muted-foreground">{extension.compatibilityReason}</p>}
            {extension.githubRepoUrl ? (
              <a
                href={extension.githubRepoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.04]"
              >
                <Github className="h-5 w-5 text-white/60" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white/85">{uiI18n.t('app.source_repository_9110973f')}</p>
                  <p className="truncate text-xs text-white/40">
                    {extension.githubRepoUrl.replace(/^https?:\/\/(www\.)?/, '')}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-white/30" />
              </a>
            ) : null}

            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                {uiI18n.t('app.about_extensions_f0b73024')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/50">
                {uiI18n.t('app.tatakai_extensions_ship_as_a_single_f903a9a7')} <code className="font-mono text-primary">{uiI18n.t('app.kai_2bba0daf')}</code>{' '}
                {uiI18n.t('app.file_containing_metadata_and_javascript_source_m_d556a3bb')}
              </p>
            </section>
          </aside>
        </div>
      </div>

      {debugOpen ? <ExtensionDebugWindow onClose={() => setDebugOpen(false)} /> : null}
    </div>
  );
}
