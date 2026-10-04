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
import { Play, BookOpen, Star, Film } from "lucide-react";
import { memo } from "react";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Link } from "react-router-dom";
import { getProxiedImageUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { splitRating } from "@/lib/mediaRating";
import { AdultBadge, MetaBadge, ScoreBadge } from "@/components/MediaCardBadges";
import { useIsMobile } from "@/hooks/ui/use-mobile";

export interface UnifiedMediaCardProps {
  item: {
    id: string; // The specific ID used for routing (malId, anilistId, or pure string id)
    name: string;
    poster: string;
    type?: string;
    status?: string;
    rating?: string | number;
    episodes?: { sub?: number; dub?: number }; // For anime
    chapters?: number; // For manga
    year?: number;
    mediaType: 'anime' | 'manga' | 'character';
    malId?: number;
    anilistId?: number;
    href?: string;
    isAdult?: boolean;
    blurAdult?: boolean;
  };
  variant?: 'poster' | 'overlay';
  className?: string;
}

export const UnifiedMediaCard = memo(function UnifiedMediaCard({ item, variant = 'overlay', className = "" }: UnifiedMediaCardProps) {
  const isMobile = useIsMobile();
  const isAnime = item.mediaType === 'anime';
  const isManga = item.mediaType === 'manga';
  const isCharacter = item.mediaType === 'character';
  const isAdultItem = Boolean(item.isAdult);
  const shouldBlurAdult = Boolean(isAdultItem && item.blurAdult);
  const { score, label } = splitRating(item.rating);
  // Phones: no hover states exist, so drop the GPU-heavy hover overlays,
  // backdrop-blurs and transitions entirely (big scroll win on long grids).

  const getMangaFormatLabel = () => {
    if (!isManga) return item.mediaType;

    const normalized = String(item.type || item.mediaType || "manga").trim().toLowerCase();
    if (normalized === "manwha" || normalized === "manwah") return "manhwa";
    if (normalized === "comic" || normalized === "oel") return "comics";
    if (!normalized) return "manga";
    return normalized;
  };

  const mediaBadgeLabel = getMangaFormatLabel();

  /**
   * An off-site `href` stays an external anchor; everything else routes. A card
   * with no id at all gets no link rather than a dead one that navigates to the
   * current page.
   */
  const isExternal = Boolean(item.href && /^https?:\/\//i.test(item.href));
  const routeTo = (() => {
    if (item.href) return item.href;
    if (isAnime) return `/anime/${encodeURIComponent(item.id)}`;
    if (isManga) return `/manga/${encodeURIComponent(item.id)}`;
    if (isCharacter) {
      const characterRouteId = item.id || item.name;
      return characterRouteId ? `/char/${encodeURIComponent(characterRouteId)}` : null;
    }
    return null;
  })();

  const getBadgeIcon = () => {
    if (isAnime) return <Film className="w-3 h-3" />;
    if (isManga) return <BookOpen className="w-3 h-3" />;
    if (isCharacter) return <Star className="w-3 h-3" />;
    return null;
  };

  const renderMetadata = () => {
    if (isCharacter) return null;

    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {score && <ScoreBadge score={score} />}
        {label && <MetaBadge>{label}</MetaBadge>}

        {isAnime && !!item.episodes?.sub && (
          <MetaBadge>
            {item.episodes.sub} sub {item.episodes.dub ? `• ${item.episodes.dub} dub` : ''}
          </MetaBadge>
        )}

        {isManga && item.chapters != null && item.chapters > 0 && (
          <MetaBadge>{item.chapters} ch</MetaBadge>
        )}
      </div>
    );
  };

  if (variant === 'poster') {
    return (
      <div
        className={cn(
          'group relative flex flex-col md:transition-all md:duration-300',
          routeTo && 'cursor-pointer',
          className
        )}
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] md:transition-all md:duration-300 md:group-hover:border-white/20 md:group-hover:shadow-xl md:group-hover:shadow-black/60 md:group-hover:-translate-y-1">
          <img
            src={getProxiedImageUrl(item.poster || '')}
            alt={item.name}
            className={cn(
              "w-full h-full object-cover object-top md:transition-transform md:duration-500 md:group-hover:scale-105",
              shouldBlurAdult && "blur-md scale-105"
            )}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onError={(event) => {
              const image = event.currentTarget;
              const directPoster = item.poster || '';
              const stage = image.dataset.fallbackStage || 'proxy';

              if (stage === 'proxy' && directPoster && image.currentSrc !== directPoster) {
                image.dataset.fallbackStage = 'direct';
                image.src = directPoster;
                return;
              }

              if (stage !== 'placeholder') {
                image.dataset.fallbackStage = 'placeholder';
                image.src = '/placeholder.svg';
              }
            }}
          />

          {isAdultItem && <AdultBadge className="absolute top-2 right-2 z-20" />}

          {shouldBlurAdult && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
              <span className="rounded-full border border-destructive/40 bg-black/70 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] text-destructive backdrop-blur-sm">
                Sensitive
              </span>
            </div>
          )}

          {item.status && !isCharacter && !isAdultItem && (
            <div className="absolute top-2 right-2 z-10">
              <div className="px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {item.status}
              </div>
            </div>
          )}

          {score && (
            <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
              <Star className="h-2.5 w-2.5 fill-amber text-amber" />
              {score}
            </div>
          )}

          {!isMobile && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}

          {!isMobile && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="w-11 h-11 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 transform scale-75 group-hover:scale-100 transition-transform duration-300 ease-out">
              {isManga ? <BookOpen className="w-5 h-5 ml-0.5" /> : (isCharacter ? <Star className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />)}
            </div>
          </div>
          )}

          {routeTo &&
            (isExternal ? (
              <a
                href={routeTo}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.name}
                className="absolute inset-0 z-30 focus-visible:outline-none"
              />
            ) : (
              <Link
                to={routeTo}
                aria-label={item.name}
                className="absolute inset-0 z-30 focus-visible:outline-none"
              />
            ))}
        </div>

        <div className="mt-2.5 px-0.5 space-y-0.5">
          <h3 className="font-display font-bold text-sm leading-snug line-clamp-1 text-white/90 group-hover:text-white transition-colors">
            {item.name}
          </h3>
          <p className="flex items-center gap-1.5 text-xs font-medium text-white/45">
            <span className="capitalize">{mediaBadgeLabel}</span>
            {item.year && <span>· {item.year}</span>}
            {item.chapters && item.chapters > 0 && <span>· {item.chapters} ch</span>}
            {isAnime && !!item.episodes?.sub && <span>· {item.episodes.sub} sub</span>}
          </p>
        </div>
      </div>
    );
  }

  // Overlay variant — GlassPanel (backdrop-blur) is desktop-only; phones get
  // a plain card with solid overlays so long recommendation grids stay fluid.
  const overlayInner = (
      <div className="relative aspect-[2/3] overflow-hidden" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}>
        <img
          src={getProxiedImageUrl(item.poster || '')}
          alt={item.name}
          className={cn(
            "w-full h-full object-cover object-top md:transition-transform md:duration-500 md:group-hover:scale-110",
            shouldBlurAdult && "blur-md scale-110"
          )}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={(event) => {
            const image = event.currentTarget;
            const directPoster = item.poster || '';
            const stage = image.dataset.fallbackStage || 'proxy';

            if (stage === 'proxy' && directPoster && image.currentSrc !== directPoster) {
              image.dataset.fallbackStage = 'direct';
              image.src = directPoster;
              return;
            }

            if (stage !== 'placeholder') {
              image.dataset.fallbackStage = 'placeholder';
              image.src = '/placeholder.svg';
            }
          }}
        />

        {isAdultItem && <AdultBadge className="absolute top-2 right-2 z-20" />}

        {shouldBlurAdult && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <span className="rounded-full border border-destructive/40 bg-black/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-destructive backdrop-blur-sm">
              Sensitive Preview
            </span>
          </div>
        )}

        {/* Media Type Badge */}
        {item.mediaType && (
          <div className="absolute top-2 left-2 z-10">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              {getBadgeIcon()}
              {mediaBadgeLabel}
            </div>
          </div>
        )}

        {/* Status Badge */}
        {item.status && !isCharacter && !isAdultItem && (
          <div className="absolute top-2 right-2 z-10">
            <div className="px-2 py-1 rounded-full bg-black/60 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {item.status}
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent opacity-80 md:group-hover:opacity-90 md:transition-opacity" />

        {/* Hover Action Overlay — desktop only */}
        {!isMobile && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 transform scale-50 group-hover:scale-100 transition-transform duration-300 ease-out">
            {isManga ? <BookOpen className="w-6 h-6 ml-0.5" /> : (isCharacter ? <Star className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />)}
          </div>
        </div>
        )}

        <div className="absolute bottom-0 w-full p-4 min-h-[80px] flex flex-col justify-end">
          <h3 className="font-display font-bold text-base md:text-lg leading-tight line-clamp-2 text-white">
            {item.name}
          </h3>
          {renderMetadata()}
        </div>

        {/* The link overlays the whole card so the poster is one hit target.
            It has to sit here rather than wrap the title: the title's own
            container is absolutely positioned, so a stretched pseudo-element
            inside it would only cover the bottom bar. */}
        {routeTo &&
          (isExternal ? (
            <a
              href={routeTo}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.name}
              className="absolute inset-0 z-30 focus-visible:outline-none"
            />
          ) : (
            <Link
              to={routeTo}
              aria-label={item.name}
              className="absolute inset-0 z-30 focus-visible:outline-none"
            />
          ))}
      </div>
  );

  if (isMobile) {
    return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] active:scale-[0.99]',
          routeTo && 'cursor-pointer',
          className,
        )}
      >
        {overlayInner}
      </div>
    );
  }

  return (
    <GlassPanel
      className={cn(
        'group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/20 focus-within:ring-2 focus-within:ring-ring',
        routeTo && 'cursor-pointer',
        className,
      )}
    >
      {overlayInner}
    </GlassPanel>
  );
})
