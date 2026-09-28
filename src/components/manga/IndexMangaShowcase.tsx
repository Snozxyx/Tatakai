import { useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Flame, Star } from "lucide-react";
import type { MangaSearchItem } from "@/types/manga";
import type { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { useMangaHome } from "@/hooks/api/useMangaHome";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";

type MangaCardItem = UnifiedMediaCardProps["item"];

function toMangaCard(item: MangaSearchItem): MangaCardItem | null {
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

function dedupe(items: MangaCardItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.anilistId ?? item.malId ?? item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatStatus(status?: string) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("releasing") || s.includes("publishing")) return "Ongoing";
  if (s.includes("finished") || s.includes("complete")) return "Completed";
  if (s.includes("hiatus")) return "Hiatus";
  if (s.includes("not_yet") || s.includes("upcoming")) return "Upcoming";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

const CARD_WIDTH = "w-[150px] sm:w-[170px] md:w-[190px] lg:w-[210px] flex-shrink-0 snap-start";

function MangaShowcaseCard({ item }: { item: MangaCardItem }) {
  const navigate = useNavigate();
  const status = formatStatus(item.status);

  return (
    <GlassPanel
      className="group relative cursor-pointer overflow-hidden transition-transform duration-300 ease-out hover:-translate-y-1"
      onClick={() => navigate(`/manga/${item.id}`)}
    >
      <div className="relative aspect-[2/3]">
        <img
          src={item.poster}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105 group-hover:brightness-110 ${
            item.isAdult ? "blur-md scale-110" : ""
          }`}
        />

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-0 transition-colors duration-300 group-hover:bg-black/10" />

        {/* Type */}
        {item.type && (
          <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/90 text-white text-[10px] font-bold uppercase tracking-wider shadow-md shadow-black/30">
            <BookOpen className="w-3 h-3" />
            {item.type}
          </div>
        )}

        {/* Score */}
        {item.rating && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white">
            <Star className="w-3 h-3 fill-amber text-amber" />
            {item.rating}
          </div>
        )}

        {/* Adult veil */}
        {item.isAdult && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-2 py-1 rounded-md bg-black/60 backdrop-blur border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/80">
              18+
            </span>
          </div>
        )}

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-3.5 pt-10">
          <h4 className="font-bold text-sm leading-tight line-clamp-2 drop-shadow-md group-hover:text-orange-200 transition-colors duration-300">
            {item.name}
          </h4>

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {item.chapters && (
              <span className="inline-flex items-center bg-white/10 backdrop-blur-sm border border-white/5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider text-white/80">
                CH {item.chapters}
              </span>
            )}
            {status && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/55">
                {status === "Ongoing" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
                {status}
              </span>
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

function ShowcaseSkeleton() {
  return (
    <div className="aspect-[2/3] rounded-xl bg-white/5 border border-white/5 animate-pulse" />
  );
}

/**
 * The hub's trending rail.
 *
 * Reads the trending lane of the shared `/manga/home` bundle, so the heading
 * is true and the rail costs no request of its own.
 */
export function IndexMangaShowcase() {
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const { data, isLoading } = useMangaHome();
  const scrollRef = useRef<HTMLDivElement>(null);

  const showcaseCards = useMemo(() => {
    const lane: MangaSearchItem[] = data?.trending ?? [];
    const cards = lane
      .filter((item) => !inferMangaAdultFlag(item) || contentSafetySettings.showAdultEverywhere)
      .map(toMangaCard)
      .filter(Boolean) as MangaCardItem[];

    return dedupe(cards).slice(0, 10);
  }, [data, contentSafetySettings.showAdultEverywhere]);

  const showSkeleton = isLoading && showcaseCards.length === 0;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const railClasses =
    "flex gap-4 overflow-x-auto pb-4 px-2 snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

  return (
    <section className="mb-24">
      {/* Header */}
      <HomeSectionHeading
        className="mb-8"
        icon={<Flame className="w-5 h-5 text-primary" />}
        title="Trending Manga"
        subtitle="What readers are opening right now."
        action={
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex gap-1 p-1 rounded-full bg-white/5 border border-white/10">
              <button
                onClick={() => scroll("left")}
                aria-label="Scroll left"
                className="p-2 rounded-full text-muted-foreground hover:text-white hover:bg-white/10 transition-colors duration-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scroll("right")}
                aria-label="Scroll right"
                className="p-2 rounded-full text-muted-foreground hover:text-white hover:bg-white/10 transition-colors duration-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <Link
              to="/manga"
              className="group inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white/5 border border-white/10 text-xs font-semibold uppercase tracking-wider text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-300"
            >
              Open Hub
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </div>
        }
      />

      {/* Rail */}
      {showSkeleton ? (
        <div className={railClasses}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={CARD_WIDTH}>
              <ShowcaseSkeleton />
            </div>
          ))}
        </div>
      ) : showcaseCards.length > 0 ? (
        <div className="relative">
          <div className="pointer-events-none absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-background to-transparent z-10" />

          <div ref={scrollRef} className={railClasses}>
            {showcaseCards.map((item) => (
              <div key={`index-manga-${item.id}`} className={CARD_WIDTH}>
                <MangaShowcaseCard item={item} />
              </div>
            ))}
            <div className="w-2 flex-shrink-0" aria-hidden="true" />
          </div>
        </div>
      ) : (
        <div className="mx-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <p className="text-sm text-muted-foreground">Nothing trending yet — check back shortly.</p>
          <Link
            to="/manga"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors"
          >
            Browse the manga hub <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </section>
  );
}