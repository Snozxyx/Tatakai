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
import { Search, X, Loader2, Film, Play, Camera, SlidersHorizontal, Sparkles } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchCharacters } from "@/services/character.service";
import { getProxiedImageUrl } from "@/lib/api";
import { searchAniListAnime } from "@/lib/externalIntegrations";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const queryParam = searchParams.get("q") || "";
  const [query, setQuery] = useState(queryParam);
  const [searchInput, setSearchInput] = useState(queryParam);
  const [page, setPage] = useState(1);
  const [resultType, setResultType] = useState<'all' | 'anime' | 'character'>('all');
  const [animeTypeFilter, setAnimeTypeFilter] = useState<string>('all');
  const [minRating, setMinRating] = useState<number>(0);
  const [onlyDub, setOnlyDub] = useState(false);
  const [imageConfidenceThreshold, setImageConfidenceThreshold] = useState<number>(0.85);
  const [useAniListAssist, setUseAniListAssist] = useState(false);
  const [aniListFormat, setAniListFormat] = useState<string>('all');
  const [aniListStatus, setAniListStatus] = useState<string>('all');
  const [aniListSeason, setAniListSeason] = useState<string>('all');
  const [aniListSeasonYear, setAniListSeasonYear] = useState<string>('');
  const [aniListCountry, setAniListCountry] = useState<string>('all');
  const [aniListSort, setAniListSort] = useState<string>('POPULARITY_DESC');
  const [aniListGenresText, setAniListGenresText] = useState<string>('');
  const [showAdvancedAssist, setShowAdvancedAssist] = useState(false);

  const { data, isLoading } = useSearch(query, page);
  const { data: characterSearch, isLoading: loadingCharacters } = useQuery({
    queryKey: ['character-search', query, page],
    queryFn: () => searchCharacters(query, page, 12),
    enabled: query.length > 1,
    staleTime: 2 * 60 * 1000,
  });

  const aniListGenres = useMemo(
    () => aniListGenresText.split(',').map((genre) => genre.trim()).filter(Boolean),
    [aniListGenresText]
  );

  const { data: aniListAssistResults = [], isLoading: loadingAniListAssist } = useQuery({
    queryKey: [
      'anilist-assist-search',
      query,
      useAniListAssist,
      aniListFormat,
      aniListStatus,
      aniListSeason,
      aniListSeasonYear,
      aniListCountry,
      aniListSort,
      aniListGenres.join('|'),
    ],
    queryFn: () => searchAniListAnime(query, {
      perPage: 12,
      format: aniListFormat === 'all' ? undefined : aniListFormat as any,
      status: aniListStatus === 'all' ? undefined : aniListStatus as any,
      season: aniListSeason === 'all' ? undefined : aniListSeason as any,
      seasonYear: aniListSeasonYear ? Number(aniListSeasonYear) : undefined,
      countryOfOrigin: aniListCountry === 'all' ? undefined : aniListCountry as any,
      genres: aniListGenres.length > 0 ? aniListGenres : undefined,
      sort: aniListSort as any,
    }),
    enabled: useAniListAssist && query.length > 1,
    staleTime: 2 * 60 * 1000,
  });

  // Image search states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageResults, setImageResults] = useState<any[] | null>(null);
  const [isSearchingImage, setIsSearchingImage] = useState(false);

  const filteredAnimeResults = (data?.animes || []).filter((anime) => {
    const animeType = (anime.type || '').toLowerCase();
    const animeRating = Number.parseFloat(anime.rating || '0');

    if (animeTypeFilter !== 'all' && animeType !== animeTypeFilter) return false;
    if (animeRating > 0 && animeRating < minRating) return false;
    if (onlyDub && !(Number(anime.episodes?.dub || 0) > 0)) return false;
    return true;
  });

  const filteredImageResults = (imageResults || []).filter((result) => {
    return Number(result?.similarity || 0) >= imageConfidenceThreshold;
  });

  const characterResults = characterSearch?.data || [];

  const handleMapAniListToTatakai = (result: any) => {
    if (result?.idMal) {
      navigate(`/anime/mal-${result.idMal}`);
      return;
    }
    if (result?.id) {
      navigate(`/anime/anilist-${result.id}`);
      return;
    }
    const fallbackTitle = result?.title?.english || result?.title?.romaji || result?.title?.native;
    if (fallbackTitle) {
      navigate(`/search?q=${encodeURIComponent(fallbackTitle)}`);
    }
  };

  const handleUseAniListTitle = (result: any) => {
    const title = result?.title?.english || result?.title?.romaji || result?.title?.native;
    if (!title) return;
    setSearchInput(title);
    navigate(`/search?q=${encodeURIComponent(title)}`);
  };

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

  useEffect(() => {
    setPage(1);
  }, [query]);

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

  const showAnimeResults = resultType !== 'character';
  const showCharacterResults = resultType !== 'anime';
  const hasAnimeResults = filteredAnimeResults.length > 0;
  const hasCharacterResults = characterResults.length > 0;
  const hasAnyResult = (showAnimeResults && hasAnimeResults) || (showCharacterResults && hasCharacterResults);
  const hybridLoading = isLoading || (showCharacterResults && loadingCharacters);

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
                  {` • ${filteredAnimeResults.length} anime`}
                  {query.length > 1 && ` • ${characterResults.length} characters`}
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

          <GlassPanel className="mt-5 p-4 md:p-5 space-y-4 border border-white/10">
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'all', label: 'All' },
                { id: 'anime', label: 'Anime' },
                { id: 'character', label: 'Characters' }
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setResultType(item.id)}
                  className={`h-9 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${resultType === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background/70 border border-white/10 text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {item.label}
                </button>
              ))}

              <label className="h-9 px-3 rounded-lg text-xs font-bold uppercase tracking-wide bg-background/70 border border-white/10 text-muted-foreground hover:text-foreground flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyDub}
                  onChange={(e) => setOnlyDub(e.target.checked)}
                  className="accent-primary"
                />
                Dub only
              </label>

              <button
                type="button"
                onClick={() => setShowAdvancedAssist((v) => !v)}
                className="h-9 px-3 rounded-lg text-xs font-bold uppercase tracking-wide bg-background/70 border border-white/10 text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showAdvancedAssist ? 'Hide Advanced' : 'Show Advanced'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Anime Type</p>
                <select
                  value={animeTypeFilter}
                  onChange={(e) => setAnimeTypeFilter(e.target.value)}
                  className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm"
                >
                  <option value="all">All types</option>
                  <option value="tv">TV</option>
                  <option value="movie">Movie</option>
                  <option value="ova">OVA</option>
                  <option value="ona">ONA</option>
                  <option value="special">Special</option>
                </select>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Min Rating: {minRating.toFixed(1)}</p>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Image Confidence: {Math.round(imageConfidenceThreshold * 100)}%+</p>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={imageConfidenceThreshold}
                  onChange={(e) => setImageConfidenceThreshold(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl border border-primary/20 bg-primary/5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">Smart ID Assist</p>
                    <p className="text-xs text-muted-foreground">Use advanced metadata filters and map directly by MAL/AniList IDs.</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm bg-background/70 border border-white/10 rounded-lg px-3 h-9">
                  <input
                    type="checkbox"
                    checked={useAniListAssist}
                    onChange={(e) => setUseAniListAssist(e.target.checked)}
                    className="accent-primary"
                  />
                  Enable Smart Assist
                </label>
              </div>

              {useAniListAssist && showAdvancedAssist && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Format</p>
                    <select value={aniListFormat} onChange={(e) => setAniListFormat(e.target.value)} className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm">
                      <option value="all">All formats</option>
                      <option value="TV">TV</option>
                      <option value="MOVIE">Movie</option>
                      <option value="OVA">OVA</option>
                      <option value="ONA">ONA</option>
                      <option value="SPECIAL">Special</option>
                      <option value="TV_SHORT">TV Short</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Release Status</p>
                    <select value={aniListStatus} onChange={(e) => setAniListStatus(e.target.value)} className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm">
                      <option value="all">Any status</option>
                      <option value="RELEASING">Releasing</option>
                      <option value="FINISHED">Finished</option>
                      <option value="NOT_YET_RELEASED">Not Yet Released</option>
                      <option value="HIATUS">Hiatus</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Season</p>
                    <select value={aniListSeason} onChange={(e) => setAniListSeason(e.target.value)} className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm">
                      <option value="all">Any season</option>
                      <option value="WINTER">Winter</option>
                      <option value="SPRING">Spring</option>
                      <option value="SUMMER">Summer</option>
                      <option value="FALL">Fall</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Season Year</p>
                    <input
                      type="number"
                      min={1950}
                      max={2100}
                      placeholder="e.g. 2026"
                      value={aniListSeasonYear}
                      onChange={(e) => setAniListSeasonYear(e.target.value)}
                      className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Country</p>
                    <select value={aniListCountry} onChange={(e) => setAniListCountry(e.target.value)} className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm">
                      <option value="all">Any country</option>
                      <option value="JP">Japan</option>
                      <option value="KR">Korea</option>
                      <option value="CN">China</option>
                      <option value="TW">Taiwan</option>
                      <option value="US">United States</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Sort</p>
                    <select value={aniListSort} onChange={(e) => setAniListSort(e.target.value)} className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm">
                      <option value="POPULARITY_DESC">Popularity</option>
                      <option value="SCORE_DESC">Score</option>
                      <option value="TRENDING_DESC">Trending</option>
                      <option value="START_DATE_DESC">Latest Start Date</option>
                      <option value="FAVOURITES_DESC">Favorites</option>
                    </select>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Genres (comma separated)</p>
                    <input
                      type="text"
                      value={aniListGenresText}
                      onChange={(e) => setAniListGenresText(e.target.value)}
                      placeholder="Action, Fantasy, Drama"
                      className="w-full h-9 rounded-lg bg-background/80 border border-white/10 px-3 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>
        </div>

        {/* Image Search Results Overlay/Section */}
        {imageResults && (
          <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                Identification Results ({filteredImageResults.length})
              </h2>
              <button
                onClick={() => setImageResults(null)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear Results
              </button>
            </div>
            {filteredImageResults.length === 0 ? (
              <GlassPanel className="p-6 text-sm text-muted-foreground">
                No frame matches above {Math.round(imageConfidenceThreshold * 100)}% confidence. Lower the confidence filter to see more candidates.
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredImageResults.map((result, idx) => (
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
            )}
          </div>
        )}

        {query && useAniListAssist && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                AniList Assist Matches ({aniListAssistResults.length})
              </h2>
              {loadingAniListAssist && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {loadingAniListAssist ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <CardSkeleton key={`anilist-assist-skeleton-${idx}`} />
                ))}
              </div>
            ) : aniListAssistResults.length === 0 ? (
              <GlassPanel className="p-4 text-sm text-muted-foreground">
                AniList found no matches with the current filters. Try loosening season/status/genre filters.
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aniListAssistResults.map((result: any) => {
                  const displayTitle = result?.title?.english || result?.title?.romaji || result?.title?.native || 'Unknown title';
                  return (
                    <GlassPanel key={`anilist-assist-${result.id}`} className="p-3 flex gap-3 items-start">
                      <img
                        src={getProxiedImageUrl(result?.coverImage?.large || result?.coverImage?.medium || '/placeholder.svg')}
                        alt={displayTitle}
                        className="w-16 h-20 rounded-lg object-cover flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{displayTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {result?.format || 'ANIME'} • {result?.status || 'UNKNOWN'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {result?.season || 'Season ?'} {result?.seasonYear || result?.startDate?.year || ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-1">
                          Score: {result?.averageScore ? `${result.averageScore}%` : 'N/A'} • Pop: {result?.popularity || 'N/A'}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          MAL: {result?.idMal || 'None'} • AniList: {result?.id}
                        </p>

                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => handleMapAniListToTatakai(result)}
                            className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30"
                          >
                            Map to Tatakai
                          </button>
                          <button
                            onClick={() => handleUseAniListTitle(result)}
                            className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-white/10 text-muted-foreground hover:text-foreground"
                          >
                            Use Title
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {query ? (
          hybridLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          ) : (
          <>
            {showCharacterResults && hasCharacterResults && (
              <div className="mb-10">
                <h2 className="text-lg md:text-xl font-bold mb-4">Character Matches</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {characterResults.map((character: any) => (
                    <GlassPanel key={character._id} className="p-3 flex items-center gap-3">
                      <img
                        src={getProxiedImageUrl(character.image)}
                        alt={character.name}
                        className="w-16 h-16 rounded-lg object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{character.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{character.anime}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => runRecentSearch(character.anime)}
                            className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-primary/20 text-primary"
                          >
                            Find Anime
                          </button>
                          <button
                            onClick={() => navigate(`/char/${encodeURIComponent(character.name)}`)}
                            className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-white/10 text-muted-foreground hover:text-foreground"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              </div>
            )}

            {showAnimeResults && hasAnimeResults && (
              <>
                <AnimeGrid animes={filteredAnimeResults} />

                {data && data.totalPages > 1 && (
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
            )}

            {!hasAnyResult && (
              <div className="text-center py-20">
                <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">No results found</h2>
                <p className="text-muted-foreground">Try broadening filters or using a different query</p>
              </div>
            )}
          </>
          )
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
