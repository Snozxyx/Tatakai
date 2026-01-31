import { GlassPanel } from "@/components/ui/GlassPanel";
import { Sparkles, ArrowRight, ListOrdered } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
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
        <div className="mb-24">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                    <ListOrdered className="w-6 h-6 text-primary" />
                    Community Tier Lists
                </h2>
                <Link
                    to="/tierlists"
                    className="text-sm font-bold text-primary flex items-center gap-1 hover:gap-2 transition-all"
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
                    tierlists?.map((list, index) => (
                        <motion.div
                            key={list.id}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            viewport={{ once: true }}
                        >
                            <TierListCard tierList={list} />
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
