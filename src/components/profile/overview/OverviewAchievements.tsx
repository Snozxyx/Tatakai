import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ArrowRight, Flame, PlayCircle, Lock, CheckCircle2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import {
  RANK_TIERS,
  MEDIA_LABEL,
  MEDIA_UNIT,
  getRankImageUrl,
  getRankNameStyleForRank,
  getRankClassForRank,
  getBadgeHoverClass,
  getNextRankTier,
  getRankTier,
  rankScoreBreakdown,
  type RankUnits,
} from '@/lib/rankUtils';

export interface OverviewAchievementsProps {
  streakDays?: number;
  longestStreak?: number;
  episodesCount?: number;
  /** Unified rank score — drives the hero, badge grid and lock state. */
  rankScore?: number;
  /** Raw units per medium, for the contribution breakdown. */
  units?: RankUnits;
  onNavigateTab?: (tabKey: string) => void;
}

export function OverviewAchievements({
  streakDays = 0,
  longestStreak = 0,
  episodesCount = 0,
  rankScore,
  units,
  onNavigateTab,
}: OverviewAchievementsProps) {
  const score = rankScore ?? episodesCount;
  const currentRank = getRankTier(score);
  const nextRank = getNextRankTier(score);
  const currentRankStyle = getRankNameStyleForRank(currentRank.rank);

  const breakdown = useMemo(() => (units ? rankScoreBreakdown(units) : []), [units]);
  const unlockedCount = RANK_TIERS.filter((t) => score >= t.minScore).length;

  const rankProgressPct = nextRank
    ? Math.min(100, Math.round((nextRank.progress / (nextRank.progress + nextRank.needed)) * 100))
    : 100;

  return (
    <GlassPanel className="flex flex-col gap-6 p-5 sm:p-7 border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl overflow-hidden relative">
      {/* Decorative ambient background glow behind the hero section */}
      <div className="absolute top-0 left-1/4 w-1/2 h-24 bg-[hsl(var(--profile-accent)/0.10)] blur-[60px] rounded-full pointer-events-none" />

      {/* ── CURRENT RANK HERO ── */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="relative shrink-0">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <img
            src={getRankImageUrl(currentRank.rank)}
            alt={currentRank.name}
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain relative z-10 drop-shadow-xl"
          />
        </div>

        <div className="flex-1 w-full">
          <p className="text-[10px] sm:text-xs text-muted-foreground/80 uppercase tracking-widest font-semibold mb-1">
            Current Rank
          </p>
          <div className="flex items-baseline gap-3 mb-2.5">
            <h2
              className={cn('text-2xl sm:text-3xl font-bold tracking-tight', currentRankStyle.className)}
              style={currentRankStyle.style}
            >
              {currentRank.name}
            </h2>
            <span className="text-xs text-muted-foreground/50 font-mono">
              Rank {currentRank.rank} / 16 · {score.toLocaleString()} RP
            </span>
          </div>

          {nextRank && (
            <div className="space-y-1.5 w-full max-w-md">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Progress to {nextRank.tier.name}</span>
                <span className="font-mono text-muted-foreground/80">{nextRank.needed} RP left</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${rankProgressPct}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── QUICK STATS ── */}
      <div className="grid grid-cols-2 gap-3 z-10">
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.01] border border-white/[0.03] transition-colors hover:bg-white/[0.02]">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground/60 tracking-wider">Watch Streak</p>
            <p className="font-display text-sm font-bold text-foreground">
              {streakDays} Days <span className="text-[10px] font-normal text-muted-foreground/50 ml-1">Best: {longestStreak}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.01] border border-white/[0.03] transition-colors hover:bg-white/[0.02]">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <PlayCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground/60 tracking-wider">Ranks Unlocked</p>
            <p className="font-display text-sm font-bold text-foreground">
              {unlockedCount} / 16
            </p>
          </div>
        </div>
      </div>

      {/* Score breakdown — how each medium contributes to the shared rank. */}
      {breakdown.length > 0 && (
        <div className="flex flex-wrap gap-2 z-10">
          {breakdown.map((row) => (
            <span
              key={row.kind}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.05] bg-white/[0.02] px-2.5 py-1 text-[10px]"
            >
              <span className="font-semibold text-foreground/80">{MEDIA_LABEL[row.kind]}</span>
              <span className="text-muted-foreground/60">
                {row.units.toLocaleString()} {MEDIA_UNIT[row.kind]}
              </span>
              <span className="font-mono text-primary/70">+{row.points} RP</span>
            </span>
          ))}
        </div>
      )}

      {/* ── RANK BADGES / LADDER ── */}
      <div className="z-10 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary/80" />
          <h3 className="font-display font-semibold text-sm sm:text-base text-foreground">Rank Badges</h3>
          <span className="text-xs text-muted-foreground/50 ml-1">{unlockedCount} / 16</span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2.5">
          {RANK_TIERS.map((tier) => {
            const unlocked = score >= tier.minScore;
            const isCurrent = tier.rank === currentRank.rank;
            return (
              <div
                key={tier.rank}
                title={`${tier.name} — ${tier.minScore.toLocaleString()} RP`}
                className={cn(
                  'group relative flex flex-col items-center text-center gap-1 rounded-xl border p-2.5 duration-300 select-none',
                  unlocked
                    ? cn('border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent', getBadgeHoverClass(tier.rank))
                    : 'border-white/[0.02] bg-white/[0.005] opacity-45 hover:opacity-70',
                  isCurrent && 'border-primary/40 ring-1 ring-primary/30 bg-primary/[0.04] opacity-100',
                )}
              >
                <div className="relative w-10 h-10 flex items-center justify-center">
                  <img
                    src={getRankImageUrl(tier.rank)}
                    alt={tier.name}
                    className={cn('w-full h-full object-contain', !unlocked && 'grayscale opacity-70')}
                  />
                  {unlocked ? (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background border border-white/10 flex items-center justify-center">
                      <Lock className="w-2 h-2 text-muted-foreground/60" />
                    </div>
                  )}
                </div>
                <div
                  className={cn(
                    'text-[10px] font-bold leading-tight truncate w-full',
                    unlocked ? getRankClassForRank(tier.rank) : 'text-muted-foreground/50',
                  )}
                >
                  {tier.name}
                </div>
                <div className="font-mono text-[8px] text-muted-foreground/40">
                  {tier.minScore.toLocaleString()} RP
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FOOTER ── */}
      {onNavigateTab && (
        <div className="relative z-10 pt-4 mt-2 border-t border-white/[0.03] flex items-center justify-between text-xs">
          <span className="text-muted-foreground/60">Keep going to unlock higher tiers</span>
          <button
            onClick={() => onNavigateTab('streaks')}
            className="flex items-center gap-1.5 font-medium text-primary hover:text-primary/80 transition-colors group"
          >
            <span>All Milestones</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
