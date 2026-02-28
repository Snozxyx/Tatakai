import { motion } from 'framer-motion';
import { useWatchStreaks } from '@/hooks/useWatchStreaks';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import {
  Flame, Trophy, Clock, Tv2, Star, Zap, Moon, Mountain,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getRankImageUrl, getRankNameStyle } from '@/lib/rankUtils';

interface WatchStreaksProps {
  isOwnProfile?: boolean;
}

function StreakIcon({ streak }: { streak: number }) {
  if (streak === 0) return <Moon className="w-8 h-8 text-muted-foreground" />;
  if (streak >= 30) return <Mountain className="w-8 h-8 text-orange-400" />;
  if (streak >= 14) return <Zap className="w-8 h-8 text-yellow-400" />;
  if (streak >= 7) return <Flame className="w-8 h-8 text-orange-500" />;
  return <Flame className="w-8 h-8 text-orange-300" />;
}

const ACHIEVEMENT_RANK: Record<string, number> = {
  'filler-watcher': 1,
  'genin':          2,
  'chunin':         3,
  'week-warrior':   4,
  'plus-ultra':     5,
  'pro-hero':       6,
  'soul-reaper':    7,
  'bankai':         8,
  'survey-corps':   9,
  'month-legend':   10,
  'demon-slayer':   11,
  'hashira':        12,
};

const RANK_EPISODES = [0, 0, 5, 10, 20, 35, 50, 75, 100, 150, 250, 400, 600];

export function WatchStreaks({ isOwnProfile = false }: WatchStreaksProps) {
  const { streak, achievements, stats } = useWatchStreaks();
  const navigate = useNavigate();

  const unlockedCount = achievements.filter(a => a.unlocked).length;

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
            <div className="text-xs text-muted-foreground font-medium">Day Streak</div>
            {streak.isActiveToday && (
              <div className="text-[10px] text-orange-400 font-semibold">Active Today!</div>
            )}
          </div>
        </GlassPanel>

        {/* Longest Streak */}
        <GlassPanel className="p-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Trophy className="w-8 h-8 text-amber-400" />
            <div className="text-2xl font-black font-display">{streak.longestStreak}</div>
            <div className="text-xs text-muted-foreground font-medium">Best Streak</div>
          </div>
        </GlassPanel>

        {/* Total Episodes */}
        <GlassPanel className="p-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Tv2 className="w-8 h-8 text-blue-400" />
            <div className="text-2xl font-black font-display">{stats.totalEpisodes}</div>
            <div className="text-xs text-muted-foreground font-medium">Episodes</div>
          </div>
        </GlassPanel>

        {/* Watch Time */}
        <GlassPanel className="p-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Clock className="w-8 h-8 text-primary" />
            <div className="text-2xl font-black font-display">{stats.totalHours}</div>
            <div className="text-xs text-muted-foreground font-medium">Hours</div>
          </div>
        </GlassPanel>
      </div>

      {/* Achievements */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-base font-bold">Achievements</h3>
            <span className="text-xs text-muted-foreground">
              {unlockedCount}/{achievements.length}
            </span>
          </div>
          {isOwnProfile && (
            <button
              onClick={() => navigate('/stats')}
              className="text-xs text-primary hover:underline"
            >
              View full stats →
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {achievements.map((achievement, i) => (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
            >
              <GlassPanel
                className={cn(
                  'p-3 flex flex-col items-center gap-2 text-center relative overflow-hidden',
                  !achievement.unlocked && 'opacity-40 grayscale',
                  achievement.unlocked && 'border-border/40'
                )}
              >
                {achievement.unlocked && (
                  <div className="absolute top-0 right-0 w-8 h-8 bg-primary/10 rounded-full -translate-y-3 translate-x-3 blur-md" />
                )}
                <img
                  src={getRankImageUrl(ACHIEVEMENT_RANK[achievement.id] ?? 1)}
                  alt={achievement.title}
                  className="w-10 h-10 object-contain"
                />
                <div>
                  {(() => {
                    const rankNum = ACHIEVEMENT_RANK[achievement.id] ?? 1;
                    const ns = getRankNameStyle(RANK_EPISODES[rankNum] ?? 0);
                    return (
                      <div
                        className={cn('text-xs font-bold leading-tight', achievement.unlocked ? ns.className : '')}
                        style={achievement.unlocked ? ns.style : {}}
                      >
                        {achievement.title}
                      </div>
                    );
                  })()}
                  <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    {achievement.description}
                  </div>
                </div>
                {/* Progress bar for locked achievements */}
                {!achievement.unlocked && achievement.total && (
                  <div className="w-full mt-1">
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/50 rounded-full transition-all"
                        style={{ width: `${((achievement.progress || 0) / achievement.total) * 100}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {achievement.progress}/{achievement.total}
                    </div>
                  </div>
                )}
                {achievement.unlocked && (
                  <div className="absolute top-2 right-2">
                    <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                      <Star className="w-2.5 h-2.5 text-primary fill-primary" />
                    </div>
                  </div>
                )}
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
