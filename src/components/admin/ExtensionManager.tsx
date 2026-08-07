import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    Puzzle, Check, X, Shield, Globe, 
    ExternalLink, Loader2, Trash2, Zap, Layout
} from "lucide-react";

export function ExtensionManager() {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
    const [tableMode, setTableMode] = useState<'extension_manifests' | 'extensions'>('extension_manifests');

    const { data: extensions, isLoading } = useQuery({
        queryKey: ['admin_extensions', filter, tableMode],
        queryFn: async () => {
            // Prefer extension_manifests (v6), fallback to extensions table.
            if (tableMode === 'extension_manifests') {
                const { data, error } = await supabase
                    .from('extension_manifests' as any)
                    .select('*')
                    .eq('submission_status', filter)
                    .order('created_at', { ascending: false });

                if (!error) {
                    return (data || []).map((row: any) => ({
                        ...row,
                        id: row.id || row.extension_id,
                        status: row.submission_status,
                        name: row.display_name || row.name,
                        author: row.author_name || row.author,
                        type: row.type,
                        version: row.version,
                        description: row.description,
                    }));
                }

                // Missing table -> fallback.
                if (error.code === '42P01') {
                    setTableMode('extensions');
                } else {
                    throw error;
                }
            }

            const { data, error } = await supabase
                .from('extensions' as any)
                .select('*')
                .eq('status', filter)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.code === '42P01') {
                    // Table doesn't exist, return empty for now
                    return [];
                }
                throw error;
            }
            return data || [];
        }
    });

    const updateStatus = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            if (tableMode === 'extension_manifests') {
                const { error } = await supabase
                    .from('extension_manifests' as any)
                    .update({
                        submission_status: status,
                        is_approved: status === 'approved',
                        updated_at: new Date().toISOString(),
                    } as any)
                    .eq('id', id);
                if (error) throw error;
                return;
            }

            const { error } = await supabase
                .from('extensions' as any)
                .update({ status } as any)
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_extensions'] });
            toast.success("Extension status updated");
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Puzzle className="w-6 h-6 text-primary" />
                        Extension Registry
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Review and manage .kai extensions submitted by the community.</p>
                </div>
                <div className="flex bg-muted/30 rounded-xl p-1 border border-white/5">
                    {(['pending', 'approved', 'rejected'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                                filter === f ? "bg-primary text-primary-foreground" : "hover:bg-white/5 text-muted-foreground"
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : extensions && extensions.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {extensions.map((ext: any) => (
                        <GlassPanel key={ext.id} className="p-4 border-white/5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-2xl bg-white/5 text-primary">
                                        {ext.type === 'torrent' ? <Zap className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-sm">{ext.name}</h4>
                                            <Badge variant="secondary" className="text-[10px] font-bold">v{ext.version}</Badge>
                                            {ext.submission_status === 'pending' && (
                                                <Badge className="bg-amber-500 text-white text-[9px] font-black uppercase">Under Review</Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-3">{ext.description}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary">By {ext.author}</Badge>
                                            <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-400">{ext.type}</Badge>
                                            <a 
                                                href={ext.manifest_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-bold text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                Review Source (.kai)
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl gap-2 font-bold px-4"
                                        onClick={() => updateStatus.mutate({ id: ext.id, status: 'approved' })}
                                        disabled={ext.status === 'approved'}
                                    >
                                        <Check className="w-4 h-4" />
                                        Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="rounded-xl gap-2 font-bold px-4"
                                        onClick={() => updateStatus.mutate({ id: ext.id, status: 'rejected' })}
                                        disabled={ext.status === 'rejected'}
                                    >
                                        <X className="w-4 h-4" />
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        </GlassPanel>
                    ))}
                </div>
            ) : (
                <GlassPanel className="p-20 text-center border-dashed border-white/5">
                    <Layout className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium text-sm">No extensions found in this category.</p>
                </GlassPanel>
            )}
        </div>
    );
}
