import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { Play, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

import { GlassPanel } from '@/components/ui/GlassPanel';
import type { AnimeCard } from '@/types/anime';
import { getHighQualityPoster } from '@/lib/api';
import { useTheme } from '@/hooks/ui/useTheme';
import { buildPreferredAnimeRouteId } from '@/lib/animeIdMapping';
import { BlurhashImage } from '@/components/ui/blurhash-image';
import { FeatureFlag, useFeatureFlag } from '@/core/feature-flags';

const GAP_PX = 16; // gap-4 in AnimeGrid

interface VirtualAnimeGridProps {
  animes: AnimeCard[];
  title?: string;
  icon?: React.ReactNode;
  /** When true, removes the extra bottom margin used on section-based grids. */
  compact?: boolean;
}

interface MemoizedAnimeCardProps {
  anime: AnimeCard;
  isUltraLite: boolean;
  blurhashEnabled: boolean;
  measureRef?: React.RefObject<HTMLDivElement | null>;
  onClick: (anime: AnimeCard) => void;
}

const MemoizedAnimeCard = memo(({ anime, isUltraLite, blurhashEnabled, measureRef, onClick }: MemoizedAnimeCardProps) => {
  const posterSrc = getHighQualityPoster(anime.poster, anime.anilistId);

  return (
    <GlassPanel
      hoverEffect={!isUltraLite}
      className="group cursor-pointer overflow-hidden h-full"
      onClick={() => onClick(anime)}
    >
      <div ref={measureRef} className="relative aspect-[3/4]">
        {blurhashEnabled ? (
          <BlurhashImage
            src={posterSrc}
            alt={anime.name}
            loading="lazy"
            decoding="async"
            blurhash={(anime as any).blurhash ?? undefined}
            imgClassName={`w-full h-full object-cover object-top ${!isUltraLite ? 'transition-transform duration-500 group-hover:scale-110' : ''}`}
          />
        ) : (
          <img
            src={posterSrc}
            alt={anime.name}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover object-top ${!isUltraLite ? 'transition-transform duration-500 group-hover:scale-110' : ''}`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        {anime.type && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-primary/80 text-primary-foreground text-xs font-bold">
            {anime.type}
          </div>
        )}

        {anime.rating && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md bg-background/80 backdrop-blur text-xs font-bold">
            <Star className="w-3 h-3 fill-amber text-amber" />
            {anime.rating}
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-foreground/90 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-background text-background ml-0.5" />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h4 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {anime.name}
          </h4>
          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
            {anime.episodes?.sub && <span>SUB {anime.episodes.sub}</span>}
            {anime.episodes?.dub > 0 && <span>• DUB {anime.episodes.dub}</span>}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
});

MemoizedAnimeCard.displayName = 'MemoizedAnimeCard';

export function VirtualAnimeGrid({ animes, title, icon, compact = false }: VirtualAnimeGridProps) {
  const navigate = useNavigate();
  const { isUltraLite } = useTheme();
  const blurhashEnabled = useFeatureFlag(FeatureFlag.BLURHASH_IMAGES);

  const firstCardRef = useRef<HTMLDivElement | null>(null);

  // Responsive columns calculation
  const [columns, setColumns] = useState(2);

  useLayoutEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth >= 1024) setColumns(6);
      else if (window.innerWidth >= 768) setColumns(4);
      else setColumns(2);
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  const [cardHeight, setCardHeight] = useState<number>(420);

  useLayoutEffect(() => {
    if (!firstCardRef.current) return;
    const rect = firstCardRef.current.getBoundingClientRect();
    if (rect.height > 0) {
      setCardHeight(Math.ceil(rect.height));
    }
  }, [columns, animes.length]);

  const rowHeight = useMemo(() => cardHeight + GAP_PX, [cardHeight]);
  const rowCount = useMemo(() => Math.ceil(animes.length / columns), [animes.length, columns]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 10,
    getScrollElement: () => document.scrollingElement as HTMLElement | null,
  });

  const handleCardClick = React.useCallback((anime: AnimeCard) => {
    const routeAnimeId = buildPreferredAnimeRouteId({
      id: anime.id,
      name: anime.name,
      malId: anime.malId,
      malID: (anime as any)?.malID,
      mal_id: (anime as any)?.mal_id,
      anilistId: anime.anilistId,
      anilistID: (anime as any)?.anilistID,
      anilist_id: (anime as any)?.anilist_id,
      tatakaiId: (anime as any)?.tatakaiId,
      tatakai_id: (anime as any)?.tatakai_id,
    });

    if (routeAnimeId) {
      navigate(`/anime/${routeAnimeId}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(anime.name)}`);
    }
  }, [navigate]);

  return (
    <section className={compact ? "w-full" : "mb-24 w-full"}>
      {title && (
        <div className="flex items-center justify-between mb-8 px-2">
          <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            {icon}
            {title}
          </h3>
        </div>
      )}

      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowIndex = virtualRow.index;
          const rowStart = rowIndex * columns;

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                height: rowHeight,
                paddingBottom: GAP_PX,
              }}
            >
              <div
                className="grid h-full"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: GAP_PX,
                }}
              >
                {Array.from({ length: columns }).map((_, colIdx) => {
                  const animeIndex = rowStart + colIdx;
                  const anime = animes[animeIndex];

                  if (!anime) return <div key={`empty-${rowIndex}-${colIdx}`} />;

                  return (
                    <MemoizedAnimeCard
                      key={anime.id}
                      anime={anime}
                      isUltraLite={isUltraLite}
                      blurhashEnabled={blurhashEnabled}
                      measureRef={animeIndex === 0 ? firstCardRef : undefined}
                      onClick={handleCardClick}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
