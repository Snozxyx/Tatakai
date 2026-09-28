import { GlassPanel } from "@/components/ui/GlassPanel";
import { Sparkles, ArrowRight, ListOrdered } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TierListCard } from "@/components/tierlist/TierListCard";

export function TierlistSection() {
    const { data: tierlists, isLoading } = useQuery({
        queryKey: ['popular_tierlists'],
        queryFn: async () => {
            const { data } = await supabase
                .from('tier_lists')
                .select('*')
                .eq('is_public', true)
                .order('likes_count', { ascending: false })
                .limit(4);
            return data || [];
        },
    });

    if (!isLoading && (!tierlists || tierlists.length === 0)) return null;

    return (
        <div>
            <div className="flex items-center justify-between mb-6 px-2">
                <h2 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
                    <ListOrdered className="w-5 h-5 text-primary" />
                    Community Tier Lists
                </h2>
                <Link
                    to="/tierlists"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                    View All <ArrowRight className="w-4 h-4" />
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-64 bg-muted/20 rounded-3xl animate-pulse" />
                    ))
                ) : (
                    tierlists?.map((list) => (
                        <TierListCard key={list.id} tierList={list} />
                    ))
                )}
            </div>
        </div>
    );
}
