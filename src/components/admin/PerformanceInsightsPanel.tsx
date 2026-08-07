import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  XCircle,
  Loader2,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { subDays, startOfDay, format } from 'date-fns';
import { versionDistribution, adoptionRate } from '@/utils/performanceInsights';
import type { VersionDistribution, PerfSnapshot } from '@/types/admin-dashboard';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
const VERSION_DIST_KEY = ['admin_perf_version_dist'] as const;
const makeCrashKey = (days: number) => ['admin_perf_crash_rate', days] as const;
const ADOPTION_KEY = ['admin_perf_adoption'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-7 h-7 animate-spin text-primary opacity-50" />
    </div>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <GlassPanel className="p-8 text-center border-destructive/20 bg-destructive/5">
      <XCircle className="w-8 h-8 text-destructive/50 mx-auto mb-3" />
      <p className="text-sm font-medium text-destructive mb-3">Failed to load data</p>
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

// ---------------------------------------------------------------------------
// Version Distribution Section
// ---------------------------------------------------------------------------
function VersionDistributionSection() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: VERSION_DIST_KEY,
    queryFn: async (): Promise<VersionDistribution[]> => {
      // app_version column added by 20260509000001 migration — handle gracefully
      const { data: rows, error } = await (supabase
        .from('profiles')
        .select('app_version') as any);
      if (error) {
        // Column doesn't exist yet — return empty to show "not available" state
        if (error.code === '42703' || error.message?.includes('column')) return [];
        throw error;
      }
      const profiles = (rows ?? []) as { app_version: string | null }[];
      return versionDistribution(profiles);
    },
  });

  if (isLoading) return <SectionLoader />;
  if (isError) return <SectionError onRetry={refetch} />;

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Version distribution data not available
      </p>
    );
  }

  const maxCount = data[0]?.count ?? 1;

  return (
    <div className="space-y-3">
      {data.map((entry) => (
        <div key={entry.version} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-medium">v{entry.version}</span>
            <span className="text-muted-foreground tabular-nums">
              {entry.count.toLocaleString()} ({entry.percent.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-primary/70 rounded-full transition-all duration-500"
              style={{ width: `${(entry.count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adoption Rate Section
// ---------------------------------------------------------------------------
function AdoptionRateSection() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ADOPTION_KEY,
    queryFn: async (): Promise<{ rate: number | null; targetVersion: string | null }> => {
      // Find active mandatory/recommended stable policy
      const { data: policyRows, error: policyError } = await supabase
        .from('update_policies')
        .select('target_version, type, channel')
        .eq('channel', 'stable')
        .eq('active', true)
        .in('type', ['mandatory', 'recommended'])
        .limit(1);
      if (policyError) throw policyError;

      const policy = policyRows?.[0];
      if (!policy) return { rate: null, targetVersion: null };

      // Get all profiles app_version
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('app_version');
      if (profileError) throw profileError;

      const profiles = (profileRows ?? []) as { app_version: string | null }[];
      const rate = adoptionRate(profiles, { target_version: policy.target_version });

      return { rate, targetVersion: policy.target_version };
    },
  });

  if (isLoading) return <SectionLoader />;
  if (isError) return <SectionError onRetry={refetch} />;

  if (data?.rate === null) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No active stable channel policy
      </p>
    );
  }

  return (
    <div className="flex items-center gap-6 p-4 rounded-xl bg-white/5">
      <div className="flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
          Stable Policy Target
        </p>
        <p className="font-mono font-semibold text-sm">v{data?.targetVersion}</p>
      </div>
      <div className="text-right">
        <p className="text-3xl font-bold text-primary tabular-nums">
          {(data?.rate ?? 0).toFixed(1)}%
        </p>
        <p className="text-xs text-muted-foreground">Adoption Rate</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crash Rate Section
// ---------------------------------------------------------------------------
function CrashRateSection() {
  const [days, setDays] = useState(30);
  const [inputDays, setInputDays] = useState('30');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: makeCrashKey(days),
    queryFn: async (): Promise<{ date: string; count: number }[]> => {
      const since = subDays(startOfDay(new Date()), days - 1).toISOString();
      const { data: rows, error } = await supabase
        .from('playback_telemetry')
        .select('created_at')
        .eq('event_type', 'crash')
        .gte('created_at', since);
      if (error) throw error;

      // Group by calendar day
      const countMap = new Map<string, number>();
      for (const row of rows ?? []) {
        const day = (row.created_at as string).slice(0, 10);
        countMap.set(day, (countMap.get(day) ?? 0) + 1);
      }

      // Fill in all days in range even if count = 0
      const result: { date: string; count: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
        result.push({ date: d, count: countMap.get(d) ?? 0 });
      }
      return result;
    },
  });

  const handleApplyDays = () => {
    const parsed = parseInt(inputDays, 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 90) {
      setDays(parsed);
    }
  };

  if (isLoading) return <SectionLoader />;
  if (isError) return <SectionError onRetry={refetch} />;

  const isEmpty = !data || data.every((d) => d.count === 0);

  return (
    <div className="space-y-4">
      {/* Range control */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Range (days):</span>
        <input
          type="number"
          min={1}
          max={90}
          value={inputDays}
          onChange={(e) => setInputDays(e.target.value)}
          className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button size="sm" variant="outline" onClick={handleApplyDays} className="text-xs h-7">
          Apply
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-1 text-xs h-7 text-muted-foreground"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No crash telemetry data
        </p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
                labelFormatter={(l) => `Date: ${l}`}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Crashes"
                stroke="#f87171"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perf Snapshot Section (Electron-only)
// ---------------------------------------------------------------------------
function PerfSnapshotSection() {
  const [snapshots, setSnapshots] = useState<PerfSnapshot[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSnapshots() {
      const electron = (window as any).electron;
      if (!electron?.perfGetHistory) {
        setLoading(false);
        return;
      }
      try {
        const data = await electron.perfGetHistory(20);
        setSnapshots(Array.isArray(data) ? data : []);
      } catch {
        setSnapshots([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSnapshots();
  }, []);

  if (loading) return <SectionLoader />;

  if (!snapshots || snapshots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No performance snapshot data available
      </p>
    );
  }

  const chartData = snapshots.map((s, i) => ({
    index: i + 1,
    heapUsedMB: s.heapUsedMB,
    rssMB: s.rssMB,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis
            dataKey="index"
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            label={{ value: 'Snapshot #', position: 'insideBottom', offset: -2, fontSize: 10 }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            unit=" MB"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="heapUsedMB"
            name="Heap Used (MB)"
            stroke="#60a5fa"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="rssMB"
            name="RSS (MB)"
            stroke="#34d399"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function PerformanceInsightsPanel() {
  const isElectron = !!(window as any).electron;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          Performance Insights
        </h2>
      </div>

      {/* Version Distribution */}
      <GlassPanel className="p-6 border-white/10">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <ChevronUp className="w-4 h-4 text-primary" />
          App Version Distribution
        </h3>
        <VersionDistributionSection />
      </GlassPanel>

      {/* Adoption Rate */}
      <GlassPanel className="p-6 border-white/10">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <ChevronDown className="w-4 h-4 text-primary" />
          Stable Policy Adoption Rate
        </h3>
        <AdoptionRateSection />
      </GlassPanel>

      {/* Crash Rate Trend */}
      <GlassPanel className="p-6 border-white/10">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-destructive" />
          Crash Rate Trend
        </h3>
        <CrashRateSection />
      </GlassPanel>

      {/* Perf Snapshot — Electron only */}
      {isElectron && (
        <GlassPanel className="p-6 border-white/10">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Memory Snapshots (Desktop)
          </h3>
          <PerfSnapshotSection />
        </GlassPanel>
      )}
    </div>
  );
}
