import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLeaderboard, LeaderboardType, useUserRank } from '@/hooks/community/useLeaderboard';
import { useAuth } from '@/contexts/AuthContext';
import {
  Trophy,
  Star,
  MessageSquare,
  TrendingUp,
  UserPlus,
  Flame,
  Crown,
  Sparkles,
  ChevronRight,
  Medal,
} from 'lucide-react';
import { getRankTier, getRankImageUrl } from '@/lib/rankUtils';
import { AnimatedCounter } from '@/components/profile/overview/AnimatedCounter';
import { cn } from '@/lib/utils';

export interface LeaderboardSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: LeaderboardType;
}

export const LEADERBOARD_TYPES: Array<{
  value: LeaderboardType;
  label: string;
  icon: React.ElementType;
  scoreLabel: string;
  color: string;
}> = [
  { value: 'watched', label: 'Most Watched', icon: Trophy, scoreLabel: 'episodes', color: 'text-amber-400' },
  { value: 'streak', label: 'Best Streak', icon: Flame, scoreLabel: 'days', color: 'text-rose-400' },
  { value: 'rated', label: 'Most Rated', icon: Star, scoreLabel: 'ratings', color: 'text-amber-300' },
  { value: 'comments', label: 'Most Comments', icon: MessageSquare, scoreLabel: 'comments', color: 'text-sky-400' },
  { value: 'active', label: 'Most Active', icon: TrendingUp, scoreLabel: 'points', color: 'text-emerald-400' },
  { value: 'followers', label: 'Most Followers', icon: UserPlus, scoreLabel: 'followers', color: 'text-purple-400' },
];

const PODIUM = [
  { rank: 1, glow: 'bg-amber-400/20', ring: 'ring-amber-400/70 border-amber-400/50', order: 'order-2', lift: '-mt-4', crown: 'text-amber-400', badgeBg: 'bg-amber-400/10 text-amber-300 border-amber-400/30' },
  { rank: 2, glow: 'bg-slate-300/15', ring: 'ring-slate-300/60 border-slate-300/40', order: 'order-1', lift: 'mt-2', crown: 'text-slate-300', badgeBg: 'bg-slate-300/10 text-slate-200 border-slate-300/30' },
  { rank: 3, glow: 'bg-amber-700/20', ring: 'ring-amber-700/60 border-amber-700/40', order: 'order-3', lift: 'mt-4', crown: 'text-amber-600', badgeBg: 'bg-amber-700/10 text-amber-400 border-amber-700/30' },
];

function displayName(entry: any) {
  return entry.display_name || (entry.username && entry.username !== 'null' ? entry.username : 'Anonymous');
}

function PodiumCard({
  entry,
  config,
  scoreLabel,
  onClose,
}: {
  entry: any;
  config: (typeof PODIUM)[number];
  scoreLabel: string;
  onClose: () => void;
}) {
  const rankTier = getRankTier(entry.score);
  return (
    <Link
      to={`/user/${entry.username || entry.user_id}`}
      onClick={onClose}
      className={cn('flex-1 group', config.order)}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'relative flex flex-col items-center overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-white/[0.02] p-4 text-center backdrop-blur-xl shadow-lg transition-all duration-300 group-hover:border-primary/50 group-hover:bg-white/[0.04] group-hover:-translate-y-1',
          config.lift,
        )}
      >
        <div className={cn('pointer-events-none absolute -top-8 h-24 w-24 rounded-full blur-[50px]', config.glow)} />
        
        {/* Crown & Rank indicator */}
        <div className="relative mb-1 flex items-center justify-center">
          <Crown className={cn('h-5 w-5 drop-shadow-md', config.crown)} />
        </div>

        <Avatar className={cn('relative h-14 w-14 ring-2 shadow-2xl transition-transform duration-300 group-hover:scale-105', config.ring)}>
          <AvatarImage src={entry.avatar_url || ''} />
          <AvatarFallback className="font-bold">{displayName(entry)[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>

        <span className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black border', config.badgeBg)}>
          #{config.rank}
        </span>

        <p className="relative mt-1.5 w-full truncate font-display text-xs font-bold tracking-tight text-white group-hover:text-primary transition-colors">
          {displayName(entry)}
        </p>

        <div className="relative mt-1 flex items-center gap-1">
          <img src={getRankImageUrl(rankTier.rank)} alt="" className="h-3.5 w-3.5 object-contain" />
          <span className={cn('text-[10px] font-semibold', rankTier.color)}>{rankTier.name}</span>
        </div>

        <p className="relative mt-1.5 font-display text-lg font-black tabular-nums text-white">
          <AnimatedCounter value={entry.score} />
        </p>
        <p className="relative text-[9px] uppercase tracking-wider text-muted-foreground/70">{scoreLabel}</p>
      </motion.div>
    </Link>
  );
}

function LeaderboardRow({
  entry,
  currentUserId,
  scoreLabel,
  onClose,
}: {
  entry: any;
  currentUserId?: string;
  scoreLabel: string;
  onClose: () => void;
}) {
  const isCurrentUser = entry.user_id === currentUserId;
  const rankTier = getRankTier(entry.score);

  return (
    <Link to={`/user/${entry.username || entry.user_id}`} onClick={onClose} className="block group">
      <div
        className={cn(
          'flex items-center gap-3.5 rounded-2xl border border-white/[0.04] bg-white/[0.015] px-3.5 py-3 transition-all duration-200 group-hover:border-white/[0.12] group-hover:bg-white/[0.04]',
          isCurrentUser && 'border-primary/40 bg-primary/[0.06] ring-1 ring-primary/40',
        )}
      >
        <span className="w-6 text-center font-display text-xs font-black tabular-nums text-muted-foreground/80 group-hover:text-white">
          {entry.rank}
        </span>

        <Avatar className="h-9 w-9 ring-1 ring-white/10 group-hover:ring-primary/40 transition-all">
          <AvatarImage src={entry.avatar_url || ''} />
          <AvatarFallback className="font-bold text-xs">{displayName(entry)[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-display text-xs font-bold tracking-tight text-white group-hover:text-primary transition-colors">
              {displayName(entry)}
            </p>
            {isCurrentUser && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[9px] font-bold uppercase text-primary">
                You
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <img src={getRankImageUrl(rankTier.rank)} alt="" className="h-3 w-3 object-contain" />
            <span className={cn('text-[10px] font-semibold', rankTier.color)}>{rankTier.name}</span>
          </div>
        </div>

        <div className="text-right">
          <p className="font-display text-sm font-bold tabular-nums text-white">
            {entry.score.toLocaleString()}
          </p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{scoreLabel}</p>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export function LeaderboardSheet({ open, onOpenChange, defaultType = 'watched' }: LeaderboardSheetProps) {
  const { user } = useAuth();
  const [type, setType] = useState<LeaderboardType>(defaultType);
  const limit = type === 'streak' ? 25 : 100;
  const { data: leaderboard, isLoading } = useLeaderboard(type, limit);
  const { data: userRank } = useUserRank(type, user?.id);

  const activeType = LEADERBOARD_TYPES.find((t) => t.value === type) || LEADERBOARD_TYPES[0];
  const scoreLabel = activeType.scoreLabel;

  const top3 = (leaderboard || []).slice(0, 3);
  const rest = (leaderboard || []).slice(3);

  const handleClose = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-white/[0.08] bg-background/60 p-0 backdrop-blur-[40px] sm:max-w-md md:max-w-lg shadow-[-20px_0_40px_rgba(0,0,0,0.5)] z-50"
      >
        {/* ── Ambient Background Glow (matching AvatarPickerSheet) ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/15 blur-[120px] rounded-full" />
          <div className="absolute bottom-20 left-0 w-72 h-72 bg-primary/10 blur-[100px] rounded-full" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background/95" />
        </div>

        {/* ── Header ── */}
        <SheetHeader className="relative shrink-0 border-b border-white/[0.05] bg-white/[0.01] p-6 pb-5 text-left z-10">
          <SheetTitle className="flex items-center gap-3 text-2xl font-black tracking-tight text-white drop-shadow-md">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/30 to-amber-500/5 border border-amber-500/20 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Trophy className="h-5 w-5" />
            </div>
            Hall of Fame
          </SheetTitle>
          <p className="text-xs font-medium text-muted-foreground/80 mt-1">
            Top ranked members across the Tatakai community
          </p>
        </SheetHeader>

        {/* ── Scrollable Body ── */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar relative z-10">
          {/* User Rank Preview Card (matching AvatarPickerSheet preview card) */}
          {userRank && (
            <div className="relative overflow-hidden rounded-[2rem] border border-amber-500/25 bg-amber-500/[0.04] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl group">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.08] to-transparent pointer-events-none" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-300 font-display text-lg font-black shadow-lg">
                    #{userRank.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Your Standing</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                        Top {Math.max(1, Math.round((userRank.rank / Math.max(1, userRank.totalUsers)) * 100))}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                      Out of {userRank.totalUsers.toLocaleString()} active community members
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-display text-xl font-black tabular-nums text-white">
                    {userRank.score.toLocaleString()}
                  </p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-amber-400/80">{scoreLabel}</p>
                </div>
              </div>
            </div>
          )}

          {/* Category Filter Pills (matching AvatarPickerSheet Tabs) */}
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl backdrop-blur-md">
            {LEADERBOARD_TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold tracking-tight transition-all duration-200',
                  type === value
                    ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.35)] scale-[1.02]'
                    : 'text-muted-foreground hover:text-white hover:bg-white/[0.03]',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* Content: Podium + Ranks */}
          {isLoading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 h-44 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-3xl bg-white/[0.03]" />
                ))}
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.03]" />
              ))}
            </div>
          ) : leaderboard && leaderboard.length > 0 ? (
            <div className="space-y-4">
              {/* Podium */}
              {top3.length === 3 && (
                <div className="flex items-end gap-2.5 pt-2 pb-2">
                  {PODIUM.map((config) => {
                    const entry = top3.find((e) => e.rank === config.rank);
                    return entry ? (
                      <PodiumCard
                        key={config.rank}
                        entry={entry}
                        config={config}
                        scoreLabel={scoreLabel}
                        onClose={handleClose}
                      />
                    ) : null;
                  })}
                </div>
              )}

              {/* Remaining list */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1 pt-2">
                  {top3.length === 3 ? 'Community Standings' : 'Top Members'}
                </p>
                {(top3.length === 3 ? rest : leaderboard).map((entry) => (
                  <LeaderboardRow
                    key={entry.user_id}
                    entry={entry}
                    currentUserId={user?.id}
                    scoreLabel={scoreLabel}
                    onClose={handleClose}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/[0.01] p-10 text-center">
              <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-bold text-white">No leaderboard records yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Start watching and engaging to get ranked!</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
