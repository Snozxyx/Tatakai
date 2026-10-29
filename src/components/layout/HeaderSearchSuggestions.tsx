import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Film, BookOpen, Loader2, Clock, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";
import { getPreferredTitleLanguage, selectMediaTitle } from '@/lib/titleLanguage';

import { searchMangaTags } from '@/core/content/manga-tag-search';
import { mergeCatalog, normalizeCatalogTitle } from '@/lib/catalogMerge';

interface Suggestion {
  anilistId?: number;
  malId?: number;
  canonicalTitle?: string;
  mediaType?: string;
  href?: string;
  id: string | number;
  name: string;
  poster: string | null;
  type: "anime" | "manga" | "novel" | "history";
  year?: number | null;
  format?: string | null;
  countryOfOrigin?: string | null;
}

async function fetchSuggestions(q: string): Promise<Suggestion[]> {
  if (!q || q.trim().length < 2) return [];
  const params = new URLSearchParams({ q: q.trim() });
  const raw = await fetch(`${resolveApiV3Base()}/content/search/suggestions?${params}`, {
    signal: AbortSignal.timeout(4000),
  }).then((response) => { if (!response.ok) throw new Error('Search unavailable'); return response.json(); });

  const results: Suggestion[] = [];
  const mediaArr = Array.isArray(raw?.data?.media) ? raw.data.media : [];
  for (const m of mediaArr) {
    const name = selectMediaTitle(m);
    if (!name || name === 'Unknown') continue;
    const formatUpper = String(m.format ?? "").toUpperCase();
    const isNovel = formatUpper === "NOVEL" || formatUpper === "LIGHT_NOVEL" || m.mediaType === "novel";
    results.push({
      id: m.anilistId ?? m.tatakaiId ?? (m.malId ? `mal:${m.malId}` : ''),
      anilistId: m.anilistId, malId: m.malId, canonicalTitle: name,
      mediaType: isNovel ? 'novel' : m.mediaType === 'manga' ? 'manga' : 'anime',
      name,
      poster: m.coverImageLarge || m.coverImageMedium || null,
      type: isNovel ? "novel" : m.mediaType === "manga" ? "manga" : "anime",
      year: m.startDate?.year ?? m.seasonYear ?? null,
      format: m.format ?? null,
      countryOfOrigin: m.countryOfOrigin ?? null,
    });
  }

  return results.filter(item => item.id);
}

interface Props {
  inline?: boolean;
  query: string;
  visible: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
}

function formatSuggestionType(item: Suggestion): string {
  if (item.type === "novel") return i18n.t('nav.novels');
  if (item.type !== "manga") return item.format || i18n.t('layout.searchTypeAnime');
  const format = String(item.format || "MANGA").toUpperCase();
  if (item.countryOfOrigin === "KR") return i18n.t('layout.searchTypeManhwa');
  if (item.countryOfOrigin === "CN") return i18n.t('layout.searchTypeManhua');
  if (format === "MANHWA") return i18n.t('layout.searchTypeManhwa');
  if (format === "MANHUA") return i18n.t('layout.searchTypeManhua');
  if (format === "OEL") return i18n.t('layout.searchTypeComics');
  if (format === "ONE_SHOT") return i18n.t('layout.searchTypeOneShot');
  return i18n.t('layout.searchTypeManga');
}

export function HeaderSearchSuggestions({ query, visible, onSelect, onClose, inline = false }: Props) {
  useUiTranslation();
  const { t } = useTranslation();
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
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });

  const { data: primary = [], isFetching: primaryFetching } = useQuery({
    queryKey: ["header-suggestions", debouncedQuery, getPreferredTitleLanguage()],
    queryFn: () => fetchSuggestions(debouncedQuery),
    enabled: visible && debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
    retry: false,
  });

  const { data: extra = [], isFetching: catalogFetching } = useQuery({
    queryKey: ['header-mangabaka', debouncedQuery.trim(), getPreferredTitleLanguage()],
    queryFn: async (): Promise<Suggestion[]> => {
      const catalog = await searchMangaTags(debouncedQuery.trim(), 1, 12, { tagSource: 'mangabaka' });
      return catalog.results.map(item => ({
        id: item.id!, anilistId: item.anilistId, malId: item.malId,
        name: item.canonicalTitle, canonicalTitle: item.canonicalTitle,
        poster: item.poster, type: item.format === 'NOVEL' ? 'novel' : 'manga',
        mediaType: item.format === 'NOVEL' ? 'novel' : 'manga',
        href: item.href, year: item.year, format: item.format === 'NOVEL' ? 'NOVEL' : item.mediaType,
      }));
    },
    enabled: visible && debouncedQuery.trim().length >= 2,
    staleTime: 5 * 60_000, retry: false,
  });
  const isFetching = primaryFetching || catalogFetching;
  const term = normalizeCatalogTitle(debouncedQuery);
  const suggestions = mergeCatalog(primary, extra).sort((a, b) => {
    const rank = (name: string) => normalizeCatalogTitle(name) === term ? 0 : normalizeCatalogTitle(name).startsWith(term) ? 1 : 2;
    return rank(a.name) - rank(b.name);
  }).slice(0, 14);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (visible && !inline) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose, inline]);

  if (!visible) return null;

  const showHistory = query.trim().length < 2 && history.length > 0;
  const showSuggestions = query.trim().length >= 2;
  const isWaitingForQuery = query !== debouncedQuery;
  const hasContent = showHistory || showSuggestions;
  if (!hasContent) return null;

  const handleSelect = (item: Suggestion) => {
    onSelect(item.name);
    if (item.href) { window.open(item.href, '_blank', 'noopener,noreferrer'); return; }
    navigate(
      item.type === "novel"
        ? `/novel/${item.id}`
        : item.type === "manga"
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
      className={inline ? 'relative' : 'absolute top-full left-0 right-0 mt-2 z-[200] bg-background/95 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl overflow-hidden'}
      onMouseDown={inline ? undefined : (e) => e.preventDefault()}
    >
      {showHistory && (
        <div className="p-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('layout.searchRecent')}</span>
          </div>
          {history.slice(0, 5).map((term) => (
            <div key={term} className="flex items-center rounded-xl hover:bg-accent">
              <button type="button" onClick={() => handleHistorySelect(term)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{term}</span>
              </button>
              <button type="button" aria-label={t('discovery.removeSearch', { term })} onClick={event => removeHistory(term, event)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSuggestions && (
        <div className="p-2">
          {(isWaitingForQuery || (isFetching && suggestions.length === 0)) && (
            <div className="flex items-center gap-3 px-3 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('layout.searchSearching')}</span>
            </div>
          )}

          {!isWaitingForQuery && suggestions.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <TrendingUp className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('layout.searchResults')}</span>
              </div>
              {suggestions.map((item) => (
                <button
                  type="button"
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors text-left group"
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
                            {item.type === "anime" ? (
                              <Film className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
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
                          item.type === "novel"
                            ? "bg-muted text-muted-foreground"
                            : item.type === "manga"
                              ? "bg-muted text-muted-foreground"
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

          {!isWaitingForQuery && !isFetching && suggestions.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              <Trans i18nKey="layout.searchNoResultsRich" values={{ query }} components={{ query: <span className="text-foreground" /> }} />
            </div>
          )}

          {/* Search all results footer */}
          <button
            type="button"
            onClick={() => {
              onSelect(query);
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-semibold text-primary border border-primary/20 hover:border-primary/40"
          >
            <Search className="w-4 h-4" />
            {t('layout.searchAllResults', { query })}
          </button>
        </div>
      )}
    </div>
  );
}
