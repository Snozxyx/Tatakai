import { memo, useRef } from "react";
import { Link } from "react-router-dom";
import { BellRing, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useFollowedMangaUpdates } from "@/hooks/api/useFollowedMangaUpdates";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromManga } from "@/components/media/quickPeekStore";

const CARD_WIDTH = "media-card-rail-item";

const FollowedMangaCard = memo(function FollowedMangaCard({
  update,
}: {
  update: ReturnType<typeof useFollowedMangaUpdates>["updates"][number];
}) {
  const href = `/manga/${encodeURIComponent(update.mangaId)}`;
  // Exact new chapter in the reader (`item.href` wins over the default
  // detail route inside UnifiedMediaCard), falling back to the detail page
  // when no chapter resolved.
  const readHref =
    update.latestChapterNumber != null
      ? `/manga/read/${encodeURIComponent(update.mangaId)}?chapterNumber=${update.latestChapterNumber}${update.latestChapterTitle ? `&chapterTitle=${encodeURIComponent(update.latestChapterTitle)}` : ""}${update.latestChapterKey ? `&chapterKey=${encodeURIComponent(update.latestChapterKey)}` : ""}`
      : href;

  const item: UnifiedMediaCardProps["item"] = {
    id: update.mangaId,
    name: update.mangaTitle,
    poster: update.mangaPoster || "",
    type: update.format || "manga",
    chapters:
      update.latestChapterNumber != null && update.latestChapterNumber > 0
        ? Math.floor(update.latestChapterNumber)
        : undefined,
    href: readHref,
    mediaType: "manga",
  };

  return (
    <Peekable
      media={peekFromManga(
        { id: update.mangaId, name: update.mangaTitle, poster: update.mangaPoster },
        href,
      )}
    >
      {/* Relative wrapper carries the single coordinated badge row. The card's
          own corner badges are suppressed (`topBadges="none"`) so the format
          pill can't stack on top of the chapter pill in overlay card style. */}
      <div data-mobile-poster-card className={`relative ${CARD_WIDTH}`}>
        <UnifiedMediaCard item={item} topBadges="none" />

        {(update.latestChapterNumber != null || update.hasNew) && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-40 flex items-start justify-between gap-1.5">
            {update.latestChapterNumber != null ? (
              <span className="shrink-0 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
                Ch. {update.latestChapterNumber}
              </span>
            ) : (
              <span />
            )}
            {update.hasNew && (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow-lg">
                {update.newChaptersCount} new
              </span>
            )}
          </div>
        )}
      </div>
    </Peekable>
  );
});

export const FollowedMangaUpdates = memo(function FollowedMangaUpdates() {
  const { user } = useAuth();
  const { updates, isLoading, hasFollowed } = useFollowedMangaUpdates(10);
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
    <section className="mb-10 space-y-4 md:mb-12 md:space-y-5" aria-labelledby="followed-manga-heading">
      <HomeSectionHeading
        icon={<BellRing className="h-5 w-5 text-primary" />}
        title={<span id="followed-manga-heading">New Chapters from Followed Comics</span>}
        subtitle={
          updates.some((u) => u.hasNew)
            ? `${updates.filter((u) => u.hasNew).length} titles with unread chapters`
            : "Latest chapters from your readlist"
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
              to="/profile?tab=manga-readlist"
              className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View All
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <div data-mobile-home-rail className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${CARD_WIDTH} space-y-3`}>
              <div className="aspect-[2/3] w-full animate-pulse rounded-2xl border border-white/5 bg-white/[0.04]" />
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
      ) : (
        <div ref={scrollRef} data-mobile-home-rail className="flex gap-4 overflow-x-auto pb-4 pt-1" style={{ scrollbarWidth: "none" }}>
          {updates.map((update) => (
            <FollowedMangaCard key={update.mangaId} update={update} />
          ))}
        </div>
      )}
    </section>
  );
});
