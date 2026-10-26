import { CosmeticAvatar } from '@/components/profile/IdentityCosmetics';
import { FollowButton } from '@/components/community/FollowButton';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, Check, Plus, Settings, Loader2, Crown, Shield, ChevronDown, LogOut, BadgeCheck, Info, Sparkles } from 'lucide-react';
import { CommunitySidebar } from '@/components/community/feed/CommunitySidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/api';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCommunityBySlug,
  useCommunityMembers,
  useToggleCommunityMembership,
  useUpdateMemberRole,
} from '@/hooks/community/useCommunities';
import { useCommunityPresence } from '@/hooks/community/useCommunityPresence';
import { FeedList } from '@/components/community/feed/FeedList';
import { CommunityInfoWidget } from '@/components/community/CommunityInfoWidget';
import { CommunityStaffWidget } from '@/components/community/CommunityStaffWidget';
import { CommunityRightRail } from '@/components/community/feed/CommunityRightRail';
import { LeaderboardSheet } from '@/components/community/LeaderboardSheet';

const ROLE_ICON: Record<string, any> = { owner: Crown, mod: Shield };

export default function CommunitySpacePage() {
  useUiTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const { user, isAdmin, isModerator } = useAuth();
  const { data: community, isLoading } = useCommunityBySlug(slug);
  const toggle = useToggleCommunityMembership();
  const [showSettings, setShowSettings] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  // Community-scoped moderation is gated by role (owner/mod), the creator, or
  // platform staff — not created_by alone.
  const canManage =
    !!(user && community) &&
    (community.created_by === user.id ||
      community.my_role === 'owner' ||
      community.my_role === 'mod' ||
      isAdmin ||
      isModerator);

  // Roster powers the members showcase (all pages) + the roles panel (managers).
  const { data: members = [] } = useCommunityMembers(community?.id);
  const { onlineUserIds, onlineUsers } = useCommunityPresence();
  const updateRole = useUpdateMemberRole();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <CommunitySidebar />
        <main className={cn('relative z-10 w-full', isDesktopApp ? 'pl-24 lg:pl-28' : 'pl-0 md:pl-24 lg:pl-28')}>
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <h1 className="font-display text-2xl font-bold">{uiI18n.t('app.community_not_found_7f77fcb2')}</h1>
            <Button className="mt-4 rounded-full" onClick={() => navigate('/community')}>{uiI18n.t('app.back_to_community_58498a50')}</Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <CommunitySidebar />

      {/* Ambient banner bleed behind the whole page */}
      {community.banner_url && (
        <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
          <img
            src={getProxiedImageUrl(community.banner_url)}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-[0.15] blur-[100px] saturate-[2.5] md:opacity-[0.25]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background/95" />
        </div>
      )}

      <main className={cn('relative z-10 w-full', isDesktopApp ? 'pl-24 lg:pl-28' : 'pl-0 md:pl-24 lg:pl-28')}>
        {/* Full-width cinematic banner; content retains its readable bounds. */}
        <div className="w-full">
        {/* ── Cinematic hero banner ── */}
        {/* Escape the content gutter: desktop starts at the 80px rail edge;
            web banners extend behind the floating navigation. */}
        <div className={cn(
          'group relative h-[300px] select-none overflow-hidden md:h-[clamp(390px,36vw,580px)]',
          isDesktopApp
            ? '-ml-4 w-[calc(100%+1rem)] lg:-ml-8 lg:w-[calc(100%+2rem)]'
            : 'w-full md:-ml-24 md:w-[calc(100%+6rem)] lg:-ml-28 lg:w-[calc(100%+7rem)]',
        )}>
          {community.banner_url ? (
            <img
              src={getProxiedImageUrl(community.banner_url)}
              alt={uiI18n.t('app.i18n_value_0_banner_4eb507b5', { value0: community.name })}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent opacity-90" />

          <div className="absolute left-6 top-6 z-20">
            <button
              onClick={() => navigate('/community')}
              className="group/back flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs font-bold text-white/90 shadow-xl backdrop-blur-xl transition-colors hover:bg-black/60 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover/back:-translate-x-1" />
              <span>{uiI18n.t('app.community_bfd58ee3')}</span>
            </button>
          </div>
        </div>

        {/* ── Community header + feed ── */}
        <div className="mx-auto max-w-screen-2xl px-4 pb-10 md:px-8">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative z-20 -mt-16 mb-7 md:-mt-20"
          >
            <div className="community-card p-4 md:p-5">
            <div className="flex items-end justify-between gap-3">
              {/* Community icon */}
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-white/[0.04] shadow-[0_0_40px_rgba(0,0,0,0.5)] md:h-28 md:w-28">
                {community.icon_url ? (
                  <img src={getProxiedImageUrl(community.icon_url)} alt="" className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20">
                    <Users className="h-9 w-9 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/community/c/${community.slug}/information`)}
                  className="gap-1.5 rounded-full border border-white/10 bg-white/[0.06] text-white backdrop-blur-md hover:bg-white/[0.12]"
                >
                  <Info className="h-4 w-4" /> <span className="hidden sm:inline">{uiI18n.t('app.info_4b631f69')}</span>
                </Button>
                <FollowButton kind="community" id={community.id} />
                {canManage && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/community/c/${community.slug}/settings`)}
                      className="gap-1.5 rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
                    >
                      <Settings className="h-4 w-4" /> {uiI18n.t('app.settings_c7f73bb5')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowSettings((v) => !v)}
                      className="gap-1.5 rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
                    >
                      <Crown className="h-4 w-4" /> {uiI18n.t('app.manage_bf58d17e')}
                    </Button>
                  </>
                )}
                {user && (
                  community.is_member ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          disabled={toggle.isPending}
                          className="gap-1.5 rounded-full bg-white/10 font-bold text-foreground hover:bg-white/15"
                        >
                          {toggle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {uiI18n.t('app.joined_43a1c626')}
                          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-rose-400 focus:text-rose-400"
                          onClick={() => toggle.mutate({ communityId: community.id, isMember: true })}
                          disabled={toggle.isPending}
                        >
                          <LogOut className="mr-2 h-4 w-4" /> {uiI18n.t('app.leave_community_271bf4be')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button
                      size="sm"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ communityId: community.id, isMember: false })}
                      className="gap-1.5 rounded-full font-bold"
                    >
                      {toggle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {uiI18n.t('app.join_e0d73143')}
                    </Button>
                  )
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary/85">
                  <Sparkles className="h-3.5 w-3.5" /> {uiI18n.t('app.community_space_75188c4f')}
                </div>
            <h1 className="flex items-center gap-2 font-display text-3xl font-black tracking-tight drop-shadow-xl md:text-4xl">
              <span className="bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
                {community.name}
              </span>
              {community.is_verified && (
                <BadgeCheck className="h-6 w-6 shrink-0 text-sky-400 md:h-7 md:w-7" aria-label={uiI18n.t('app.verified_community_8777dd86')} />
              )}
            </h1>
            {community.description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{community.description}</p>}
              </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 backdrop-blur-md">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-bold tabular-nums text-white">{community.member_count}</span>
              <span className="text-xs text-muted-foreground">{community.member_count === 1 ? uiI18n.t('app.member_6467baa3') : uiI18n.t('app.members_f13eb585')}</span>
            </div>
            </div>
            </div>
          </motion.div>

          {/* Owner settings: member roles */}
          {canManage && showSettings && (
            <GlassPanel className="mb-5 p-5">
              <h3 className="mb-3 font-display font-bold tracking-tight">{uiI18n.t('app.members_amp_ranks_e109da08')}</h3>
              <div className="space-y-2">
                {members.map((m) => {
                  const RoleIcon = ROLE_ICON[m.role];
                  return (
                    <div key={m.user_id} className="flex items-center gap-3 rounded-xl border border-white/[0.03] bg-white/[0.015] px-3 py-2">
                      <CosmeticAvatar userId={m.user_id} className="h-8 w-8">
                        <AvatarImage src={m.avatar_url || undefined} />
                        <AvatarFallback>{(m.display_name || m.username || 'U')[0]?.toUpperCase()}</AvatarFallback>
                      </CosmeticAvatar>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.display_name || m.username || uiI18n.t('app.anonymous_9bed5104')}</span>
                      {RoleIcon && <RoleIcon className="h-3.5 w-3.5 text-amber" />}
                      <Select
                        value={m.role}
                        onValueChange={(role) => updateRole.mutate({ communityId: community.id, userId: m.user_id, role: role as any })}
                        disabled={m.user_id === community.created_by}
                      >
                        <SelectTrigger className="h-8 w-28 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">{uiI18n.t('app.member_6853c98a')}</SelectItem>
                          <SelectItem value="mod">{uiI18n.t('app.mod_f388dbfb')}</SelectItem>
                          <SelectItem value="owner">{uiI18n.t('app.owner_89ff3122')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
                {members.length === 0 && <p className="text-sm text-muted-foreground">{uiI18n.t('app.no_members_yet_ea27c45b')}</p>}
              </div>
            </GlassPanel>
          )}

          {/* ── Two-column: masonry feed + members rail ── */}
          <div className="flex items-start gap-8 xl:gap-10">
            <div className="w-full min-w-0 flex-1">
              {/* Info shows inline on mobile (no rail there). */}
              <div className="mb-5 space-y-5 xl:hidden">
                <CommunityInfoWidget community={community} canManage={canManage} />
                <CommunityStaffWidget members={members} onlineUserIds={onlineUserIds} />
              </div>
              <FeedList tab="foryou" communityId={community.id} showComposer={community.is_member} layout="masonry" />
            </div>

            {/* Shared community rail — Info/Staff on top, then the follow-along stack */}
            <CommunityRightRail
              members={members}
              onlineUserIds={onlineUserIds}
              onlineUsers={onlineUsers}
              onOpenLeaderboard={() => setLeaderboardOpen(true)}
              header={
                <>
                  <CommunityInfoWidget community={community} canManage={canManage} />
                  <CommunityStaffWidget members={members} onlineUserIds={onlineUserIds} />
                </>
              }
            />
          </div>
        </div>
        </div>
      </main>
      <LeaderboardSheet open={leaderboardOpen} onOpenChange={setLeaderboardOpen} />
      <MobileNav />
    </div>
  );
}
