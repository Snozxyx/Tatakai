import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookMarked, Bookmark, BookOpen, Film, Check, Star, Loader2, RefreshCw } from "lucide-react";
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
import { useNovelDetail } from '@/hooks/api/useNovelData';
import { selectReadingTitle } from '@/lib/titleLanguage';
import { usePreferredReadingTitleLanguage } from '@/hooks/ui/useTitleLanguage';
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
    <div data-quick-peek-trigger={media?.kind} className="contents" {...longPress} onContextMenuCapture={event => {
      if (!media) return;
      longPress.onContextMenu(event);
      if (!event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation(); openMediaQuickPeek(media);
      }
    }}>
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
  const location = useLocation();
  const readingTitleLanguage = usePreferredReadingTitleLanguage();
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
  // Keep novel identity and its detail adapter separate from manga library writes.

  // Lazy enrichment — same queries the detail pages use, so results are
  // usually already cached. Disabled until the sheet actually opens.
  const { data: animeInfo, isLoading: animeLoading, isFetching: animeFetching, isError: animeError, refetch: retryAnime } = useAnimeInfo(open ? animeId : undefined);
  const { data: mangaResp, isLoading: mangaLoading, isFetching: mangaFetching, isError: mangaError, refetch: retryManga } = useMangaDetail(open ? mangaId : undefined);
  const novel = useNovelDetail(open ? novelId : undefined);
  const mangaDetail = (novelId ? novel.data?.detail : mangaResp?.detail) ?? null;

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
  useEffect(() => { closeMediaQuickPeek(); }, [location.key]);

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

  const media = {
    ...visible,
    name: visible.kind === 'anime'
      ? (visible.enrichIdentity ? animeInfo?.info?.name : visible.name) || visible.name
      : selectReadingTitle(mangaDetail, readingTitleLanguage) || visible.name,
    poster: visible.poster || (visible.kind === 'anime' ? animeInfo?.info?.poster : mangaDetail?.coverImage) || '',
  };
  const isAnime = media.kind === "anime";
  const { score } = splitRating(media.rating ?? (mangaDetail?.score ? mangaDetail.score / 10 : undefined));

  const genres: string[] = isAnime
    ? (animeInfo?.moreInfo?.genres ?? []).slice(0, 5)
    : (mangaDetail?.genres ?? []).slice(0, 5);
  const rawDescription = isAnime
    ? (animeInfo?.info?.description ?? "")
    : (mangaDetail?.synopsis ?? "");
  const description = rawDescription ? stripHtml(rawDescription) : "";
  const detailLoading = isAnime ? animeLoading : novelId ? novel.isLoading : mangaLoading;
  const detailFetching = isAnime ? animeFetching : novelId ? novel.isFetching : mangaFetching;
  const detailError = isAnime ? animeError : novelId ? novel.isError : mangaError;
  const status = media.status || (isAnime ? animeInfo?.moreInfo?.status : mangaDetail?.status) || null;
  const metaLine = [media.type || (isAnime ? "Anime" : media.kind === "novel" ? "Novel" : "Manga"), status, media.year].filter(Boolean).join(" · ");

  const chapterCount = media.chapters ?? mangaDetail?.totalChapters;
  const countLine = isAnime
    ? media.episodesSub != null && media.episodesSub > 0 ? uiI18n.t('quickView.episodes', { count: media.episodesSub }) : ''
    : chapterCount != null && chapterCount > 0 ? uiI18n.t('quickView.chapters', { count: chapterCount }) : '';

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
      if (getMediaQuickPeekSnapshot()?.id === savingId && getMediaQuickPeekSnapshot()?.kind === savingKind) setSaveMessage(uiI18n.t(saved ? 'quickView.removed' : 'quickView.saved'));
    } catch {
      if (getMediaQuickPeekSnapshot()?.id === savingId && getMediaQuickPeekSnapshot()?.kind === savingKind) { setSaveFailed(true); setSaveMessage(uiI18n.t('quickView.saveFailed')); }
    } finally {
      saving.current = false;
    }
  };

  const detailsRoute = /^\/(?:anime|manga|novel)\/[^/]+(?:[?#].*)?$/.test(media.routeTo);
  const actionLabel = uiI18n.t(detailsRoute ? 'quickView.openDetails' : /^https?:/i.test(media.routeTo)
    ? 'app.open_cf9b7706' : isAnime ? 'quickView.continueWatching' : 'quickView.continueReading');

  const actions = (
    <div className="peek-actions border-t border-border bg-background px-5 py-4 md:px-6">
      <div className="flex gap-3">
        {canSave && <button type="button" onClick={toggleSave} disabled={saveLoading} aria-busy={saveLoading} aria-pressed={saved}
          className={cn('peek-action ui-button flex h-12 min-w-0 flex-1 items-center justify-center gap-2 border px-3 text-sm font-medium disabled:opacity-60',
            saved ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted/30 text-foreground hover:bg-muted/60')}>
          {saveLoading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : saved
            ? isAnime ? <Check aria-hidden className="ui-save-check size-4" /> : <BookMarked aria-hidden className="ui-save-check size-4" />
            : <Bookmark aria-hidden className="size-4" />}
          <span className="truncate">{saved ? uiI18n.t('app.saved_c0ae8f6e') : isAnime ? uiI18n.t('app.watchlist_48a616d9') : uiI18n.t('app.bookmark_441da1bf')}</span>
        </button>}
        <button type="button" onClick={() => go(media.routeTo)}
          className="peek-action ui-button flex h-12 min-w-0 flex-[1.2] items-center justify-center gap-2 bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {isAnime ? <Film aria-hidden className="size-4" /> : <BookOpen aria-hidden className="size-4" />}
          <span className="truncate">{actionLabel}</span>
        </button>
      </div>
      {canSave && (saveLoading || saveMessage) && <p role="status" className={cn('mt-3 text-center text-xs', saveFailed ? 'text-destructive' : 'text-muted-foreground')}>
        {saveLoading ? uiI18n.t('app.updating_your_list_f716f24d') : saveMessage}
        {saveFailed && <button type="button" onClick={toggleSave} className="ml-2 min-h-8 rounded px-1 font-medium underline underline-offset-4">{uiI18n.t('app.retry_9f5cd8a2')}</button>}
      </p>}
    </div>
  );

  return (
    <PeekSheet open={open} onClose={closeMediaQuickPeek} label={media.name} footer={actions}>
      {banner && <div className="relative h-28 overflow-hidden bg-muted md:h-36" aria-hidden>
        <img src={getProxiedImageUrl(banner)} alt="" className="h-full w-full object-cover object-center" decoding="async" referrerPolicy="no-referrer"
          onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      </div>}
      <div className={cn('peek-summary relative grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-4 px-5 pb-6 md:grid-cols-[144px_minmax(0,1fr)] md:gap-x-6 md:px-6', banner ? '-mt-8' : 'pt-12')}>
        <div className="row-start-1 self-start overflow-hidden rounded-xl border border-border bg-muted md:row-span-2">
          <img src={getProxiedImageUrl(media.poster || '')} alt="" className="aspect-[2/3] w-full object-cover" decoding="async"
            onError={event => { if (event.currentTarget.src !== `${window.location.origin}/placeholder.svg`) event.currentTarget.src = '/placeholder.svg'; }} />
        </div>
        <div className={cn('col-start-2 min-w-0', banner && 'pt-10')}>
          <h2 className="break-words font-display text-2xl font-semibold leading-[1.15] text-foreground md:text-[28px]">{media.name}</h2>
          {metaLine && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{metaLine}</p>}
          {(score || countLine) && <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] tabular-nums">
            {score && <span className="inline-flex items-center gap-1 font-medium text-foreground"><Star aria-hidden className="size-3.5 fill-amber text-amber" />{score}</span>}
            {score && countLine && <span aria-hidden className="text-muted-foreground">·</span>}
            {countLine && <span className="text-muted-foreground">{countLine}</span>}
          </p>}
        </div>
        <div className="peek-details col-span-2 min-w-0 md:col-span-1 md:col-start-2" aria-busy={detailLoading || detailFetching}>
          {detailLoading && !genres.length ? <div className="flex gap-2" aria-hidden>
            {[0, 1, 2].map(index => <span key={index} className="h-5 w-16 animate-pulse rounded bg-muted" />)}
          </div> : genres.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-medium text-foreground/80">
            {genres.map(genre => <span key={genre} className="border-b border-border pb-1">{genre}</span>)}
          </div>}
          {detailLoading && !description ? <div className="mt-4 space-y-2" role="status">
            <span className="sr-only">{uiI18n.t('app.loading_details_d6b61171')}</span>
            {[100, 95, 70].map(width => <div key={width} aria-hidden className="h-3 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />)}
          </div> : description ? <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-muted-foreground md:line-clamp-5">{description}</p>
            : !detailError && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{uiI18n.t('app.no_synopsis_available_you_can_still_open_the_ful_551403cf')}</p>}
          {detailError && <div role="status" className="mt-4 rounded-xl border border-border bg-muted/25 p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">{uiI18n.t('app.additional_details_couldn_t_load_ef5d3db2')}</p>
            <button type="button" disabled={detailFetching} onClick={() => { void (isAnime ? retryAnime() : novelId ? novel.refetch() : retryManga()); }}
              className="ui-button mt-1 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-primary disabled:opacity-60">
              <RefreshCw aria-hidden className={cn('size-3.5', detailFetching && 'animate-spin')} />
              {detailFetching ? uiI18n.t('app.retrying_2310131b') : uiI18n.t('app.retry_details_2d9fbf10')}
            </button>
          </div>}
        </div>
      </div>
    </PeekSheet>
  );
}
