import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Activity, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerfSnapshot {
  timestamp: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  cpuUser: number;
  cpuSystem: number;
  rendererHeapMB?: number;
  rendererRssMB?: number;
}

interface PerfMetricsPanelProps {
  onClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEAP_WARN_MB = 512;
const RSS_WARN_MB = 1024;
const AUTO_REFRESH_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function mb(val: number | undefined): string {
  if (val === undefined) return '—';
  return `${val.toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PerfMetricsPanel
 *
 * On open: calls `window.electron.perfGetHistory()` and renders sparkline
 * charts using recharts for `heapUsedMB` and `rssMB` over time.
 * Auto-refreshes every 30 s while open.
 * Highlights samples exceeding thresholds (heap > 512, rss > 1024) in amber.
 *
 * Requirements: 4.9, 8.2
 */
export function PerfMetricsPanel({ onClose }: PerfMetricsPanelProps) {
  const [snapshots, setSnapshots] = useState<PerfSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = useCallback(async () => {
    const electron = (window as any).electron;
    if (!electron?.perfGetHistory) {
      setError('perfGetHistory IPC not available — is this a desktop build?');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: PerfSnapshot[] | { error: string } = await electron.perfGetHistory();
      if (Array.isArray(data)) {
        setSnapshots(data);
      } else if (data && typeof (data as any).error === 'string') {
        setError((data as any).error);
      }
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount + auto-refresh every 30 s
  useEffect(() => {
    fetchHistory();
    intervalRef.current = setInterval(fetchHistory, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchHistory]);

  const latest = snapshots[snapshots.length - 1];

  const chartData = snapshots.map((s) => ({
    time: formatTime(s.timestamp),
    heap: parseFloat(s.heapUsedMB.toFixed(1)),
    rss: parseFloat(s.rssMB.toFixed(1)),
    heapWarn: s.heapUsedMB > HEAP_WARN_MB,
    rssWarn: s.rssMB > RSS_WARN_MB,
  }));

  return (
    <div
      role="dialog"
      aria-label="Performance Metrics"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f0f1a',
        color: '#e5e7eb',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={15} color="#6366f1" />
          <span style={{ fontWeight: 600 }}>Performance Metrics</span>
          {loading && (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>refreshing…</span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close perf panel"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {error ? (
          <p style={{ color: '#f87171' }}>{error}</p>
        ) : snapshots.length === 0 && !loading ? (
          <p style={{ color: 'rgba(255,255,255,0.4)' }}>
            No performance data yet. Data is sampled every 30 seconds.
          </p>
        ) : (
          <>
            {/* Current stats */}
            {latest && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <StatCard
                  label="Heap Used"
                  value={mb(latest.heapUsedMB)}
                  warn={latest.heapUsedMB > HEAP_WARN_MB}
                />
                <StatCard
                  label="RSS"
                  value={mb(latest.rssMB)}
                  warn={latest.rssMB > RSS_WARN_MB}
                />
                <StatCard label="Heap Total" value={mb(latest.heapTotalMB)} />
                <StatCard label="External" value={mb(latest.externalMB)} />
                {latest.rendererHeapMB !== undefined && (
                  <StatCard label="Renderer Heap" value={mb(latest.rendererHeapMB)} />
                )}
              </div>
            )}

            {/* Heap sparkline */}
            <ChartSection
              title="Heap Used (MB)"
              data={chartData}
              dataKey="heap"
              colour="#6366f1"
              warnThreshold={HEAP_WARN_MB}
            />

            {/* RSS sparkline */}
            <ChartSection
              title="RSS (MB)"
              data={chartData}
              dataKey="rss"
              colour="#10b981"
              warnThreshold={RSS_WARN_MB}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      style={{
        background: warn ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${warn ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: warn ? '#fbbf24' : '#e5e7eb',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ChartSection({
  title,
  data,
  dataKey,
  colour,
  warnThreshold,
}: {
  title: string;
  data: Array<Record<string, unknown>>;
  dataKey: string;
  colour: string;
  warnThreshold: number;
}) {
  // Check if any sample exceeds the threshold — highlight label in amber
  const hasWarn = data.some((d) => (d[dataKey] as number) > warnThreshold);

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: hasWarn ? '#fbbf24' : 'rgba(255,255,255,0.55)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {title}
        {hasWarn && (
          <span
            style={{
              fontSize: 10,
              background: 'rgba(251,191,36,0.15)',
              color: '#fbbf24',
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            HIGH
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colour} stopOpacity={0.25} />
              <stop offset="95%" stopColor={colour} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="time"
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: '#1a1a2e',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: '#e5e7eb',
              fontSize: 11,
            }}
            formatter={(val: number) => [`${val.toFixed(1)} MB`, dataKey === 'heap' ? 'Heap' : 'RSS']}
            labelFormatter={(label) => `Time: ${label}`}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={colour}
            strokeWidth={1.5}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            activeDot={{ r: 3, fill: colour }}
          />
          {/* Threshold reference line */}
          {data.some((d) => (d[dataKey] as number) > warnThreshold * 0.5) && (
            <Area
              type="monotone"
              dataKey={() => warnThreshold}
              stroke="rgba(251,191,36,0.3)"
              strokeWidth={1}
              strokeDasharray="4 4"
              fill="none"
              dot={false}
              activeDot={false}
              legendType="none"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PerfMetricsPanel;
