
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, Check, Plus, ArrowRight, BadgeCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityBySlug, useToggleCommunityMembership } from '@/hooks/community/useCommunities';

interface CommunityWidgetCardProps {
  slug: string;
  name?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function CommunityWidgetCard({
  slug,
  name,
  iconUrl,
  bannerUrl,
  children,
  side = 'bottom',
  className,
}: CommunityWidgetCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Gate the fetch on `open`
  const { data: community, isLoading } = useCommunityBySlug(open ? slug : undefined);
  const toggle = useToggleCommunityMembership();

  const displayName = community?.name || name || 'Community';
  const icon = community?.icon_url || iconUrl || null;
  const banner = community?.banner_url || bannerUrl || null;
  const memberCount = community?.member_count ?? null;
  const isMember = community?.is_member ?? false;

  const go = () => navigate(`/community/c/${slug}`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-80 overflow-hidden rounded-xl border border-white/10 bg-[#08090b]/95 p-0 shadow-2xl backdrop-blur-xl',
          className
        )}
      >
        {/* Banner */}
        <button
          type="button"
          onClick={go}
          className="relative block h-24 w-full overflow-hidden bg-zinc-800 transition-opacity hover:opacity-90"
        >
          {banner ? (
            <img src={getProxiedImageUrl(banner)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-secondary/20 to-zinc-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#08090b]/80 to-transparent" />
        </button>

        <div className="px-4 pb-4">
          {/* Avatar & Action Row */}
          <div className="flex items-start justify-between">
            <button
              type="button"
              onClick={go}
              className="relative z-10 -mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-[#08090b] bg-zinc-900 transition-transform hover:scale-105"
            >
              {icon ? (
                <img src={getProxiedImageUrl(icon)} alt="" className="h-full w-full object-cover object-center" />
              ) : (
                <Users className="h-8 w-8 text-zinc-500" />
              )}
            </button>

            <div className="mt-3 flex shrink-0 items-center gap-2">
              {user && (
                <Button
                  size="sm"
                  variant={isMember ? 'outline' : 'default'}
                  disabled={toggle.isPending || isLoading || !community}
                  onClick={() => community && toggle.mutate({ communityId: community.id, isMember })}
                  className={cn(
                    "h-8 rounded-full px-4 text-xs font-bold transition-all",
                    isMember ? "border-white/20 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500" : ""
                  )}
                >
                  {toggle.isPending || isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isMember ? (
                    <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Joined</span>
                  ) : (
                    'Join'
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Title & Slug */}
          <div className="mt-2 flex flex-col">
            <button type="button" onClick={go} className="flex items-center gap-1 text-left">
              <span className="truncate text-lg font-bold text-white hover:underline leading-tight">
                {displayName}
              </span>
              {community?.is_verified && (
                <BadgeCheck className="h-4.5 w-4.5 shrink-0 text-sky-400" aria-label="Verified community" />
              )}
            </button>
            <span className="text-sm text-zinc-400">c/{slug}</span>
          </div>

          {/* Description & Loading Skeletons */}
          {isLoading && !community ? (
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full animate-pulse rounded-md bg-white/10" />
              <div className="h-3 w-5/6 animate-pulse rounded-md bg-white/10" />
              <div className="h-3 w-4/6 animate-pulse rounded-md bg-white/10" />
            </div>
          ) : (
            community?.description && (
              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-300">
                {community.description}
              </p>
            )
          )}

          {/* Stats */}
          {isLoading && memberCount === null ? (
            <div className="mt-4 h-4 w-24 animate-pulse rounded-md bg-white/10" />
          ) : memberCount !== null ? (
            <div className="mt-4 flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1 text-zinc-400">
                <span className="font-bold text-white tabular-nums">{memberCount.toLocaleString()}</span> 
                {memberCount === 1 ? 'member' : 'members'}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Link */}
        <div className="border-t border-white/5 bg-white/[0.02] p-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={go} 
            className="group w-full justify-between text-zinc-300 hover:text-white hover:bg-white/5"
          >
            View Community
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
