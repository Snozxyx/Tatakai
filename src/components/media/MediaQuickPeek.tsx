import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, Bookmark, BookOpen, ChevronRight, Play, Plus, Check, Star, Loader2, RefreshCw } from "lucide-react";
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
import { useNovelReadlistItem, useUpsertNovelReadlist, useRemoveFromNovelReadlist } from "@/hooks/user/useNovelReadlist";
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
  useUiTranslation();
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
  useUiTranslation();
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
  const novelId = visible?.kind === "novel" ? visible.id : undefined;
  // Novels share the manga catalog (AniList MANGA/NOVEL), so detail enrichment
  // reuses the manga query — only the library write targets the novel track.

  // Lazy enrichment — same queries the detail pages use, so results are
  // usually already cached. Disabled until the sheet actually opens.
  const { data: animeInfo, isLoading: animeLoading, isFetching: animeFetching, isError: animeError, refetch: retryAnime } = useAnimeInfo(open ? animeId : undefined);
  const { data: mangaResp, isLoading: mangaLoading, isFetching: mangaFetching, isError: mangaError, refetch: retryManga } = useMangaDetail(open ? (mangaId ?? novelId) : undefined);
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
  const { data: novelItem, isLoading: novelLoading } = useNovelReadlistItem(open ? novelId : undefined);
  const upsertNovel = useUpsertNovelReadlist();
  const removeNovel = useRemoveFromNovelReadlist();
  const saving = useRef(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => { setSaveMessage(''); setSaveFailed(false); }, [visible?.id, visible?.kind]);

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
  const detailFetching = isAnime ? animeFetching : mangaFetching;
  const detailError = isAnime ? animeError : mangaError;
  const status = media.status || (isAnime ? animeInfo?.moreInfo?.status : mangaDetail?.status) || null;
  const metaLine = [media.type || (isAnime ? "Anime" : media.kind === "novel" ? "Novel" : "Manga"), status, media.year].filter(Boolean).join(" · ");

  const countLine = isAnime
    ? [media.episodesSub != null && media.episodesSub > 0 ? `${media.episodesSub} episodes` : null]
        .filter(Boolean)
        .join(" · ")
    : media.chapters != null && media.chapters > 0
      ? `${media.chapters} chapters`
      : "";

  const canSave = media.canSave !== false;
  const isNovel = media.kind === "novel";

  const saved = isAnime ? Boolean(watchlistItem) : isNovel ? Boolean(novelItem) : Boolean(readlistItem);
  const saveLoading = isAnime
    ? watchlistLoading || addToWatchlist.isPending || removeFromWatchlist.isPending
    : isNovel
      ? novelLoading || upsertNovel.isPending || removeNovel.isPending
      : readlistLoading || upsertReadlist.isPending || removeFromReadlist.isPending;

  const toggleSave = async () => {
    if (saveLoading || saving.current) return;
    if (!user) {
      go("/auth");
      return;
    }
    void triggerHaptic("toggle");
    saving.current = true;
    setSaveMessage(''); setSaveFailed(false);
    const savingId = media.id;
    const savingKind = media.kind;
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
      } else if (isNovel) {
        if (novelItem) await removeNovel.mutateAsync({ novelId: media.id });
        else
          await upsertNovel.mutateAsync({
            novelId: media.id,
            novelTitle: media.name,
            novelPoster: media.poster,
            status: "plan_to_read",
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
      if (getMediaQuickPeekSnapshot()?.id === savingId && getMediaQuickPeekSnapshot()?.kind === savingKind) setSaveMessage(saved ? 'Removed from your list.' : 'Saved to your list.');
    } catch {
      if (getMediaQuickPeekSnapshot()?.id === savingId && getMediaQuickPeekSnapshot()?.kind === savingKind) { setSaveFailed(true); setSaveMessage('Couldn’t update your list. Try again.'); }
    } finally {
      saving.current = false;
    }
  };

  return (
    <PeekSheet open={open} onClose={closeMediaQuickPeek} label={media.name}>
      <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Banner header — real banner art when the row carries (or resolves)
            one, blurred poster otherwise. Same language as the heroes. */}
        {banner ? (
          <div className="relative mb-4 h-28 shrink-0 overflow-hidden" aria-hidden>
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
            <div className="w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
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
                {!score && !countLine ? <span className="text-muted-foreground">{uiI18n.t('app.details_inside_293f9a1b')}</span> : null}
              </p>
            </div>
          </div>

          <div className="peek-details mt-4 min-h-[160px]" aria-busy={detailLoading || detailFetching}>
          {detailLoading && genres.length === 0 ? (
            <div className="flex min-h-8 flex-wrap gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-8 w-20 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
          ) : genres.length > 0 ? (
            <div className="flex min-h-8 flex-wrap gap-2">
              {genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-border bg-muted/60 px-3 py-1 text-[13px] font-medium text-foreground"
                >
                  {g}
                </span>
              ))}
            </div>
          ) : null}

          {detailLoading && !description ? <div className="mt-3 space-y-2" aria-label={uiI18n.t('app.loading_details_448da065')} role="status">
            <span className="sr-only">{uiI18n.t('app.loading_details_d6b61171')}</span>
            {[100, 95, 70].map(width => <div key={width} aria-hidden className="h-3 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />)}
          </div> : description ? (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground line-clamp-3">{description}</p>
          ) : !detailError ? <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{uiI18n.t('app.no_synopsis_available_you_can_still_open_the_ful_551403cf')}</p> : null}
          {detailError && <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">{uiI18n.t('app.additional_details_couldn_t_load_ef5d3db2')}</p>
            <button type="button" disabled={detailFetching} onClick={() => { void (isAnime ? retryAnime() : retryManga()); }}
              className="ui-button inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-primary disabled:opacity-60">
              <RefreshCw aria-hidden className={cn('h-3.5 w-3.5', detailFetching && 'animate-spin')} />{detailFetching ? uiI18n.t('app.retrying_2310131b') : uiI18n.t('app.retry_details_2d9fbf10')}
            </button>
          </div>}
          </div>
        </div>

        {/* Sticky actions — always visible and tappable, even on small phones */}
        <div className="sticky bottom-0 -mb-1 mt-4 border-t border-border bg-background/95 px-5 pb-3 pt-3 backdrop-blur-xl">
          <div className="flex gap-2.5">
            {canSave ? (
              <button
                type="button"
                onClick={toggleSave}
                disabled={saveLoading}
                aria-busy={saveLoading}
                aria-pressed={saved}
                className={cn(
                  "ui-button flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border px-3 text-[15px] font-semibold transition-[background-color,border-color,color,transform] motion-safe:active:scale-[0.98] disabled:opacity-60",
                  saved
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted/50 text-foreground hover:bg-muted",
                )}
              >
                {saveLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : saved ? (
                  isAnime ? (
                    <Check className="ui-save-check h-5 w-5" />
                  ) : (
                    <BookMarked className="ui-save-check h-5 w-5" />
                  )
                ) : (
                  <Bookmark className="h-5 w-5" />
                )}
                <span className="truncate">{saved ? uiI18n.t('app.saved_c0ae8f6e') : isAnime ? uiI18n.t('app.watchlist_48a616d9') : uiI18n.t('app.bookmark_441da1bf')}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => go(media.routeTo)}
              className="ui-button flex h-[52px] min-w-0 flex-[1.2] items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-[15px] font-semibold text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 motion-safe:active:scale-[0.98]"
            >
              {isAnime ? <Play className="h-5 w-5 fill-primary-foreground" /> : <BookOpen className="h-5 w-5" />}
              <span className="truncate">{isAnime ? uiI18n.t('app.start_watching_da441255') : uiI18n.t('app.start_reading_9cc0a0cb')}</span>
            </button>
            <button
              type="button"
              onClick={() => go(media.routeTo)}
              aria-label={uiI18n.t('app.view_i18n_value_0_06355651', { value0: media.name })}
              className="ui-button flex h-[52px] w-[52px] shrink-0 items-center justify-center gap-0.5 rounded-2xl border border-border bg-muted/50 text-[15px] font-semibold text-foreground transition-[background-color,transform] hover:bg-muted motion-safe:active:scale-[.97]"
            >
              <span className="hidden min-[380px]:inline">{uiI18n.t('app.view_69bd4ef9')}</span>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          {canSave && <p role="status" className={cn('mt-2 min-h-5 text-center text-xs', saveFailed ? 'text-destructive' : 'text-muted-foreground')}>
            {saveLoading ? uiI18n.t('app.updating_your_list_f716f24d') : saveMessage}
            {saveFailed && <button type="button" onClick={toggleSave} className="ml-2 rounded px-1 font-semibold underline underline-offset-4">{uiI18n.t('app.retry_9f5cd8a2')}</button>}
          </p>}

          {/* Extra save affordance for anime parity with card hover actions */}
          {canSave && isAnime && !saved ? (
            <button
              type="button"
              onClick={toggleSave}
              disabled={saveLoading}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-3 py-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> {uiI18n.t('app.add_to_watchlist_c1adf59b')}
            </button>
          ) : null}
        </div>
      </div>
    </PeekSheet>
  );
}
