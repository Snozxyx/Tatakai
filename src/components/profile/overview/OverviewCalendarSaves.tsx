import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, ChevronRight, Tv, Check } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useTrackedShows, usePublicTrackedShows } from '@/hooks/user/useTrackedShows';
import { useNextAiringEpisodes, type NextAiringInfo } from '@/hooks/api/useNextAiringEpisodes';

/**
 * Tatakai Calendar — the shows a user has saved (`tracked_shows`) with a live
 * countdown to each one's next episode. Saves come from the calendar's
 * right-click "Add to calendar" and the anime page's Track button; the countdown
 * is driven by AniList's per-show `nextAiringEpisode` (see
 * `useNextAiringEpisodes`) so it works no matter how far out the episode is.
 *
 * Works for both own and other profiles. On your own profile it reads your rows
 * via `useTrackedShows` (scoped to auth.uid()); when viewing someone else it
 * reads *their* rows via `usePublicTrackedShows`, allowed by RLS only when that
 * user's profile is public and their `show_calendar` opt-out is on. The caller
 * gates the mount on those flags, but passing them through keeps the query
 * disabled otherwise.
 */
interface OverviewCalendarSavesProps {
  /** Whose calendar to show. Omit for the logged-in user's own. */
  userId?: string;
  isViewingOther?: boolean;
  /** Viewed profile's privacy flags — only used when isViewingOther. */
  isPublic?: boolean;
  showCalendar?: boolean;
}

interface SavedRow {
  key: string;
  anilistId: number | null;
  title: string;
  coverImage: string | null;
  airingAt: number | null;
  episode: number | null;
  totalEpisodes: number | null;
  finished: boolean;
}

function Countdown({ airingAt, now }: { airingAt: number; now: number }) {
  const diff = airingAt * 1000 - now;
  if (diff <= 0) {
    return (
      <span className="font-display text-xs font-bold text-primary tabular-nums animate-pulse">
        Airing now
      </span>
    );
  }
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts =
    days > 0
      ? [
          { v: days, l: 'd' },
          { v: hours, l: 'h' },
          { v: minutes, l: 'm' },
        ]
      : [
          { v: hours, l: 'h' },
          { v: minutes, l: 'm' },
          { v: seconds, l: 's' },
        ];

  return (
    <span className="font-display text-xs font-bold text-primary tabular-nums">
      {parts.map((p, i) => (
        <span key={p.l}>
          {String(p.v).padStart(2, '0')}
          <span className="text-[10px] text-primary/60">{p.l}</span>
          {i < parts.length - 1 ? <span className="text-primary/30"> </span> : null}
        </span>
      ))}
    </span>
  );
}

export function OverviewCalendarSaves({
  userId,
  isViewingOther = false,
  isPublic = false,
  showCalendar = true,
}: OverviewCalendarSavesProps = {}) {
  // Own profile reads via the auth-scoped hook; other profiles via the public
  // hook. Both hooks run (rules of hooks), but the inactive one is disabled by
  // its `enabled` gate so only one request fires.
  const own = useTrackedShows();
  const other = usePublicTrackedShows(userId, isPublic, showCalendar);
  const { data: tracked = [], isLoading: tracksLoading } = isViewingOther ? other : own;

  const anilistIds = useMemo(
    () =>
      tracked
        .map((t) => t.anilist_id)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    [tracked],
  );

  const { data: airingMap = {}, isLoading: airingLoading } = useNextAiringEpisodes(anilistIds);

  // Single ticking clock shared by every countdown row, so we run one interval
  // instead of one per card.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo<SavedRow[]>(() => {
    const mapped: SavedRow[] = tracked.map((t) => {
      const info: NextAiringInfo | undefined =
        typeof t.anilist_id === 'number' ? airingMap[t.anilist_id] : undefined;
      const finished =
        !info?.airingAt && (info?.status === 'FINISHED' || info?.status === 'CANCELLED');
      return {
        key: t.id,
        anilistId: t.anilist_id,
        title: info?.title || t.title || 'Unknown',
        coverImage: info?.coverImage || t.image_url || null,
        airingAt: info?.airingAt ?? null,
        episode: info?.episode ?? null,
        totalEpisodes: info?.totalEpisodes ?? null,
        finished,
      };
    });

    // Soonest upcoming episode first; shows with no scheduled episode sink to
    // the bottom, ordered by title.
    return mapped.sort((a, b) => {
      if (a.airingAt && b.airingAt) return a.airingAt - b.airingAt;
      if (a.airingAt) return -1;
      if (b.airingAt) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [tracked, airingMap]);

  const isLoading = tracksLoading || (anilistIds.length > 0 && airingLoading);
  const upcomingCount = rows.filter((r) => r.airingAt).length;

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl h-full">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1 justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg border border-white/[0.05] bg-primary/10 text-primary">
                <CalendarClock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-display font-bold text-base text-foreground tracking-tight">
                  Tatakai Calendar
                </h4>
                <p className="text-xs text-muted-foreground/70 font-medium">
                  {upcomingCount > 0
                    ? `${upcomingCount} saved ${upcomingCount === 1 ? 'show' : 'shows'} airing soon`
                    : isViewingOther
                      ? 'Saved shows and episode countdowns'
                      : 'Your saved shows and episode countdowns'}
                </p>
              </div>
            </div>

            <Link
              to="/calendar"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors group shrink-0"
            >
              <span>Calendar</span>
              <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Saved shows list */}
          {isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[58px] bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : rows.length > 0 ? (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto scrollbar-none pr-0.5">
              {rows.slice(0, 8).map((row, idx) => (
                <motion.div
                  key={row.key}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: idx * 0.04, ease: 'easeOut' }}
                >
                  <Link
                    to={row.anilistId ? `/anilist/${row.anilistId}` : '/calendar'}
                    className="group flex items-center justify-between p-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-primary/30 transition-all duration-200 shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {row.coverImage ? (
                        <img
                          src={row.coverImage}
                          alt={row.title}
                          loading="lazy"
                          className="w-9 h-12 rounded-lg object-cover shrink-0 border border-white/10 group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-9 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <Tv className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h5 className="font-semibold text-xs text-foreground/90 truncate group-hover:text-primary transition-colors">
                          {row.title}
                        </h5>
                        <span className="text-[10px] text-muted-foreground/70 font-medium">
                          {row.airingAt && row.episode
                            ? `Episode ${row.episode}${row.totalEpisodes ? ` of ${row.totalEpisodes}` : ''}`
                            : row.finished
                              ? 'Finished airing'
                              : 'No upcoming episode'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      {row.airingAt ? (
                        <>
                          <Countdown airingAt={row.airingAt} now={now} />
                          <span className="block text-[10px] text-muted-foreground/70 font-medium">
                            {new Date(row.airingAt * 1000).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </>
                      ) : row.finished ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/60">
                          <Check className="w-3 h-3" />
                          Complete
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-muted-foreground/50">TBA</span>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
              <CalendarClock className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground/70">No saved shows yet</p>
              {!isViewingOther && (
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Track a show from its page or the calendar to see countdowns here
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="pt-4 border-t border-white/[0.04] mt-4">
          <Link
            to="/calendar"
            className="w-full py-2.5 px-3 rounded-xl bg-white/[0.03] hover:bg-primary/10 border border-white/[0.06] hover:border-primary/20 text-xs font-bold text-center block text-foreground hover:text-primary transition-all duration-200"
          >
            Open Tatakai Calendar →
          </Link>
        </div>
      </div>
    </GlassPanel>
  );
}
