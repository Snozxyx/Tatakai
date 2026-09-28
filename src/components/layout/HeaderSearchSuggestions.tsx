import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Film, BookOpen, Loader2, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";

interface Suggestion {
  id: string | number;
  name: string;
  poster: string | null;
  type: "anime" | "manga" | "history";
  year?: number | null;
  format?: string | null;
  countryOfOrigin?: string | null;
}

async function fetchSuggestions(q: string): Promise<Suggestion[]> {
  if (!q || q.trim().length < 2) return [];
  const params = new URLSearchParams({ q: q.trim() });
  const raw = await fetch(`${resolveApiV3Base()}/content/search/suggestions?${params}`, {
    signal: AbortSignal.timeout(4000),
  }).then((response) => response.json());

  const results: Suggestion[] = [];
  const mediaArr = Array.isArray(raw?.data?.media) ? raw.data.media : [];
  for (const m of mediaArr) {
    const name = m.titleEnglish || m.titleRomaji || m.titleNative;
    if (!name || name === "Unknown") continue;
    results.push({
      id: m.anilistId ?? m.tatakaiId ?? m.malId,
      name,
      poster: m.coverImageLarge || m.coverImageMedium || null,
      type: m.mediaType === "manga" ? "manga" : "anime",
      year: m.startDate?.year ?? m.seasonYear ?? null,
      format: m.format ?? null,
      countryOfOrigin: m.countryOfOrigin ?? null,
    });
  }

  return results;
}

interface Props {
  query: string;
  visible: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
}

function formatSuggestionType(item: Suggestion): string {
  if (item.type !== "manga") return item.format || "Anime";
  const format = String(item.format || "MANGA").toUpperCase();
  if (item.countryOfOrigin === "KR") return "Manhwa";
  if (item.countryOfOrigin === "CN") return "Manhua";
  if (format === "MANHWA") return "Manhwa";
  if (format === "MANHUA") return "Manhua";
  if (format === "OEL") return "Comics";
  if (format === "ONE_SHOT") return "One-shot";
  return "Manga";
}

export function HeaderSearchSuggestions({ query, visible, onSelect, onClose }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("tatakai_search_history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ["header-suggestions", debouncedQuery],
    queryFn: () => fetchSuggestions(debouncedQuery),
    enabled: visible && debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
    retry: false,
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (visible) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose]);

  if (!visible) return null;

  const showHistory = query.trim().length < 2 && history.length > 0;
  const showSuggestions = query.trim().length >= 2;
  const isWaitingForQuery = query !== debouncedQuery;
  const hasContent = showHistory || (showSuggestions && (isWaitingForQuery || isFetching || suggestions.length > 0));
  if (!hasContent) return null;

  const handleSelect = (item: Suggestion) => {
    onSelect(item.name);
    navigate(
      item.type === "manga"
        ? `/manga/${item.id}`
        : `/anime/${item.id}`
    );
  };

  const handleHistorySelect = (term: string) => {
    onSelect(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const removeHistory = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = history.filter((h) => h !== term);
    setHistory(next);
    try {
      localStorage.setItem("tatakai_search_history", JSON.stringify(next));
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 right-0 mt-2 z-[200] bg-background/95 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl overflow-hidden"
      onMouseDown={(e) => e.preventDefault()} // prevent input blur on click
    >
      {showHistory && (
        <div className="p-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent</span>
          </div>
          {history.slice(0, 5).map((term) => (
            <button
              key={term}
              onClick={() => handleHistorySelect(term)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors group text-left"
            >
              <Search className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              <span className="flex-1 text-sm truncate">{term}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => removeHistory(term, e as any)}
                className="text-[10px] text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all px-1"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {showSuggestions && (
        <div className="p-2">
          {isFetching && suggestions.length === 0 && (
            <div className="flex items-center gap-3 px-3 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Searching…</span>
            </div>
          )}

          {suggestions.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <TrendingUp className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Results</span>
              </div>
              {suggestions.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                >
                  <div className="w-8 h-10 rounded-lg overflow-hidden shrink-0 bg-muted">
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {item.type === "manga" ? (
                          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <Film className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                          item.type === "manga"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-primary/15 text-primary/80"
                        )}
                      >
                        {formatSuggestionType(item)}
                      </span>
                      {item.year && (
                        <span className="text-[10px] text-muted-foreground">{item.year}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {!isFetching && suggestions.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No results for "<span className="text-foreground">{query}</span>"
            </div>
          )}

          {/* Search all results footer */}
          <button
            onClick={() => {
              onSelect(query);
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-semibold text-primary border border-primary/20 hover:border-primary/40"
          >
            <Search className="w-4 h-4" />
            Search all results for "{query}"
          </button>
        </div>
      )}
    </div>
  );
}
