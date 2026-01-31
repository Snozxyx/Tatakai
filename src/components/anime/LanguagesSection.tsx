import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getProxiedImageUrl } from "@/lib/api";
import { Languages, ArrowRight, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { Badge } from "@/components/ui/badge";

export function LanguagesSection() {
  const navigate = useNavigate();

  const { data: languages, isLoading: loadingLangs } = useQuery({
    queryKey: ['custom_languages_home'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_languages')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: submissions, isLoading: loadingSubs } = useQuery({
    queryKey: ['approved_submissions_home'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_items')
        .select('*')
        .eq('status', 'approved')
        .limit(4);
      if (error) throw error;
      return data;
    }
  });

  const isLoading = loadingLangs || loadingSubs;

  if (isLoading) {
    return (
      <div className="mb-16">
        <div className="flex items-center gap-3 mb-8 px-2">
          <Skeleton className="w-8 h-8 rounded-xl" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!languages || languages.length === 0) {
    return null;
  }

  return (
    <div className="mb-16">
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
            <Languages className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">Languages</h2>
        </div>
        <button
          onClick={() => navigate("/languages")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          View All <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {languages.slice(0, 8 - (submissions?.length || 0)).map((lang, idx) => (
          <motion.div
            key={lang.code}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="cursor-pointer"
            onClick={() => navigate(`/languages/${lang.code}`)}
          >
            <GlassPanel className="p-4 aspect-[3/4] flex flex-col items-center justify-center text-center group hover:border-primary/50 transition-colors">
              {lang.poster && (
                <img
                  src={getProxiedImageUrl(lang.poster)}
                  alt={lang.name}
                  className="w-full h-full object-cover rounded-lg mb-3 opacity-80 group-hover:opacity-100 transition-opacity"
                />
              )}
              <h3 className="text-lg font-semibold mb-1">{lang.name}</h3>
              <p className="text-xs text-muted-foreground">{lang.code.toUpperCase()}</p>
            </GlassPanel>
          </motion.div>
        ))}

        {submissions?.map((sub, idx) => (
          <motion.div
            key={sub.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: (languages.length + idx) * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="cursor-pointer"
            onClick={() => sub.type === 'subtitle' ? navigate('/search') : navigate(`/watch/${sub.anime_id}?ep=${sub.episode_number}`)}
          >
            <GlassPanel className="p-4 aspect-[3/4] flex flex-col items-center justify-center text-center group hover:border-primary/50 transition-colors border-primary/30 bg-primary/5">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-sm font-bold line-clamp-2">{sub.anime_name}</h3>
              <p className="text-[10px] text-muted-foreground uppercase mt-2">{sub.type}</p>
              <Badge variant="secondary" className="mt-2 text-[10px]">EP {sub.episode_number}</Badge>
            </GlassPanel>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
