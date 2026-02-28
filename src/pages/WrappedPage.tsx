import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useWatchStreaks } from '@/hooks/useWatchStreaks';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/useIsNativeApp';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Background } from '@/components/layout/Background';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getRankTier, getRankImageUrl, getNextRankTier } from '@/lib/rankUtils';
import {
  ArrowLeft, Clock, Tv2, Flame, Trophy, Star,
  TrendingUp, Calendar, BarChart3, Sparkles, Film,
  type LucideIcon
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';

function StatCard({
  icon: Icon, label, value, sublabel, accent = false, iconClass
}: {
  icon: LucideIcon; label: string; value: string | number; sublabel?: string; accent?: boolean; iconClass?: string;
}) {
  return (
    <GlassPanel className={cn(
      'p-5 text-center relative overflow-hidden',
      accent && 'border-primary/20 bg-primary/5'
    )}>
      {accent && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      )}
      <div className={cn('flex items-center justify-center mb-2', iconClass)}>
        <Icon className="w-8 h-8" />
      </div>
      <div className="text-3xl font-black font-display leading-none">{value}</div>
      <div className="text-sm font-semibold mt-1">{label}</div>
      {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
    </GlassPanel>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-muted-foreground w-28 truncate shrink-0">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
        />
      </div>
      <span className="text-xs font-bold w-8 text-right shrink-0">{value}</span>
    </div>
  );
}

export default function WrappedPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: history = [] } = useWatchHistory();
  const { streak, achievements, stats } = useWatchStreaks();
  const isMobileApp = useIsMobileApp();
  const isMobile = useIsMobile();
  const isDesktopApp = useIsDesktopApp();
  const showSidebar = !isMobile && !isMobileApp;

  const currentYear = new Date().getFullYear();

  // Genre frequency
  const genreStats = useMemo(() => {
    // Proxy from anime names - group by name keywords to sim genre
    const animeCount: Record<string, number> = {};
    history.forEach(h => {
      const key = h.anime_id;
      animeCount[key] = (animeCount[key] || 0) + 1;
    });
    return Object.entries(animeCount)
      .map(([id, count]) => {
        const item = history.find(h => h.anime_id === id);
        return { id, name: item?.anime_name || id, count, poster: item?.anime_poster };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [history]);

  // Monthly activity
  const monthlyActivity = useMemo(() => {
    const months: Record<string, number> = {};
    history.forEach(h => {
      const month = new Date(h.watched_at).toLocaleString('default', { month: 'short', year: '2-digit' });
      months[month] = (months[month] || 0) + 1;
    });
    return Object.entries(months)
      .slice(-6)
      .map(([month, count]) => ({ month, count }));
  }, [history]);

  const maxMonthly = Math.max(...monthlyActivity.map(m => m.count), 1);
  const unlockedAchievements = achievements.filter(a => a.unlocked);

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Sign in to see your stats</p>
        <Button onClick={() => navigate('/auth')}>Sign In</Button>
      </div>
    );
  }

  const MONTH_COLORS = [
    'bg-primary/60', 'bg-primary/70', 'bg-primary/80',
    'bg-primary/90', 'bg-primary', 'bg-primary',
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {!showSidebar && <Background />}
      {showSidebar && <Sidebar />}

      <main className={cn(
        'relative z-10 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6',
        isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'
      )}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-4 mb-2">
            <Avatar className="w-14 h-14 ring-2 ring-primary/20">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold text-lg">
                {profile?.display_name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-muted-foreground text-sm font-medium">Your {currentYear} stats</div>
              <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight gradient-text">
                {profile?.display_name || 'Your'} Wrapped
              </h1>
            </div>
          </div>
        </motion.div>

        {/* Big Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <StatCard
            icon={Clock}
            iconClass="text-primary"
            label="Hours Watched"
            value={stats.totalHours.toLocaleString()}
            sublabel={`${stats.totalMinutes.toLocaleString()} minutes`}
            accent
          />
          <StatCard
            icon={Tv2}
            iconClass="text-blue-400"
            label="Episodes"
            value={stats.totalEpisodes.toLocaleString()}
            sublabel={`${stats.completedEpisodes} completed`}
          />
          <StatCard
            icon={Film}
            iconClass="text-teal-400"
            label="Anime Series"
            value={stats.uniqueAnime.toLocaleString()}
            sublabel="unique titles"
          />
          <StatCard
            icon={Flame}
            iconClass="text-orange-400"
            label="Best Streak"
            value={`${streak.longestStreak}d`}
            sublabel={streak.currentStreak > 0 ? `${streak.currentStreak}d current` : 'Keep it going!'}
          />
        </motion.div>

        {/* Rank Badge */}
        {stats.totalEpisodes > 0 && (() => {
          const rankTier = getRankTier(stats.totalEpisodes);
          const nextRank = getNextRankTier(stats.totalEpisodes);
          const progressPct = nextRank
            ? Math.min(100, (nextRank.progress / (nextRank.progress + nextRank.needed)) * 100)
            : 100;
          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-8"
            >
              <GlassPanel className="p-5 flex flex-col sm:flex-row items-center gap-5 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                <img
                  src={getRankImageUrl(rankTier.rank)}
                  alt={rankTier.name}
                  className="w-20 h-20 object-contain drop-shadow-lg"
                />
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-1">Your Current Rank</p>
                  <h2 className={cn('text-2xl font-black font-display', rankTier.color)}>{rankTier.name}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {stats.totalEpisodes.toLocaleString()} episodes watched
                  </p>
                  {nextRank && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress to <span className={nextRank.tier.color}>{nextRank.tier.name}</span></span>
                        <span>{nextRank.needed} more episodes</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className={cn('h-full rounded-full bg-gradient-to-r from-primary to-secondary')}
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPct}%` }}
                          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </GlassPanel>
            </motion.div>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Anime */}
          {genreStats.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <GlassPanel className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Star className="w-4 h-4 text-amber-400" />
                  <h2 className="font-display font-bold text-base">Most Watched</h2>
                </div>
                <div className="space-y-3">
                  {genreStats.map((item, i) => (
                    <MiniBar
                      key={item.id}
                      label={item.name}
                      value={item.count}
                      max={genreStats[0]?.count || 1}
                      color={i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-primary' : 'bg-muted-foreground/50'}
                    />
                  ))}
                </div>
              </GlassPanel>
            </motion.div>
          )}

          {/* Monthly Activity */}
          {monthlyActivity.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
            >
              <GlassPanel className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h2 className="font-display font-bold text-base">Monthly Activity</h2>
                </div>
                <div className="flex items-end gap-2 h-24">
                  {monthlyActivity.map((m, i) => {
                    const heightPct = maxMonthly > 0 ? (m.count / maxMonthly) * 100 : 0;
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <motion.div
                          className={cn('w-full rounded-t-lg', MONTH_COLORS[i] || 'bg-primary/60')}
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(heightPct, 4)}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 + i * 0.08 }}
                          style={{ minHeight: '4px' }}
                        />
                        <div className="text-[10px] text-muted-foreground font-medium">{m.month}</div>
                      </div>
                    );
                  })}
                </div>
              </GlassPanel>
            </motion.div>
          )}
        </div>

        {/* Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h2 className="font-display font-bold text-base">Achievements</h2>
                <span className="text-xs text-muted-foreground">
                  {unlockedAchievements.length}/{achievements.length} unlocked
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-5 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(unlockedAchievements.length / achievements.length) * 100}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
              />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-3">
              {achievements.map((achievement, i) => {
                // Map achievement to a rank image
                const rankMap: Record<string, number> = {
                  'first-episode':    1,
                  'ten-episodes':     3,
                  'hundred-episodes': 8,
                  'marathon':         11,
                  'streak-7':         4,
                  'streak-30':        9,
                  'completionist':    6,
                  'explorer':         5,
                  'binge':            7,
                  'otaku':            12,
                };
                const rankNum = rankMap[achievement.id] ?? 1;
                return (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.35 + i * 0.03, duration: 0.2 }}
                    title={`${achievement.title}: ${achievement.description}`}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-xl border text-center cursor-default transition-all',
                      achievement.unlocked
                        ? 'border-border/40 bg-muted/20 hover:bg-muted/40'
                        : 'border-border/20 bg-muted/10 opacity-35 grayscale'
                    )}
                  >
                    <img
                      src={getRankImageUrl(rankNum)}
                      alt={achievement.title}
                      className="w-8 h-8 object-contain leading-none"
                    />
                    <span className="text-[9px] font-semibold leading-tight text-center">{achievement.title}</span>
                  </motion.div>
                );
              })}
            </div>
          </GlassPanel>
        </motion.div>

        {/* Empty state */}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="text-6xl">📊</div>
            <h2 className="font-display text-2xl font-black">No stats yet</h2>
            <p className="text-muted-foreground max-w-xs">
              Start watching anime to build your personal stats and unlock achievements!
            </p>
            <Button onClick={() => navigate('/')}>
              Start Watching
            </Button>
          </div>
        )}
      </main>

      {!showSidebar && <MobileNav />}
    </div>
  );
}
