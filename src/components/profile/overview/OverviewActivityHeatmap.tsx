import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Flame, Info, Trophy } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface OverviewActivityHeatmapProps {
  history?: any[];
  mangaReadlist?: any[];
  commentDates?: Array<{ created_at?: string | null }>;
  currentStreak?: number;
  longestStreak?: number;
  userId?: string;
}

type ActivitySource = 'all' | 'anime' | 'manga' | 'forum';

const SOURCE_TABS: { key: ActivitySource; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'anime', label: 'Anime' },
  { key: 'manga', label: 'Manga' },
  { key: 'forum', label: 'Forum' },
];

const WEEKS = 26;
const DAY_MS = 86400000;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function levelClass(count: number): string {
  if (count <= 0) return 'bg-white/[0.02] hover:bg-white/[0.08] border-white/[0.04]';
  if (count === 1) return 'bg-primary/20 hover:bg-primary/30 border-primary/20 shadow-sm';
  if (count <= 3) return 'bg-primary/45 hover:bg-primary/55 border-primary/30 shadow-sm';
  if (count <= 6) return 'bg-primary/70 hover:bg-primary/80 border-primary/40 shadow-sm';
  return 'bg-primary hover:brightness-110 border-primary/50 shadow-[0_0_12px_rgba(244,63,94,0.35)]';
}

export function OverviewActivityHeatmap({
  history = [],
  mangaReadlist = [],
  commentDates = [],
  currentStreak = 0,
  longestStreak = 0,
}: OverviewActivityHeatmapProps) {
  const [source, setSource] = useState<ActivitySource>('all');

  const since = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const start = new Date(d.getTime() - (WEEKS * 7 - 1) * DAY_MS);
    start.setDate(start.getDate() - start.getDay());
    return start;
  }, []);

  // Compute daily counts map for the selected source. Anime uses watch_history
  // timestamps, manga uses readlist updated_at, forum uses comment created_at.
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    const add = (dateVal?: string | null) => {
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (Number.isNaN(d.getTime())) return;
      const key = dayKey(d);
      map[key] = (map[key] || 0) + 1;
    };

    if (source === 'all' || source === 'anime') {
      history.forEach((row) => add(row?.watched_at || row?.updated_at));
    }
    if (source === 'all' || source === 'manga') {
      mangaReadlist.forEach((row) => add(row?.updated_at || row?.created_at));
    }
    if (source === 'all' || source === 'forum') {
      commentDates.forEach((row) => add(row?.created_at));
    }
    return map;
  }, [history, mangaReadlist, commentDates, source]);

  // Generate week columns and running total
  const { weeks, totalInPeriod } = useMemo(() => {
    const cols: { date: Date; key: string; count: number }[][] = [];
    let running = 0;
    for (let w = 0; w < WEEKS; w++) {
      const col: { date: Date; key: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(since.getTime() + (w * 7 + d) * DAY_MS);
        const key = dayKey(date);
        const count = counts[key] || 0;
        running += count;
        col.push({ date, key, count });
      }
      cols.push(col);
    }
    return { weeks: cols, totalInPeriod: running };
  }, [counts, since]);

  const now = Date.now();

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      {/* Decorative background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.05)] blur-[70px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              Activity & Watch 
            </h3>
            <span className="text-[10px] font-semibold text-muted-foreground/80 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.05] uppercase tracking-wider">
              26 Weeks
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Track your daily watch velocity, consistency, and active streaks
          </p>
        </div>

        {/* Source filter + Streak & Volume Summary Badges */}
        <div className="flex items-center gap-2 text-xs self-start lg:self-auto flex-wrap">
          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/[0.03]">
            {SOURCE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setSource(t.key)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200',
                  source === t.key
                    ? 'bg-white/10 text-foreground shadow-sm'
                    : 'text-muted-foreground/60 hover:text-foreground/90 hover:bg-white/[0.02]',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/20 border border-white/[0.03]">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-muted-foreground/70 text-[11px]">Current:</span>
            <span className="font-bold text-foreground font-display tabular-nums">{currentStreak}d</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/20 border border-white/[0.03]">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-muted-foreground/70 text-[11px]">Record:</span>
            <span className="font-bold text-foreground font-display tabular-nums">{longestStreak}d</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <span className="font-bold font-display tabular-nums">{totalInPeriod}</span>
            <span className="text-[10px] uppercase font-semibold tracking-wide">
              {source === 'forum' ? 'comments' : source === 'manga' ? 'updates' : 'events'}
            </span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid with Progressive Cell Reveal */}
      <TooltipProvider delayDuration={100}>
        <div className="relative z-10 overflow-x-auto scrollbar-none pb-2 pt-1">
          <div className="flex gap-1.5 justify-between min-w-[580px]">
            {weeks.map((col, wi) => (
              <div key={wi} className="flex flex-col gap-1.5">
                {col.map((cell, di) => {
                  const isFuture = cell.date.getTime() > now;
                  return (
                    <Tooltip key={cell.key}>
                      <TooltipTrigger asChild>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.7 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{
                            duration: 0.25,
                            delay: wi * 0.008 + di * 0.003,
                            ease: 'easeOut',
                          }}
                          className={cn(
                            'h-3.5 w-3.5 rounded-[4px] border transition-all duration-200 cursor-pointer',
                            isFuture
                              ? 'bg-transparent border-transparent pointer-events-none'
                              : levelClass(cell.count),
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="text-xs bg-background/90 backdrop-blur-xl border border-white/10 p-2.5 shadow-2xl rounded-xl"
                      >
                        <p className="font-bold text-foreground mb-0.5">
                          {cell.date.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground/80">
                          <span className="font-bold text-primary font-mono">{cell.count}</span>{' '}
                          {cell.count === 1 ? 'episode/activity' : 'episodes/activities'} tracked
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </TooltipProvider>

      {/* Footer Legend */}
      <div className="relative z-10 flex items-center justify-between pt-4 border-t border-white/[0.04] mt-2 text-[11px] text-muted-foreground/60">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-muted-foreground/50" />
          Interactive daily watch & read activity
        </span>

        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="flex gap-1 items-center">
            <div className="h-2.5 w-2.5 rounded-[3px] bg-white/[0.02] border border-white/[0.04]" />
            <div className="h-2.5 w-2.5 rounded-[3px] bg-primary/20 border border-primary/20" />
            <div className="h-2.5 w-2.5 rounded-[3px] bg-primary/45 border border-primary/30" />
            <div className="h-2.5 w-2.5 rounded-[3px] bg-primary/70 border border-primary/40" />
            <div className="h-2.5 w-2.5 rounded-[3px] bg-primary border border-primary/50" />
          </div>
          <span>More</span>
        </div>
      </div>
    </GlassPanel>
  );
}