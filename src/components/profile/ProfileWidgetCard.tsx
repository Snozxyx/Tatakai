import { useOwnedProfileThemes } from '@/hooks/user/useProfileThemeClaims';
import { isTV } from "@/core/tv/device";
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { CachedProfileImage } from '@/components/ui/cached-profile-image';
import { useProfileWatchTime } from '@/hooks/user/useProfileWatchTime';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { readThemePreferences } from '@/lib/profileThemes';
import { resolveProfileTheme } from '@/components/profile/themes/registry';
import './themes/sekaipop/sekaipop-preview.css';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, UserCheck, UserPlus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
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
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { ProfileBackgroundEffects } from '@/components/profile/ProfileBackgroundEffects';
import { AvatarDecoration } from '@/components/profile/AvatarDecoration';
import { ProfileCosmeticEffect, ProfileNameplate } from '@/components/profile/ProfileCosmeticEffect';
import { hasPremiumCosmetics } from '@/lib/profileCosmetics';
import { profileSurfaceStyle, readProfileCustomization } from '@/lib/profileSettings';

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
  useUiTranslation();
  return useQuery({
    queryKey: ['profile_widget', userId],
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, banner_url, bio, is_public, show_history, show_watchlist, created_at, app_settings, is_admin, role')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Counts plus a cached, narrow watch-history total shared with full profiles. */
function useWidgetStats(userId?: string | null, enabled = false, watchAllowed = false, libraryAllowed = false) {
  useUiTranslation();
  const watched = useProfileWatchTime(userId, enabled && watchAllowed);
  const stats = useQuery({
    queryKey: ['profile_widget_stats', userId, watchAllowed, libraryAllowed],
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const countOf = async (table: string, extra?: (q: any) => any) => {
        let q = supabase.from(table as any).select('*', { count: 'exact', head: true }).eq('user_id', userId!);
        if (extra) q = extra(q);
        const { count } = await q;
        return count || 0;
      };

      const [episodes, mangaCount, commentsCount, ratingsCount, forumPostsCount] = await Promise.all([
        watchAllowed ? countOf('watch_history') : Promise.resolve(0),
        libraryAllowed ? countOf('manga_readlist') : Promise.resolve(0),
        countOf('comments'),
        countOf('ratings'),
        countOf('forum_posts', (q) => q.eq('is_approved', true)),
      ]);

      return {
        episodes,
        mangaCount,
        commentsCount,
        ratingsCount,
        forumPostsCount,
      };
    },
  });
  return { ...stats, data: stats.data ? { ...stats.data, watchTimeSeconds: watched.data ?? 0 } : undefined };
}

/**
 * Ambient glow scoped to the card — a compact echo of the profile page's
 * background effects (drifting blurred orbs + a radial tint) that lives INSIDE
 * the popover rather than as a full-screen `fixed` layer. Collapses to a static
 * gradient under `prefers-reduced-motion`.
 */
function WidgetAmbient() {
  useUiTranslation();
  const reduce = useMotionPreference();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base radial tint */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, hsl(var(--profile-accent) / 0.18) 0%, transparent 55%)',
        }}
      />
      {/* Drifting accent orbs */}
      <motion.div
        className="absolute -left-10 -top-10 h-40 w-40 rounded-full blur-3xl"
        style={{ background: 'hsl(var(--profile-accent) / 0.25)' }}
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
  useUiTranslation();
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString(uiI18n.language));

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
  if (hours > 0) return `${hours.toLocaleString(uiI18n.language)}h ${minutes}m`;
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
  useUiTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) void triggerHaptic('open');
  }, [open]);

  // Gate the fetches on `open` so nothing runs until the user actually opens it.
  const activeId = open ? userId ?? undefined : undefined;
  const { data: badges, isPending: pendingBadges, isSuccess: verifiedBadges } = useUserBadges(activeId);
  const { isFollowing, checkingFollow, followStats, follow, unfollow, isFollowingLoading } = useFollow(activeId);
  const { data: fetched, isPending: pendingProfile } = useWidgetProfile(userId, open);
  const { data: stats } = useWidgetStats(activeId, open, user?.id === userId || (!!fetched?.is_public && fetched?.show_history !== false), user?.id === userId || (!!fetched?.is_public && fetched?.show_watchlist !== false));

  // Prefer freshly-fetched values, fall back to the props the comment already had.
  const name = fetched?.display_name || displayName || fetched?.username || username || 'User';
  const handle = fetched?.username || username;
  const avatar = fetched?.avatar_url || avatarUrl || undefined;
  const banner = fetched?.banner_url || undefined;
  const bio = fetched?.is_public ? fetched?.bio : null;
  const rankStyle = getRankNameStyle(rankScore);
  const customization = readProfileCustomization(fetched, hasPremiumCosmetics(fetched, badges));
  const { backgroundEffect, avatarDecoration, profileEffect, nameplate } = customization;

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
    if (handle) {
      setOpen(false);
      navigate(`/@${handle}`, { state: fetched && (fetched.is_public || isSelf) ? { profileArrival: { username: handle, display_name: name, avatar_url: avatar, app_settings: { profileThemes: readThemePreferences(fetched.app_settings) } } } : undefined });
    }
  };

  const isMobile = useIsMobile();

  const close = () => {
    void triggerHaptic('tap');
    setOpen(false);
  };

  const ownedThemes = useOwnedProfileThemes(open ? userId : undefined);
  const widgetPreferences = readThemePreferences(fetched?.app_settings);
  const widgetTheme = resolveProfileTheme(widgetPreferences, fetched, badges ?? [], verifiedBadges, ownedThemes.data);
  const Preview = widgetTheme.Preview;
  const resolvingWidget = open && (pendingProfile || pendingBadges || ownedThemes.isLoading);
  if (resolvingWidget || (Preview && fetched)) {
    const loadingCard = <div className="profile-widget-resolving" role="status"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Opening profile card…</div>;
    const themedBody = resolvingWidget ? loadingCard : Preview && fetched ? <Suspense fallback={loadingCard}><Preview
      userId={userId ?? undefined} configuration={widgetPreferences.configurations[widgetTheme.id]} name={name} username={handle} avatar={avatar} banner={banner} bio={bio}
      badges={badges ?? []} followers={followStats?.followers} following={followStats?.following} episodes={stats?.episodes} watchTimeSeconds={stats?.watchTimeSeconds}
      privateProfile={!fetched.is_public && !isSelf} canViewHistory={isSelf || (fetched.is_public && fetched.show_history !== false)}
      canFollow={canFollow} isFollowing={Boolean(isFollowing)} followPending={checkingFollow || isFollowingLoading}
      onFollow={() => isFollowing ? unfollow() : follow()} onOpen={goToProfile} onClose={close}
      moderation={userId ? <ModerationMenu contentType="user" contentId={userId} authorUserId={userId} authorName={name} /> : undefined}
    /></Suspense> : loadingCard;
    return isMobile || isTV() ? <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild>{children}</DialogTrigger><DialogContent showCloseButton={false} aria-describedby={undefined} className={cn('profile-theme-preview-shell', className)}><DialogTitle className="sr-only">{name} profile preview</DialogTitle>{themedBody}</DialogContent></Dialog> : <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{children}</PopoverTrigger><PopoverContent side={side} align="center" className={cn('profile-theme-preview-shell z-[60]', className)}>{themedBody}</PopoverContent></Popover>;
  }

  if (isTV()) return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="tv-profile-widget" aria-describedby={undefined}>
        {banner && <div className="tv-profile-widget-cover"><CachedProfileImage className="tv-profile-widget-banner" src={banner} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /></div>}
        <div className="tv-profile-widget-body" style={profileSurfaceStyle(customization)}>
          <div className="tv-profile-widget-identity">
            <div className="tv-profile-widget-avatar"><Avatar><AvatarImage src={avatar} /><AvatarFallback>{name[0]}</AvatarFallback></Avatar><AvatarDecoration decoration={avatarDecoration} /></div>
            <div><DialogTitle><ProfileNameplate nameplate={nameplate}>{name}</ProfileNameplate></DialogTitle><p>@{handle || 'user'}</p><RankBadge score={rankScore} size="sm" /></div>
          </div>
          <UserBadges badges={badges} size={28} max={5} />
          {bio && <p className="tv-profile-widget-bio">{bio}</p>}
          {fetched && !fetched.is_public && !isSelf && <p>This profile is private.</p>}
          <dl className="tv-profile-widget-stats"><div><dt>Followers</dt><dd>{followStats?.followers ?? '—'}</dd></div><div><dt>Following</dt><dd>{followStats?.following ?? '—'}</dd></div>{(isSelf || (fetched?.is_public && fetched.show_history !== false)) && <><div><dt>Episodes watched</dt><dd>{stats?.episodes ?? '—'}</dd></div><div><dt>Watch time</dt><dd>{stats ? formatWatchTime(stats.watchTimeSeconds) : '—'}</dd></div></>}</dl>
          <div className="tv-profile-widget-actions"><Button disabled={!handle} onClick={() => { setOpen(false); navigate(`/user/${handle}`); }}>View full profile</Button>{canFollow && <Button variant="outline" disabled={isFollowingLoading || checkingFollow} onClick={() => isFollowing ? unfollow() : follow()}>{isFollowing ? <UserCheck /> : <UserPlus />}{isFollowing ? 'Following' : 'Follow'}</Button>}<Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const cardBody = (
    <div className="relative isolate overflow-hidden" style={profileSurfaceStyle(customization)}>
      {backgroundEffect === 'none' && <WidgetAmbient />}
      {open && <ProfileBackgroundEffects effect={backgroundEffect} variant="widget" />}
      {open && <ProfileCosmeticEffect effect={profileEffect} />}
      {/* hairline top highlight — consistent glass edge */}
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* Single refined close — top-left so it never collides with moderation kebab */}
      <button
        type="button"
        aria-label={uiI18n.t('app.close_profile_preview_fb08f6b3')}
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
              style={{ maskImage: 'linear-gradient(to bottom, black 35%, transparent 100%)' }}
              onClick={goToProfile}
            >
              {banner && (
                <CachedProfileImage
                  src={banner}
                  alt=""
                  className="h-full w-full object-cover opacity-90"
                />
              )}
            </div>

            {/* Header */}
            <div className="-mt-8 flex items-start gap-3 px-4 pb-3">
              <div className="relative h-16 w-16 shrink-0">
                <Avatar
                  className="h-16 w-16 shrink-0 cursor-pointer ring-4 ring-background transition-shadow hover:ring-primary/40"
                  onClick={goToProfile}
                >
                  <AvatarImage src={avatar} className="object-cover" />
                  <AvatarFallback className="bg-gradient-to-br from-primary/60 to-secondary/60 text-lg font-bold text-primary-foreground">
                    {name[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <AvatarDecoration decoration={avatarDecoration} />
              </div>
              <div className="min-w-0 flex-1 pt-8">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={goToProfile}
                    className={cn('truncate text-sm font-bold transition-opacity hover:opacity-80', rankStyle.className)}
                    style={rankStyle.style}
                  >
                    <ProfileNameplate nameplate={nameplate}>{name}</ProfileNameplate>
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
                  {isFollowing ? uiI18n.t('app.following_90eeb100') : uiI18n.t('app.follow_66587a7a')}
                </Button>
              </div>
            )}

            {/* Bio (only for public profiles) */}
            {bio && <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">{bio}</p>}

            {/* Complete profile snapshot */}
            <div className="grid grid-cols-2 gap-2 border-y border-white/10 px-4 py-4">
              {[
                { get label() { return uiI18n.t('app.followers_78eaabf4'); }, value: <CountUp value={followStats?.followers ?? 0} /> },
                { get label() { return uiI18n.t('app.following_90eeb100'); }, value: <CountUp value={followStats?.following ?? 0} /> },
                { get label() { return uiI18n.t('app.episodes_watched_a91d9ad8'); }, value: <CountUp value={stats?.episodes ?? 0} /> },
                { get label() { return uiI18n.t('app.watch_time_200564a6'); }, value: formatWatchTime(stats?.watchTimeSeconds ?? 0) },
                { get label() { return uiI18n.t('app.comics_read_4581963d'); }, value: <CountUp value={stats?.mangaCount ?? 0} /> },
                { get label() { return uiI18n.t('app.reputation_5f21606b'); }, value: `${reputationRate}%` },
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
                {uiI18n.t('app.view_profile_b98795a2')}
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
            showCloseButton={false}
            aria-describedby={undefined}
            className={cn(
              'w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-3xl border-white/10 bg-background/95 p-0 shadow-2xl backdrop-blur-xl custom-scrollbar',
              className,
            )}
          >
            <DialogTitle className="sr-only">{uiI18n.t('app.profile_preview_9a067c9b')} {name}</DialogTitle>
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
