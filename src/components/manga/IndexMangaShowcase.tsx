import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Flame, SlidersHorizontal } from "lucide-react";
import { searchManga } from "@/services/manga.service";
import type { MangaSearchItem, MangaSearchResult } from "@/types/manga";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useContentSafetySettings } from "@/hooks/useContentSafetySettings";
import { inferMangaAdultFlag } from "@/lib/contentSafety";

const SHOWCASE_QUERIES = [
  "One Piece",
  "Solo Leveling",
  "Blue Box",
  "Omniscient Reader",
  "Dandadan",
  "Kingdom",
  "villainess manga",
];

function toMangaCard(item: MangaSearchItem): UnifiedMediaCardProps["item"] | null {
  const title =
    item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native;
  const id = item.anilistId || item.malId;

  if (!id || !title) return null;

  return {
    id: String(id),
    name: title,
    poster: item.poster || "",
    type: item.mediaType || "manga",
    status: item.status || undefined,
    rating:
      typeof item.score === "number" && Number.isFinite(item.score)
        ? (item.score / 10).toFixed(1)
        : undefined,
    chapters:
      typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : undefined,
    malId: typeof item.malId === "number" ? item.malId : undefined,
    anilistId: typeof item.anilistId === "number" ? item.anilistId : undefined,
    isAdult: inferMangaAdultFlag(item),
    mediaType: "manga",
  };
}

function dedupe(items: UnifiedMediaCardProps["item"][]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.anilistId ?? item.malId ?? item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function IndexMangaShowcase() {
  const { settings: contentSafetySettings } = useContentSafetySettings();

  const showcaseQueries = useQueries({
    queries: SHOWCASE_QUERIES.map((term) => ({
      queryKey: ["index-manga-showcase", term],
      queryFn: (): Promise<MangaSearchResult> => searchManga(term, 1, 12),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const showcaseCards = useMemo(() => {
    const cards = showcaseQueries.flatMap((state) => {
      const results = Array.isArray(state.data?.results) ? state.data.results : [];
      return results
        .filter((item) => {
          const isAdult = inferMangaAdultFlag(item);
          return !isAdult || contentSafetySettings.showAdultEverywhere;
        })
        .map(toMangaCard)
        .filter(Boolean) as UnifiedMediaCardProps["item"][];
    });

    return dedupe(cards).slice(0, 10);
  }, [showcaseQueries, contentSafetySettings.showAdultEverywhere]);

  const isLoading = showcaseQueries.some((queryState) => queryState.isLoading) && showcaseCards.length === 0;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-black flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Manga Picks Tonight
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Banner highlights plus fast manga cards you can open and read immediately.
          </p>
        </div>
        <Link
          to="/manga"
          className="text-xs font-bold uppercase tracking-wider text-primary hover:underline"
        >
          Open Manga Hub
        </Link>
      </div>

      {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <GlassPanel className="p-5 border border-primary/25 bg-primary/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-primary">Fast Reading Flow</p>
              <h3 className="mt-2 text-lg font-black">Jump from card to chapter in seconds</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick a manga, choose your source, and continue in the upgraded premium reader.
              </p>
            </div>
            <Flame className="w-5 h-5 text-primary" />
          </div>
          <Link
            to="/manga"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            Start Reading
            <ArrowRight className="w-4 h-4" />
          </Link>
        </GlassPanel>

        <GlassPanel className="p-5 border border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Cross-Media Filters</p>
              <h3 className="mt-2 text-lg font-black">Power filters live in unified search</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Filter anime and manga together by type, status, provider, rating, and advanced metadata.
              </p>
            </div>
            <SlidersHorizontal className="w-5 h-5 text-primary" />
          </div>
          <Link
            to="/search"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10"
          >
            Open Search Filters
            <ArrowRight className="w-4 h-4" />
          </Link>
        </GlassPanel>
      </div> */}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : showcaseCards.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-4">
          {showcaseCards.map((item) => (
            <UnifiedMediaCard key={`index-manga-${item.id}`} item={item} />
          ))}
        </div>
      ) : (
        <GlassPanel className="p-5 border border-white/10">
          <p className="text-sm text-muted-foreground">Manga cards are loading. Please check again shortly.</p>
        </GlassPanel>
      )}
    </section>
  );
}
