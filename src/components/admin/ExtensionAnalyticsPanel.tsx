import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { AlertTriangle, Loader2, Package, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { topNExtensions, computeUninstallRate } from '@/utils/extensionAnalytics';
import type { ExtensionMetrics } from '@/types/admin-dashboard';

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------
const QUERY_KEY = ['admin_extension_analytics'] as const;

// ---------------------------------------------------------------------------
// Data shape returned by the query function
// ---------------------------------------------------------------------------
interface ExtensionAnalyticsData {
  topExtensions: ExtensionMetrics[];
  auditSummary: { event_type: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExtensionAnalyticsPanel() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ExtensionAnalyticsData> => {
      const now = new Date();
      const sevenDaysAgo = subDays(now, 7);
      const thirtyDaysAgo = subDays(now, 30);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

      // Run both queries in parallel
      // extension_manifests is the canonical table (extension_id is the text PK used throughout)
      // extension_audit_logs stores admin/system events with performed_at timestamp
      const [extensionsResult, auditResult] = await Promise.all([
        supabase
          .from('extension_manifests' as any)
          .select('extension_id, name, install_count, health_score, created_at'),
        supabase
          .from('extension_audit_logs' as any)
          .select('event_type, performed_at')
          .gte('performed_at', sevenDaysAgoISO),
      ]);

      if (extensionsResult.error) throw extensionsResult.error;
      if (auditResult.error) throw auditResult.error;

      const extensionRows = (extensionsResult.data as any[]) ?? [];
      const auditRows = (auditResult.data as any[]) ?? [];

      // Map extension rows to ExtensionMetrics
      const metrics: ExtensionMetrics[] = extensionRows.map((row) => {
        const totalInstalls: number = (row.install_count as number | null) ?? 0;
        const activeUsers: number = totalInstalls; // proxy: no separate active-user column
        const recentInstalls: number =
          row.created_at != null && row.created_at >= thirtyDaysAgoISO ? 1 : 0;
        const healthScore: number = (row.health_score as number | null) ?? 1;
        const uninstallRate = computeUninstallRate(totalInstalls, activeUsers);

        return {
          id: (row.extension_id as string | null) ?? (row.id as string | null) ?? '',
          name: (row.name as string | null) ?? '',
          totalInstalls,
          activeUsers,
          recentInstalls,
          healthScore,
          uninstallRate,
        };
      });

      // Top 10 by totalInstalls
      const topExtensions = topNExtensions(metrics, 10);

      // Group audit log events by event_type (audit log uses performed_at timestamp)
      const eventCountMap = new Map<string, number>();
      for (const row of auditRows) {
        const eventType = (row.event_type as string | null) ?? 'unknown';
        eventCountMap.set(eventType, (eventCountMap.get(eventType) ?? 0) + 1);
      }
      const auditSummary = Array.from(eventCountMap.entries())
        .map(([event_type, count]) => ({ event_type, count }))
        .sort((a, b) => b.count - a.count);

      return { topExtensions, auditSummary };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const renderLoadingState = () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
    </div>
  );

  const renderErrorState = () => (
    <GlassPanel className="p-12 text-center border-destructive/20 bg-destructive/5">
      <XCircle className="w-10 h-10 text-destructive/50 mx-auto mb-4" />
      <p className="text-sm font-medium text-destructive mb-4">
        Failed to load extension analytics
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRetry}
        className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </Button>
    </GlassPanel>
  );

  const renderTable = (extensions: ExtensionMetrics[]) => {
    if (extensions.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No extension data available
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-3 px-4 font-semibold text-muted-foreground">
                Name
              </th>
              <th className="text-right py-3 px-4 font-semibold text-muted-foreground">
                Total Installs
              </th>
              <th className="text-right py-3 px-4 font-semibold text-muted-foreground">
                Active Users
              </th>
              <th className="text-right py-3 px-4 font-semibold text-muted-foreground">
                Installs Last 30 Days
              </th>
              <th className="text-right py-3 px-4 font-semibold text-muted-foreground">
                Uninstall Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {extensions.map((ext) => {
              const isUnhealthy = ext.healthScore < 0.5;
              return (
                <tr
                  key={ext.id}
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-2">
                      {isUnhealthy && (
                        <AlertTriangle
                          className="w-4 h-4 text-amber-500 shrink-0"
                          aria-label="Low health score"
                        />
                      )}
                      <span className={isUnhealthy ? 'text-amber-600 font-medium' : ''}>
                        {ext.name}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {ext.totalInstalls.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {ext.activeUsers.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {ext.recentInstalls.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {ext.uninstallRate === null ? (
                      <span className="text-muted-foreground">N/A</span>
                    ) : (
                      `${ext.uninstallRate.toFixed(1)}%`
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAuditSummary = (
    auditSummary: { event_type: string; count: number }[],
  ) => (
    <GlassPanel className="p-6">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        Audit Log — Last 7 Days
      </h3>
      {auditSummary.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No audit events in the last 7 days
        </p>
      ) : (
        <div className="space-y-2">
          {auditSummary.map(({ event_type, count }) => (
            <div
              key={event_type}
              className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0"
            >
              <span className="text-sm font-mono text-foreground/80">
                {event_type}
              </span>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          Extension Analytics
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          disabled={isLoading || isFetching}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        renderLoadingState()
      ) : isError ? (
        renderErrorState()
      ) : (
        <div className="space-y-6">
          {/* Extensions table */}
          <GlassPanel className="p-6">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Top 10 Extensions by Total Installs
            </h3>
            {renderTable(data?.topExtensions ?? [])}
          </GlassPanel>

          {/* Audit log summary */}
          {renderAuditSummary(data?.auditSummary ?? [])}
        </div>
      )}
    </div>
  );
}
