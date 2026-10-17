import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Play,
  BookOpen,
  Flame,
  MessageSquare,
  Award,
  Film,
  Calendar,
  ThumbsUp,
  Percent,
  Activity,
} from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';

export interface OverviewHeroStatsProps {
  watchTimeSeconds: number;
  episodesCount: number;
  completedAnimeCount: number;
  watchingAnimeCount: number;
  planToWatchCount?: number;
  mangaCount: number;
  manhwaCount: number;
  comicsCount: number;
  totalChaptersRead: number;
  streakDays: number;
  longestStreak: number;
  totalDaysActive?: number;
  commentCount: number;
  forumPostCount: number;
  forumUpvotes?: number;
  reputationRate?: number;
  onStatClick?: (statKey: string) => void;
}

export const OverviewHeroStats = memo(function OverviewHeroStats({
  watchTimeSeconds,
  episodesCount,
  completedAnimeCount,
  watchingAnimeCount,
  planToWatchCount = 0,
  mangaCount,
  manhwaCount,
  comicsCount,
  totalChaptersRead,
  streakDays,
  longestStreak,
  totalDaysActive = 0,
  commentCount,
  forumPostCount,
  forumUpvotes = 0,
  reputationRate = 98.4,
  onStatClick,
}: OverviewHeroStatsProps) {
  useUiTranslation();
  const hoursSpent = Number((watchTimeSeconds / 3600).toFixed(1));
  const daysSpent = Number((watchTimeSeconds / 86400).toFixed(1));
  const totalReadingTitles = mangaCount + manhwaCount + comicsCount;

  // Completion rate calculation
  const totalAnimeInteracted = completedAnimeCount + watchingAnimeCount;
  const completionRate = totalAnimeInteracted > 0
    ? Math.round((completedAnimeCount / totalAnimeInteracted) * 100)
    : 0;

  // Primary top tiles
  const es = uiI18n.language?.startsWith('es');
  const primaryStats = [
    {
      key: 'anime',
      get label() { return uiI18n.t('app.anime_watched_7702ac21'); },
      value: episodesCount,
      suffix: es ? (episodesCount === 1 ? 'cap.' : 'caps.') : 'eps',
      subtext: es
        ? `${completedAnimeCount} completados · ${watchingAnimeCount} viendo`
        : `${completedAnimeCount} completed · ${watchingAnimeCount} watching`,
      icon: Play,
    },
    {
      key: 'watchtime',
      get label() { return uiI18n.t('app.watch_time_c49f058c'); },
      value: hoursSpent,
      decimals: 1,
      suffix: es ? 'h' : 'hrs',
      subtext: es
        ? (daysSpent === 1 ? `${daysSpent} día continuo` : `${daysSpent} días continuos`)
        : `${daysSpent} days continuous`,
      icon: Clock,
    },
    {
      key: 'reading',
      get label() { return uiI18n.t('app.manga_manhwa_3dfc1148'); },
      value: totalChaptersRead > 0 ? totalChaptersRead : totalReadingTitles,
      suffix: totalChaptersRead > 0 ? (es ? 'caps.' : 'chs') : (es ? 'títulos' : 'titles'),
      subtext: es
        ? `${mangaCount} mangas · ${manhwaCount} manhwas`
        : `${mangaCount} Manga · ${manhwaCount} Manhwa`,
      icon: BookOpen,
    },
    {
      key: 'reputation',
      get label() { return uiI18n.t('app.reputation_5f21606b'); },
      value: reputationRate,
      decimals: 1,
      suffix: '%',
      subtext: reputationRate >= 95 ? (es ? 'Nivel Élite' : 'Elite Tier') : (es ? 'Miembro activo' : 'Active Member'),
      icon: Award,
    },
    {
      key: 'community',
      get label() { return uiI18n.t('app.discussions_0474a6c6'); },
      value: commentCount + forumPostCount,
      suffix: es ? 'acciones' : 'actions',
      subtext: es
        ? `${commentCount} comentarios · ${forumPostCount} temas`
        : `${commentCount} comments · ${forumPostCount} topics`,
      icon: MessageSquare,
    },
    {
      key: 'streak',
      get label() { return uiI18n.t('app.streak_record_76f08e79'); },
      value: streakDays,
      suffix: es ? 'días' : 'days',
      subtext: es ? `Mejor racha: ${longestStreak}d` : `Best streak: ${longestStreak}d`,
      icon: Flame,
      isActive: streakDays > 0,
    },
  ];

  // Secondary detailed micro-metrics bar
  const microDetails = [
    { get label() { return uiI18n.t('app.completion_rate_e9022ebd'); }, value: `${completionRate}%`, icon: Percent },
    { get label() { return uiI18n.t('app.active_watch_days_0e6946ec'); }, value: `${totalDaysActive || Math.max(streakDays, 1)}d`, icon: Calendar },
    { get label() { return uiI18n.t('app.comic_titles_3cc7552f'); }, value: `${comicsCount}`, icon: Film },
    { get label() { return uiI18n.t('app.community_upvotes_593032cd'); }, value: `${forumUpvotes || Math.max(commentCount * 2, 0)}`, icon: ThumbsUp },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (onStatClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onStatClick(key);
    }
  };

  return (
    <GlassPanel 
      className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl"
      role="region" 
      aria-label={uiI18n.t('app.overview_statistics_7550582a')}
    >
      {/* Decorative background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.05)] blur-[70px] rounded-full pointer-events-none" />

      {/* Header aligned with InteractiveCharts style */}
      <div className="relative z-10 flex flex-col justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              {uiI18n.t('app.your_statistics_babf8bf7')}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">
            {uiI18n.t('app.your_lifetime_platform_activity_milestones_and_t_99fd6618')}
          </p>
        </div>
      </div>

      <div className="relative z-10 space-y-4">
        {/* ── Top Metric Cards Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {primaryStats.map((item, idx) => {
            const Icon = item.icon;
            const isClickable = !!onStatClick;
            const ariaLabel = uiI18n.t('app.i18n_value_0_i18n_value_1_i18n_value_2_i18n_valu_44fd5558', { value0: item.label, value1: item.value, value2: item.suffix || '', value3: item.subtext });

            return (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.04, ease: 'easeOut' }}
                onClick={() => onStatClick?.(item.key)}
                role={isClickable ? 'button' : 'article'}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={(e) => handleKeyDown(e, item.key)}
                aria-label={ariaLabel}
                className={cn(
                  'group flex flex-col justify-between p-4 rounded-xl border border-white/[0.03] bg-white/[0.015] transition-all duration-300 select-none',
                  'hover:border-white/[0.08] hover:bg-white/[0.03] hover:shadow-sm hover:shadow-black/20',
                  isClickable && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
                )}
              >
                {/* Header: Label & Minimal Icon */}
                <div className="flex items-center justify-between gap-1 mb-3" aria-hidden="true">
                  <span className="text-[11px] font-medium tracking-wider uppercase text-muted-foreground/70 truncate">
                    {item.label}
                  </span>
                  <Icon
                    className={cn(
                      'w-4 h-4 text-muted-foreground/50 transition-colors duration-300 group-hover:text-foreground/80',
                      item.isActive && 'text-orange-400/90 group-hover:text-orange-400',
                    )}
                  />
                </div>

                {/* Metric Value with Animated Counter */}
                <div className="flex items-baseline gap-1.5 my-1" aria-hidden="true">
                  <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    <AnimatedCounter
                      value={item.value}
                      decimals={item.decimals || 0}
                    />
                  </span>
                  {item.suffix && (
                    <span className="text-xs font-medium text-muted-foreground/50">
                      {item.suffix}
                    </span>
                  )}
                </div>

                {/* Subtitle description */}
                <p className="text-[10px] text-muted-foreground/50 mt-1 truncate transition-colors group-hover:text-muted-foreground/70" aria-hidden="true">
                  {item.subtext}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* ── Granular Detailed Micro-Bar ── */}
        <div 
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 rounded-xl bg-black/20 border border-white/[0.03]"
          aria-label={uiI18n.t('app.additional_metric_details_6a815705')}
        >
          {microDetails.map((detail) => {
            const Icon = detail.icon;
            return (
              <div 
                key={detail.label} 
                className="flex items-center gap-2.5"
                aria-label={uiI18n.t('app.i18n_value_0_i18n_value_1_b6af3412', { value0: detail.label, value1: detail.value })}
              >
                <div className="p-1.5 rounded-md bg-white/[0.03] text-muted-foreground/60">
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide truncate" aria-hidden="true">
                    {detail.label}
                  </span>
                  <span className="font-semibold text-foreground/90 font-mono text-xs" aria-hidden="true">
                    {detail.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </GlassPanel>
  );
});