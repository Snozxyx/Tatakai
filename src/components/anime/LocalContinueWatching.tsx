import { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, Play, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getLocalContinueWatching, removeFromLocalContinueWatching, LocalContinueWatchingItem } from '@/lib/localStorage';
import { getProxiedImageUrl } from '@/lib/api';
import { fetchAniZipMapping } from '@/lib/mapping/anizip';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromAnime } from '@/components/media/quickPeekStore';

function formatTimeLeft(remainingSeconds: number) {
  if (remainingSeconds <= 0) return 'Almost finished';

  const minutes = Math.ceil(remainingSeconds / 60);

  if (minutes < 60) return `${minutes}m left`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ''} left`;
}

function resolveAnilistId(animeId: string): number | null {
  const raw = String(animeId || '').trim();
  const prefixed = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (prefixed?.[1]) return Number(prefixed[1]);
  if (/^\d+$/.test(raw)) return Number(raw);
  return null;
}

const LocalContinueCard = memo(function LocalContinueCard({
  item,
  onRemove,
  onOpen,
}: {
  item: LocalContinueWatchingItem;
  onRemove: (e: React.MouseEvent, episodeId: string) => void;
  onOpen: (item: LocalContinueWatchingItem) => void;
}) {
  const progressSeconds = Math.max(0, Number(item.progressSeconds) || 0);
  const durationSeconds = Math.max(0, Number(item.durationSeconds) || 0);
  const percent =
    durationSeconds > 0
      ? Math.min(100, Math.round((progressSeconds / durationSeconds) * 100))
      : null;
  const timeLeft =
    durationSeconds > 0 ? formatTimeLeft(durationSeconds - progressSeconds) : null;

  const anilistId = resolveAnilistId(item.animeId);
  const { data: episodeDetail } = useQuery({
    queryKey: ['local-continue-episode-detail', anilistId ?? item.animeId, item.episodeNumber],
    queryFn: async () => {
      if (!anilistId) return null;
      try {
        const mapping = await fetchAniZipMapping(anilistId);
        return mapping?.byNumber.get(item.episodeNumber) ?? null;
      } catch {
        return null;
      }
    },
    enabled: anilistId != null,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });

  const poster = item.animePoster ? getProxiedImageUrl(item.animePoster) : '/placeholder.svg';
  const thumb = episodeDetail?.image ? getProxiedImageUrl(episodeDetail.image) : poster;
  const epTitle = episodeDetail?.title ?? null;

  return (
    <Peekable
      key={item.episodeId}
      media={peekFromAnime(
        { id: item.animeId, name: item.animeName, poster: item.animePoster },
        `/anime/${item.animeId}`,
      )}
    >
      <div
        data-mobile-poster-card
        className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition-all duration-300 hover:border-primary/40 hover:bg-white/[0.04] active:scale-[0.99]"
        onClick={() => onOpen(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(item);
          }
        }}
      >
        <button
          onClick={(e) => onRemove(e, item.episodeId)}
          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 opacity-90 backdrop-blur-sm transition-all duration-200 hover:border-destructive/50 hover:bg-destructive hover:text-destructive-foreground sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Remove ${item.animeName} from continue watching`}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Landscape episode thumbnail */}
        <div className="relative aspect-video w-full overflow-hidden bg-white/[0.04]">
          <img
            src={thumb}
            alt={epTitle ? `Episode ${item.episodeNumber}: ${epTitle}` : `${item.animeName} episode ${item.episodeNumber}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
            EP {item.episodeNumber}
          </span>
          {timeLeft && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white/85 backdrop-blur-sm">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {timeLeft}
            </span>
          )}

          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
              <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
            </span>
          </span>

          {epTitle && (
            <p className="absolute inset-x-2 bottom-6 line-clamp-1 text-[11px] font-semibold text-white/90 drop-shadow-md">
              {epTitle}
            </p>
          )}

          {percent !== null && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15" aria-hidden="true">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 p-3">
          <img src={poster} alt="" loading="lazy" className="h-10 w-8 shrink-0 rounded-md object-cover" />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-[13px] font-bold leading-tight text-white/90 transition-colors group-hover:text-primary">
              {item.animeName}
            </h3>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-white/50">
              <span className="truncate">
                Episode {item.episodeNumber}
                {epTitle ? ` • ${epTitle}` : ''}
              </span>
              {percent !== null && <span className="shrink-0 tabular-nums font-bold text-white/60">{percent}%</span>}
            </div>
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              Resume
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Peekable>
  );
});

export function LocalContinueWatching() {
  const { user } = useAuth();
  const [items, setItems] = useState<LocalContinueWatchingItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Only show localStorage continue watching for non-logged in users
    if (!user) {
      setItems(getLocalContinueWatching());
    }
  }, [user]);

  // For logged-in users, they use the database-backed ContinueWatching component
  if (user || items.length === 0) return null;

  const handleRemove = (e: React.MouseEvent, episodeId: string) => {
    e.stopPropagation();
    removeFromLocalContinueWatching(episodeId);
    setItems(getLocalContinueWatching());
  };

  const handleOpen = (item: LocalContinueWatchingItem) => {
    const progressSeconds = Math.max(0, Math.floor(Number(item.progressSeconds) || 0));
    navigate(`/watch/${encodeURIComponent(item.episodeId)}?t=${progressSeconds}`);
  };

  return (
    <section className="mb-12" aria-labelledby="local-continue-watching-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card">
            <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Local queue
            </p>
            <h2
              id="local-continue-watching-heading"
              className="font-display text-xl font-bold tracking-tight md:text-2xl"
            >
              Continue Watching
            </h2>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Pick up where you left off
        </p>
      </div>

      <div data-mobile-home-rail="resume" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 4).map((item) => (
          <LocalContinueCard key={item.episodeId} item={item} onRemove={handleRemove} onOpen={handleOpen} />
        ))}
      </div>
    </section>
  );
}
