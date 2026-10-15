import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { motion } from 'framer-motion';
import { useWatchStreaks, type WatchStreak } from '@/hooks/user/useWatchStreaks';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import {
  Flame, Trophy, Clock, Tv2, Star, Zap, Moon, Mountain, Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getRankImageUrl, getRankNameStyleForRank, getBadgeHoverClass, getRankBadges } from '@/lib/rankUtils';

interface WatchStreaksStats {
  totalEpisodes: number;
  totalHours: number;
}

interface WatchStreaksProps {
  isOwnProfile?: boolean;
  /** Unified rank score — drives the 16 rank badges. */
  rankScore?: number;
  /** Viewed-user data. When omitted, falls back to the signed-in user's hook. */
  streak?: WatchStreak;
  stats?: WatchStreaksStats;
}

function StreakIcon({ streak }: { streak: number }) {
  useUiTranslation();
  if (streak === 0) return <Moon className="w-8 h-8 text-muted-foreground" />;
  if (streak >= 30) return <Mountain className="w-8 h-8 text-orange-400" />;
  if (streak >= 14) return <Zap className="w-8 h-8 text-yellow-400" />;
  if (streak >= 7) return <Flame className="w-8 h-8 text-orange-500" />;
  return <Flame className="w-8 h-8 text-orange-300" />;
}

export function WatchStreaks({
  isOwnProfile = false,
  rankScore,
  streak: streakProp,
  stats: statsProp,
}: WatchStreaksProps) {
  useUiTranslation();
  const own = useWatchStreaks();
  const navigate = useNavigate();

  // Prefer viewed-user data when provided; otherwise use the signed-in user's.
  const streak = streakProp ?? own.streak;
  const stats = statsProp ?? own.stats;
  const score = rankScore ?? stats.totalEpisodes;

  const badges = getRankBadges(score);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className="space-y-6">
      {/* Streak Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Current Streak */}
        <GlassPanel className={cn(
          'p-4 text-center relative overflow-hidden',
          streak.isActiveToday && 'border-orange-500/20 bg-orange-500/5'
        )}>
          {streak.isActiveToday && (
            <div className="absolute top-0 right-0 w-12 h-12 bg-orange-500/10 rounded-full -translate-y-4 translate-x-4 blur-xl" />
          )}
          <div className="flex flex-col items-center gap-1">
            <StreakIcon streak={streak.currentStreak} />
            <div className="text-2xl font-black font-display">{streak.currentStreak}</div>
            <div className="text-xs text-muted-foreground font-medium">{uiI18n.t('app.day_streak_ca4b28ae')}</div>
            {streak.isActiveToday && (
              <div className="text-[10px] text-orange-400 font-semibold">{uiI18n.t('app.active_today_c57265f4')}</div>
            )}
          </div>
        </GlassPanel>

        {/* Longest Streak */}
        <GlassPanel className="p-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Trophy className="w-8 h-8 text-amber-400" />
            <div className="text-2xl font-black font-display">{streak.longestStreak}</div>
            <div className="text-xs text-muted-foreground font-medium">{uiI18n.t('app.best_streak_3b03fa81')}</div>
          </div>
        </GlassPanel>

        {/* Total Episodes */}
        <GlassPanel className="p-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Tv2 className="w-8 h-8 text-blue-400" />
            <div className="text-2xl font-black font-display">{stats.totalEpisodes}</div>
            <div className="text-xs text-muted-foreground font-medium">{uiI18n.t('app.episodes_49d641ba')}</div>
          </div>
        </GlassPanel>

        {/* Watch Time */}
        <GlassPanel className="p-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Clock className="w-8 h-8 text-primary" />
            <div className="text-2xl font-black font-display">{stats.totalHours}</div>
            <div className="text-xs text-muted-foreground font-medium">{uiI18n.t('app.hours_9e25a34e')}</div>
          </div>
        </GlassPanel>
      </div>

      {/* Rank badges — one per rank tier (16). */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-base font-bold">{uiI18n.t('app.rank_badges_8f907804')}</h3>
            <span className="text-xs text-muted-foreground">
              {unlockedCount}/{badges.length}
            </span>
          </div>
          {isOwnProfile && (
            <button
              onClick={() => navigate('/stats')}
              className="text-xs text-primary hover:underline"
            >
              {uiI18n.t('app.view_full_stats_fc10786e')}
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(unlockedCount / badges.length) * 100}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {badges.map((badge, i) => {
            const ns = getRankNameStyleForRank(badge.rank);
            return (
              <motion.div
                key={badge.rank}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
              >
                <GlassPanel
                  className={cn(
                    'p-3 flex flex-col items-center gap-2 text-center relative overflow-hidden',
                    !badge.unlocked && 'opacity-40 grayscale',
                    badge.unlocked && cn('border-border/40', getBadgeHoverClass(badge.rank))
                  )}
                >
                  {badge.unlocked && (
                    <div className="absolute top-0 right-0 w-8 h-8 bg-[hsl(var(--profile-accent)/0.12)] rounded-full -translate-y-3 translate-x-3 blur-md" />
                  )}
                  <img
                    src={getRankImageUrl(badge.rank)}
                    alt={badge.name}
                    className="w-10 h-10 object-contain"
                  />
                  <div>
                    <div
                      className={cn('text-xs font-bold leading-tight', badge.unlocked ? ns.className : '')}
                      style={badge.unlocked ? ns.style : {}}
                    >
                      {badge.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {badge.description}
                    </div>
                  </div>
                  {badge.unlocked ? (
                    <div className="absolute top-2 right-2">
                      <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                        <Star className="w-2.5 h-2.5 text-primary fill-primary" />
                      </div>
                    </div>
                  ) : (
                    <div className="absolute top-2 right-2">
                      <div className="w-4 h-4 rounded-full bg-background/60 border border-white/10 flex items-center justify-center">
                        <Lock className="w-2.5 h-2.5 text-muted-foreground/60" />
                      </div>
                    </div>
                  )}
                </GlassPanel>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
