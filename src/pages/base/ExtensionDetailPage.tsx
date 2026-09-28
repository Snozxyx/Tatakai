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
import { Link, useParams } from 'react-router-dom';
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
        <p className="mt-3 font-bold text-white/80">Source view needs the desktop app</p>
        <p className="mt-1 text-sm text-white/45">
          The bundle is read from the extension sandbox, which only runs on desktop.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-white/50">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Reading bundle…
      </div>
    );
  }

  if (error || !data?.success) {
    const message = data?.error ?? (error instanceof Error ? error.message : 'Unknown error');
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-6">
        <p className="flex items-center gap-2 font-bold text-destructive">
          <TriangleAlert className="h-4 w-4" />
          Source unavailable
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
          Truncated to 50 KB — the full bundle is{' '}
          {formatBytes(data.totalBytes) ?? 'larger than the display limit'}.
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
              Latest
            </span>
          ) : null}
          {version.isStable ? null : (
            <span className="rounded-full border border-amber/30 bg-amber/15 px-2.5 py-1 text-[11px] font-bold text-amber">
              Pre-release
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
              Install this version
            </button>
          ) : null}
        </div>
      </div>

      {version.changelog ? (
        <MarkdownBlock source={version.changelog} className="mt-3" baseUrl={baseUrl} />
      ) : (
        <p className="mt-3 text-sm text-white/40">No release notes for this version.</p>
      )}

      {version.releaseUrl ? (
        <a
          href={version.releaseUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white/50 hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Release page
        </a>
      ) : null}
    </div>
  );
}

const TABS: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'versions', label: "What's new" },
  { id: 'permissions', label: 'Permissions' },
  { id: 'source', label: 'Source' },
];

export default function ExtensionDetailPage() {
  const { extensionId } = useParams<{ extensionId: string }>();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();

  const [tab, setTab] = useState<DetailTab>('overview');
  const [debugOpen, setDebugOpen] = useState(false);

  const { extension, isLoading, error, isFromService } = useStoreExtensionDetail(extensionId);
  const installer = useExtensionInstaller();

  const visual = typeVisual(extension?.type);
  const state = extension ? installer.stateFor(extension) : 'idle';

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
          Loading extension
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
          <h1 className="font-display text-2xl font-black tracking-tight">Extension not found</h1>
          <p className="mt-1 max-w-md text-sm text-white/45">
            {error?.message ??
              'It may have been unpublished, or the id in this link no longer exists in the catalogue.'}
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/extensions">Back to the store</Link>
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
          Store
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
                      updated {formatRelative(extension.updatedAt)}
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
                onClick={() => installer.toggle(extension)}
                size="lg"
                label={
                  state === 'installed'
                    ? 'Remove'
                    : state === 'installing'
                      ? 'Working…'
                      : state === 'not_loaded'
                        ? 'Installed (not loaded)'
                        : 'Get'
                }
                className="min-w-[11rem]"
              />
              {!isNative ? (
                <p className="text-xs font-semibold text-white/40">
                  Runs in the desktop app's sandbox
                </p>
              ) : null}
              {isNative && state !== 'idle' ? (
                <button
                  type="button"
                  onClick={() => setDebugOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-white/40 hover:text-white"
                >
                  <Bug className="h-3.5 w-3.5" />
                  Open debug window
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Download} label="Installs" value={formatCompact(extension.installs)} />
          <StatCard icon={Check} label="Downloads" value={formatCompact(extension.downloads)} />
          <StatCard icon={Eye} label="Views" value={formatCompact(extension.views)} />
          <StatCard
            icon={HeartPulse}
            label="Health"
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
                    {extension.description || 'The publisher did not provide a description.'}
                  </p>
                  {extension.readme ? (
                    <MarkdownBlock source={extension.readme} baseUrl={readmeBase} />
                  ) : (
                    <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 text-sm text-white/40">
                      No readme published for this extension.
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
                        ? 'No releases published yet.'
                        : 'This extension was sideloaded from a local bundle, so the store has no release history for it.'}
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'permissions' ? (
                <div className="space-y-6">
                  <section>
                    <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground">
                      <Shield className="h-4 w-4 text-primary" />
                      Requested permissions
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
                        This extension requests no special permissions.
                      </p>
                    )}
                  </section>

                  {extension.capabilities.length > 0 ? (
                    <section>
                      <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
                        Capabilities
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
                      Extensions run in a sandbox with no filesystem access and no access to your
                      account credentials. Network requests are limited to the domains listed above.
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
                Details
              </h2>
              <div className="mt-2 divide-y divide-white/[0.05]">
                <DetailRow label="Publisher">{extension.author}</DetailRow>
                <DetailRow label="Type">{visual.label}</DetailRow>
                <DetailRow label="Version">v{extension.version}</DetailRow>
                <DetailRow label="Status" >
                  <span className="capitalize">{extension.status}</span>
                </DetailRow>
                {extension.latestVersion?.sizeBytes ? (
                  <DetailRow label="Size">
                    {formatBytes(extension.latestVersion.sizeBytes)}
                  </DetailRow>
                ) : null}
                {formatRelative(extension.updatedAt) ? (
                  <DetailRow label="Updated">{formatRelative(extension.updatedAt)}</DetailRow>
                ) : null}
                {formatRelative(extension.createdAt) ? (
                  <DetailRow label="Published">{formatRelative(extension.createdAt)}</DetailRow>
                ) : null}
                <DetailRow label="Identifier">
                  <span className="break-all font-mono text-xs">{extension.slug}</span>
                </DetailRow>
              </div>
            </section>

            {extension.tags.length > 0 ? (
              <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                  Tags
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

            {extension.githubRepoUrl ? (
              <a
                href={extension.githubRepoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.04]"
              >
                <Github className="h-5 w-5 text-white/60" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white/85">Source repository</p>
                  <p className="truncate text-xs text-white/40">
                    {extension.githubRepoUrl.replace(/^https?:\/\/(www\.)?/, '')}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-white/30" />
              </a>
            ) : null}

            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                About .kai bundles
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/50">
                Tatakai extensions ship as a single <code className="font-mono text-primary">.kai</code>{' '}
                file: a signed manifest plus a sandboxed JavaScript bundle. Installing one never
                executes code outside the sandbox.
              </p>
            </section>
          </aside>
        </div>
      </div>

      {debugOpen ? <ExtensionDebugWindow onClose={() => setDebugOpen(false)} /> : null}
    </div>
  );
}
