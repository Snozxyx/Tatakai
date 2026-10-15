import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { memo, useRef } from "react";
import { Link } from "react-router-dom";
import { BellRing, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useFollowedNovelUpdates } from "@/hooks/api/useFollowedNovelUpdates";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromNovel } from "@/components/media/quickPeekStore";

const CARD_WIDTH = "media-card-rail-item";

const FollowedNovelCard = memo(function FollowedNovelCard({
  update,
}: {
  update: ReturnType<typeof useFollowedNovelUpdates>["updates"][number];
}) {
  useUiTranslation();
  const href = `/novel/${encodeURIComponent(update.novelId)}`;
  // Exact new chapter in the reader (`item.href` wins over the default
  // detail route inside UnifiedMediaCard), falling back to the detail page
  // when no chapter resolved.
  const readHref =
    update.latestChapterNumber != null
      ? `/novel/read/${encodeURIComponent(update.novelId)}?chapterNumber=${update.latestChapterNumber}${update.latestChapterTitle ? `&chapterTitle=${encodeURIComponent(update.latestChapterTitle)}` : ""}${update.latestChapterKey ? `&chapterKey=${encodeURIComponent(update.latestChapterKey)}` : ""}`
      : href;

  const item: UnifiedMediaCardProps["item"] = {
    id: update.novelId,
    name: update.novelTitle,
    poster: update.novelPoster || "",
    type: "novel",
    chapters:
      update.latestChapterNumber != null && update.latestChapterNumber > 0
        ? Math.floor(update.latestChapterNumber)
        : undefined,
    href: readHref,
    mediaType: "novel",
  };

  return (
    <Peekable
      media={peekFromNovel(
        { id: update.novelId, name: update.novelTitle, poster: update.novelPoster },
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
                {uiI18n.t('app.ch_d8dbf726')} {update.latestChapterNumber}
              </span>
            ) : (
              <span />
            )}
            {update.hasNew && (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow-lg">
                {update.newChaptersCount} {uiI18n.t('app.new_c2a6b03f')}
              </span>
            )}
          </div>
        )}
      </div>
    </Peekable>
  );
});

export const FollowedNovelUpdates = memo(function FollowedNovelUpdates() {
  useUiTranslation();
  const { user } = useAuth();
  const { updates, isLoading, hasFollowed } = useFollowedNovelUpdates(10);
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
    <section className="mb-10 space-y-4 md:mb-12 md:space-y-5" aria-labelledby="followed-novel-heading">
      <HomeSectionHeading
        icon={<BellRing className="h-5 w-5 text-primary" />}
        title={<span id="followed-novel-heading">{uiI18n.t('app.new_chapters_from_followed_novels_cbaaa55a')}</span>}
        subtitle={
          updates.some((u) => u.hasNew)
            ? uiI18n.t('app.i18n_value_0_titles_with_unread_chapters_e064d2f1', { value0: updates.filter((u) => u.hasNew).length })
            : uiI18n.t('app.latest_chapters_from_your_novel_library_94790443')
        }
        action={
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <button
                onClick={() => scroll("left")}
                aria-label={uiI18n.t('app.scroll_left_2c9e5a60')}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => scroll("right")}
                aria-label={uiI18n.t('app.scroll_right_2994b49c')}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Link
              to="/profile?tab=novel-readlist"
              className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {uiI18n.t('app.view_all_efd83559')}
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
            <FollowedNovelCard key={update.novelId} update={update} />
          ))}
        </div>
      )}
    </section>
  );
});
