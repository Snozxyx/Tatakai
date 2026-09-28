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
  const hoursSpent = Number((watchTimeSeconds / 3600).toFixed(1));
  const daysSpent = Number((watchTimeSeconds / 86400).toFixed(1));
  const totalReadingTitles = mangaCount + manhwaCount + comicsCount;

  // Completion rate calculation
  const totalAnimeInteracted = completedAnimeCount + watchingAnimeCount;
  const completionRate = totalAnimeInteracted > 0
    ? Math.round((completedAnimeCount / totalAnimeInteracted) * 100)
    : 0;

  // Primary top tiles
  const primaryStats = [
    {
      key: 'anime',
      label: 'Anime Watched',
      value: episodesCount,
      suffix: 'eps',
      subtext: `${completedAnimeCount} completed · ${watchingAnimeCount} watching`,
      icon: Play,
    },
    {
      key: 'watchtime',
      label: 'Watch Time',
      value: hoursSpent,
      decimals: 1,
      suffix: 'hrs',
      subtext: `${daysSpent} days continuous`,
      icon: Clock,
    },
    {
      key: 'reading',
      label: 'Manga & Manhwa',
      value: totalChaptersRead > 0 ? totalChaptersRead : totalReadingTitles,
      suffix: totalChaptersRead > 0 ? 'chs' : 'titles',
      subtext: `${mangaCount} Manga · ${manhwaCount} Manhwa`,
      icon: BookOpen,
    },
    {
      key: 'reputation',
      label: 'Reputation',
      value: reputationRate,
      decimals: 1,
      suffix: '%',
      subtext: reputationRate >= 95 ? 'Elite Tier' : 'Active Member',
      icon: Award,
    },
    {
      key: 'community',
      label: 'Discussions',
      value: commentCount + forumPostCount,
      suffix: 'actions',
      subtext: `${commentCount} comments · ${forumPostCount} topics`,
      icon: MessageSquare,
    },
    {
      key: 'streak',
      label: 'Streak Record',
      value: streakDays,
      suffix: 'days',
      subtext: `Best streak: ${longestStreak}d`,
      icon: Flame,
      isActive: streakDays > 0,
    },
  ];

  // Secondary detailed micro-metrics bar
  const microDetails = [
    { label: 'Completion Rate', value: `${completionRate}%`, icon: Percent },
    { label: 'Active Watch Days', value: `${totalDaysActive || Math.max(streakDays, 1)}d`, icon: Calendar },
    { label: 'Comic Titles', value: `${comicsCount}`, icon: Film },
    { label: 'Community Upvotes', value: `${forumUpvotes || Math.max(commentCount * 2, 0)}`, icon: ThumbsUp },
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
      aria-label="Overview Statistics"
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
              Your Statistics
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Your lifetime platform activity, milestones, and total interaction summary
          </p>
        </div>
      </div>

      <div className="relative z-10 space-y-4">
        {/* ── Top Metric Cards Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {primaryStats.map((item, idx) => {
            const Icon = item.icon;
            const isClickable = !!onStatClick;
            const ariaLabel = `${item.label}: ${item.value} ${item.suffix || ''}. ${item.subtext}`;

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
          aria-label="Additional metric details"
        >
          {microDetails.map((detail) => {
            const Icon = detail.icon;
            return (
              <div 
                key={detail.label} 
                className="flex items-center gap-2.5"
                aria-label={`${detail.label}: ${detail.value}`}
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