import { memo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock, Flame, Heart, Plus, Sparkles } from "lucide-react";
import { searchManga } from "@/core/content/manga-client";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import type { MangaSearchItem } from "@/types/manga";

type LaneDef = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  mode?: string;
  sort?: string;
  exploreTo: string;
};

const LANES: LaneDef[] = [
  {
    id: "recent-popular",
    title: "Most Recent Popular",
    subtitle: "Trending across manga right now",
    icon: <Flame className="h-5 w-5 text-orange" />,
    sort: "TRENDING_DESC",
    exploreTo: "/manga/discover?sort=trending",
  },
  {
    id: "most-follows",
    title: "Most Follows",
    subtitle: "The most followed series",
    icon: <Heart className="h-5 w-5 text-destructive fill-destructive" />,
    sort: "FAVOURITES_DESC",
    exploreTo: "/manga/discover?sort=popularity",
  },
  {
    id: "new-comics",
    title: "New Comics",
    subtitle: "Fresh series that just started",
    icon: <Sparkles className="h-5 w-5 text-amber" />,
    sort: "START_DATE_DESC",
    exploreTo: "/manga/discover?sort=latestUpdate",
  },
  {
    id: "latest-updates",
    title: "Latest Updates",
    subtitle: "New chapters just dropped",
    icon: <Clock className="h-5 w-5 text-primary" />,
    mode: "new-chap",
    exploreTo: "/manga/discover?sort=latestUpdate",
  },
];

function toCard(item: MangaSearchItem): UnifiedMediaCardProps["item"] | null {
  const title =
    item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native;
  const rawId = item.anilistId || item.malId || item.id;
  if (!rawId || !title) return null;
  return {
    id: String(rawId),
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

export const MangaExtraLanes = memo(function MangaExtraLanes() {
  const { settings } = useContentSafetySettings();
  const canShowAdult = settings.showAdultEverywhere;

  const results = useQueries({
    queries: LANES.map((lane) => ({
      queryKey: ["manga-extra-lane", lane.id, canShowAdult],
      queryFn: async () => {
        const res = await searchManga("", 1, 12, {
          mode: (lane.mode as never) ?? undefined,
          sort: lane.sort,
          adult: canShowAdult,
        });
        const items = (res.results ?? [])
          .filter((item) => canShowAdult || !inferMangaAdultFlag(item))
          .map(toCard)
          .filter(Boolean) as UnifiedMediaCardProps["item"][];
        // Dedupe by AniList/MAL id.
        const seen = new Set<string>();
        return items.filter((item) => {
          const key = String(item.anilistId ?? item.malId ?? item.id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 10);
      },
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  return (
    <>
      {LANES.map((lane, index) => {
        const items = results[index]?.data ?? [];
        const isLoading = results[index]?.isLoading ?? false;
        if (!isLoading && items.length === 0) return null;
        return (
          <section key={lane.id} className="mb-12 md:mb-16" aria-label={lane.title}>
            <HomeSectionHeading
              icon={lane.icon}
              title={lane.title}
              subtitle={lane.subtitle}
              viewAllTo={lane.exploreTo}
            />
            {isLoading ? (
              <div data-mobile-home-rail className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="media-card-rail-item space-y-3">
                    <CardSkeleton />
                  </div>
                ))}
              </div>
            ) : (
              <div data-mobile-home-rail className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
                {items.map((item) => (
                  <div key={`${lane.id}-${item.id}`} className="media-card-rail-item">
                    <UnifiedMediaCard item={item} />
                  </div>
                ))}
                <Link
                  to={lane.exploreTo}
                  aria-label={`Show more ${lane.title}`}
                  className="media-card-rail-item"
                >
                  <span className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] transition-colors hover:border-primary/50 hover:bg-primary/[0.06]">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary transition-transform hover:scale-105">
                      <Plus className="h-6 w-6" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Show more
                    </span>
                  </span>
                  <span className="mt-2.5 block px-0.5 text-sm font-bold leading-snug text-white/45">
                    {lane.title}
                  </span>
                </Link>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
});
