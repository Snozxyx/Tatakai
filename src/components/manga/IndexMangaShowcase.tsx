import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import type { MangaSearchItem } from "@/types/manga";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
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

const CARD_WIDTH = "w-36 shrink-0 snap-start sm:w-44 md:w-48";

function MangaShowcaseCard({ item }: { item: MangaCardItem }) {
  // No explicit variant: the card follows the appearance setting like every
  // other rail — text inside the artwork ("Cinematic overlay") or below it
  // ("Clean poster"), per Settings → Appearance → Media cards.
  return (
    <UnifiedMediaCard
      item={{ ...item, status: formatStatus(item.status) || undefined, blurAdult: Boolean(item.isAdult) }}
    />
  );
}

function ShowcaseSkeleton() {
  return (
    <CardSkeleton />
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
        <div data-mobile-home-rail ref={scrollRef} className={railClasses}>
          {showcaseCards.map((item) => (
            <div key={`index-manga-${item.id}`} className={CARD_WIDTH}>
              <MangaShowcaseCard item={item} />
            </div>
          ))}
          <div className="w-2 flex-shrink-0" aria-hidden="true" />
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
