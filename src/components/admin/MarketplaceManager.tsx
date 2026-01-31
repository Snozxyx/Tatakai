import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    ShoppingBag, Check, X, Subtitles, Server,
    ExternalLink, Loader2, AlertCircle, TrendingUp, Globe, Plus, Trash2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function MarketplaceManager() {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

    const { data: items, isLoading } = useQuery({
        queryKey: ['admin_marketplace_items', filter],
        queryFn: async () => {
            const { data: itemsData, error } = await supabase
                .from('marketplace_items')
                .select('*')
                .eq('status', filter)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!itemsData || itemsData.length === 0) return [];

            // Fetch profiles
            const userIds = [...new Set(itemsData.map(i => i.user_id))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('user_id, display_name, avatar_url, username')
                .in('user_id', userIds);

            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

            return itemsData.map(item => ({
                ...item,
                user: profileMap.get(item.user_id)
            }));
        }
    });

    const deleteItem = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('marketplace_items')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_marketplace_items'] });
            toast.success("Item deleted permanently");
        },
        onError: (error: any) => {
            toast.error("Failed to delete: " + error.message);
        }
    });

    const updateItemStatus = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
                .from('marketplace_items')
                .update({
                    status,
                    moderator_id: user?.id
                })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_marketplace_items'] });
            toast.success("Item status updated");
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Globe className="w-6 h-6 text-primary" />
                        Language Submissions
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1 text-balance">Review user-submitted subtitles and anime sources</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => window.open('/admin/languages', '_self')}
                        variant="outline"
                        size="sm"
                        className="gap-2 rounded-xl border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
                    >
                        <Plus className="w-4 h-4" />
                        Direct Source
                    </Button>
                    <div className="flex bg-muted/30 rounded-xl p-1 border border-white/5">
                        {(['pending', 'approved', 'rejected'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-white/5 text-muted-foreground"
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : items && items.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {items.map((item: any) => (
                        <GlassPanel key={item.id} className="p-4 border-white/5 hover:bg-white/5 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-2xl bg-white/5 text-primary">
                                        {item.type === 'subtitle' ? <Subtitles className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-sm capitalize">{item.type}: {item.anime_name}</h4>
                                            <Badge variant="secondary" className="text-[10px] font-bold">EP {item.episode_number}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-3 italic">Uploaded by {item.user?.display_name || "Unknown User"}</p>

                                        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/80">
                                            <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">LANG: {item.data?.lang || 'N/A'}</span>
                                            <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">LABEL: {item.data?.label || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-10 w-10 p-0 rounded-xl bg-white/5 hover:text-primary"
                                        onClick={() => window.open(item.data?.url, '_blank')}
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-10 w-10 p-0 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive hover:text-white transition-all"
                                        onClick={() => {
                                            if (confirm("Are you sure you want to delete this submission permanently?")) {
                                                deleteItem.mutate(item.id);
                                            }
                                        }}
                                        title="Delete Permanently"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl gap-2 font-bold px-4"
                                        onClick={() => updateItemStatus.mutate({ id: item.id, status: 'approved' })}
                                        disabled={item.status === 'approved'}
                                    >
                                        <Check className="w-4 h-4" />
                                        Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="rounded-xl gap-2 font-bold px-4"
                                        onClick={() => updateItemStatus.mutate({ id: item.id, status: 'rejected' })}
                                        disabled={item.status === 'rejected'}
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
                    <ShoppingBag className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium text-sm">No items waiting for review.</p>
                </GlassPanel>
            )}
        </div>
    );
}
