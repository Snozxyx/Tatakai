import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAdminLogs, type AdminLog, useDeleteAdminLogs } from '@/hooks/admin/useAdminLogs';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { Search, FileText, Trash2, Eye, CheckCircle, XCircle, Shield, User, Copy } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function AdminLogs() {
  useUiTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyClientErrors, setOnlyClientErrors] = useState(false);
  const { data: logs, isLoading } = useAdminLogs(200);
  const deleteMutation = useDeleteAdminLogs();
  const { toast } = useToast();
  const confirm = useConfirm();

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
      toast({ get title() { return uiI18n.t('app.no_error_id_b25974c0'); }, get description() { return uiI18n.t('app.this_log_does_not_contain_an_error_id_f2ee1bc9'); } });
      return;
    }
    try {
      await navigator.clipboard.writeText(errorId);
      toast({ get title() { return uiI18n.t('app.copied_8e3df45a'); }, get description() { return uiI18n.t('app.copied_error_id_i18n_value_0_70e14be9', { value0: errorId }); } });
    } catch (e) {
      toast({ get title() { return uiI18n.t('app.copy_failed_bd5acbff'); }, description: String(e) });
    }
  };

  const handleDeleteFiltered = async () => {
    if (!filteredLogs || filteredLogs.length === 0) {
      toast({ get title() { return uiI18n.t('app.nothing_to_delete_7acb2e0c'); }, get description() { return uiI18n.t('app.no_logs_match_the_current_filters_f54d0a41'); } });
      return;
    }

    const confirmMsg = `Delete ${filteredLogs.length} logs? This action cannot be undone.`;
    if (!(await confirm({ title: confirmMsg, destructive: true }))) return;

    const ids = filteredLogs.map((l) => l.id);
    try {
      await deleteMutation.mutateAsync({ ids });
      toast({ get title() { return uiI18n.t('app.deleted_441bda6c'); }, get description() { return uiI18n.t('app.deleted_i18n_value_0_logs_ae10b342', { value0: ids.length }); } });
    } catch (e: any) {
      toast({ get title() { return uiI18n.t('app.delete_failed_64513b47'); }, description: e?.message || String(e) });
    }
  };

  const handleCleanupOld = async () => {
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const confirmMsg = 'Delete logs older than 2 days? This action cannot be undone.';
    if (!(await confirm({ title: confirmMsg, destructive: true }))) return;

    try {
      await deleteMutation.mutateAsync({ created_before: cutoff });
      toast({ get title() { return uiI18n.t('app.cleanup_complete_47841e8f'); }, get description() { return uiI18n.t('app.old_logs_deleted_2a5ef42d'); } });
    } catch (e: any) {
      toast({ get title() { return uiI18n.t('app.cleanup_failed_2700ef39'); }, description: e?.message || String(e) });
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
          <h2 className="text-2xl font-bold text-white">{uiI18n.t('app.admin_activity_logs_d7bc35e0')}</h2>
          <p className="text-sm text-gray-400 mt-1">
            {uiI18n.t('app.track_all_administrative_actions_and_system_even_33a9cc35')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {filteredLogs?.length || 0} {uiI18n.t('app.logs_126dd3b7')}
          </Badge>

          <Button
            variant={onlyClientErrors ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => setOnlyClientErrors((v) => !v)}
          >
            {uiI18n.t('app.client_errors_dad4a97b')}
          </Button>

          <Button
            onClick={handleDeleteFiltered}
            variant="destructive"
            size="sm"
            className="gap-2"
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4" />
            {uiI18n.t('app.delete_f6fdbe48')}
          </Button>

          <Button
            onClick={handleCleanupOld}
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={deleteMutation.isPending}
          >
            {uiI18n.t('app.clean_2_days_fe7aa161')}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          placeholder={uiI18n.t('app.search_by_action_type_or_user_06b8142f')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400"
        />
      </div>

      {isLoading ? (
        <GlassPanel className="p-8 text-center">
          <p className="text-gray-400">{uiI18n.t('app.loading_logs_9375a3fc')}</p>
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
                          {log.profiles?.display_name || log.profiles?.username || uiI18n.t('app.unknown_user_3511814c')}
                        </p>
                        <p className="text-sm text-gray-400">
                          @{log.profiles?.username || uiI18n.t('app.unknown_50d8b4a9')}
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
                      <span className="text-gray-500">{uiI18n.t('app.entity_type_611f2e87')}</span>{' '}
                      <span className="font-medium">{log.entity_type}</span>
                    </p>
                    {log.entity_id && (
                      <p className="text-xs text-gray-500 font-mono">
                        {uiI18n.t('app.id_d789a1e9')} {log.entity_id.substring(0, 16)}...
                      </p>
                    )}
                    {log.details && typeof log.details === 'object' && (
                      <div className="mt-2 p-2 bg-black/30 rounded-md">
                        {log.details.error_id && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-400 font-mono">
                              <span className="text-gray-500">{uiI18n.t('app.error_id_013173f5')}</span> {log.details.error_id}
                            </p>
                            <button
                              onClick={() => handleCopyErrorId(log.details.error_id)}
                              className="text-gray-400 hover:text-gray-200"
                              title={uiI18n.t('app.copy_error_id_e3feff85')}
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
                        <span className="text-gray-600">{uiI18n.t('app.ip_97322c15')}</span> {log.ip_address}
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
            {searchTerm ? uiI18n.t('app.no_logs_match_your_search_criteria_91192ccc') : uiI18n.t('app.no_admin_logs_found_bd52a0a1')}
          </p>
        </GlassPanel>
      )}
    </div>
  );
}


