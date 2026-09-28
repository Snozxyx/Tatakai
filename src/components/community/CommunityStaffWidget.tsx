import { useNavigate } from 'react-router-dom';
import { Crown, Shield, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { OnlineDot } from './feed/OnlineDot';
import type { CommunityMember } from '@/hooks/community/useCommunities';

const ROLE_META: Record<string, { label: string; icon: typeof Crown; className: string }> = {
  owner: { label: 'Owner', icon: Crown, className: 'text-amber-400 border-amber-400/25 bg-amber-400/10' },
  mod: { label: 'Moderator', icon: Shield, className: 'text-sky-400 border-sky-400/25 bg-sky-400/10' },
};

/**
 * The community's staff team — owner + moderators — surfaced as a rail widget
 * on the community space page so members can see who runs the space. Shares the
 * solid-dark community-widget card language ([[community-feed-platform]]).
 * Roster comes from `useCommunityMembers`; presence drives the green dots.
 * Renders nothing when there's no staff to show.
 */
export function CommunityStaffWidget({
  members,
  onlineUserIds,
  className,
}: {
  members: CommunityMember[];
  onlineUserIds: Set<string>;
  className?: string;
}) {
  const navigate = useNavigate();

  // Owner first, then mods; members are excluded from the staff list.
  const staff = members
    .filter((m) => m.role === 'owner' || m.role === 'mod')
    .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));

  if (staff.length === 0) return null;

  return (
    <div
      className={cn(
        'community-card community-card-hover group flex w-full flex-col',
        className,
      )}
    >
      <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-amber-400/10 blur-[90px] transition-colors group-hover:bg-amber-400/20" />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 p-4 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10">
          <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">Community Team</span>
      </div>

      {/* Staff rows */}
      <div className="relative z-10 space-y-1.5 px-3 pb-3">
        {staff.map((m) => {
          const name = m.display_name || m.username || 'Anonymous';
          const meta = ROLE_META[m.role] ?? ROLE_META.mod;
          const RoleIcon = meta.icon;
          return (
            <button
              key={m.user_id}
              onClick={() => m.username && navigate(`/user/${m.username}`)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.03] bg-white/[0.015] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
              title={name}
            >
              <div className="relative shrink-0">
                <Avatar className="h-9 w-9 ring-2 ring-white/[0.06]">
                  <AvatarImage src={m.avatar_url || ''} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-xs font-bold text-zinc-400">
                    {name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {onlineUserIds.has(m.user_id) && <OnlineDot size="sm" className="ring-background" />}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{name}</span>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  meta.className,
                )}
              >
                <RoleIcon className="h-3 w-3" />
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
