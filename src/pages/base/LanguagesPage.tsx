import { useAnimelokLanguages } from "@/hooks/useAnimelok";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getProxiedImageUrl } from "@/lib/api";
import { Languages, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton-custom";

export default function LanguagesPage() {
  const { data, isLoading } = useAnimelokLanguages();
  const navigate = useNavigate();

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
              <h1 className="text-3xl md:text-4xl font-bold">Choose Your Language</h1>
              <p className="text-muted-foreground mt-1">Select a language to browse anime</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : data && data.languages ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
            {data.languages.map((lang, idx) => (
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
                <GlassPanel className="p-6 aspect-[3/4] flex flex-col items-center justify-center text-center group hover:border-primary/50 transition-colors">
                  {lang.poster && (
                    <img
                      src={getProxiedImageUrl(lang.poster)}
                      alt={lang.name}
                      className="w-full h-full object-cover rounded-lg mb-4 opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                  <h2 className="text-xl font-bold mb-2">{lang.name}</h2>
                  <p className="text-sm text-muted-foreground uppercase">{lang.code}</p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>
        ) : (
          <GlassPanel className="p-12 text-center">
            <p className="text-muted-foreground">No languages available</p>
          </GlassPanel>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
