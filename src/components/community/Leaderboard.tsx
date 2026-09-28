import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLeaderboard, LeaderboardType, useUserRank } from '@/hooks/community/useLeaderboard';
import { useAuth } from '@/contexts/AuthContext';
import { Trophy, Star, MessageSquare, TrendingUp, UserPlus, Flame, Crown } from 'lucide-react';
import { getRankTier, getRankImageUrl } from '@/lib/rankUtils';
import { AnimatedCounter } from '@/components/profile/overview/AnimatedCounter';
import { cn } from '@/lib/utils';

const LEADERBOARD_TYPES: Array<{ value: LeaderboardType; label: string; icon: any; scoreLabel: string }> = [
  { value: 'watched', label: 'Most Watched', icon: Trophy, scoreLabel: 'episodes' },
  { value: 'streak', label: 'Best Streak', icon: Flame, scoreLabel: 'days' },
  { value: 'rated', label: 'Most Rated', icon: Star, scoreLabel: 'ratings' },
  { value: 'comments', label: 'Most Comments', icon: MessageSquare, scoreLabel: 'comments' },
  { value: 'active', label: 'Most Active', icon: TrendingUp, scoreLabel: 'points' },
  { value: 'followers', label: 'Most Followers', icon: UserPlus, scoreLabel: 'followers' },
];

const PODIUM = [
  { rank: 1, glow: 'bg-amber/20', ring: 'ring-amber/50', order: 'order-2', lift: '-mt-4', crown: 'text-amber' },
  { rank: 2, glow: 'bg-white/10', ring: 'ring-white/30', order: 'order-1', lift: 'mt-2', crown: 'text-muted-foreground' },
  { rank: 3, glow: 'bg-orange/20', ring: 'ring-orange/40', order: 'order-3', lift: 'mt-4', crown: 'text-orange' },
];

function displayName(entry: any) {
  return entry.display_name || (entry.username && entry.username !== 'null' ? entry.username : 'Anonymous');
}

function PodiumCard({ entry, config, scoreLabel }: { entry: any; config: (typeof PODIUM)[number]; scoreLabel: string }) {
  const rankTier = getRankTier(entry.score);
  return (
    <Link to={`/user/${entry.username || entry.user_id}`} className={cn('flex-1', config.order)}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'relative flex flex-col items-center overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4 text-center transition-all hover:border-primary/40',
          config.lift,
        )}
      >
        <div className={cn('pointer-events-none absolute -top-8 h-24 w-24 rounded-full blur-[50px]', config.glow)} />
        <Crown className={cn('relative mb-1 h-4 w-4', config.crown)} />
        <Avatar className={cn('relative h-14 w-14 ring-2', config.ring)}>
          <AvatarImage src={entry.avatar_url || ''} />
          <AvatarFallback>{displayName(entry)[0]}</AvatarFallback>
        </Avatar>
        <p className="relative mt-2 w-full truncate text-sm font-display font-bold tracking-tight">{displayName(entry)}</p>
        <div className="relative mt-0.5 flex items-center gap-1">
          <img src={getRankImageUrl(rankTier.rank)} alt="" className="h-3.5 w-3.5 object-contain" />
          <span className={cn('text-[10px] font-semibold', rankTier.color)}>{rankTier.name}</span>
        </div>
        <p className="relative mt-1 font-display text-xl font-black tabular-nums">
          <AnimatedCounter value={entry.score} />
        </p>
        <p className="relative text-[10px] uppercase tracking-wider text-muted-foreground/70">{scoreLabel}</p>
      </motion.div>
    </Link>
  );
}

function LeaderboardRow({ entry, currentUserId, scoreLabel }: { entry: any; currentUserId?: string; scoreLabel: string }) {
  const isCurrentUser = entry.user_id === currentUserId;
  const rankTier = getRankTier(entry.score);
  return (
    <Link to={`/user/${entry.username || entry.user_id}`}>
      <div
        className={cn(
          'flex items-center gap-4 rounded-2xl border border-white/[0.03] bg-white/[0.015] px-4 py-3 transition-all hover:border-white/[0.08] hover:bg-white/[0.03]',
          isCurrentUser && 'ring-1 ring-primary/60',
        )}
      >
        <span className="w-6 text-center font-display text-sm font-bold tabular-nums text-muted-foreground">
          {entry.rank}
        </span>
        <Avatar className="h-10 w-10">
          <AvatarImage src={entry.avatar_url || ''} />
          <AvatarFallback>{displayName(entry)[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-display font-bold tracking-tight">{displayName(entry)}</p>
            {isCurrentUser && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">You</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <img src={getRankImageUrl(rankTier.rank)} alt="" className="h-3.5 w-3.5 object-contain" />
            <span className={cn('text-xs font-semibold', rankTier.color)}>{rankTier.name}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-bold tabular-nums">{entry.score.toLocaleString()}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{scoreLabel}</p>
        </div>
      </div>
    </Link>
  );
}

export function Leaderboard() {
  const { user } = useAuth();
  const [type, setType] = useState<LeaderboardType>('watched');
  const limit = type === 'streak' ? 10 : 100;
  const { data: leaderboard, isLoading } = useLeaderboard(type, limit);
  const { data: userRank } = useUserRank(type, user?.id);

  const activeType = LEADERBOARD_TYPES.find((t) => t.value === type)!;
  const scoreLabel = activeType.scoreLabel;

  const top3 = (leaderboard || []).slice(0, 3);
  const rest = (leaderboard || []).slice(3);

  return (
    <GlassPanel className="relative overflow-hidden rounded-[2rem] p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-amber/10 blur-[70px]" />

      {/* Header */}
      <div className="relative mb-4 flex items-center gap-2.5">
        <Trophy className="h-4 w-4 text-amber" />
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight">Leaderboard</h3>
          <p className="text-xs text-muted-foreground/70">Top community members</p>
        </div>
      </div>

      {/* Type pills */}
      <div className="relative mb-5 flex flex-wrap gap-1.5">
        {LEADERBOARD_TYPES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tracking-tight transition-all',
              type === value
                ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.4)]'
                : 'bg-white/[0.03] text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* User rank */}
      {userRank && (
        <div className="relative mb-5 flex items-center justify-between overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Your Rank</p>
            <p className="font-display text-xl font-black tabular-nums">
              #{userRank.rank} <span className="text-sm font-normal text-muted-foreground">of {userRank.totalUsers.toLocaleString()}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Your Score</p>
            <p className="font-display text-xl font-black tabular-nums">
              {userRank.score.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{scoreLabel}</span>
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : leaderboard && leaderboard.length > 0 ? (
        <div className="relative space-y-3">
          {/* Podium */}
          {top3.length === 3 && (
            <div className="mb-2 flex items-end gap-2 sm:gap-3">
              {PODIUM.map((config) => {
                const entry = top3.find((e) => e.rank === config.rank);
                return entry ? (
                  <PodiumCard key={config.rank} entry={entry} config={config} scoreLabel={scoreLabel} />
                ) : null;
              })}
            </div>
          )}

          {/* Remaining rows */}
          <div className="space-y-2">
            {(top3.length === 3 ? rest : leaderboard).map((entry) => (
              <LeaderboardRow key={entry.user_id} entry={entry} currentUserId={user?.id} scoreLabel={scoreLabel} />
            ))}
          </div>
        </div>
      ) : (
        <div className="relative rounded-2xl border border-dashed border-white/10 bg-white/[0.01] py-12 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No leaderboard data available</p>
        </div>
      )}
    </GlassPanel>
  );
}
