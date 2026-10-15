import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useAdminLogs, useDeleteAdminLogs } from "@/hooks/admin/useAdminLogs";
import { formatDistanceToNow } from '@/lib/localeFormat';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Trash2, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function ModerationLogs() {
  useUiTranslation();
    const { data: logs, isLoading } = useAdminLogs(50, { action: 'automod_violation' });
    const deleteLogs = useDeleteAdminLogs();
    const confirm = useConfirm();

    if (isLoading) {
        return <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
    }

    if (!logs?.length) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border-2 border-dashed border-white/10 rounded-xl bg-card/20">
                <ShieldAlert className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-lg font-bold">{uiI18n.t('app.no_violations_found_cf2010e4')}</h3>
                <p className="text-sm">{uiI18n.t('app.the_auto_moderation_system_hasn_t_flagged_any_se_b9b48c32')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-500" />
                    {uiI18n.t('app.auto_moderation_log_4b0ad6e5')}
                </h3>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={async () => {
                        if (await confirm({ get title() { return uiI18n.t('app.clear_all_visible_logs_b1288fba'); }, destructive: true })) {
                            // In a real app we might pass IDs or a filter, existing hook supports filter
                            deleteLogs.mutate({ action: 'automod_violation' }, {
                                onSuccess: () => toast.success(uiI18n.t('app.logs_cleared_3ae0ddcd'))
                            });
                        }
                    }}
                >
                    <Trash2 className="w-3 h-3 mr-2" />
                    {uiI18n.t('app.clear_logs_7c3089dc')}
                </Button>
            </div>

            <div className="space-y-2">
                {logs.map((log) => {
                    // details: { violations: [], original_content: string }
                    const violations = log.details?.violations || [];
                    const content = log.details?.original_content || '';

                    return (
                        <div key={log.id} className="p-4 rounded-xl bg-card border border-white/5 flex gap-4">
                            <Avatar className="w-10 h-10 border border-white/10">
                                <AvatarImage src={log.profiles?.avatar_url || ''} />
                                <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-sm truncate">{log.profiles?.display_name || log.profiles?.username || uiI18n.t('app.unknown_user_3511814c')}</p>
                                        <span className="text-xs text-muted-foreground">• {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                    </div>
                                </div>

                                <div className="p-2 rounded bg-black/20 text-xs font-mono mb-2 break-all border border-white/5">
                                    {content}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {violations.map((v: any, i: number) => (
                                        <Badge key={i} variant="destructive" className="text-[10px] uppercase">
                                            {v.type}: {v.match}
                                        </Badge>
                                    ))}
                                    <Badge variant="outline" className="text-[10px]">{log.entity_type}</Badge>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

