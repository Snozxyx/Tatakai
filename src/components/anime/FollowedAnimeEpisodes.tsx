import { memo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BellRing, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useFollowedAnimeUpdates } from "@/hooks/api/useFollowedAnimeUpdates";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { getProxiedImageUrl } from "@/lib/api";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromAnime } from "@/components/media/quickPeekStore";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = Date.now() - then;
  if (diff < 0) return "Airing soon";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? "Just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

const FollowedEpisodeCard = memo(function FollowedEpisodeCard({
  update,
}: {
  update: ReturnType<typeof useFollowedAnimeUpdates>["updates"][number];
}) {
  const navigate = useNavigate();
  const routeId =
    buildPreferredAnimeRouteId({
      id: update.animeId,
      name: update.animeName,
      anilistId: update.anilistId ?? undefined,
    }) || update.animeId;

  const thumb = update.episodeImage
    ? getProxiedImageUrl(update.episodeImage)
    : update.animePoster
      ? getProxiedImageUrl(update.animePoster)
      : "/placeholder.svg";

  // Open that exact episode in the watch page (`<baseId>?ep=<n>` is the
  // episode identity WatchPage parses). Fall back to the anime page only when
  // the episode number is still unknown.
  const href = `/anime/${encodeURIComponent(routeId)}`;
  const watchHref =
    update.latestEpisodeNumber != null
      ? `/watch/${encodeURIComponent(`${update.animeId}?ep=${update.latestEpisodeNumber}`)}`
      : href;

  return (
    <Peekable
      media={peekFromAnime(
        {
          id: update.animeId,
          name: update.animeName,
          poster: update.animePoster,
          anilistId: update.anilistId,
        },
        href,
      )}
    >
      <article
        onClick={() => navigate(watchHref)}
        data-mobile-poster-card
        className="group relative w-[240px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition-all duration-300 hover:border-primary/40 hover:bg-white/[0.04] active:scale-[0.98] md:w-[280px]"
      >
        {/* Episode thumbnail — 16:9, the actual screencap when ani.zip has one */}
        <div className="relative aspect-video w-full overflow-hidden bg-white/[0.04]">
          <img
            src={thumb}
            alt={
              update.episodeTitle
                ? `Episode ${update.latestEpisodeNumber}: ${update.episodeTitle}`
                : update.animeName
            }
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.fallback === "1") return;
              img.dataset.fallback = "1";
              img.src = "/placeholder.svg";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* EP badge */}
          {update.latestEpisodeNumber != null && (
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
              EP {update.latestEpisodeNumber}
            </span>
          )}
          {/* New count badge */}
          {update.hasNew && (
            <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow-lg">
              {update.newEpisodesCount} new
            </span>
          )}

          {/* Play overlay */}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </span>

          {/* Episode title on the thumbnail */}
          {update.episodeTitle && (
            <p className="absolute inset-x-2 bottom-2 line-clamp-1 text-[11px] font-semibold text-white/90 drop-shadow-md">
              {update.episodeTitle}
            </p>
          )}
        </div>

        {/* Series line */}
        <div className="flex items-center gap-2.5 p-3">
          <img
            src={
              update.animePoster
                ? getProxiedImageUrl(update.animePoster)
                : "/placeholder.svg"
            }
            alt=""
            loading="lazy"
            className="h-10 w-8 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <h4
              data-mobile-poster-title
              className="line-clamp-1 text-[13px] font-bold leading-tight text-white/90 group-hover:text-primary"
            >
              {update.animeName}
            </h4>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-white/50">
              {update.latestEpisodeNumber != null ? (
                <>
                  Episode {update.latestEpisodeNumber}
                  {update.lastWatchedEpisode != null &&
                    ` • Watched ${update.lastWatchedEpisode}`}
                </>
              ) : (
                "In your watchlist"
              )}
              {timeAgo(update.airDateUtc)
                ? ` • ${timeAgo(update.airDateUtc)}`
                : null}
            </p>
          </div>
        </div>
      </article>
    </Peekable>
  );
});

export const FollowedAnimeEpisodes = memo(function FollowedAnimeEpisodes() {
  const { user } = useAuth();
  const { updates, isLoading, hasFollowed } = useFollowedAnimeUpdates(10);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!user) return null;
  if (!isLoading && (!hasFollowed || updates.length === 0)) return null;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  return (
    <section className="mb-10 space-y-4 md:mb-12 md:space-y-5" aria-labelledby="followed-episodes-heading">
      <HomeSectionHeading
        icon={<BellRing className="h-5 w-5 text-primary" />}
        title={<span id="followed-episodes-heading">New Episodes from Followed Anime</span>}
        subtitle={
          updates.some((u) => u.hasNew)
            ? `${updates.filter((u) => u.hasNew).length} series with unwatched episodes`
            : "Latest aired episodes from your watchlist"
        }
        action={
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <button
                onClick={() => scroll("left")}
                aria-label="Scroll left"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => scroll("right")}
                aria-label="Scroll right"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Link
              to="/profile?tab=watchlist"
              className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View All
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <div
          data-mobile-home-rail
          className="flex gap-3 overflow-x-auto pb-4 md:gap-4"
          style={{ scrollbarWidth: "none" }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="w-[240px] shrink-0 animate-pulse overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] md:w-[280px]"
            >
              <div className="aspect-video w-full bg-white/[0.05]" />
              <div className="space-y-2 p-3">
                <div className="h-3.5 w-3/4 rounded bg-white/[0.06]" />
                <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          data-mobile-home-rail
          className="flex gap-3 overflow-x-auto pb-4 pt-1 md:gap-4"
          style={{ scrollbarWidth: "none" }}
        >
          {updates.map((update) => (
            <FollowedEpisodeCard key={update.animeId} update={update} />
          ))}
        </div>
      )}
    </section>
  );
});
