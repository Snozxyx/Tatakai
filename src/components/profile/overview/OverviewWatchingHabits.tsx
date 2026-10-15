import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Flame, Trophy, CalendarClock, Zap } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import { computeWatchingHabits, type HistoryRow } from '@/core/profile/watchingHabits';

export interface OverviewWatchingHabitsProps {
  history?: HistoryRow[];
  currentStreak?: number;
  longestStreak?: number;
}

export function OverviewWatchingHabits({
  history = [],
  currentStreak = 0,
  longestStreak = 0,
}: OverviewWatchingHabitsProps) {
  useUiTranslation();
  const habits = useMemo(() => computeWatchingHabits(history), [history]);
  const maxHour = Math.max(1, ...habits.hourly);

  const stats = [
    { get label() { return uiI18n.t('app.peak_activity_28472744'); }, value: habits.peakHourLabel || '—', icon: Clock },
    { get label() { return uiI18n.t('app.most_active_day_e02dabd0'); }, value: habits.mostActiveDay || '—', icon: CalendarClock },
    {
      get label() { return uiI18n.t('app.avg_active_day_f9a15025'); },
      value: habits.avgEpisodesPerActiveDay > 0 ? `${habits.avgEpisodesPerActiveDay.toFixed(1)} eps` : '—',
      icon: Zap,
    },
    { get label() { return uiI18n.t('app.active_days_0ebfff45'); }, value: habits.activeDays > 0 ? `${habits.activeDays}` : '—', icon: Flame },
  ];

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-primary/80" />
          <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
            {uiI18n.t('app.your_watching_habits_f24db1ca')}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground/70">{uiI18n.t('app.based_on_your_latest_activity_per_episode_47c5a48e')}</p>
      </div>

      <div className="relative z-10 space-y-5">
        {habits.totalEvents === 0 ? (
          <div className="flex flex-col items-center justify-center h-[180px] text-center">
            <Clock className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">{uiI18n.t('app.no_watch_activity_yet_13616ee9')}</p>
          </div>
        ) : (
          <>
            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.015] border border-white/[0.03]"
                  >
                    <div className="p-1.5 rounded-md bg-white/[0.03] text-muted-foreground/60">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide truncate">
                        {s.label}
                      </span>
                      <span className="font-semibold text-foreground/90 text-xs truncate">{s.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 24h activity mini chart */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {uiI18n.t('app.24_hour_activity_c3cd4b82')}
                </span>
                <span className="text-[10px] text-muted-foreground/50">12a · 6a · 12p · 6p</span>
              </div>
              <div className="flex items-end gap-[2px] h-16">
                {habits.hourly.map((count, hour) => (
                  <div
                    key={hour}
                    className="flex-1 flex items-end h-full"
                    title={uiI18n.t('app.i18n_value_0_at_i18n_value_1_00_638892f1', { value0: count, value1: hour })}
                  >
                    <motion.div
                      className={cn(
                        'w-full rounded-sm',
                        hour === habits.peakHour ? 'bg-primary' : 'bg-primary/30',
                      )}
                      initial={{ height: 0 }}
                      whileInView={{ height: `${Math.max((count / maxHour) * 100, count > 0 ? 8 : 2)}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: hour * 0.01, ease: 'easeOut' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Streak badges */}
            <div className="flex items-center gap-2 pt-4 border-t border-white/[0.04]">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/20 border border-white/[0.03]">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-muted-foreground/70 text-[11px]">{uiI18n.t('app.current_19889c90')}</span>
                <span className="font-bold text-foreground font-display tabular-nums">{currentStreak}d</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/20 border border-white/[0.03]">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-muted-foreground/70 text-[11px]">{uiI18n.t('app.longest_0ea4fdd7')}</span>
                <span className="font-bold text-foreground font-display tabular-nums">{longestStreak}d</span>
              </div>
            </div>
          </>
        )}
      </div>
    </GlassPanel>
  );
}
