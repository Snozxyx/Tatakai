import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, History, Play } from 'lucide-react';

import {
  useContinueWatching,
  migrateGuestProgressToAccount,
} from '@/hooks/user/useWatchHistory';
import { useAuth } from '@/contexts/AuthContext';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getProxiedImageUrl } from '@/lib/api';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
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

export function ContinueWatching() {
  const { user } = useAuth();
  const { data: items, isLoading } = useContinueWatching();

  useEffect(() => {
    if (user?.id) void migrateGuestProgressToAccount(user.id);
  }, [user?.id]);

  if (!user || isLoading || !items?.length) return null;

  return (
    <section className="mb-12" aria-labelledby="continue-watching-heading">
      <HomeSectionHeading
        icon={<Clock className="w-5 h-5 text-primary" />}
        title={<span id="continue-watching-heading">Continue Watching</span>}
        action={
          <div className="flex items-center gap-3 shrink-0">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Pick up where you left off
            </p>
            <Link
              to="/profile?tab=history"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="View full watch history"
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              History
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 4).map((item) => {
          const progressSeconds = Math.max(
            0,
            Number(item.progress_seconds) || 0,
          );
          const durationSeconds = Math.max(
            0,
            Number(item.duration_seconds) || 0,
          );

          const percent =
            durationSeconds > 0
              ? Math.min(
                  100,
                  Math.round((progressSeconds / durationSeconds) * 100),
                )
              : null;

          const timeLeft =
            durationSeconds > 0
              ? formatTimeLeft(durationSeconds - progressSeconds)
              : null;

          const poster = item.anime_poster
            ? getProxiedImageUrl(item.anime_poster)
            : '/placeholder.svg';

          return (
            <Peekable
              key={item.id}
              media={peekFromAnime(
                { id: item.anime_id, name: item.anime_name, poster: item.anime_poster },
                `/anime/${item.anime_id}`,
              )}
            >
            <Link
              to={`/watch/${encodeURIComponent(item.episode_id)}?t=${Math.floor(progressSeconds)}`}
              aria-label={`Resume ${item.anime_name}, episode ${item.episode_number}${percent !== null ? `, ${percent}% watched` : ''}`}
              className="group flex min-h-[176px] overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              {/* Portrait artwork */}
              <div className="relative w-28 shrink-0 overflow-hidden bg-muted sm:w-24 lg:w-28 xl:w-24">
                <img
                  src={poster}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </div>

              {/* Episode details */}
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      EP {item.episode_number}
                    </span>

                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                      <Play
                        className="ml-0.5 h-3.5 w-3.5 fill-current"
                        aria-hidden="true"
                      />
                    </span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 font-display text-sm font-semibold leading-snug sm:text-base">
                    {item.anime_name}
                  </h3>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      {timeLeft && (
                        <Clock
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {timeLeft ?? 'Ready to resume'}
                    </span>

                    {percent !== null && (
                      <span className="shrink-0 tabular-nums">{percent}%</span>
                    )}
                  </div>

                  {percent !== null && (
                    <div aria-hidden="true">
                      <ProgressBar
                        progress={percent}
                        className="h-1.5 rounded-full"
                      />
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
            </Link>
            </Peekable>
          );
        })}
      </div>
    </section>
  );
}