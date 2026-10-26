import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Bookmark, Radio, Layers, Music2, Users, LogIn } from 'lucide-react';
import { NavIcon } from '@/components/ui/NavIcon';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { useIsPhone } from '@/hooks/ui/use-mobile';
import { cn } from '@/lib/utils';

/**
 * X-style vertical rail shown in place of the global {@link Sidebar} on
 * `/community` (and sub-routes). Uses the same fixed positioning so the page's
 * `md:pl-20 lg:pl-24` content padding still aligns. Narrow phones keep
 * `MobileNav`; wide native viewports (tablets, foldables) keep this rail.
 *
 * Fixed icon-only rail — it does not expand (labels are surfaced via tooltips
 * on each {@link NavIcon}).
 */
export function CommunitySidebar() {
  useUiTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isDesktopApp = useIsDesktopApp();
  const isMobileApp = useIsMobileApp();
  const isPhoneWidth = useIsPhone();

  // Same contract as the global Sidebar: narrow phones keep MobileNav (this
  // rail is CSS-hidden below md anyway); wide native viewports must keep the
  // rail, otherwise tablets/foldables lose all community navigation.
  if (isMobileApp && isPhoneWidth) return null;

  const expanded = false;
  const isActive = (path: string) => location.pathname === path;
  const profileHref = profile?.username ? `/@${profile.username}` : '/profile';
  const avatarLetter = (profile?.display_name || profile?.username || 'U')[0]?.toUpperCase();

  return (
    <nav
      data-sidebar
      className={cn(
        'fixed z-40 flex flex-col transition-colors duration-150',
        isDesktopApp
          ? cn(
              'left-0 top-0 h-screen border-r border-white/5 bg-background/40 pb-6 pt-16 backdrop-blur-3xl',
              expanded ? 'w-60 items-stretch px-3' : 'w-20 items-center',
            )
          : cn(
              'left-4 top-1/2 hidden -translate-y-1/2 rounded-[2.5rem] border border-white/[0.08] bg-black/25 p-2.5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] backdrop-blur-3xl md:flex xl:left-6',
              expanded ? 'w-56 items-stretch' : 'w-[68px] items-center',
            ),
      )}
    >
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        aria-label={uiI18n.t('app.back_b52b36b7')}
        title={expanded ? undefined : uiI18n.t('app.back_b52b36b7')}
        className={cn(
          'group flex items-center justify-center transition-all duration-200 active:scale-95',
          expanded
            ? 'mb-4 w-full gap-3.5 rounded-2xl bg-white/[0.04] px-3.5 py-3 hover:bg-white/[0.08] hover:text-white'
            : 'mb-3 h-11 w-11 shrink-0 rounded-full bg-white/[0.05] text-muted-foreground hover:bg-white/[0.1] hover:text-white',
        )}
      >
        <ArrowLeft className="h-[22px] w-[22px] shrink-0 transition-transform group-hover:-translate-x-0.5" />
        {expanded && <span className="truncate text-sm font-semibold">{uiI18n.t('app.back_b52b36b7')}</span>}
      </button>

      {/* Top Separator */}
      {!expanded && <div className="mb-3 h-px w-6 shrink-0 rounded-full bg-white/[0.08]" />}

      {/* Main Nav Links */}
      <div className={cn('flex flex-col', expanded ? 'gap-1.5 w-full' : 'items-center gap-2.5')}>
        <NavIcon icon={Home} active={isActive('/')} onClick={() => navigate('/')} label={uiI18n.t('app.home_70f8bb9a')} expanded={expanded} />
        <NavIcon icon={Users} active={isActive('/community')} onClick={() => navigate('/community')} label={uiI18n.t('app.community_bfd58ee3')} expanded={expanded} />
        <NavIcon
          icon={Bookmark}
          active={isActive('/community/bookmarks')}
          onClick={() => navigate('/community/bookmarks')}
          label={uiI18n.t('app.bookmarks_ca3cddd2')}
          expanded={expanded}
        />
        <NavIcon icon={Radio} active={isActive('/isshoni')} onClick={() => navigate('/isshoni')} label={uiI18n.t('app.watch_together_195732a6')} expanded={expanded} />
        <NavIcon icon={Layers} active={isActive('/tierlists')} onClick={() => navigate('/tierlists')} label={uiI18n.t('app.tier_lists_86752701')} expanded={expanded} />
        <NavIcon icon={Music2} active={isActive('/playlists')} onClick={() => navigate('/playlists')} label={uiI18n.t('app.playlists_77b69f32')} expanded={expanded} />
      </div>

      <div className={cn('mt-auto flex flex-col', expanded ? 'w-full' : 'items-center')}>
        {/* Bottom Separator */}
        {!expanded && <div className="mb-3 mt-4 h-px w-6 shrink-0 rounded-full bg-white/[0.08]" />}
        
        {user ? (
          <button
            onClick={() => navigate(profileHref)}
            aria-label={uiI18n.t('app.profile_ff4fc027')}
            className={cn(
              'group relative flex items-center transition-all duration-200 active:scale-95',
              expanded 
                ? 'w-full gap-3 rounded-2xl p-2 hover:bg-white/[0.06]' 
                : 'h-11 w-11 justify-center rounded-full',
            )}
          >
            <CosmeticAvatar userId={profile?.user_id} className="h-[38px] w-[38px] shrink-0 ring-2 ring-white/10 transition-all duration-300 group-hover:ring-primary/50 group-hover:shadow-[0_0_16px_hsl(var(--primary)/0.4)]">
              <AvatarImage src={profile?.avatar_url || ''} className="object-cover" />
              <AvatarFallback className="bg-zinc-800 text-xs font-bold text-zinc-300">{avatarLetter}</AvatarFallback>
            </CosmeticAvatar>
            {expanded && (
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-semibold text-white">
                  <CosmeticName userId={profile?.user_id}>{profile?.display_name || profile?.username || uiI18n.t('app.you_905cb326')}</CosmeticName>
                </p>
                {profile?.username && <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>}
              </div>
            )}
          </button>
        ) : (
          <div className={expanded ? 'mt-4' : ''}>
            <NavIcon icon={LogIn} active={isActive('/auth')} onClick={() => navigate('/auth')} label={uiI18n.t('app.sign_in_f8492cc1')} expanded={expanded} />
          </div>
        )}
      </div>
    </nav>
  );
}