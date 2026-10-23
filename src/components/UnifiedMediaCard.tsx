import { TatakaiReadingViews } from '@/components/media/TatakaiReadingViews';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * The card behind the manga surfaces, search results and the anime page's
 * related rails (docs/Plans.md §2 — "Cards (improve polish and consistency)").
 *
 * Navigation is a real anchor stretched over the poster rather than an `onClick`
 * on the panel: the panel is a `div`, so the old version was unreachable by
 * keyboard, announced as nothing to a screen reader, and could not be
 * ctrl/middle-clicked into a new tab. The badges and the rating split are shared
 * with `AnimeCardWithPreview` so the two agree.
 */
import { Star, BookOpen, Film, Play } from "lucide-react";
import { memo } from "react";

import { MediaCardFrame } from "@/components/MediaCardFrame";
import { getProxiedImageUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { splitRating } from "@/lib/mediaRating";
import { AdultBadge, ScoreBadge, MetaBadge } from "@/components/MediaCardBadges";
import { useMediaCardStyle } from '@/hooks/ui/useMediaCardStyle';
import { useLongPress } from "@/hooks/ui/useLongPress";
import { openMediaQuickPeek, type QuickPeekMedia } from "@/components/media/quickPeekStore";
import { useHoverPreview } from '@/hooks/useHoverPreview';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Loader2 } from 'lucide-react';
import { resolveTatakaiAnimeViewId, TatakaiAnimeViews } from '@/components/media/TatakaiAnimeViews';

export interface UnifiedMediaCardProps {
  item: {
    id: string; // The specific ID used for routing (malId, anilistId, or pure string id)
    name: string;
    poster: string;
    banner?: string;
    logo?: string;
    titleLogo?: string;
    description?: string;
    type?: string;
    status?: string;
    rating?: string | number;
    episodes?: { sub?: number; dub?: number }; // For anime
    chapters?: number; // For manga
    year?: number;
    mediaType: 'anime' | 'manga' | 'novel' | 'character';
    malId?: number;
    anilistId?: number;
    href?: string;
    isAdult?: boolean;
    blurAdult?: boolean;
  };
  variant?: 'poster' | 'overlay';
  rank?: number;
  className?: string;
  /**
   * `'none'` suppresses the card's own corner badges (overlay media-type pill
   * + status pill). Used when a wrapper paints its own coordinated badge row
   * in the same corners — rendering both stacks the pills on top of each
   * other. Everything else (poster, metadata, score) stays identical.
   */
  topBadges?: 'auto' | 'none';
}

/** Normalize a manga `type` into its display label ("manhwa", "comics", …). */
function mangaFormatLabel(type?: string | null, mediaType = 'manga'): string {
  if (mediaType !== 'manga' && mediaType !== 'novel') return mediaType;
  const normalized = String(type || mediaType || 'manga').trim().toLowerCase();
  if (normalized === 'manwha' || normalized === 'manwah') return uiI18n.t('app.manhwa_348a38ef');
  if (normalized === 'comic' || normalized === 'oel') return uiI18n.t('app.comics_6d6af0b1');
  if (!normalized) return uiI18n.t('app.manga_1c404c69');
  return normalized;
}

export const UnifiedMediaCard = memo(function UnifiedMediaCard({ item, variant, rank, className = "", topBadges = 'auto' }: UnifiedMediaCardProps) {
  useUiTranslation();
  const isAnime = item.mediaType === 'anime';
  const isManga = item.mediaType === 'manga';
  const isNovel = (item.mediaType as string) === 'novel';
  const isCharacter = item.mediaType === 'character';
  const isAdultItem = Boolean(item.isAdult);
  const shouldBlurAdult = Boolean(isAdultItem && item.blurAdult);
  const { score, label } = splitRating(item.rating);
  const { style } = useMediaCardStyle();
  const overlay = (variant || style) === 'overlay';
  const mobile = useIsMobile();
  const previewEnabled = isAnime && !mobile;
  const preview = useHoverPreview({ anilistId: item.anilistId, malId: item.malId, title: item.name, enabled: previewEnabled && !shouldBlurAdult });
  const animeViewId = isAnime ? resolveTatakaiAnimeViewId(item.id, item.anilistId) : undefined;
  // Phones: no hover states exist, so drop the GPU-heavy hover overlays,
  // backdrop-blurs and transitions entirely (big scroll win on long grids).

  const mediaBadgeLabel = isManga || isNovel
    ? mangaFormatLabel(item.type, item.mediaType)
    : item.mediaType;

  /**
   * An off-site `href` stays an external anchor; everything else routes. A card
   * with no id at all gets no link rather than a dead one that navigates to the
   * current page.
   */
  const routeTo = (() => {
    if (item.href) return item.href;
    if (isAnime) return `/anime/${encodeURIComponent(item.id)}`;
    if (isManga) return `/manga/${encodeURIComponent(item.id)}`;
    if (isNovel) return `/novel/${encodeURIComponent(item.id)}`;
    if (isCharacter) {
      const characterRouteId = item.id || item.name;
      return characterRouteId ? `/char/${encodeURIComponent(characterRouteId)}` : null;
    }
    return null;
  })();

  // Long-press quick peek — card fields paint instantly, genres/synopsis
  // enrich lazily inside the sheet. Characters have no peek target.
  const peekMedia: QuickPeekMedia | null =
    !isCharacter && routeTo
      ? {
          kind: isAnime ? "anime" : isNovel ? "novel" : "manga",
          id: item.id,
          name: item.name,
          poster: item.poster,
          anilistId: item.anilistId ?? null,
          type: isManga || isNovel ? mediaBadgeLabel : item.type,
          status: item.status,
          year: item.year,
          rating: item.rating,
          episodesSub: item.episodes?.sub,
          episodesDub: item.episodes?.dub,
          chapters: item.chapters,
          routeTo,
        }
      : null;
  const longPress = useLongPress({
    onLongPress: () => {
      if (peekMedia) openMediaQuickPeek(peekMedia);
    },
    disabled: !peekMedia,
  });

  return <MediaCardFrame title={item.name} href={routeTo} variant={variant} className={className} {...longPress}
    onMouseEnter={previewEnabled ? preview.onEnter : undefined} onMouseLeave={previewEnabled ? preview.onLeave : undefined}
    poster={<><img src={getProxiedImageUrl(item.poster || '')} alt="" aria-hidden loading="lazy" decoding="async" fetchPriority="low"
      className={cn('media-card-image h-full w-full object-cover object-top', preview.isActive && !shouldBlurAdult && 'opacity-0', shouldBlurAdult && 'blur-md scale-105')}
      onError={event => {
        const image = event.currentTarget;
        const stage = image.dataset.fallbackStage || 'proxy';
        if (stage === 'proxy' && item.poster && image.currentSrc !== item.poster) {
          image.dataset.fallbackStage = 'direct'; image.src = item.poster; return;
        }
        if (stage !== 'placeholder') { image.dataset.fallbackStage = 'placeholder'; image.src = '/placeholder.svg'; }
      }} />
      {previewEnabled && !shouldBlurAdult && <video ref={preview.videoRef} preload="none" muted loop playsInline crossOrigin="anonymous" onError={preview.onError}
        className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-150', preview.isActive ? 'opacity-100' : 'opacity-0')} />}
      {preview.isLoading && <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
      {preview.unavailable && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"><span className="rounded-lg bg-black/75 px-3 py-2 text-xs text-white">{uiI18n.t('app.preview_unavailable_36d31d45')}</span></div>}
      {!preview.isLoading && !preview.unavailable && !preview.isActive && <div aria-hidden className="media-card-preview media-card-open pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/90 text-primary-foreground">{isManga || isNovel ? <BookOpen className="h-6 w-6" /> : isCharacter ? <Star className="h-6 w-6" /> : <Play className="ml-1 h-6 w-6" />}</span>
      </div>}
    </>}
    badges={<>
      {rank !== undefined && <span className="absolute left-2 top-2 z-20 rounded-lg bg-black/75 px-2 py-1 text-xs font-semibold tabular-nums text-white" aria-label={uiI18n.t('app.rank_i18n_value_0_f4f41943', { value0: rank })}>#{rank}</span>}
      {isAdultItem && <AdultBadge className={cn('absolute left-2 z-20', rank !== undefined ? 'top-10' : 'top-2')} />}
      {shouldBlurAdult && <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50"><span className="rounded-full bg-black/80 px-3 py-1 text-xs font-semibold text-white">{uiI18n.t('app.sensitive_preview_16bb7f14')}</span></div>}
      {overlay && topBadges !== 'none' && <span className={cn('absolute left-2 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white', rank !== undefined || isAdultItem ? 'top-10' : 'top-2')}>
        {isManga || isNovel ? <BookOpen aria-hidden className="h-3 w-3" /> : isAnime ? <Film aria-hidden className="h-3 w-3" /> : <Star aria-hidden className="h-3 w-3" />}{mediaBadgeLabel}
      </span>}
      {overlay && topBadges !== 'none' && item.status && !isCharacter && !isAdultItem && <span className="absolute right-2 top-2 z-20 max-w-[60%] truncate rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/85">{item.status}</span>}
      {!overlay && score && <span className="media-card-score absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-lg bg-black/75 px-2 py-1 text-xs font-semibold text-white"><Star aria-hidden className="h-3 w-3 fill-amber text-amber" />{score}</span>}
    </>}
    metadata={overlay ? <div className="flex flex-wrap items-center gap-2">
      {score && <ScoreBadge score={score} />}{label && <MetaBadge className="text-white/85">{label}</MetaBadge>}
      {isAnime && !!item.episodes?.sub && <MetaBadge className="text-white/85">{item.episodes.sub} {uiI18n.t('app.sub_5d85613a')} {item.episodes.dub ? uiI18n.t('app.i18n_value_0_dub_f85b5df5', { value0: item.episodes.dub }) : ''}</MetaBadge>}
      {(isManga || isNovel) && !!item.chapters && <MetaBadge className="text-white/85">{item.chapters} {uiI18n.t('app.ch_482bd64c')}</MetaBadge>}
      {(isManga||isNovel)&&<TatakaiReadingViews kind={isNovel?"novel":"manga"} id={item.id} anilistId={item.anilistId}/>}
      {animeViewId && <TatakaiAnimeViews animeId={animeViewId} className="text-white/85" />}
    </div> : <div className="flex flex-wrap items-center gap-x-1.5">
      <span className="capitalize">{isAnime ? item.type || uiI18n.t('app.anime_f1b32a19') : mediaBadgeLabel}</span>
      {item.year && <span>· {item.year}</span>}
      {(isManga || isNovel) && !!item.chapters && <span>· {item.chapters} {uiI18n.t('app.ch_482bd64c')}</span>}
      {isAnime && !!item.episodes?.sub && <span>· {item.episodes.sub} {uiI18n.t('app.sub_5d85613a')}</span>}
      {isAnime && !!item.episodes?.dub && <span>· {item.episodes.dub} {uiI18n.t('app.dub_1ca4b285')}</span>}
      {label && <span>· {label}</span>}
      {item.status && !isCharacter && <span>· {item.status}</span>}
      {(isManga||isNovel)&&<TatakaiReadingViews kind={isNovel?"novel":"manga"} id={item.id} anilistId={item.anilistId}/>}
      {animeViewId && <TatakaiAnimeViews animeId={animeViewId} />}
    </div>} />;
});
