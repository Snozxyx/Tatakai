import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLeaderboard } from '@/hooks/community/useLeaderboard';
import type { PresenceUser } from '@/hooks/community/useCommunityPresence';
import { OnlineDot } from './OnlineDot';
import { cn } from '@/lib/utils';

export interface MembersShowcaseWidgetProps {
  className?: string;
  onlineUserIds: Set<string>;
  /** Global feed mode: presence list used to seed the grid before leaderboard fill. */
  onlineUsers?: PresenceUser[];
  /**
   * Community mode: the exact roster to show (people who joined THIS community).
   * When supplied, the leaderboard fallback is skipped and the online count in
   * the header reflects online *members of this community* only.
   */
  members?: ShowcaseMember[];
  /** Header label (defaults to "Members"). */
  title?: string;
  /** Max avatars to render. */
  limit?: number;
}

interface ShowcaseMember {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * "Community members" showcase (Item 9): online members first (green dot),
 * then the rest of the roster. Presence is passed in — the page owns the single
 * `community-presence` subscription.
 *
 * Two modes: global feed (online users + active-leaderboard fill), or
 * community-scoped (pass `members` = people who joined that community).
 */
export function MembersShowcaseWidget({
  className,
  onlineUsers,
  onlineUserIds,
  members: roster,
  title = 'Members',
  limit = 20,
}: MembersShowcaseWidgetProps) {
  const navigate = useNavigate();
  const scoped = Array.isArray(roster);
  // Shares the feed page's cache key; the result is ignored in scoped mode.
  const { data: leaders = [] } = useLeaderboard('active', 16);

  // De-dupe the source pool, then order online-first so live members lead.
  const pool: ShowcaseMember[] = scoped
    ? roster!
    : [...(onlineUsers ?? []), ...(leaders as ShowcaseMember[])];
  const seen = new Set<string>();
  const online: ShowcaseMember[] = [];
  const offline: ShowcaseMember[] = [];
  for (const u of pool) {
    if (!u.user_id || seen.has(u.user_id)) continue;
    seen.add(u.user_id);
    (onlineUserIds.has(u.user_id) ? online : offline).push(u);
  }
  const members = [...online, ...offline].slice(0, limit);
  // Header count: online members of THIS community (scoped) vs global online.
  const onlineCount = scoped ? online.length : onlineUserIds.size;

  return (
    <div
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all hover:border-white/[0.12]',
        className,
      )}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-emerald-500/10 blur-[90px] transition-all group-hover:bg-emerald-500/20" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-[90px]" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
            <Users className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">{title}</span>
        </div>
        {onlineCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="tabular-nums">{onlineCount}</span> online
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="relative z-10 px-4 pb-4">
        {members.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-zinc-500">No members to show yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
            {members.map((m) => {
              const name = m.display_name || m.username || 'Anonymous';
              return (
                <button
                  key={m.user_id}
                  onClick={() => m.username && navigate(`/user/${m.username}`)}
                  className="group/m flex flex-col items-center gap-1.5"
                  title={name}
                >
                  <div className="relative">
                    <Avatar className="h-11 w-11 ring-2 ring-white/[0.06] transition-transform duration-200 group-hover/m:scale-105">
                      <AvatarImage src={m.avatar_url || ''} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-xs font-bold text-zinc-400">
                        {name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {onlineUserIds.has(m.user_id) && <OnlineDot size="sm" className="ring-[#08090b]" />}
                  </div>
                  <span className="w-full truncate text-center text-[10px] font-medium text-zinc-400 transition-colors group-hover/m:text-zinc-200">
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
