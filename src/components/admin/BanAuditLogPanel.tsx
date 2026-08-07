import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Loader2,
  RefreshCw,
  XCircle,
  History,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { filterAuditLog, exportAuditLogCsv } from '@/utils/banUtils';
import type { BanAuditRecord } from '@/types/admin-dashboard';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50;
const QUERY_KEY = ['admin_ban_audit_log'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BanAuditLogPanel() {
  const { isAdmin, isModerator } = useAuth();
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'banned' | 'unbanned'>('all');

  // ---------------------------------------------------------------------------
  // Access control
  // ---------------------------------------------------------------------------
  if (!isAdmin && !isModerator) {
    return (
      <GlassPanel className="p-12 text-center border-destructive/20 bg-destructive/5">
        <XCircle className="w-10 h-10 text-destructive/50 mx-auto mb-4" />
        <p className="text-sm font-medium text-destructive">
          Access denied — admin or moderator role required
        </p>
      </GlassPanel>
    );
  }

  // ---------------------------------------------------------------------------
  // Fetch (paginated)
  // ---------------------------------------------------------------------------
  const { data: allRecords, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<BanAuditRecord[]> => {
      // Query ban_history with profile data for the target user
      const { data, error } = await (supabase
        .from('ban_history' as any)
        .select('id, user_id, action, reason, duration_hours, expires_at, performed_by, created_at, banned_by, unbanned_at')
        .order('created_at', { ascending: false })
        .limit(1000) as any);

      if (error) {
        toast.error('Failed to load ban audit log');
        throw error;
      }

      // Collect all user_id (profile ids) to join with profiles
      const profileIds = [...new Set(((data ?? []) as any[]).map((r: any) => r.user_id).filter(Boolean))];
      const bannedByIds = [...new Set(((data ?? []) as any[]).map((r: any) => r.banned_by || r.performed_by).filter(Boolean))];
      const allIds = [...new Set([...profileIds, ...bannedByIds])];

      let profileMap = new Map<string, { display_name: string; username: string }>();
      if (allIds.length > 0) {
        const { data: profiles } = await (supabase
          .from('profiles' as any)
          .select('id, display_name, username')
          .in('id', allIds) as any);
        (profiles ?? []).forEach((p: any) => {
          profileMap.set(p.id, { display_name: p.display_name || p.username || p.id, username: p.username || '' });
        });
      }

      return ((data ?? []) as any[]).map((row: any) => {
        const targetProfile = profileMap.get(row.user_id);
        const performerProfile = profileMap.get(row.performed_by || row.banned_by);
        // Derive action: if action column exists use it, otherwise derive from unbanned_at
        const action: 'banned' | 'unbanned' = row.action === 'unbanned' || (row.unbanned_at && !row.action) ? 'unbanned' : 'banned';
        return {
          id: row.id as string,
          user_id: row.user_id as string,
          username: targetProfile?.username || '',
          display_name: targetProfile?.display_name || row.user_id || '',
          action,
          reason: (row.reason as string) || '',
          duration_hours: row.duration_hours as number | null,
          expires_at: row.expires_at as string | null,
          performed_by_display_name: performerProfile?.display_name || '',
          timestamp: (row.created_at as string) || '',
        };
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------
  const filteredRecords = filterAuditLog(allRecords ?? [], searchText, actionFilter);
  const pageCount = Math.ceil(filteredRecords.length / PAGE_SIZE);
  const paginatedRecords = filteredRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filter changes
  const handleSearchChange = (v: string) => {
    setSearchText(v);
    setPage(0);
  };
  const handleActionFilterChange = (v: 'all' | 'banned' | 'unbanned') => {
    setActionFilter(v);
    setPage(0);
  };

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------
  const handleExport = () => {
    const blob = exportAuditLogCsv(filteredRecords);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ban-audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Duration display
  // ---------------------------------------------------------------------------
  const formatDuration = (hours: number | null): string => {
    if (hours === null) return 'permanent';
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0 && remainingHours > 0) return `${days}d ${remainingHours}h`;
    if (days > 0) return `${days}d`;
    return `${hours}h`;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <History className="w-6 h-6 text-primary" />
          Ban Audit Log
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredRecords.length === 0}
            className="gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name or username…"
            className="w-full bg-white/5 border border-white/10 rounded pl-9 pr-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => handleActionFilterChange(e.target.value as any)}
          className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All Actions</option>
          <option value="banned">Banned</option>
          <option value="unbanned">Unbanned</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
        </div>
      ) : isError ? (
        <GlassPanel className="p-10 text-center border-destructive/20 bg-destructive/5">
          <XCircle className="w-8 h-8 text-destructive/50 mx-auto mb-3" />
          <p className="text-sm font-medium text-destructive mb-4">Failed to load audit log</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </GlassPanel>
      ) : paginatedRecords.length === 0 ? (
        <GlassPanel className="p-12 text-center border-dashed border-white/5">
          <History className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No matching records found</p>
        </GlassPanel>
      ) : (
        <>
          <GlassPanel className="border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">User</th>
                    <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Action</th>
                    <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Reason</th>
                    <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Duration</th>
                    <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">By</th>
                    <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record) => (
                    <tr key={record.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-xs font-medium">{record.display_name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">@{record.username}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                          record.action === 'banned'
                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                            : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {record.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate" title={record.reason}>
                        {record.reason}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                        {formatDuration(record.duration_hours)}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                        {record.performed_by_display_name
                          ? record.performed_by_display_name.slice(0, 8) + '…'
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {record.timestamp
                          ? format(new Date(record.timestamp), 'MMM d, yyyy HH:mm')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">
                {filteredRecords.length} records · Page {page + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="gap-1 text-xs"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
