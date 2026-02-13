import { useSearchParams, useNavigate } from "react-router-dom";
import { useSearch } from "@/hooks/useAnimeData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { cn } from "@/lib/utils";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2, Film, Play, Camera } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useState, useEffect } from "react";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const queryParam = searchParams.get("q") || "";
  const [query, setQuery] = useState(queryParam);
  const [searchInput, setSearchInput] = useState(queryParam);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSearch(query, page);

  // Image search states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageResults, setImageResults] = useState<any[] | null>(null);
  const [isSearchingImage, setIsSearchingImage] = useState(false);

  const handleImageSearch = async () => {
    if (!selectedFile) return;

    setIsSearchingImage(true);
    setImageResults(null);
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("https://api.trace.moe/search", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setImageResults(data.result || []);
    } catch (error) {
      console.error("Image search error:", error);
    } finally {
      setIsSearchingImage(false);
    }
  };

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
      } catch { }
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
    } catch { }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {!isNative && <Background />}
      {!isNative && <Sidebar />}

      <main className={cn(
        "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isNative ? "p-6" : "pl-6 md:pl-32"
      )}>
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
              className="pl-10 pr-20 h-12 bg-muted/50 border-border/50 rounded-xl text-base"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="p-1 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              <label className="p-1 rounded-full hover:bg-muted cursor-pointer text-muted-foreground hover:text-primary transition-colors">
                <Camera className="w-5 h-5" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      // Optional: auto-scroll to image search section or trigger search
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </form>

        <div className="mb-8 md:mb-12">
          <h1 className="font-display text-2xl md:text-4xl font-bold mb-4 md:mb-6 flex items-center gap-3">
            <Search className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            {query ? 'Search Results' : 'Search'}
          </h1>

          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div className="flex-1">
              {query && (
                <p className="text-muted-foreground text-sm md:text-base mb-2">
                  Showing results for "<span className="text-foreground font-medium">{query}</span>"
                  {data && ` • ${data.animes.length} results found`}
                </p>
              )}
            </div>

            {/* Image Search Integration */}
            <div className="w-full md:w-auto p-4 rounded-2xl bg-muted/30 border border-white/5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Search by Image (trace.moe)</p>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer group">
                  <div className="flex items-center gap-2 px-4 h-10 rounded-xl bg-white/5 border border-white/10 group-hover:border-primary/50 transition-colors">
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors overflow-hidden truncate">
                      {selectedFile ? selectedFile.name : 'Choose frame...'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </label>
                <button
                  onClick={handleImageSearch}
                  disabled={!selectedFile || isSearchingImage}
                  className="px-4 h-10 rounded-xl bg-primary text-primary-foreground font-medium hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
                >
                  {isSearchingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Identify'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Image Search Results Overlay/Section */}
        {imageResults && imageResults.length > 0 && (
          <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                Identification Results
              </h2>
              <button
                onClick={() => setImageResults(null)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear Results
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {imageResults.map((result, idx) => (
                <GlassPanel key={idx} className="p-4 flex gap-4 items-start group hover:border-primary/50 transition-colors">
                  <div className="relative w-32 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-muted ring-1 ring-white/10">
                    <img
                      src={result.image}
                      alt="Result frame"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm line-clamp-1 mb-1" title={result.filename}>
                      {result.filename}
                    </h3>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold">
                        <span className="text-primary">{(result.similarity * 100).toFixed(1)}% Match</span>
                        <span className="text-muted-foreground/60">EP {result.episode || '?'}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60">
                        At {new Date(result.at * 1000).toISOString().substr(11, 8)}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/search?q=${encodeURIComponent(result.filename.split('] ')[1]?.split(' - ')[0] || result.filename)}`)}
                      className="mt-3 w-full py-1.5 rounded-lg bg-white/5 hover:bg-primary/20 text-[10px] font-bold text-primary transition-all border border-white/5 hover:border-primary/30"
                    >
                      Search on Tatakai
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>
          </div>
        )}

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
