import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, Bookmark, BookOpen, ChevronRight, Play, Plus, Check, Star, Loader2 } from "lucide-react";
import { PeekSheet } from "@/components/media/PeekSheet";
import { getProxiedImageUrl } from "@/lib/api";
import { splitRating } from "@/lib/mediaRating";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimeInfo } from "@/hooks/api/useAnimeData";
import { useMangaDetail } from "@/hooks/api/useMangaData";
import { useMediaBanner } from "@/hooks/api/useMediaBanner";
import { useLongPress } from "@/hooks/ui/useLongPress";
import { useWatchlistItem, useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/user/useWatchlist";
import { useMangaReadlistItem, useUpsertMangaReadlist, useRemoveFromMangaReadlist } from "@/hooks/user/useMangaReadlist";
import {
  closeMediaQuickPeek,
  getMediaQuickPeekSnapshot,
  openMediaQuickPeek,
  subscribeMediaQuickPeek,
  type QuickPeekMedia,
} from "@/components/media/quickPeekStore";

/**
 * Long-press quick peek — the fast detail widget behind every anime/manga
 * card (docs parity with the manga-reader bottom sheets).
 *
 * Cards call `openMediaQuickPeek(media)` (e.g. from `useLongPress`, or by
 * wrapping in `<Peekable>`); the single `MediaQuickPeekHost` mounted in
 * `MainLayout` renders the sheet. The card's own fields paint instantly;
 * banner, genres + synopsis enrich lazily from the same detail queries the
 * info pages use.
 */

/**
 * Zero-layout wrapper that gives any card the quick peek: hold (touch/mouse)
 * or right-click opens it, and the tap that ends a hold is swallowed so the
 * card never navigates. `display: contents` keeps grid/flex placement on the
 * wrapped card itself. Pass `null` to disable.
 */
export function Peekable({
  media,
  children,
}: {
  media: QuickPeekMedia | null;
  children: ReactNode;
}) {
  const longPress = useLongPress({
    onLongPress: () => {
      if (media) openMediaQuickPeek(media);
    },
    disabled: !media,
  });
  return (
    <div className="contents" {...longPress}>
      {children}
    </div>
  );
}

function stripHtml(value: string): string {
  return value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").trim();
}

export function MediaQuickPeekHost() {
  const peeked = useSyncExternalStore(subscribeMediaQuickPeek, getMediaQuickPeekSnapshot);
  const navigate = useNavigate();
  const { user } = useAuth();
  const open = peeked != null;
  // Retain the last media so the sheet can animate out on close.
  const [shown, setShown] = useState<QuickPeekMedia | null>(null);
  useEffect(() => {
    if (peeked) setShown(peeked);
  }, [peeked]);
  const visible = peeked ?? shown;

  const animeId = visible?.kind === "anime" ? visible.id : undefined;
  const mangaId = visible?.kind === "manga" ? visible.id : undefined;

  // Lazy enrichment — same queries the detail pages use, so results are
  // usually already cached. Disabled until the sheet actually opens.
  const { data: animeInfo, isLoading: animeLoading } = useAnimeInfo(open ? animeId : undefined);
  const { data: mangaResp, isLoading: mangaLoading } = useMangaDetail(open ? mangaId : undefined);
  const mangaDetail = mangaResp?.detail ?? null;

  // Wide banner art: card-supplied first, else AniList (numeric id required).
  // Pure enhancement — failure keeps the blurred-poster header.
  const { data: fetchedBanner } = useMediaBanner(
    visible?.kind,
    visible?.anilistId ?? null,
    open && !visible?.banner,
  );
  const banner = visible?.banner || fetchedBanner || null;

  const { data: watchlistItem, isLoading: watchlistLoading } = useWatchlistItem(open ? animeId : undefined);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const { data: readlistItem, isLoading: readlistLoading } = useMangaReadlistItem(open ? mangaId : undefined);
  const upsertReadlist = useUpsertMangaReadlist();
  const removeFromReadlist = useRemoveFromMangaReadlist();

  // Dismiss on route change (a peek must never survive navigation).
  useEffect(() => {
    if (!open) return;
    return () => closeMediaQuickPeek();
  }, [open]);

  const go = useCallback(
    (to: string) => {
      closeMediaQuickPeek();
      void triggerHaptic("navigate");
      if (/^https?:\/\//i.test(to)) {
        window.open(to, "_blank", "noopener,noreferrer");
        return;
      }
      navigate(to);
    },
    [navigate],
  );

  if (!visible) return null;

  const media = visible;
  const isAnime = media.kind === "anime";
  const { score } = splitRating(media.rating);

  const genres: string[] = isAnime
    ? (animeInfo?.moreInfo?.genres ?? []).slice(0, 5)
    : (mangaDetail?.genres ?? []).slice(0, 5);
  const rawDescription = isAnime
    ? (animeInfo?.info?.description ?? "")
    : (mangaDetail?.synopsis ?? "");
  const description = rawDescription ? stripHtml(rawDescription) : "";
  const detailLoading = isAnime ? animeLoading : mangaLoading;
  const status = media.status || (isAnime ? animeInfo?.moreInfo?.status : mangaDetail?.status) || null;
  const metaLine = [media.type || (isAnime ? "Anime" : "Manga"), status, media.year].filter(Boolean).join(" · ");

  const countLine = isAnime
    ? [media.episodesSub != null && media.episodesSub > 0 ? `${media.episodesSub} episodes` : null]
        .filter(Boolean)
        .join(" · ")
    : media.chapters != null && media.chapters > 0
      ? `${media.chapters} chapters`
      : "";

  const canSave = media.canSave !== false;

  const saved = isAnime ? Boolean(watchlistItem) : Boolean(readlistItem);
  const saveLoading = isAnime
    ? watchlistLoading || addToWatchlist.isPending || removeFromWatchlist.isPending
    : readlistLoading || upsertReadlist.isPending || removeFromReadlist.isPending;

  const toggleSave = async () => {
    if (!user) {
      go("/auth");
      return;
    }
    void triggerHaptic("toggle");
    try {
      if (isAnime) {
        if (watchlistItem) await removeFromWatchlist.mutateAsync(media.id);
        else
          await addToWatchlist.mutateAsync({
            animeId: media.id,
            animeName: media.name,
            animePoster: media.poster,
            status: "plan_to_watch",
          });
      } else {
        if (readlistItem) await removeFromReadlist.mutateAsync({ mangaId: media.id });
        else
          await upsertReadlist.mutateAsync({
            mangaId: media.id,
            mangaTitle: media.name,
            mangaPoster: media.poster,
            status: "plan_to_read",
          });
      }
    } catch {
      /* hook toasts the failure */
    }
  };

  return (
    <PeekSheet open={open} onClose={closeMediaQuickPeek} label={media.name}>
      <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Banner header — real banner art when the row carries (or resolves)
            one, blurred poster otherwise. Same language as the heroes. */}
        {banner ? (
          <div className="relative mb-4 h-32 shrink-0 overflow-hidden" aria-hidden>
            <img
              src={getProxiedImageUrl(banner)}
              alt=""
              className="h-full w-full object-cover object-center"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background" />
          </div>
        ) : (
          <div className="relative mb-4 h-28 shrink-0 overflow-hidden" aria-hidden>
            <img
              src={getProxiedImageUrl(media.poster || "")}
              alt=""
              className="h-full w-full scale-110 object-cover object-top blur-2xl brightness-[0.5] saturate-150"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />
          </div>
        )}

        <div className="px-5">
          <div className="flex gap-4">
            <div className="w-24 shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <img
                src={getProxiedImageUrl(media.poster || "")}
                alt={media.name}
                className="aspect-[3/4] w-full object-cover"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  if (e.currentTarget.src !== `${window.location.origin}/placeholder.svg`)
                    e.currentTarget.src = "/placeholder.svg";
                }}
              />
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <h2 className="font-display text-xl font-black leading-tight tracking-tight text-foreground line-clamp-3">
                {media.name}
              </h2>
              {metaLine ? <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">{metaLine}</p> : null}
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-foreground/80">
                {score ? (
                  <>
                    <Star className="h-3.5 w-3.5 fill-amber text-amber" />
                    {score}
                  </>
                ) : null}
                {score && countLine ? <span className="text-muted-foreground">·</span> : null}
                {countLine ? <span className="text-muted-foreground">{countLine}</span> : null}
                {!score && !countLine ? <span className="text-muted-foreground">Details inside</span> : null}
              </p>
            </div>
          </div>

          {/* Genres — skeleton while the detail query warms up */}
          {detailLoading && genres.length === 0 ? (
            <div className="mt-4 flex gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-8 w-20 animate-pulse rounded-full bg-white/[0.06]" />
              ))}
            </div>
          ) : genres.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[13px] font-medium text-foreground/85"
                >
                  {g}
                </span>
              ))}
            </div>
          ) : null}

          {description ? (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground line-clamp-3">{description}</p>
          ) : null}
        </div>

        {/* Sticky actions — always visible and tappable, even on small phones */}
        <div className="sticky bottom-0 -mb-1 mt-4 border-t border-white/10 bg-background/95 px-5 pb-3 pt-3 backdrop-blur-xl">
          <div className="flex gap-2.5">
            {canSave ? (
              <button
                type="button"
                onClick={toggleSave}
                disabled={saveLoading}
                className={cn(
                  "flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border px-3 text-[15px] font-bold transition-all active:scale-[0.98] disabled:opacity-60",
                  saved
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-white/12 bg-white/[0.06] text-foreground hover:bg-white/[0.1]",
                )}
              >
                {saveLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : saved ? (
                  isAnime ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <BookMarked className="h-5 w-5" />
                  )
                ) : (
                  <Bookmark className="h-5 w-5" />
                )}
                <span className="truncate">{saved ? "Saved" : isAnime ? "Watchlist" : "Bookmark"}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => go(media.routeTo)}
              className="flex h-[52px] min-w-0 flex-[1.2] items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-[15px] font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98]"
            >
              {isAnime ? <Play className="h-5 w-5 fill-primary-foreground" /> : <BookOpen className="h-5 w-5" />}
              <span className="truncate">{isAnime ? "Start watching" : "Start reading"}</span>
            </button>
            <button
              type="button"
              onClick={() => go(media.routeTo)}
              aria-label={`View ${media.name}`}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center gap-0.5 rounded-2xl border border-white/12 bg-white/[0.06] text-[15px] font-bold text-foreground transition-all hover:bg-white/[0.1] active:scale-95"
            >
              <span className="hidden min-[380px]:inline">View</span>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Extra save affordance for anime parity with card hover actions */}
          {canSave && isAnime && !saved ? (
            <button
              type="button"
              onClick={toggleSave}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-3 py-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Add to watchlist
            </button>
          ) : null}
        </div>
      </div>
    </PeekSheet>
  );
}
