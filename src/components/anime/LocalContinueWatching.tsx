import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Play, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getLocalContinueWatching, removeFromLocalContinueWatching, LocalContinueWatchingItem } from '@/lib/localStorage';
import { getProxiedImageUrl } from '@/lib/api';
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 4).map((item) => {
          const progressSeconds = Math.max(0, Number(item.progressSeconds) || 0);
          const durationSeconds = Math.max(0, Number(item.durationSeconds) || 0);

          const percent =
            durationSeconds > 0
              ? Math.min(100, Math.round((progressSeconds / durationSeconds) * 100))
              : null;

          const timeLeft =
            durationSeconds > 0
              ? formatTimeLeft(durationSeconds - progressSeconds)
              : null;

          const poster = item.animePoster
            ? getProxiedImageUrl(item.animePoster)
            : '/placeholder.svg';

          return (
            <Peekable
              key={item.episodeId}
              media={peekFromAnime(
                { id: item.animeId, name: item.animeName, poster: item.animePoster },
                `/anime/${item.animeId}`,
              )}
            >
            <div
              className="group relative flex min-h-[176px] overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              {/* Remove button */}
              <button
                onClick={(e) => handleRemove(e, item.episodeId)}
                className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background/90 text-muted-foreground opacity-0 backdrop-blur-sm transition-all duration-200 hover:border-destructive/50 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${item.animeName} from continue watching`}
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {/* Portrait artwork */}
              <div
                className="relative w-28 shrink-0 overflow-hidden bg-muted sm:w-24 lg:w-28 xl:w-24"
                onClick={() => navigate(`/watch/${encodeURIComponent(item.episodeId)}?t=${Math.floor(progressSeconds)}`)}
              >
                <img
                  src={poster}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </div>

              {/* Episode details */}
              <div
                className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4"
                onClick={() => navigate(`/watch/${encodeURIComponent(item.episodeId)}?t=${Math.floor(progressSeconds)}`)}
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      EP {item.episodeNumber}
                    </span>

                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                      <Play className="ml-0.5 h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    </span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 font-display text-sm font-semibold leading-snug sm:text-base">
                    {item.animeName}
                  </h3>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      {timeLeft && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      {timeLeft ?? 'Ready to resume'}
                    </span>

                    {percent !== null && <span className="shrink-0 tabular-nums">{percent}%</span>}
                  </div>

                  {percent !== null && (
                    <div aria-hidden="true">
                      <ProgressBar progress={percent} className="h-1.5 rounded-full" />
                    </div>
                  )}

                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold">
                    Resume
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </div>
            </div>
            </Peekable>
          );
        })}
      </div>
    </section>
  );
}