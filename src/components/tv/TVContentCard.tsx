import { useQuery } from "@tanstack/react-query";
import {
  tvCardMetadata,
  type TVCardMetadataInput,
} from "@/core/tv/cardMetadata";
import { TVCardFacts, TVCardTags } from "./TVCardMetadata";
import { resolveTatakaiAnimeViewId } from "@/components/media/TatakaiAnimeViews";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { useTVTitleArt } from "@/core/tv/useTVTitleArt";
import { observeTVVisibility } from "@/core/tv/visibility";
export interface TVCard extends TVCardMetadataInput {
  id: string;
  name: string;
  poster?: string;
  banner?: string;
  href?: string;
  progress?: number;
  rank?: number;
  subtitle?: string;
  description?: string;
}
export const TVContentCard = memo(function TVContentCard({
  item,
  onFocus,
}: {
  item: TVCard;
  onFocus?(item: TVCard): void;
}) {
  const panel = useRef<HTMLElement>(null);
  const anchor = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0 });
  const anime =
    !item.href || /^\/anime\//.test(item.href) || /^\/watch\//.test(item.href);
  const animeId = item.href?.startsWith("/watch/")
    ? new URL(item.href, location.origin).searchParams.get("animeId") ||
      undefined
    : item.href?.startsWith("/anime/")
    ? decodeURIComponent(item.href.slice(7).split("?")[0])
    : item.id;
  const art = useTVTitleArt(open && anime ? animeId : undefined);
  const bookKind = item.href?.startsWith("/manga/")
    ? "manga"
    : item.href?.startsWith("/novel/")
    ? "novel"
    : undefined;
  const book = useQuery({
    queryKey: ["tv-card-book-metadata", bookKind, item.id],
    enabled: open && !!bookKind,
    staleTime: 3600000,
    queryFn: async (): Promise<TVCardMetadataInput> => {
      const result =
        bookKind === "manga"
          ? await (
              await import("@/core/content/manga-client")
            ).getMangaDetail(item.id)
          : await (
              await import("@/core/content/novel-client")
            ).getNovelDetail(item.id);
      const detail = result.detail;
      return {
        type: detail.format || bookKind,
        status: detail.status,
        genres: detail.genres,
        rating: detail.score ? (detail.score / 10).toFixed(1) : undefined,
        year: detail.yearStart || undefined,
        chapters: detail.totalChapters || undefined,
        description: detail.synopsis || undefined,
        banner: detail.bannerImage || undefined,
      };
    },
  });
  const metadata = tvCardMetadata({ ...item, ...book.data }, art.data);
  const viewId = anime
    ? resolveTatakaiAnimeViewId(animeId, art.data?.anilistId)
    : undefined;
  useEffect(() => {
    if (!anchor.current) return;
    return observeTVVisibility(anchor.current, setVisible);
  }, []);
  function show() {
    clearTimeout(timer.current);
    onFocus?.(item);
    timer.current = setTimeout(() => {
      if (!anchor.current || (!anchor.current.matches(':hover') && document.activeElement !== anchor.current)) return;
      const rect = anchor.current.getBoundingClientRect();
      const width = Math.min(
        Math.max(rect.width * 1.23, 340),
        innerWidth * 0.39
      );
      const height = Math.min(width * 0.98, innerHeight * 0.76);
      setPosition({
        width,
        left: Math.max(
          24,
          Math.min(
            rect.left - (width - rect.width) / 2,
            innerWidth - width - 24
          )
        ),
        top: Math.max(24, Math.min(rect.top - 28, innerHeight - height - 24)),
      });
      setOpen(true);
    }, 650);
  }
  function hide() {
    clearTimeout(timer.current);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const resize = new ResizeObserver(() => {
      const height = panel.current?.getBoundingClientRect().height || 0;
      setPosition((previous) => {
        const top = Math.max(
          24,
          Math.min(previous.top, innerHeight - height - 24)
        );
        return top === previous.top ? previous : { ...previous, top };
      });
    });
    resize.observe(panel.current);
    return () => resize.disconnect();
  }, [open]);
  const description = (
    art.data?.description ||
    book.data?.description ||
    item.description ||
    ""
  ).replace(/<[^>]*>/g, "");
  return (
    <>
      <Link
        ref={anchor}
        className="tv-content-card"
        to={item.href || `/anime/${item.id}`}
        data-tv-key={`card-${item.id}`}
        onFocus={show}
        onBlur={hide}
        onMouseEnter={show}
        onMouseLeave={hide}
        aria-describedby={open ? `tv-preview-${item.id}` : undefined}
      >
        <div className="tv-card-art">
          {item.poster && (
            <img
              loading="lazy"
              decoding="async"
              src={item.tvMetadata?.banner || item.banner || item.poster}
              alt=""
            />
          )}
          {(item.progress !== undefined ||
            item.href?.startsWith("/tv/iptv")) && (
            <span className="tv-card-badge">
              {item.progress !== undefined ? "Continue" : "Live"}
            </span>
          )}
          {metadata.status &&
            item.progress === undefined &&
            !item.href?.startsWith("/tv/iptv") && (
              <span className="tv-card-status">
                {metadata.status.toLowerCase()}
              </span>
            )}
          {item.rank && <span className="tv-rank">{item.rank}</span>}
          {item.progress !== undefined && (
            <progress
              max={1}
              value={item.progress}
              aria-label="Watch progress"
            />
          )}
        </div>
        <div className="tv-card-caption">
          <strong>{item.name}</strong>
          {item.subtitle && <span>{item.subtitle}</span>}
          <TVCardFacts
            metadata={metadata}
            viewId={visible ? viewId : undefined}
            adult={item.isAdult}
          />
          <TVCardTags tags={metadata.tags} />
        </div>
      </Link>
      {open &&
        createPortal(
          <aside
            ref={panel}
            id={`tv-preview-${item.id}`}
            className="tv-card-preview"
            style={position}
            role="tooltip"
          >
            <div className="tv-card-preview-art">
              <img
                src={
                  art.data?.bannerImage ||
                  book.data?.banner ||
                  item.tvMetadata?.banner ||
                  item.banner ||
                  item.poster
                }
                alt=""
              />
              <div />
            </div>
            <div className="tv-card-preview-copy">
              <h3>{item.name}</h3>
              <TVCardFacts
                metadata={metadata}
                viewId={viewId}
                adult={item.isAdult}
                expanded
              />
              <TVCardTags tags={metadata.tags} expanded />
              {description ? (
                <p className="tv-card-preview-description">{description}</p>
              ) : (
                <p className="tv-card-preview-description">
                  {art.isFetching
                    ? "Loading title details…"
                    : "Open this title to explore episodes and available sources."}
                </p>
              )}
              {item.progress !== undefined && (
                <progress
                  max={1}
                  value={item.progress}
                  aria-label="Watch progress"
                />
              )}
              <span className="tv-card-preview-action">
                <Info /> Select to{" "}
                {item.href?.startsWith("/watch")
                  ? "resume watching"
                  : "open title"}
              </span>
            </div>
          </aside>,
          document.body
        )}
    </>
  );
});
