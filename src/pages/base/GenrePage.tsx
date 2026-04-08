import { useParams } from "react-router-dom";
import { useGenreAnimes } from "@/hooks/useAnimeData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { Tag } from "lucide-react";
import { useState } from "react";

export default function GenrePage() {
  const { genre } = useParams<{ genre: string }>();
  const [page, setPage] = useState(1);
  
  const { data, isLoading } = useGenreAnimes(genre, page);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        <Header />

        <div className="mb-12">
          <h1 className="font-display text-4xl font-bold mb-4 flex items-center gap-3 capitalize">
            <Tag className="w-8 h-8 text-primary" />
            {genre?.replace("-", " ")} Anime
          </h1>
          
          {data && (
            <p className="text-muted-foreground">
              Page {data.currentPage} of {data.totalPages}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : data?.animes.length ? (
          <>
            <AnimeGrid animes={data.animes} />
            
            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-4 py-2">
                  Page {data.currentPage} of {data.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data.hasNextPage}
                  className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <Tag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No anime found</h2>
            <p className="text-muted-foreground">This genre doesn't have any anime yet</p>
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
