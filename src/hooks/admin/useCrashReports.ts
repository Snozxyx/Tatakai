import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { CrashReport } from '@/types/admin-dashboard';

/**
 * Reads persisted desktop crash metadata from the `crash_reports` table
 * (populated by the desktop crash service via POST /api/v3/crash → service-role
 * insert). Staff-only via RLS. Metadata only — no dumps, no PII.
 *
 * The admin CrashReportPanel merges these persisted rows with the live
 * `onCrashPrevious` IPC feed (crashes forwarded by the local desktop process
 * this session), so the panel shows history across machines, not just this one.
 */
export function useCrashReports(limit = 50) {
  const { user } = useAuth();

  return useQuery<CrashReport[]>({
    queryKey: ['crash_reports', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crash_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        const { logger } = await import('@/lib/logger');
        void logger.error('[CrashReports] Error:', error);
        return [];
      }

      return (data ?? []).map((row: any): CrashReport => ({
        id: String(row.crash_id ?? row.id),
        date: row.crashed_at ?? row.created_at,
        path: '',
        app_version: row.app_version ?? null,
        platform: row.platform ?? null,
        arch: row.arch ?? null,
        node_version: row.node_version ?? null,
        electron_version: row.electron_version ?? null,
        source: 'persisted',
      }));
    },
    enabled: !!user,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });
}
