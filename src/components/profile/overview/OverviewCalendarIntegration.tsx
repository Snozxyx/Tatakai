import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Tv } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useAiringSchedule, type AiringEntry } from '@/hooks/api/useAiringSchedule';

export interface OverviewCalendarIntegrationProps {
  watchlist?: any[];
}

export function OverviewCalendarIntegration({
  watchlist = [],
}: OverviewCalendarIntegrationProps) {
  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { data: airingShows = [], isLoading } = useAiringSchedule(weekStart);

  // Match watchlist anime titles to airing schedule
  const matchedSchedule = useMemo(() => {
    const watchlistTitles = new Set(
      watchlist.map((w) => (w.anime_name || '').toLowerCase().trim()).filter(Boolean),
    );

    const nowSec = Math.floor(Date.now() / 1000);

    // Prioritize upcoming episodes
    const upcoming = airingShows.filter((show) => show.airingAt >= nowSec - 3600);

    // Sort to place tracked/watchlist matches first
    return upcoming
      .sort((a, b) => {
        const aMatch = watchlistTitles.has(a.title.toLowerCase().trim());
        const bMatch = watchlistTitles.has(b.title.toLowerCase().trim());
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return a.airingAt - b.airingAt;
      })
      .slice(0, 4);
  }, [airingShows, watchlist]);

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl h-full">
      {/* Background glow accent */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1 justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg border border-white/[0.05] bg-primary/10 text-primary">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-display font-bold text-base text-foreground tracking-tight">
                  Tatakai Airing Calendar
                </h4>
                <p className="text-xs text-muted-foreground/70 font-medium">
                  Upcoming episode airings synced with watchlist
                </p>
              </div>
            </div>

            <Link
              to="/calendar"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors group shrink-0"
            >
              <span>Full Calendar</span>
              <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Schedule List */}
          {isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[58px] bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : matchedSchedule.length > 0 ? (
            <div className="space-y-2.5">
              {matchedSchedule.map((entry: AiringEntry) => {
                const airDate = new Date(entry.airingAt * 1000);
                const timeStr = airDate.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const dayStr = airDate.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <Link
                    key={`air-${entry.id}`}
                    to={`/anilist/${entry.mediaId}`}
                    className="group flex items-center justify-between p-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-primary/30 transition-all duration-200 shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {entry.coverImage ? (
                        <img
                          src={entry.coverImage}
                          alt={entry.title}
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
                          {entry.title}
                        </h5>
                        <span className="text-[10px] text-muted-foreground/70 font-medium">
                          Episode {entry.episode} {entry.totalEpisodes ? `of ${entry.totalEpisodes}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <span className="font-display text-xs font-bold text-primary block tabular-nums">
                        {timeStr}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 font-medium">
                        {dayStr}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
              <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground/70">No upcoming airing shows tracked this week</p>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="pt-4 border-t border-white/[0.04] mt-4">
          <Link
            to="/calendar"
            className="w-full py-2.5 px-3 rounded-xl bg-white/[0.03] hover:bg-primary/10 border border-white/[0.06] hover:border-primary/20 text-xs font-bold text-center block text-foreground hover:text-primary transition-all duration-200"
          >
            Explore Airing Schedules →
          </Link>
        </div>
      </div>
    </GlassPanel>
  );
}