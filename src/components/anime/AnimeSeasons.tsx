import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Link } from 'react-router-dom';
import { useAnimeSeasons } from '@/hooks/api/useAnimeSeasons';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Layers, ChevronRight, ChevronLeft } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromAnime } from '@/components/media/quickPeekStore';

interface AnimeSeasonsProps {
  animeId: string;
  compact?: boolean;
  showTitle?: boolean;
}

export function AnimeSeasons({ animeId, compact = false, showTitle = true }: AnimeSeasonsProps) {
  useUiTranslation();
  const { data: seasons = [], isLoading } = useAnimeSeasons(animeId);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg animate-pulse bg-muted/50",
              compact ? "w-20 h-28" : "w-32 h-44"
            )}
          />
        ))}
      </div>
    );
  }

  // Only show if there are multiple entries in the watch order
  if (seasons.length <= 1) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = compact ? 200 : 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative">
      {showTitle && (
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          {uiI18n.t('app.watch_order_ebe52c88')}{seasons.length})
        </h3>
      )}

      <div className="relative group">
        {/* Scroll buttons */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm shadow-lg"
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide px-1"
        >
          {seasons.map((season) => {
            const isMovie = season.format === 'Movie';
            const isOvaSpecial = season.format === 'OVA' || season.format === 'Special' || season.format === 'ONA';
            const badgeLabel = season.isCurrent
              ? uiI18n.t('app.now_9841c420')
              : isMovie
                ? uiI18n.t('app.movie_83d1753d')
                : isOvaSpecial
                  ? (season.format ?? 'SPECIAL').toUpperCase()
                  : uiI18n.t('app.si18n_value_0_a9453ba1', { value0: season.seasonNumber });

            return (
              <Peekable
                key={season.id}
                media={peekFromAnime(
                  { id: season.id, name: season.name, poster: season.poster },
                  `/anime/${season.id}`,
                )}
              >
              <Link
                to={`/anime/${season.id}`}
                className={cn(
                  "flex-shrink-0 group/item block",
                  compact ? "w-20" : "w-28",
                  season.isCurrent && "pointer-events-none"
                )}
              >
                <div className={cn(
                  "relative rounded-lg overflow-hidden transition-all",
                  compact ? "w-20" : "w-28",
                  season.isCurrent
                    ? "ring-2 ring-primary"
                    : "hover:scale-105 hover:ring-2 hover:ring-primary/50"
                )}>
                  <img
                    src={getProxiedImageUrl(season.poster)}
                    alt={season.name}
                    className="w-full aspect-[2/3] object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {/* Season badge */}
                  <div className={cn(
                    "absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase",
                    season.isCurrent
                      ? "bg-primary text-primary-foreground"
                      : isOvaSpecial || isMovie
                        ? "bg-amber-500/90 text-black"
                        : "bg-black/80 text-white"
                  )}>
                    {badgeLabel}
                  </div>
                  {/* Episode count */}
                  {season.episodeCount && (
                    <div className="absolute bottom-1 left-1 text-[9px] font-bold text-white/90 drop-shadow">
                      {season.episodeCount} {uiI18n.t('app.ep_00c1bff9')}
                    </div>
                  )}
                </div>
                <p className={cn(
                  "mt-2 font-medium line-clamp-2 text-left px-1 whitespace-normal leading-tight break-words",
                  compact ? "text-[10px]" : "text-xs",
                  season.isCurrent ? "text-primary" : "text-foreground/80 group-hover/item:text-primary transition-colors"
                )}>
                  {season.name}
                </p>
                {season.year && (
                  <p className="text-[9px] text-muted-foreground px-1">{season.year}</p>
                )}
              </Link>
              </Peekable>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm shadow-lg"
          onClick={() => scroll('right')}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

// Card version for profile page
interface SeasonCardProps {
  animeId: string;
  animeName: string;
  animePoster: string;
}

export function SeasonCard({ animeId, animeName, animePoster }: SeasonCardProps) {
  useUiTranslation();
  const { data: seasons = [] } = useAnimeSeasons(animeId);

  // Only render if there are multiple entries
  if (seasons.length <= 1) return null;

  const current = seasons.find(s => s.isCurrent);

  return (
    <div className="p-4 rounded-xl bg-muted/30 border border-white/5">
      <div className="flex items-center gap-4 mb-3">
        <img
          src={getProxiedImageUrl(animePoster)}
          alt={animeName}
          className="w-12 h-16 object-cover rounded-lg"
        />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold line-clamp-1">{animeName}</h4>
          <p className="text-sm text-muted-foreground">
            {current
              ? uiI18n.t('app.season_i18n_value_0_of_i18n_value_1_69f68467', { value0: current.seasonNumber, value1: seasons.length })
              : uiI18n.t('app.i18n_value_0_entries_cf6d6f40', { value0: seasons.length })}
          </p>
        </div>
      </div>
      <AnimeSeasons animeId={animeId} compact showTitle={false} />
    </div>
  );
}

