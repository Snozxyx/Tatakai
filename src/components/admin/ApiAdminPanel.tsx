import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  TriangleAlert,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TATAKAI_API_URL, unwrapApiData } from '@/lib/api/api-client';
import { withAdminSecretHeader } from '@/lib/api/adminSecret';

type ScraperNode = {
  id: string;
  label: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number;
};

type ScraperHealthPayload = {
  success?: boolean;
  checkedAt?: string;
  summary?: {
    total: number;
    operational: number;
    degraded: number;
    down: number;
  };
  scrapers?: ScraperNode[];
};

type CanonicalSummary = {
  snapshotTotal: number;
  snapshotByScope: Array<{ scope: 'anime' | 'manga' | 'hianime'; count: number }>;
  sourceQueue: {
    total: number;
    pending: number;
    healthy: number;
    unhealthy: number;
    due: number;
  };
  mangaHomeRows: number;
  recentSnapshots: Array<{
    scope: 'anime' | 'manga' | 'hianime';
    routePath: string;
    refreshedAt: string;
  }>;
  recentJobs: Array<{
    jobName: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
  }>;
};

type CanonicalSummaryPayload = {
  success?: boolean;
  enabled: boolean;
  summary: CanonicalSummary | null;
};

type SourceValidationResult = {
  id: number;
  ok: boolean;
  status: number | null;
  error: string | null;
};

type SourceValidationPayload = {
  success?: boolean;
  enabled: boolean;
  reserved: number;
  checked: number;
  healthy: number;
  unhealthy: number;
  results: SourceValidationResult[];
};

const fetchJson = async <T,>(path: string, init?: RequestInit, timeoutMs = 12000): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const providedHeaders = (init?.headers || {}) as Record<string, string>;

    const response = await fetch(`${TATAKAI_API_URL}${path}`, {
      ...init,
      headers: withAdminSecretHeader({
        Accept: 'application/json',
        ...providedHeaders,
      }),
      signal: controller.signal,
    });

    let json: any = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const message = String(json?.message || `HTTP ${response.status}`);
      throw new Error(message);
    }

    if (!json) return {} as T;
    return unwrapApiData<T>(json as any);
  } finally {
    window.clearTimeout(timeout);
  }
};

const statusPillClass = (status: string) => {
  if (status === 'operational' || status === 'success') {
    return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40';
  }
  if (status === 'degraded') {
    return 'bg-amber-500/20 text-amber-500 border-amber-500/40';
  }
  return 'bg-destructive/20 text-destructive border-destructive/40';
};

export function ApiAdminPanel() {
  const queryClient = useQueryClient();
  const [recentLimit, setRecentLimit] = useState('10');
  const [validationLimit, setValidationLimit] = useState('8');
  const [validationTimeoutMs, setValidationTimeoutMs] = useState('9000');
  const [webhookMessage, setWebhookMessage] = useState('Tatakai API admin test message');
  const [lastValidationRun, setLastValidationRun] = useState<SourceValidationPayload | null>(null);

  const parsedRecentLimit = useMemo(() => {
    const value = Number.parseInt(recentLimit, 10);
    if (!Number.isFinite(value)) return 10;
    return Math.max(1, Math.min(value, 50));
  }, [recentLimit]);

  const scraperHealthQuery = useQuery({
    queryKey: ['admin-api', 'scraper-health'],
    queryFn: () => fetchJson<ScraperHealthPayload>('/health/scrapers'),
    refetchInterval: 60_000,
  });

  const canonicalSummaryQuery = useQuery({
    queryKey: ['admin-api', 'canonical-summary', parsedRecentLimit],
    queryFn: () =>
      fetchJson<CanonicalSummaryPayload>(
        `/jobs/canonical/summary?recent=${parsedRecentLimit}`
      ),
    refetchInterval: 60_000,
  });

  const sourceValidationMutation = useMutation({
    mutationFn: async () => {
      const limit = Math.max(1, Math.min(Number.parseInt(validationLimit, 10) || 8, 50));
      const timeoutMs = Math.max(
        1500,
        Math.min(Number.parseInt(validationTimeoutMs, 10) || 9000, 20_000)
      );

      return fetchJson<SourceValidationPayload>(
        `/jobs/source-validation/random-check?limit=${limit}&timeoutMs=${timeoutMs}`,
        { method: 'GET' },
        timeoutMs + 5000
      );
    },
    onSuccess: (payload) => {
      setLastValidationRun(payload);
      queryClient.invalidateQueries({ queryKey: ['admin-api', 'canonical-summary'] });
      toast.success(
        `Source validation done: ${payload.healthy} healthy / ${payload.unhealthy} unhealthy`
      );
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to run source validation sample');
    },
  });

  const webhookMutation = useMutation({
    mutationFn: async () => {
      const content = webhookMessage.trim();
      if (!content) {
        throw new Error('Webhook message cannot be empty');
      }

      return fetchJson<{ ok?: boolean }>('/webhooks/discord', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'status',
          content: `[Admin API Panel] ${content}`,
          username: 'Tatakai API Admin',
        }),
      });
    },
    onSuccess: () => {
      toast.success('Discord webhook test sent');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to send Discord webhook test');
    },
  });

  const scraperSummary = scraperHealthQuery.data?.summary;
  const scraperNodes = scraperHealthQuery.data?.scrapers || [];
  const canonicalData = canonicalSummaryQuery.data;
  const canonicalSummary = canonicalData?.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Operational Scrapers</p>
              <p className="text-xl font-bold">
                {scraperSummary ? `${scraperSummary.operational}/${scraperSummary.total}` : '--'}
              </p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/20">
              <Database className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Canonical Snapshots</p>
              <p className="text-xl font-bold">
                {canonicalSummary ? canonicalSummary.snapshotTotal : '--'}
              </p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Activity className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Source Queue Due</p>
              <p className="text-xl font-bold">
                {canonicalSummary ? canonicalSummary.sourceQueue.due : '--'}
              </p>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Zap className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Validation Check</p>
              <p className="text-xl font-bold">
                {lastValidationRun
                  ? `${lastValidationRun.checked} (${lastValidationRun.healthy}/${lastValidationRun.unhealthy})`
                  : '--'}
              </p>
            </div>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              API Health and Scrapers
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Live health from {TATAKAI_API_URL}/health/scrapers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`${TATAKAI_API_URL}/health/scrapers`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Open
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => scraperHealthQuery.refetch()}
              disabled={scraperHealthQuery.isFetching}
            >
              {scraperHealthQuery.isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {scraperHealthQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading scraper health...</p>
        ) : scraperHealthQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load scraper health.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{scraperSummary?.total ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Operational</p>
                <p className="text-lg font-bold text-emerald-500">{scraperSummary?.operational ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Degraded</p>
                <p className="text-lg font-bold text-amber-500">{scraperSummary?.degraded ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Down</p>
                <p className="text-lg font-bold text-destructive">{scraperSummary?.down ?? 0}</p>
              </div>
            </div>

            <div className="space-y-2">
              {scraperNodes.map((node) => (
                <div
                  key={node.id}
                  className="rounded-lg border border-border/40 p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{node.label}</p>
                    <p className="text-xs text-muted-foreground">{node.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold border ${statusPillClass(
                        node.status
                      )}`}
                    >
                      {node.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{node.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>

            {scraperHealthQuery.data?.checkedAt && (
              <p className="text-xs text-muted-foreground">
                Last checked {formatDistanceToNow(new Date(scraperHealthQuery.data.checkedAt), { addSuffix: true })}
              </p>
            )}
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Canonical Store Summary
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Snapshot totals, queue state, and recent canonical jobs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={recentLimit}
              onChange={(event) => setRecentLimit(event.target.value)}
              className="w-20 h-9"
              aria-label="Recent rows"
            />
            <Button variant="outline" size="sm" onClick={() => canonicalSummaryQuery.refetch()}>
              Refresh
            </Button>
          </div>
        </div>

        {!canonicalData?.enabled ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500 flex items-center gap-2">
            <TriangleAlert className="w-4 h-4" />
            Canonical database is disabled.
          </div>
        ) : canonicalSummaryQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading canonical summary...</p>
        ) : canonicalSummaryQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load canonical summary.</p>
        ) : canonicalSummary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Snapshots</p>
                <p className="text-lg font-bold">{canonicalSummary.snapshotTotal}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Queue Total</p>
                <p className="text-lg font-bold">{canonicalSummary.sourceQueue.total}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-bold">{canonicalSummary.sourceQueue.pending}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Healthy</p>
                <p className="text-lg font-bold text-emerald-500">{canonicalSummary.sourceQueue.healthy}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">Unhealthy</p>
                <p className="text-lg font-bold text-destructive">{canonicalSummary.sourceQueue.unhealthy}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/40 p-3">
                <p className="font-medium mb-2">Snapshot by scope</p>
                <div className="space-y-2">
                  {canonicalSummary.snapshotByScope.map((row) => (
                    <div key={row.scope} className="flex items-center justify-between text-sm">
                      <span className="uppercase text-muted-foreground tracking-wide">{row.scope}</span>
                      <span className="font-semibold">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border/40 p-3">
                <p className="font-medium mb-2">Recent jobs</p>
                <div className="space-y-2 max-h-44 overflow-auto pr-1">
                  {canonicalSummary.recentJobs.map((job, index) => (
                    <div key={`${job.jobName}-${index}`} className="text-sm border-b border-border/30 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{job.jobName}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs border ${statusPillClass(job.status)}`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(job.startedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No canonical summary available.</p>
        )}
      </GlassPanel>

      <GlassPanel className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Source Validation Job
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Run the random source-validation sampler from the admin dashboard.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Input
            value={validationLimit}
            onChange={(event) => setValidationLimit(event.target.value)}
            placeholder="Limit (1-50)"
          />
          <Input
            value={validationTimeoutMs}
            onChange={(event) => setValidationTimeoutMs(event.target.value)}
            placeholder="Timeout ms (1500-20000)"
          />
          <Button
            onClick={() => sourceValidationMutation.mutate()}
            disabled={sourceValidationMutation.isPending}
            className="gap-2"
          >
            {sourceValidationMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Activity className="w-4 h-4" />
            )}
            Run Validation
          </Button>
        </div>

        {lastValidationRun && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Checked {lastValidationRun.checked}, healthy {lastValidationRun.healthy}, unhealthy{' '}
              {lastValidationRun.unhealthy}
            </div>
            <div className="space-y-2 max-h-48 overflow-auto pr-1">
              {lastValidationRun.results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-lg border border-border/40 p-2 flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {result.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span>Queue #{result.id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {result.status || 'no-status'} {result.error ? `(${result.error})` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="p-6">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-primary" />
            API Webhook Smoke Test
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sends a test payload to /webhooks/discord using the status channel.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <Input
            value={webhookMessage}
            onChange={(event) => setWebhookMessage(event.target.value)}
            placeholder="Webhook message"
          />
          <Button
            onClick={() => webhookMutation.mutate()}
            disabled={webhookMutation.isPending}
            className="gap-2"
          >
            {webhookMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            Send Test
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
}
