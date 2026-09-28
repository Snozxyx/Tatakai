import { useNavigate } from 'react-router-dom';
import { Users, Check, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserBadges } from '@/components/ui/UserBadges';
import { useLeaderboard } from '@/hooks/community/useLeaderboard';
import { useSuggestedUsers } from '@/hooks/community/useSuggestedUsers';
import { useFollow } from '@/hooks/community/useFollow';
import { useBatchUserBadges } from '@/hooks/community/useUserBadges';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';
import type { BadgeDef } from '@/lib/badges';
import { cn } from '@/lib/utils';
import { OnlineDot } from './OnlineDot';

export interface SocialWidgetProps {
  className?: string;
  /** Presence ids from the page-owned `useCommunityPresence` (green online dots). */
  onlineUserIds?: Set<string>;
}

interface FollowSuggestion {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
}

function TopUserRow({ entry, badges, online }: { entry: FollowSuggestion; badges?: BadgeDef[]; online?: boolean }) {
  const navigate = useNavigate();
  const { isFollowing, follow, unfollow, isFollowingLoading } = useFollow(entry.user_id);

  const name = entry.display_name || entry.username || 'Anonymous';
  const goToProfile = () => {
    if (entry.username) navigate(`/user/${entry.username}`);
  };

  return (
    <div className="group/row relative overflow-hidden rounded-xl border border-white/[0.07] transition-all duration-200 hover:border-white/[0.14]">
      {/* Banner fills the whole card */}
      {entry.banner_url ? (
        <img
          src={getProxiedImageUrl(entry.banner_url)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-40 transition-transform duration-500 group-hover/row:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/15 via-primary/8 to-transparent" />
      )}
      {/* Dark scrim so text stays readable */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#08090b]/90 via-[#08090b]/70 to-[#08090b]/40" />

      {/* Content */}
      <div className="relative flex items-center gap-2.5 p-2.5">
        <button onClick={goToProfile} aria-label={`View ${name}'s profile`} className="relative shrink-0">
          <Avatar className="h-9 w-9 ring-2 ring-white/10 transition-transform duration-200 group-hover/row:scale-105">
            <AvatarImage src={entry.avatar_url || ''} className="object-cover" />
            <AvatarFallback className="bg-zinc-800 text-xs font-bold text-zinc-400">
              {name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {online && <OnlineDot size="sm" className="ring-[#08090b]" />}
        </button>

        <button onClick={goToProfile} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1">
            <p className="truncate text-xs font-semibold text-zinc-100">
              {name}
            </p>
            <UserBadges badges={badges} size={11} max={1} />
          </div>
          {entry.username && (
            <p className="truncate text-[10px] text-zinc-400/80">@{entry.username}</p>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            isFollowing ? unfollow() : follow();
          }}
          disabled={isFollowingLoading}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[11px] font-bold transition-all duration-200 active:scale-95 disabled:opacity-60',
            isFollowing
              ? 'border border-white/[0.12] bg-black/40 text-zinc-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400'
              : 'bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.15)] hover:bg-sky-400',
          )}
        >
          {isFollowing ? (
            <><Check className="h-3 w-3" />Following</>
          ) : (
            <><UserPlus className="h-3 w-3" />Follow</>
          )}
        </button>
      </div>
    </div>
  );
}

export function SocialWidget({ className, onlineUserIds }: SocialWidgetProps) {
  const { user } = useAuth();
  const { data: suggested = [], isLoading: loadingSuggested } = useSuggestedUsers(8);
  const { data: leaders = [], isLoading: loadingLeaders } = useLeaderboard('active', 8);

  const pool: FollowSuggestion[] = suggested.length > 0 ? suggested : (leaders as FollowSuggestion[]);
  const isLoading = loadingSuggested || (suggested.length === 0 && loadingLeaders);
  const suggestions = pool.filter((u) => u.user_id !== user?.id).slice(0, 5);

  const { data: badgeMap } = useBatchUserBadges(suggestions.map((s) => s.user_id));

  return (
    <div
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
        className
      )}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-sky-500/10 blur-[90px] transition-all group-hover:bg-sky-500/20" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-[90px] transition-all group-hover:bg-primary/20" />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 p-4 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10">
          <Users className="h-3.5 w-3.5 text-sky-400" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
          Who to Follow
        </span>
      </div>

      {/* List */}
      <div className="relative z-10 flex flex-col gap-2 px-3 pb-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-xl border border-white/[0.05]"
            >
              <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />
              <div className="relative flex items-center gap-2.5 p-2.5">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/10" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-24 animate-pulse rounded-full bg-white/8" />
                  <div className="h-2 w-16 animate-pulse rounded-full bg-white/5" />
                </div>
                <div className="h-7 w-20 animate-pulse rounded-full bg-white/5" />
              </div>
            </div>
          ))
        ) : suggestions.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-zinc-500">No suggestions yet.</p>
        ) : (
          suggestions.map((entry) => (
            <TopUserRow key={entry.user_id} entry={entry} badges={badgeMap?.[entry.user_id]} online={onlineUserIds?.has(entry.user_id)} />
          ))
        )}
      </div>
    </div>
  );
}
