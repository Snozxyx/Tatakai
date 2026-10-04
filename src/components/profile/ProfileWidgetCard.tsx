import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, UserCheck, UserPlus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RankBadge } from '@/components/ui/RankBadge';
import { UserBadges } from '@/components/ui/UserBadges';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { useFollow } from '@/hooks/community/useFollow';
import { useAuth } from '@/contexts/AuthContext';
import { ModerationMenu } from '@/components/moderation/ModerationMenu';
import { computeReputation } from '@/core/profile/reputation';
import { getRankNameStyle } from '@/lib/rankUtils';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface ProfileWidgetCardProps {
  /** Auth user id (= profiles.user_id). Drives badges, follow counts, bio fetch. */
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Unified rank score (RP) — see computeRankScore. Optional. */
  rankScore?: number;
  /** The clickable trigger (author name or avatar). */
  children: React.ReactNode;
  /** Popover side. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

/** Lightweight, privacy-safe profile lookup by user_id (does NOT throw on private). */
function useWidgetProfile(userId?: string | null, enabled = false) {
  return useQuery({
    queryKey: ['profile_widget', userId],
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, banner_url, bio, is_public, created_at')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Cheap activity stats for the popover — total episodes, cached watch time,
 * readlist size, and the raw signals `computeReputation` needs. Every read is a
 * `head:true` COUNT (no rows transferred) so this stays light even when the
 * widget is opened over a long comment list. Gated on `open` by the caller.
 */
function useWidgetStats(userId?: string | null, enabled = false) {
  return useQuery({
    queryKey: ['profile_widget_stats', userId],
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const countOf = async (table: string, extra?: (q: any) => any) => {
        let q = supabase.from(table as any).select('*', { count: 'exact', head: true }).eq('user_id', userId!);
        if (extra) q = extra(q);
        const { count } = await q;
        return count || 0;
      };

      const [episodes, mangaCount, commentsCount, ratingsCount, forumPostsCount, prof] = await Promise.all([
        countOf('watch_history'),
        countOf('manga_readlist'),
        countOf('comments'),
        countOf('ratings'),
        countOf('forum_posts', (q) => q.eq('is_approved', true)),
        supabase.from('profiles').select('total_watch_time_seconds').eq('user_id', userId!).maybeSingle(),
      ]);

      return {
        episodes,
        mangaCount,
        commentsCount,
        ratingsCount,
        forumPostsCount,
        watchTimeSeconds: Number(prof.data?.total_watch_time_seconds) || 0,
      };
    },
  });
}

/**
 * Ambient glow scoped to the card — a compact echo of the profile page's
 * background effects (drifting blurred orbs + a radial tint) that lives INSIDE
 * the popover rather than as a full-screen `fixed` layer. Collapses to a static
 * gradient under `prefers-reduced-motion`.
 */
function WidgetAmbient() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base radial tint */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, hsl(var(--primary) / 0.18) 0%, transparent 55%)',
        }}
      />
      {/* Drifting accent orbs */}
      <motion.div
        className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-primary/25 blur-3xl"
        animate={reduce ? undefined : { x: [0, 24, 0], y: [0, 16, 0], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-12 top-16 h-44 w-44 rounded-full bg-secondary/25 blur-3xl"
        animate={reduce ? undefined : { x: [0, -28, 0], y: [0, -18, 0], opacity: [0.4, 0.65, 0.4] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/**
 * Count-up number that animates 0 → `value` whenever the value changes (e.g.
 * once follow counts load). Respects `prefers-reduced-motion` by snapping.
 */
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.8, ease: 'easeOut' });
    return controls.stop;
  }, [value, reduce, mv]);

  return <motion.span>{text}</motion.span>;
}

function formatWatchTime(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours.toLocaleString()}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * A compact profile preview shown on click of a comment author (name/avatar).
 * Replaces the previous behavior of navigating straight to the profile page —
 * "Show more" is the explicit path to the full page. Data is fetched lazily
 * (only once the popover opens) so comment lists stay cheap to render.
 */
export function ProfileWidgetCard({
  userId,
  username,
  displayName,
  avatarUrl,
  rankScore = 0,
  children,
  side = 'right',
  className,
}: ProfileWidgetCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) void triggerHaptic('open');
  }, [open]);

  // Gate the fetches on `open` so nothing runs until the user actually opens it.
  const activeId = open ? userId ?? undefined : undefined;
  const { data: badges } = useUserBadges(activeId);
  const { isFollowing, checkingFollow, followStats, follow, unfollow, isFollowingLoading } = useFollow(activeId);
  const { data: stats } = useWidgetStats(activeId, open);
  const { data: fetched } = useWidgetProfile(userId, open);

  // Prefer freshly-fetched values, fall back to the props the comment already had.
  const name = fetched?.display_name || displayName || fetched?.username || username || 'User';
  const handle = fetched?.username || username;
  const avatar = fetched?.avatar_url || avatarUrl || undefined;
  const banner = fetched?.banner_url || undefined;
  const bio = fetched?.is_public ? fetched?.bio : null;
  const rankStyle = getRankNameStyle(rankScore);

  // Bounded reputation (0–100) from the cheap signals the widget already has.
  // Mirrors ProfilePage's computeReputation call; the streak/upvote terms aren't
  // fetched here, so this reads slightly conservative next to the full page.
  const reputationRate = useMemo(
    () =>
      computeReputation({
        episodes: stats?.episodes || 0,
        commentsCount: stats?.commentsCount || 0,
        ratingsCount: stats?.ratingsCount || 0,
        forumPosts: stats?.forumPostsCount || 0,
        followers: followStats?.followers || 0,
      }).score,
    [stats, followStats],
  );

  const isSelf = !!user && user.id === userId;
  const canFollow = !!user && !isSelf && !!userId;

  const goToProfile = () => {
    if (handle) navigate(`/@${handle}`);
  };

  const isMobile = useIsMobile();

  const close = () => {
    void triggerHaptic('tap');
    setOpen(false);
  };

  const cardBody = (
    <div className="relative">
      <WidgetAmbient />
      {/* hairline top highlight — consistent glass edge */}
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* Single refined close — top-left so it never collides with moderation kebab */}
      <button
        type="button"
        aria-label="Close profile preview"
        onClick={close}
        className="absolute left-2.5 top-2.5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 shadow-lg backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white active:scale-95"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Moderation kebab — report / ban / view-in-admin for this profile */}
      {userId && (
        <div className="absolute right-2 top-2 z-20">
          <ModerationMenu
            contentType="user"
            contentId={userId}
            authorUserId={userId}
            authorName={name}
            triggerClassName="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 shadow-lg backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
          />
        </div>
      )}

          <div className="relative z-10 flex flex-col">
            {/* Banner — falls back to an accent gradient so the header always has depth */}
            <div
              className="h-20 w-full shrink-0 cursor-pointer overflow-hidden bg-gradient-to-br from-primary/30 via-secondary/20 to-transparent"
              onClick={goToProfile}
            >
              {banner && (
                <img
                  src={getProxiedImageUrl(banner)}
                  alt=""
                  className="h-full w-full object-cover opacity-90"
                />
              )}
            </div>

            {/* Header */}
            <div className="-mt-8 flex items-start gap-3 px-4 pb-3">
              <Avatar
                className="h-16 w-16 shrink-0 cursor-pointer ring-4 ring-background transition-shadow hover:ring-primary/40"
                onClick={goToProfile}
              >
                <AvatarImage src={avatar} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-primary/60 to-secondary/60 text-lg font-bold text-primary-foreground">
                  {name[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 pt-8">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={goToProfile}
                    className={cn('truncate text-sm font-bold transition-opacity hover:opacity-80', rankStyle.className)}
                    style={rankStyle.style}
                  >
                    {name}
                  </button>
                  <UserBadges
                    badges={badges}
                    size={16}
                    max={4}
                    userStats={{
                      episodes: stats?.episodes ?? 0,
                      manga_chapters: stats?.mangaCount ?? 0,
                      comments: stats?.commentsCount ?? 0,
                      ratings: stats?.ratingsCount ?? 0,
                      reputation: reputationRate,
                    }}
                  />
                </div>
                {handle && <p className="truncate text-xs text-muted-foreground/70">@{handle}</p>}
              </div>
            </div>

            <div className="px-4 pb-3">
              <RankBadge score={rankScore} size="xs" />
            </div>

            {/* Follow / Unfollow — hidden on your own card and when signed out */}
            {canFollow && (
              <div className="px-4 pb-3">
                <Button
                  size="sm"
                  variant={isFollowing ? 'outline' : 'default'}
                  onClick={() => (isFollowing ? unfollow() : follow())}
                  disabled={checkingFollow || isFollowingLoading}
                  className="h-8 w-full gap-1.5 text-xs font-semibold"
                >
                  {isFollowingLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isFollowing ? (
                    <UserCheck className="h-3.5 w-3.5" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
              </div>
            )}

            {/* Bio (only for public profiles) */}
            {bio && <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">{bio}</p>}

            {/* Complete profile snapshot */}
            <div className="grid grid-cols-2 gap-2 border-y border-white/10 px-4 py-4">
              {[
                { label: 'Followers', value: <CountUp value={followStats?.followers ?? 0} /> },
                { label: 'Following', value: <CountUp value={followStats?.following ?? 0} /> },
                { label: 'Episodes watched', value: <CountUp value={stats?.episodes ?? 0} /> },
                { label: 'Watch time', value: formatWatchTime(stats?.watchTimeSeconds ?? 0) },
                { label: 'Comics read', value: <CountUp value={stats?.mangaCount ?? 0} /> },
                { label: 'Reputation', value: `${reputationRate}%` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-3 text-center">
                  <div className="text-lg font-black tabular-nums text-foreground">{stat.value}</div>
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Show more */}
            <div className="border-t border-white/5 p-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToProfile}
                disabled={!handle}
                className="h-9 w-full text-xs font-semibold"
              >
                View profile
              </Button>
            </div>
          </div>
        </div>
      );

      return (
      isMobile ? (
        // Mobile: true centered Dialog — Radix Popover's side-based transform
        // kept pulling the card to the side, so mobile gets a real modal.
        // NOTE: must use DialogTrigger asChild (not a wrapping onClick span):
        // call-site buttons call e.stopPropagation(), which would swallow a
        // bubbled wrapper click. asChild merges the open handler onto the
        // child element itself, exactly like PopoverTrigger does.
        <Dialog open={open} onOpenChange={(o) => { if (!o) void triggerHaptic('tap'); setOpen(o); }}>
          <DialogTrigger asChild>{children}</DialogTrigger>
          <DialogContent
            aria-describedby={undefined}
            className={cn(
              'w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-3xl border-white/10 bg-background/95 p-0 shadow-2xl backdrop-blur-xl custom-scrollbar',
              // hide the default top-right close — we own the single top-left one
              '[&>button.absolute.right-4]:hidden',
              className,
            )}
          >
            <DialogTitle className="sr-only">Profile preview — {name}</DialogTitle>
            {cardBody}
          </DialogContent>
        </Dialog>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{children}</PopoverTrigger>
          <PopoverContent
            side={side}
            align="center"
            className={cn(
              'z-[50] w-80 overflow-hidden rounded-3xl border-white/10 bg-background/90 p-0 shadow-2xl backdrop-blur-xl',
              className,
            )}
          >
            {cardBody}
          </PopoverContent>
        </Popover>
      ));
}
