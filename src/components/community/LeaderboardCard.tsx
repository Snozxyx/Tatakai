import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Crown, Plus, Trophy, ChevronRight } from 'lucide-react';
import { useLeaderboard } from '@/hooks/community/useLeaderboard';
import { LeaderboardSheet } from './LeaderboardSheet';
import { cn } from '@/lib/utils';

export interface LeaderboardCardProps {
  className?: string;
  onOpen?: () => void;
}

export function LeaderboardCard({ className, onOpen }: LeaderboardCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: topUsers = [], isLoading } = useLeaderboard('watched', 5);

  const handleOpen = () => {
    if (onOpen) onOpen();
    else setSheetOpen(true);
  };

  const getRankBadge = (index: number) => {
    switch (index) {
      case 0:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 1:
        return 'bg-slate-300/10 text-slate-300 border-slate-300/20';
      case 2:
        return 'bg-amber-700/10 text-amber-600 border-amber-700/20';
      default:
        return 'bg-white/5 text-zinc-400 border-white/5';
    }
  };

  return (
    <>
      <div
        onClick={handleOpen}
        className={cn(
          'group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
          className
        )}
      >
        {/* Ambient background glows */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-amber-500/10 blur-[90px] transition-all group-hover:bg-amber-500/20" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-primary/10 blur-[90px] transition-all group-hover:bg-primary/20" />

        {/* Header Section */}
        <div className="relative z-10 flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
              Leaderboard
            </span>
          </div>
        </div>

        {/* List Section */}
        <div className="relative z-10 flex flex-col gap-1 px-3">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2 animate-pulse">
                <div className="h-[52px] w-[38px] shrink-0 rounded-lg bg-white/5" />
                <div className="flex-1 space-y-2.5 py-1">
                  <div className="h-3 w-24 rounded-full bg-white/5" />
                  <div className="h-2.5 w-16 rounded-full bg-white/5" />
                </div>
                <div className="h-8 w-8 shrink-0 rounded-full bg-white/5" />
              </div>
            ))
          ) : (
            topUsers.slice(0, 5).map((entry, i) => (
              <div
                key={entry.user_id}
                className="group/row flex items-center gap-3 rounded-2xl px-2 py-2 transition-all duration-300 hover:bg-white/[0.04]"
              >
                {/* Poster-style Avatar */}
                <div className="relative h-[52px] w-[38px] shrink-0 overflow-hidden rounded-lg border border-white/[0.05] bg-zinc-900 shadow-md">
                  <Avatar className="h-full w-full rounded-none">
                    <AvatarImage src={entry.avatar_url || ''} className="object-cover transition-transform duration-500 group-hover/row:scale-110" />
                    <AvatarFallback className="rounded-none bg-zinc-800 text-xs font-bold text-zinc-400">
                      {(entry.display_name || entry.username || 'U')[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-lg pointer-events-none" />
                </div>

                {/* Info & Score */}
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="truncate text-[13px] font-semibold text-zinc-100 transition-colors group-hover/row:text-white">
                    {entry.display_name || entry.username || 'Anonymous'}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className={cn(
                      'flex h-4 items-center justify-center rounded border px-1.5 text-[9px] font-bold tracking-wider',
                      getRankBadge(i)
                    )}>
                      {i === 0 && <Crown className="mr-1 h-2.5 w-2.5" />}
                      #{i + 1}
                    </div>
                    <span className="text-[11px] font-medium text-zinc-500">
                      <span className="text-zinc-300">{entry.score.toLocaleString()}</span> eps
                    </span>
                  </div>
                </div>

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-zinc-400 shadow-sm transition-all duration-300 group-hover/row:scale-110 group-hover/row:border-white/[0.15] group-hover/row:bg-white/[0.08] group-hover/row:text-white">
                  <Plus className="h-4 w-4" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Floating Glass CTA Card */}
        <div className="relative z-10 mt-3 p-4 pt-0">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 p-3.5 shadow-xl backdrop-blur-xl transition-all duration-300 group-hover:border-amber-500/30 group-hover:bg-black/50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-white transition-colors group-hover:text-amber-400">
                  Full Rankings
                </h3>
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  See where you stand
                </p>
              </div>
              <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-amber-400 group-active:scale-95">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <LeaderboardSheet open={sheetOpen} onOpenChange={setSheetOpen} defaultType="watched" />
    </>
  );
}
