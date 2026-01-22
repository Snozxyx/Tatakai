import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAdminLogs, type AdminLog, useDeleteAdminLogs } from '@/hooks/useAdminLogs';
import { formatDistanceToNow } from 'date-fns';
import { Search, FileText, Trash2, Eye, CheckCircle, XCircle, Shield, User, Copy } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function AdminLogs() {
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyClientErrors, setOnlyClientErrors] = useState(false);
  const { data: logs, isLoading } = useAdminLogs(200);
  const deleteMutation = useDeleteAdminLogs();
  const { toast } = useToast();

  const filteredLogs = logs?.filter((log) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      log.action.toLowerCase().includes(searchLower) ||
      log.entity_type.toLowerCase().includes(searchLower) ||
      log.profiles?.username?.toLowerCase().includes(searchLower) ||
      log.profiles?.display_name?.toLowerCase().includes(searchLower) ||
      (log.details && JSON.stringify(log.details).toLowerCase().includes(searchLower))
    );

    const matchesClientError = onlyClientErrors ? log.action === 'client_error' : true;

    return matchesSearch && matchesClientError;
  });

  const handleCopyErrorId = async (errorId?: string) => {
    if (!errorId) {
      toast({ title: 'No Error ID', description: 'This log does not contain an Error ID.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(errorId);
      toast({ title: 'Copied', description: `Copied Error ID ${errorId}` });
    } catch (e) {
      toast({ title: 'Copy failed', description: String(e) });
    }
  };

  const handleDeleteFiltered = async () => {
    if (!filteredLogs || filteredLogs.length === 0) {
      toast({ title: 'Nothing to delete', description: 'No logs match the current filters.' });
      return;
    }

    const confirmMsg = `Delete ${filteredLogs.length} logs? This action cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    const ids = filteredLogs.map((l) => l.id);
    try {
      await deleteMutation.mutateAsync({ ids });
      toast({ title: 'Deleted', description: `Deleted ${ids.length} logs.` });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || String(e) });
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('delete') || action.includes('remove')) return <Trash2 className="w-4 h-4 text-red-400" />;
    if (action.includes('approve')) return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (action.includes('reject')) return <XCircle className="w-4 h-4 text-orange-400" />;
    if (action.includes('view')) return <Eye className="w-4 h-4 text-blue-400" />;
    if (action.includes('ban')) return <Shield className="w-4 h-4 text-red-500" />;
    return <FileText className="w-4 h-4 text-gray-400" />;
  };

  const getActionColor = (action: string) => {
    if (action.includes('delete') || action.includes('remove') || action.includes('ban')) return 'destructive';
    if (action.includes('approve')) return 'default';
    if (action.includes('reject')) return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Admin Activity Logs</h2>
          <p className="text-sm text-gray-400 mt-1">
            Track all administrative actions and system events
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {filteredLogs?.length || 0} Logs
          </Badge>

          <Button
            variant={onlyClientErrors ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => setOnlyClientErrors((v) => !v)}
          >
            Client Errors
          </Button>

          <Button
            onClick={handleDeleteFiltered}
            variant="destructive"
            size="sm"
            className="gap-2"
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          placeholder="Search by action, type, or user..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400"
        />
      </div>

      {isLoading ? (
        <GlassPanel className="p-8 text-center">
          <p className="text-gray-400">Loading logs...</p>
        </GlassPanel>
      ) : filteredLogs && filteredLogs.length > 0 ? (
        <GlassPanel className="divide-y divide-white/10">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="p-4 hover:bg-white/5 transition-colors duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  {getActionIcon(log.action)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        {log.profiles?.avatar_url ? (
                          <AvatarImage
                            src={getProxiedImageUrl(log.profiles.avatar_url)}
                            alt={log.profiles.display_name || log.profiles.username}
                          />
                        ) : null}
                        <AvatarFallback>
                          <User className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-white">
                          {log.profiles?.display_name || log.profiles?.username || 'Unknown User'}
                        </p>
                        <p className="text-sm text-gray-400">
                          @{log.profiles?.username || 'unknown'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge variant={getActionColor(log.action)} className="mb-1">
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                      <p className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-300">
                      <span className="text-gray-500">Entity Type:</span>{' '}
                      <span className="font-medium">{log.entity_type}</span>
                    </p>
                    {log.entity_id && (
                      <p className="text-xs text-gray-500 font-mono">
                        ID: {log.entity_id.substring(0, 16)}...
                      </p>
                    )}
                    {log.details && typeof log.details === 'object' && (
                      <div className="mt-2 p-2 bg-black/30 rounded-md">
                        {log.details.error_id && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-400 font-mono">
                              <span className="text-gray-500">Error ID:</span> {log.details.error_id}
                            </p>
                            <button
                              onClick={() => handleCopyErrorId(log.details.error_id)}
                              className="text-gray-400 hover:text-gray-200"
                              title="Copy Error ID"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-gray-400 font-mono mt-2">
                          {JSON.stringify(log.details, null, 2)}
                        </p>
                      </div>
                    )}
                    {log.ip_address && (
                      <p className="text-xs text-gray-500">
                        <span className="text-gray-600">IP:</span> {log.ip_address}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </GlassPanel>
      ) : (
        <GlassPanel className="p-8 text-center">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {searchTerm ? 'No logs match your search criteria' : 'No admin logs found'}
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
