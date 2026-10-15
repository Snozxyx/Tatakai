import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from '@/lib/localeFormat';
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
  useUiTranslation();
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
        uiI18n.t('app.source_validation_done_i18n_value_0_healthy_i18n_335a0e8e', { value0: payload.healthy, value1: payload.unhealthy })
      );
    },
    onError: (error: any) => {
      toast.error(error?.message || uiI18n.t('app.failed_to_run_source_validation_sample_a88e7257'));
    },
  });

  const webhookMutation = useMutation({
    mutationFn: async () => {
      const content = webhookMessage.trim();
      if (!content) {
        throw new Error(uiI18n.t('app.webhook_message_cannot_be_empty_1b040e91'));
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
      toast.success(uiI18n.t('app.discord_webhook_test_sent_a3629958'));
    },
    onError: (error: any) => {
      toast.error(error?.message || uiI18n.t('app.failed_to_send_discord_webhook_test_a7bf23cb'));
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
              <p className="text-xs text-muted-foreground">{uiI18n.t('app.operational_scrapers_8314ca3b')}</p>
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
              <p className="text-xs text-muted-foreground">{uiI18n.t('app.canonical_snapshots_bc0aa8e2')}</p>
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
              <p className="text-xs text-muted-foreground">{uiI18n.t('app.source_queue_due_cdd5b57b')}</p>
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
              <p className="text-xs text-muted-foreground">{uiI18n.t('app.last_validation_check_8da21dba')}</p>
              <p className="text-xl font-bold">
                {lastValidationRun
                  ? uiI18n.t('app.i18n_value_0_i18n_value_1_i18n_value_2_9734bded', { value0: lastValidationRun.checked, value1: lastValidationRun.healthy, value2: lastValidationRun.unhealthy })
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
              {uiI18n.t('app.api_health_and_scrapers_48c811df')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {uiI18n.t('app.live_health_from_3ed241b9')} {TATAKAI_API_URL}/health/scrapers
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
                {uiI18n.t('app.open_cf9b7706')}
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
              {uiI18n.t('app.refresh_56e3badc')}
            </Button>
          </div>
        </div>

        {scraperHealthQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{uiI18n.t('app.loading_scraper_health_fd807a83')}</p>
        ) : scraperHealthQuery.isError ? (
          <p className="text-sm text-destructive">{uiI18n.t('app.failed_to_load_scraper_health_8e17ee1f')}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.total_b25928c6')}</p>
                <p className="text-lg font-bold">{scraperSummary?.total ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.operational_8459f935')}</p>
                <p className="text-lg font-bold text-emerald-500">{scraperSummary?.operational ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.degraded_13c27ff8')}</p>
                <p className="text-lg font-bold text-amber-500">{scraperSummary?.degraded ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.down_bf93e5ce')}</p>
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
                    <span className="text-xs text-muted-foreground">{node.latencyMs}{uiI18n.t('app.ms_26cc3217')}</span>
                  </div>
                </div>
              ))}
            </div>

            {scraperHealthQuery.data?.checkedAt && (
              <p className="text-xs text-muted-foreground">
                {uiI18n.t('app.last_checked_ada1b725')} {formatDistanceToNow(new Date(scraperHealthQuery.data.checkedAt), { addSuffix: true })}
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
              {uiI18n.t('app.canonical_store_summary_14344d05')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {uiI18n.t('app.snapshot_totals_queue_state_and_recent_canonical_39857366')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={recentLimit}
              onChange={(event) => setRecentLimit(event.target.value)}
              className="w-20 h-9"
              aria-label={uiI18n.t('app.recent_rows_015ee31e')}
            />
            <Button variant="outline" size="sm" onClick={() => canonicalSummaryQuery.refetch()}>
              {uiI18n.t('app.refresh_56e3badc')}
            </Button>
          </div>
        </div>

        {!canonicalData?.enabled ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500 flex items-center gap-2">
            <TriangleAlert className="w-4 h-4" />
            {uiI18n.t('app.canonical_database_is_disabled_1be90977')}
          </div>
        ) : canonicalSummaryQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{uiI18n.t('app.loading_canonical_summary_f67dd7b6')}</p>
        ) : canonicalSummaryQuery.isError ? (
          <p className="text-sm text-destructive">{uiI18n.t('app.failed_to_load_canonical_summary_21cef622')}</p>
        ) : canonicalSummary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.snapshots_55420c59')}</p>
                <p className="text-lg font-bold">{canonicalSummary.snapshotTotal}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.queue_total_6bbb3226')}</p>
                <p className="text-lg font-bold">{canonicalSummary.sourceQueue.total}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.pending_96f608c1')}</p>
                <p className="text-lg font-bold">{canonicalSummary.sourceQueue.pending}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.healthy_80ea156e')}</p>
                <p className="text-lg font-bold text-emerald-500">{canonicalSummary.sourceQueue.healthy}</p>
              </div>
              <div className="rounded-lg border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.unhealthy_718edf75')}</p>
                <p className="text-lg font-bold text-destructive">{canonicalSummary.sourceQueue.unhealthy}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/40 p-3">
                <p className="font-medium mb-2">{uiI18n.t('app.snapshot_by_scope_54730f02')}</p>
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
                <p className="font-medium mb-2">{uiI18n.t('app.recent_jobs_0c1c622f')}</p>
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
                        {new Date(job.startedAt).toLocaleString(uiI18n.language)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{uiI18n.t('app.no_canonical_summary_available_33c1c57c')}</p>
        )}
      </GlassPanel>

      <GlassPanel className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              {uiI18n.t('app.source_validation_job_f7b48f30')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {uiI18n.t('app.run_the_random_source_validation_sampler_from_th_6246e7bc')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Input
            value={validationLimit}
            onChange={(event) => setValidationLimit(event.target.value)}
            placeholder={uiI18n.t('app.limit_1_50_932ad6e8')}
          />
          <Input
            value={validationTimeoutMs}
            onChange={(event) => setValidationTimeoutMs(event.target.value)}
            placeholder={uiI18n.t('app.timeout_ms_1500_20000_fe7280c6')}
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
            {uiI18n.t('app.run_validation_814ad2fd')}
          </Button>
        </div>

        {lastValidationRun && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {uiI18n.t('app.checked_b2bc0c00')} {lastValidationRun.checked}{uiI18n.t('app.healthy_f0644c6f')} {lastValidationRun.healthy}{uiI18n.t('app.unhealthy_9cc0d966')}{' '}
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
                    <span>{uiI18n.t('app.queue_d97a3a5d')}{result.id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {result.status || uiI18n.t('app.no_status_e0de8e29')} {result.error ? uiI18n.t('app.i18n_value_0_f65d319b', { value0: result.error }) : ''}
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
            {uiI18n.t('app.api_webhook_smoke_test_138fc533')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {uiI18n.t('app.sends_a_test_payload_to_webhooks_discord_using_t_ac7be1c9')}
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <Input
            value={webhookMessage}
            onChange={(event) => setWebhookMessage(event.target.value)}
            placeholder={uiI18n.t('app.webhook_message_07ba0f38')}
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
            {uiI18n.t('app.send_test_c59675d5')}
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
}
