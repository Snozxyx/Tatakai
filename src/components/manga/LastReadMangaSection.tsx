import { Link } from "react-router-dom";
import { BookMarked, ChevronRight, Loader2, Play } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useMangaContinueReading } from "@/hooks/useMangaReadlist";
import { useAuth } from "@/contexts/AuthContext";
import { getProxiedImageUrl } from "@/lib/api";

export function LastReadMangaSection() {
  const { user } = useAuth();
  const { data: continueRows = [], isLoading } = useMangaContinueReading(6);

  return (
    <section className="mb-12">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black flex items-center gap-3">
            <BookMarked className="w-6 h-6 text-primary" />
            Continue Reading
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-1.5 font-medium">
            Jump back into your latest manga, manhwa, and comics instantly.
          </p>
        </div>
      </div>

      {isLoading ? (
        <GlassPanel className="p-8 border border-white/10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-sm font-medium uppercase tracking-wider">Syncing reading progress...</span>
          </div>
        </GlassPanel>
      ) : continueRows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {continueRows.map((item) => {
            const chapterLabel =
              item.last_chapter_number != null
                ? `Chapter ${item.last_chapter_number}`
                : item.last_chapter_title || "Last chapter";
            const lastPage = Math.max(0, Number(item.last_page_index || 0));
            const totalPages = Number(item.total_pages || 0);
            const pageLabel = totalPages > 0 ? `${lastPage + 1} / ${totalPages}` : `${lastPage + 1}`;
            const progressPercent = totalPages > 0 ? Math.min(100, Math.round(((lastPage + 1) / totalPages) * 100)) : 0;
            const chapterKey = item.last_chapter_key || "";
            const resumeHref = `/manga/read/${item.manga_id}?chapterKey=${encodeURIComponent(chapterKey)}&page=${lastPage}`;

            return (
              <GlassPanel key={item.id} className="group relative overflow-hidden p-0 border border-white/10 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_20px_-5px_rgba(139,92,246,0.3)]">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="p-4 flex items-start gap-4">
                  <Link to={resumeHref} className="relative w-20 h-28 rounded-xl overflow-hidden shadow-lg flex-shrink-0 transition-transform duration-300 group-hover:scale-[1.02]">
                    <img
                      src={getProxiedImageUrl(item.manga_poster || "/placeholder.svg")}
                      alt={item.manga_title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                      <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center text-white transform scale-75 group-hover:scale-100 transition-transform duration-300">
                        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                  </Link>

                  <div className="min-w-0 flex-1 flex flex-col pt-1">
                    <Link
                      to={`/manga/${item.manga_id}`}
                      className="text-base font-black line-clamp-2 hover:text-primary transition-colors leading-tight"
                    >
                      {item.manga_title}
                    </Link>
                    
                    <div className="mt-2 space-y-1">
                       <p className="text-xs font-bold text-primary uppercase tracking-wider line-clamp-1">
                         {chapterLabel}
                       </p>
                       <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                         <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/20" />
                         Pg {pageLabel}
                       </p>
                    </div>

                    <div className="mt-auto pt-3 pb-1">
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary relative" 
                          style={{ width: `${progressPercent}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      ) : (
        <GlassPanel className="p-8 border border-white/10 flex flex-col justify-center items-center text-center">
          <BookMarked className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-base text-muted-foreground font-medium max-w-sm">
            {user
              ? "No manga reading progress yet. Start reading a chapter and it will appear here."
              : "Sign in to track and resume your last read manga, manhwa, and comics."}
          </p>
          {!user && (
            <Link
              to="/auth"
              className="mt-4 px-6 py-2.5 rounded-xl bg-primary font-black text-primary-foreground hover:brightness-110 transition-all"
            >
              Sign In or Register
            </Link>
          )}
        </GlassPanel>
      )}
    </section>
  );
}
