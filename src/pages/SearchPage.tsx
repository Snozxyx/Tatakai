import { useSearchParams, useNavigate } from "react-router-dom";
import { useSearch } from "@/hooks/useAnimeData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryParam = searchParams.get("q") || "";
  const [query, setQuery] = useState(queryParam);
  const [searchInput, setSearchInput] = useState(queryParam);
  const [page, setPage] = useState(1);
  
  const { data, isLoading } = useSearch(query, page);

  useEffect(() => {
    if (queryParam) {
      setQuery(queryParam);
      setSearchInput(queryParam);
    }
  }, [queryParam]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      const term = searchInput.trim();
      try {
        const history = localStorage.getItem('tatakai_search_history');
        let searches: string[] = history ? JSON.parse(history) : [];
        searches = [term, ...searches.filter(s => s !== term)].slice(0, 20); // keep 20 max
        localStorage.setItem('tatakai_search_history', JSON.stringify(searches));
      } catch {}
      navigate(`/search?q=${encodeURIComponent(term)}`);
    }
  };

  // show all recent searches
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    try {
      const searches = localStorage.getItem('tatakai_search_history');
      if (searches) {
        const parsed = JSON.parse(searches) as string[];
        setRecentSearches(parsed.slice(0, 10)); // show last 10
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  const runRecentSearch = (term: string) => {
    setSearchInput(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const deleteSearchItem = (term: string) => {
    try {
      const updated = recentSearches.filter(s => s !== term);
      setRecentSearches(updated);
      localStorage.setItem('tatakai_search_history', JSON.stringify(updated));
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        <Header />

        {/* Mobile Search Bar */}
        <form onSubmit={handleSearch} className="mb-6 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              id="tatakai-global-search"
              type="text"
              placeholder="Search anime..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 pr-10 h-12 bg-muted/50 border-border/50 rounded-xl text-base"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </form>

        <div className="mb-8 md:mb-12">
          <h1 className="font-display text-2xl md:text-4xl font-bold mb-4 md:mb-6 flex items-center gap-3">
            <Search className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            {query ? 'Search Results' : 'Search'}
          </h1>
          
          {query && (
            <p className="text-muted-foreground text-sm md:text-base">
              Showing results for "<span className="text-foreground font-medium">{query}</span>"
              {data && ` • ${data.animes.length} results found`}
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
        ) : query ? (
          <div className="text-center py-20">
            <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No results found</h2>
            <p className="text-muted-foreground">Try searching for something else</p>
          </div>
        ) : (
          <div className="text-center py-20">
            <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Search for anime</h2>
            <p className="text-muted-foreground">Use the search bar above to find your favorite anime</p>

            {recentSearches.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground mb-3">Recent searches</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {recentSearches.map((term, idx) => (
                    <div key={idx} className="group inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-sm">
                      <button
                        onClick={() => runRecentSearch(term)}
                        className="font-medium"
                      >
                        {term}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSearchItem(term); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-destructive hover:text-destructive/80"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
