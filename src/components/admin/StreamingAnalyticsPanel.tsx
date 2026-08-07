import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  XCircle,
  Loader2,
  PlayCircle,
  Users,
  BarChart2,
  Download,
} from 'lucide-react';
import {
  peakConcurrentViewers,
  durationHistogram,
  topNContent,
  downloadCompletionRate,
} from '@/utils/streamingAnalytics';
import type { StreamingMetrics, DownloadMetrics } from '@/types/admin-dashboard';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
const STREAMING_QUERY_KEY = ['admin_streaming_analytics'] as const;
const DOWNLOAD_QUERY_KEY = ['admin_download_analytics'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <GlassPanel className="p-5 border-white/10 flex items-center gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </GlassPanel>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <GlassPanel className="p-10 text-center border-destructive/20 bg-destructive/5">
      <XCircle className="w-8 h-8 text-destructive/50 mx-auto mb-3" />
      <p className="text-sm font-medium text-destructive mb-4">
        Failed to load data
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </Button>
    </GlassPanel>
  );
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming section
// ---------------------------------------------------------------------------
function StreamingSection() {
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: STREAMING_QUERY_KEY,
    queryFn: async (): Promise<StreamingMetrics> => {
      const [sessionsRes, telemetryRes] = await Promise.all([
        supabase
          .from('watch_sessions')
          .select('id, started_at, watch_duration_seconds, created_at'),
        supabase
          .from('playback_telemetry')
          .select('event_type, source, server_name')
          .eq('event_type', 'source_resolved'),
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (telemetryRes.error) throw telemetryRes.error;

      const sessions = sessionsRes.data ?? [];
      const telemetry = telemetryRes.data ?? [];

      // Peak concurrent: use started_at (falls back to created_at)
      const startTimestamps = sessions
        .filter((s) => s.started_at != null || s.created_at != null)
        .map((s) => new Date((s.started_at || s.created_at) as string).getTime());

      const peakConcurrent = peakConcurrentViewers(startTimestamps);

      // Duration histogram
      const sessionsWithDuration = sessions.map((s) => ({
        watch_duration_seconds: (s as any).watch_duration_seconds ?? 0,
      }));
      const durationBuckets = durationHistogram(sessionsWithDuration);

      // Provider breakdown: use source, fall back to server_name
      const providerCounts = new Map<string, number>();
      for (const row of telemetry) {
        const provider = (row as any).source || (row as any).server_name || 'unknown';
        providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
      }
      const providerBreakdown = [...providerCounts.entries()]
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count);

      return {
        totalSessions: sessions.length,
        peakConcurrent,
        durationBuckets,
        providerBreakdown,
      };
    },
  });

  if (isLoading) return <SectionLoader />;
  if (isError || !data) return <SectionError onRetry={refetch} />;

  const maxBucketCount = Math.max(...data.durationBuckets.map((b) => b.count), 1);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          icon={<PlayCircle className="w-5 h-5" />}
          label="Total Sessions"
          value={data.totalSessions.toLocaleString()}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Peak Concurrent Viewers"
          value={data.peakConcurrent.toLocaleString()}
        />
      </div>

      {/* Duration histogram */}
      <GlassPanel className="p-5 border-white/10">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          Stream Duration Distribution
        </h3>
        <div className="space-y-3">
          {data.durationBuckets.map((bucket) => {
            const pct =
              maxBucketCount > 0
                ? Math.round((bucket.count / maxBucketCount) * 100)
                : 0;
            return (
              <div key={bucket.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">
                    {bucket.label}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {bucket.count.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* Provider breakdown */}
      <GlassPanel className="p-5 border-white/10">
        <h3 className="text-sm font-semibold mb-4">Provider Usage Breakdown</h3>
        {data.providerBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No provider data available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Provider
                  </th>
                  <th className="text-right pb-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.providerBreakdown.map((row) => (
                  <tr
                    key={row.provider}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-2 font-mono text-xs">{row.provider}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download section
// ---------------------------------------------------------------------------
function DownloadSection() {
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: DOWNLOAD_QUERY_KEY,
    queryFn: async (): Promise<DownloadMetrics> => {
      const { data: rows, error } = await supabase
        .from('watch_sessions')
        .select('id, anime_id, content_id, watch_duration_seconds, completed');

      if (error) throw error;

      const sessions = (rows ?? []) as any[];

      // Build per-content completed counts — use content_id, fall back to anime_id
      const contentMap = new Map<
        string,
        { content_id: string; title?: string; completedCount: number }
      >();
      for (const s of sessions) {
        const cid = s.content_id || s.anime_id || '__unknown__';
        const existing = contentMap.get(cid) ?? { content_id: cid, completedCount: 0 };
        if (s.completed === true) existing.completedCount++;
        contentMap.set(cid, existing);
      }

      const allContent = [...contentMap.values()];
      const topContent = topNContent(allContent, 10);

      // Completion rate — sessions with completed column available
      const completionRecords = sessions.map((s) => ({
        completed: s.completed === true,
        watch_duration_seconds: s.watch_duration_seconds ?? 0,
      }));
      const completionRate = downloadCompletionRate(completionRecords);

      return { topContent, completionRate };
    },
  });

  if (isLoading) return <SectionLoader />;
  if (isError || !data) return <SectionError onRetry={refetch} />;

  const completionRateDisplay =
    data.completionRate === null ? 'N/A' : `${data.completionRate}%`;

  return (
    <div className="space-y-6">
      {/* Completion rate stat */}
      <StatCard
        icon={<Download className="w-5 h-5" />}
        label="Overall Download Completion Rate"
        value={completionRateDisplay}
      />

      {/* Top 10 content table */}
      <GlassPanel className="p-5 border-white/10">
        <h3 className="text-sm font-semibold mb-4">
          Top 10 Content by Completed Downloads
        </h3>
        {data.topContent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No download data available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium uppercase tracking-wide w-6">
                    #
                  </th>
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Content
                  </th>
                  <th className="text-right pb-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topContent.map((item, idx) => (
                  <tr
                    key={item.content_id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-2 text-muted-foreground/60 text-xs">
                      {idx + 1}
                    </td>
                    <td className="py-2 font-mono text-xs max-w-[200px] truncate">
                      {item.title ?? item.content_id}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {item.completedCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function StreamingAnalyticsPanel() {
  return (
    <div className="space-y-10">
      {/* Streaming Analytics section */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <PlayCircle className="w-6 h-6 text-primary" />
          Streaming Analytics
        </h2>
        <StreamingSection />
      </section>

      {/* Download Analytics section */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Download className="w-6 h-6 text-primary" />
          Download Analytics
        </h2>
        <DownloadSection />
      </section>
    </div>
  );
}
