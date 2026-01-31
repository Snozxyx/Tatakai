import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAnimelokLanguageAnime } from "@/hooks/useAnimelok";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getProxiedImageUrl } from "@/lib/api";
import { Languages, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { Button } from "@/components/ui/button";
import { AnimeCardWithPreview } from "@/components/anime/AnimeCardWithPreview";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function LanguageAnimePage() {
  const { language } = useParams<{ language: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = parseInt(searchParams.get("page") || "1", 10);

  // 1. Try fetching from custom database first
  const { data: dbData, isLoading: loadingDb } = useQuery({
    queryKey: ['custom_language_anime', language],
    queryFn: async () => {
      const { data: lang } = await supabase
        .from('custom_languages')
        .select('id, name')
        .eq('code', language || '')
        .maybeSingle();

      if (!lang) return null;

      const { data: anime } = await supabase
        .from('custom_language_anime')
        .select('*')
        .eq('language_id', lang.id)
        .order('created_at', { ascending: false });

      return {
        languageName: lang.name,
        anime: anime?.map(a => ({
          id: a.anime_id,
          title: a.title,
          poster: a.poster,
          airing: a.airing_time
        })) || [],
        hasNextPage: false
      };
    }
  });

  // 2. Fetch from Animelok API as fallback
  const { data: apiData, isLoading: loadingApi } = useAnimelokLanguageAnime(language || "", page);

  const isLoading = loadingDb || (loadingApi && !dbData);
  const data = dbData || apiData;

  const handlePageChange = (newPage: number) => {
    setSearchParams({ page: newPage.toString() });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        <Header />

        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
              <Languages className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold capitalize">
                {dbData?.languageName || (language ? language.replace(/-/g, " ") : "Language")} Anime
              </h1>
              <p className="text-muted-foreground mt-1">
                {data ? `Found ${data.anime.length} anime` : "Loading..."}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : data && data.anime ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
              {data.anime.map((anime, idx) => (
                <motion.div
                  key={anime.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <AnimeCardWithPreview
                    disableClick={true}
                    anime={{
                      id: anime.id,
                      name: anime.title,
                      poster: anime.poster || "",
                      episodes: { sub: 0, dub: 0 },
                      type: "TV",
                    }}
                  />
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            {data.hasNextPage || page > 1 ? (
              <GlassPanel className="p-4 flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={!data.hasNextPage}
                  className="flex items-center gap-2"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </GlassPanel>
            ) : null}
          </>
        ) : (
          <GlassPanel className="p-12 text-center">
            <p className="text-muted-foreground">No anime found for this language</p>
          </GlassPanel>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
