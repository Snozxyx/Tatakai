import { useAdminLogs, useDeleteAdminLogs } from "@/hooks/useAdminLogs";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Trash2, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function ModerationLogs() {
    const { data: logs, isLoading } = useAdminLogs(50, { action: 'automod_violation' });
    const deleteLogs = useDeleteAdminLogs();

    if (isLoading) {
        return <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
    }

    if (!logs?.length) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border-2 border-dashed border-white/10 rounded-xl bg-card/20">
                <ShieldAlert className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-lg font-bold">No Violations Found</h3>
                <p className="text-sm">The auto-moderation system hasn't flagged any severe content recently.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-500" />
                    Auto-Moderation Log
                </h3>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                        if (confirm('Clear all visible logs?')) {
                            // In a real app we might pass IDs or a filter, existing hook supports filter
                            deleteLogs.mutate({ action: 'automod_violation' }, {
                                onSuccess: () => toast.success('Logs cleared')
                            });
                        }
                    }}
                >
                    <Trash2 className="w-3 h-3 mr-2" />
                    Clear Logs
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
                                        <p className="font-bold text-sm truncate">{log.profiles?.display_name || log.profiles?.username || 'Unknown User'}</p>
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
