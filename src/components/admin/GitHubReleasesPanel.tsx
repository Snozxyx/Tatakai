import { useCallback, useEffect, useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Github,
  RefreshCw,
  Loader2,
  XCircle,
  Download,
  Copy,
  ChevronDown,
  ChevronRight,
  Monitor,
  Apple,
  Terminal,
  Smartphone,
  Package,
  Tag,
  PlusCircle,
  ExternalLink,
  CheckCircle2,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchAllReleases,
  formatBytes,
  formatCompact,
  platformForAsset,
  GITHUB_RELEASES_URL,
  type GitHubRelease,
  type GitHubReleaseAsset,
  type PlatformKey,
} from '@/lib/github';

// Update policies require a strict X.Y.Z version; a tag like "v6.0.0-beta" can be
// browsed and downloaded here but cannot seed a policy.
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const PLATFORM_ICON: Record<PlatformKey, LucideIcon> = {
  windows: Monitor,
  macos: Apple,
  linux: Terminal,
  android: Smartphone,
};

/** Strips a leading `v` so a GitHub tag maps to the policy's semver field. */
function cleanVersion(tag: string): string {
  return tag.replace(/^v/i, '').trim();
}

/** One downloadable artefact: platform icon, size, download count, and actions. */
function AssetRow({ asset }: { asset: GitHubReleaseAsset }) {
  const platform = platformForAsset(asset.name);
  const Icon = platform ? PLATFORM_ICON[platform] : Package;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(asset.browser_download_url);
      toast.success('Download URL copied');
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="rounded-md bg-white/5 p-1.5 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-foreground">{asset.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {formatBytes(asset.size)} · {formatCompact(asset.download_count)} downloads
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={copyUrl}
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        title="Copy download URL"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        asChild
        className="h-8 shrink-0 gap-1.5 text-xs"
      >
        <a href={asset.browser_download_url} target="_blank" rel="noreferrer">
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </Button>
    </div>
  );
}

/** A single GitHub release: header badges, collapsible notes, and its assets. */
function ReleaseCard({
  release,
  expanded,
  onToggle,
  onCreatePolicy,
}: {
  release: GitHubRelease;
  expanded: boolean;
  onToggle: () => void;
  onCreatePolicy?: (version: string) => void;
}) {
  const version = cleanVersion(release.tag_name);
  const canSeedPolicy = SEMVER_RE.test(version) && !!onCreatePolicy;

  return (
    <GlassPanel className="border-white/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono text-sm font-bold">
              <Tag className="h-3.5 w-3.5 text-primary" />
              {release.tag_name}
            </span>
            {!release.prerelease && !release.draft && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Stable
              </span>
            )}
            {release.prerelease && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-400">
                <FlaskConical className="h-3 w-3" />
                Pre-release
              </span>
            )}
            {release.draft && (
              <span className="rounded-full border border-white/10 bg-muted/20 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                Draft
              </span>
            )}
          </div>
          {release.name && release.name !== release.tag_name && (
            <p className="text-sm font-medium">{release.name}</p>
          )}
          <p className="text-[11px] text-muted-foreground/70">
            Published {formatDistanceToNow(new Date(release.published_at), { addSuffix: true })}
            {' · '}
            {new Date(release.published_at).toLocaleDateString()}
            {' · '}
            {release.assets.length} asset{release.assets.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canSeedPolicy && (
            <Button
              size="sm"
              onClick={() => onCreatePolicy!(version)}
              className="h-8 gap-1.5 text-xs"
              title={`Create an update policy targeting v${version}`}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Create policy
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" title="View on GitHub">
            <a href={release.html_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {/* Assets */}
      {release.assets.length > 0 && (
        <div className="mt-3 space-y-2">
          {release.assets.map((asset) => (
            <AssetRow key={asset.name} asset={asset} />
          ))}
        </div>
      )}

      {/* Release notes (collapsible) */}
      {release.body && release.body.trim() && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Release notes
          </button>
          {expanded && (
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 p-3 font-sans text-xs leading-relaxed text-muted-foreground">
              {release.body}
            </pre>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

/**
 * Browses published GitHub releases for the desktop app (snozxyx/Tatakai),
 * exposing each release's notes and downloadable assets. `onCreatePolicy` lets
 * the parent seed an update-policy form from a real published version rather
 * than typing one blind.
 *
 * Data is read straight from the public GitHub Releases API (unauthenticated,
 * CORS-enabled, 30-min sessionStorage cache); no backend or Supabase involved.
 */
export function GitHubReleasesPanel({
  onCreatePolicy,
}: {
  onCreatePolicy?: (version: string) => void;
}) {
  const [releases, setReleases] = useState<GitHubRelease[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(false);
    const data = await fetchAllReleases(force);
    if (!data) {
      setError(true);
      setReleases(null);
    } else {
      // Drafts appear only to authenticated maintainers; keep whatever the API returns.
      setReleases(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Github className="h-5 w-5 text-primary" />
            GitHub Releases
          </h3>
          <p className="text-xs text-muted-foreground">
            Live from{' '}
            <a href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              snozxyx/Tatakai
            </a>{' '}
            — pick a version to seed a policy, or grab an installer directly.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => load(true)}
          disabled={loading}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
        </div>
      ) : error ? (
        <GlassPanel className="border-destructive/20 bg-destructive/5 p-10 text-center">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-destructive/50" />
          <p className="mb-4 text-sm font-medium text-destructive">
            Couldn't reach GitHub. It may be rate-limited (60 requests/hour) — try again shortly.
          </p>
          <Button variant="outline" size="sm" onClick={() => load(true)} className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </GlassPanel>
      ) : !releases || releases.length === 0 ? (
        <GlassPanel className="border-dashed border-white/5 p-12 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">No published releases found.</p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {releases.map((release) => (
            <ReleaseCard
              key={release.tag_name}
              release={release}
              expanded={!!expanded[release.tag_name]}
              onToggle={() =>
                setExpanded((prev) => ({ ...prev, [release.tag_name]: !prev[release.tag_name] }))
              }
              onCreatePolicy={onCreatePolicy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
