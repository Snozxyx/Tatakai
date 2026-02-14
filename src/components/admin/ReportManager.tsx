import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
    ShieldAlert, Clock, CheckCircle2, XCircle,
    User, MessageSquare, Server, Film, AlertTriangle,
    Loader2, MoreHorizontal, ChevronDown, ChevronUp, ExternalLink
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function ReportManager() {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<'pending' | 'action_taken' | 'dismissed' | 'all'>('pending');
    const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
    const [adminNote, setAdminNote] = useState("");

    const { data: reports, isLoading } = useQuery({
        queryKey: ['admin_reports', filter],
        queryFn: async () => {
            let query = supabase
                .from('reports')
                .select('*')
                .order('created_at', { ascending: false });

            if (filter !== 'all') {
                query = query.eq('status', filter);
            }

            const { data: reportsData, error } = await query;
            if (error) throw error;
            if (!reportsData || reportsData.length === 0) return [];

            // Fetch profiles for reporters and moderators
            const userIds = [...new Set([
                ...reportsData.map(r => r.reporter_id),
                ...reportsData.map(r => r.moderator_id).filter(Boolean)
            ])];

            const { data: profiles } = await supabase
                .from('profiles')
                .select('user_id, display_name, avatar_url, username')
                .in('user_id', userIds);

            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

            return reportsData.map(report => ({
                ...report,
                reporter: profileMap.get(report.reporter_id),
                moderator: report.moderator_id ? profileMap.get(report.moderator_id) : null
            }));
        }
    });

    const updateReportStatus = useMutation({
        mutationFn: async ({ id, status, note }: { id: string, status: string, note?: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
                .from('reports')
                .update({
                    status,
                    admin_notes: note,
                    moderator_id: user?.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
            toast.success("Report updated successfully");
            setExpandedReportId(null);
            setAdminNote("");
        },
        onError: (error: any) => {
            toast.error("Failed to update report: " + error.message);
        }
    });

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
            case 'action_taken': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'dismissed': return <XCircle className="w-4 h-4 text-muted-foreground" />;
            default: return null;
        }
    };

    const getTargetIcon = (type: string) => {
        switch (type) {
            case 'user': return <User className="w-4 h-4" />;
            case 'comment': return <MessageSquare className="w-4 h-4" />;
            case 'server': return <Server className="w-4 h-4" />;
            case 'anime': return <Film className="w-4 h-4" />;
            default: return <ShieldAlert className="w-4 h-4" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <ShieldAlert className="w-6 h-6 text-primary" />
                    User Reports
                </h2>
                <div className="flex bg-muted/30 rounded-xl p-1 border border-white/5">
                    {(['pending', 'action_taken', 'dismissed', 'all'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${filter === f ? "bg-primary text-primary-foreground shadow-lg" : "hover:bg-white/5"
                                }`}
                        >
                            {f.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
                </div>
            ) : reports && reports.length > 0 ? (
                <div className="space-y-4">
                    {reports.map((report: any) => (
                        <GlassPanel
                            key={report.id}
                            className={`p-4 transition-all duration-300 ${expandedReportId === report.id ? "bg-white/5 border-white/20" : "hover:bg-white/5 border-white/5"
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-2xl ${report.status === 'pending' ? 'bg-yellow-500/10' : 'bg-white/5'
                                        }`}>
                                        {getTargetIcon(report.target_type)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-sm">Reported {report.target_type}</span>
                                            <Badge variant="outline" className="text-[10px] uppercase tracking-tighter">
                                                {report.target_id.substring(0, 8)}...
                                            </Badge>
                                            {getStatusIcon(report.status)}
                                            {report.target_id?.startsWith('http') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-[10px] gap-1 hover:text-primary"
                                                    onClick={() => window.open(report.target_id, '_blank')}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    Visit Link
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium mb-1">{report.reason}</p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                            <span>Reported by {report.reporter?.display_name || "Unknown"}</span>
                                            <span>•</span>
                                            <span>{formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}</span>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (expandedReportId === report.id) {
                                            setExpandedReportId(null);
                                        } else {
                                            setExpandedReportId(report.id);
                                            setAdminNote(report.admin_notes || "");
                                        }
                                    }}
                                    className="rounded-xl h-10 w-10 p-0"
                                >
                                    {expandedReportId === report.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </Button>
                            </div>

                            {expandedReportId === report.id && (
                                <div className="mt-6 pt-6 border-t border-white/10 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Report Details</h4>
                                            <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 text-sm">
                                                {report.details || "No additional context provided."}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Moderation Action</h4>
                                            {report.moderator && (
                                                <div className="flex items-center gap-2 text-xs mb-3 text-emerald-400 font-bold">
                                                    <ShieldAlert className="w-3 h-3" />
                                                    Last handled by {report.moderator.display_name}
                                                </div>
                                            )}
                                            <Textarea
                                                placeholder="Internal notes (optional)..."
                                                value={adminNote}
                                                onChange={(e) => setAdminNote(e.target.value)}
                                                className="bg-white/5 border-white/10 text-sm mb-4"
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => updateReportStatus.mutate({
                                                        id: report.id,
                                                        status: 'action_taken',
                                                        note: adminNote
                                                    })}
                                                    disabled={updateReportStatus.isPending || report.status === 'action_taken'}
                                                    className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1 font-bold rounded-xl"
                                                >
                                                    Resolve (Action Taken)
                                                </Button>
                                                <Button
                                                    onClick={() => updateReportStatus.mutate({
                                                        id: report.id,
                                                        status: 'dismissed',
                                                        note: adminNote
                                                    })}
                                                    disabled={updateReportStatus.isPending || report.status === 'dismissed'}
                                                    variant="ghost"
                                                    className="flex-1 font-bold rounded-xl border border-white/10"
                                                >
                                                    Dismiss (Log)
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </GlassPanel>
                    ))}
                </div>
            ) : (
                <GlassPanel className="p-20 text-center border-dashed border-white/5">
                    <AlertTriangle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">No reports found for this category.</p>
                </GlassPanel>
            )}
        </div>
    );
}
