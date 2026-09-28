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
} from 'lucide-react';
import {
  peakConcurrentViewers,
  durationHistogram,
} from '@/utils/streamingAnalytics';
import type { StreamingMetrics } from '@/types/admin-dashboard';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
const STREAMING_QUERY_KEY = ['admin_streaming_analytics'] as const;

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
//
// The provider-usage breakdown and the whole download-analytics section (overall
// completion rate + top-10 by completed downloads) were removed in the admin
// overhaul; only session volume, peak concurrency and duration distribution
// remain. watch_sessions / playback_telemetry are untouched — shared elsewhere.
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
      const { data: rows, error } = await supabase
        .from('watch_sessions')
        .select('id, started_at, watch_duration_seconds, created_at');

      if (error) throw error;

      const sessions = rows ?? [];

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

      return {
        totalSessions: sessions.length,
        peakConcurrent,
        durationBuckets,
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
    </div>
  );
}
