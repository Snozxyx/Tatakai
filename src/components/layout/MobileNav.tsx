import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import {
  Download,
  Heart,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  TrendingUp,
  Users,
  BookOpen,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useHaptics } from "@/hooks/ui/useHaptics";
import { useIsMobileApp } from "@/hooks/ui/useIsNativeApp";
import { cn } from "@/lib/utils";
import { useSettingsModal } from "@/contexts/SettingsModalContext";
import { useMobileDownload } from "@/hooks/media/useMobileDownload";
import { memo, useState, useCallback, useEffect, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const POPUP_VISIBILITY_EVENT = 'tatakai-v6-popup-visibility';
const POPUP_ACTIVE_CLASS = 'v6-popup-active';
// Mirrors MobileVideoPlayer's CSS-fallback fullscreen signal (see
// MOBILE_PLAYER_FULLSCREEN_CLASS/EVENT there — duplicated to keep this
// chrome module free of the player's heavy imports).
const PLAYER_FULLSCREEN_EVENT = 'tatakai-mobile-player-fullscreen';
const PLAYER_FULLSCREEN_CLASS = 'mobile-player-fullscreen';

function isPlayerFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.body.classList.contains(PLAYER_FULLSCREEN_CLASS) ||
    document.documentElement.classList.contains(PLAYER_FULLSCREEN_CLASS) ||
    Boolean(document.fullscreenElement)
  );
}

// Routes where the bottom bar is noise — auth / onboarding / error / fullscreen-ish.
const HIDDEN_PREFIXES = [
  '/auth',
  '/welcome',
  '/onboarding',
  '/setup',
  '/maintenance',
  '/banned',
  '/error',
  '/smarttv',
  '/reset-password',
  '/update-password',
  '/mal-redirect',
  '/anilist-redirect',
];

function isHiddenRoute(pathname: string) {
  if (pathname === '/') return false;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p));
}

const MobileNavButton = memo(function MobileNavButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  progress,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  /** Small count pill (e.g. active downloads) pinned to the icon. */
  badge?: number;
  /** Aggregate 0-100 progress, rendered as a compact status rail. */
  progress?: number;
}) {
  useUiTranslation();
  const { t } = useTranslation();
  const safeProgress = progress == null ? undefined : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge ? uiI18n.t('app.i18n_value_0i18n_value_1_bb0b4be1', { value0: t('migration.activeDownloads', { label, count: badge }), value1: safeProgress != null ? `, ${safeProgress}%` : '' }) : label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'ui-mobile-nav-button group relative flex flex-1 items-center justify-center rounded-xl py-2 outline-none transition-[transform,color] duration-150 motion-safe:active:scale-[.97] focus-visible:ring-2 focus-visible:ring-primary/60',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'relative flex h-9 w-full max-w-12 min-w-0 items-center justify-center rounded-xl transition-[background-color,box-shadow] duration-150',
          active
            ? 'bg-foreground/10 shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.1)]'
            : 'group-hover:bg-foreground/[0.06] group-active:bg-foreground/[0.08]',
        )}
      >
        <Icon className={cn('h-[22px] w-[22px]')} />
        {badge != null && badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold tabular-nums text-background shadow-sm">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {safeProgress != null && badge != null && badge > 0 && (
          <span className="absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-foreground/20" aria-hidden="true">
            <span className="ui-progress-fill block h-full w-full origin-left rounded-full bg-foreground" style={{ transform: `scaleX(${safeProgress / 100})` }} />
          </span>
        )}
      </span>
    </button>
  );
});

// Keep high-frequency monitor updates inside the native Downloads tab.
function MobileDownloadsButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const { activeDownloads } = useMobileDownload();
  const count = activeDownloads.length;
  const progress = count > 0
    ? Math.round(activeDownloads.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.progress ?? 0)), 0) / count)
    : undefined;
  return <MobileNavButton icon={Download} label={t('comments.savedTab')} active={active} onClick={onClick} badge={count} progress={progress} />;
}

export function MobileNav() {
  useUiTranslation();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileApp = useIsMobileApp();
  const { open, openSettings } = useSettingsModal();
  const { impact } = useHaptics();
  const [isAnnouncementPopupActive, setIsAnnouncementPopupActive] = useState(() => {
    if (typeof document === 'undefined') return false;
    return (
      document.documentElement.classList.contains(POPUP_ACTIVE_CLASS) ||
      document.body.classList.contains(POPUP_ACTIVE_CLASS)
    );
  });
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState<boolean>(() => isPlayerFullscreenActive());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const syncFromClasses = () => {
      const isActive =
        document.documentElement.classList.contains(POPUP_ACTIVE_CLASS) ||
        document.body.classList.contains(POPUP_ACTIVE_CLASS);
      setIsAnnouncementPopupActive(isActive);
    };

    const handlePopupVisibility = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      if (typeof customEvent.detail?.open === 'boolean') {
        setIsAnnouncementPopupActive(customEvent.detail.open);
        return;
      }
      syncFromClasses();
    };

    syncFromClasses();
    window.addEventListener(POPUP_VISIBILITY_EVENT, handlePopupVisibility as EventListener);
    document.addEventListener('visibilitychange', syncFromClasses);

    return () => {
      window.removeEventListener(POPUP_VISIBILITY_EVENT, handlePopupVisibility as EventListener);
      document.removeEventListener('visibilitychange', syncFromClasses);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const syncPlayerFullscreen = () => {
      setIsPlayerFullscreen(isPlayerFullscreenActive());
    };

    const handlePlayerFullscreenEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ fullscreen?: boolean }>).detail;
      if (typeof detail?.fullscreen === 'boolean') {
        setIsPlayerFullscreen(detail.fullscreen);
        return;
      }
      syncPlayerFullscreen();
    };

    syncPlayerFullscreen();
    window.addEventListener(PLAYER_FULLSCREEN_EVENT, handlePlayerFullscreenEvent as EventListener);
    document.addEventListener('fullscreenchange', syncPlayerFullscreen);
    document.addEventListener('webkitfullscreenchange', syncPlayerFullscreen);

    return () => {
      window.removeEventListener(PLAYER_FULLSCREEN_EVENT, handlePlayerFullscreenEvent as EventListener);
      document.removeEventListener('fullscreenchange', syncPlayerFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncPlayerFullscreen);
    };
  }, []);

  const isActive = (path: string) => location.pathname === path;

  // `impact()` already respects the `hapticFeedback` toggle, reduced-motion
  // and the rapid-tap throttle in `@/lib/haptics` — no local config parsing.
  const hapticNavigate = useCallback((path: string) => {
    void impact('light');
    navigate(path);
  }, [navigate, impact]);

  const hapticOpenSettings = useCallback(() => {
    void impact('light');
    openSettings();
  }, [impact, openSettings]);

  const goHome = useCallback(() => hapticNavigate('/'), [hapticNavigate]);
  const goSearch = useCallback(() => hapticNavigate('/search'), [hapticNavigate]);
  const goCustom = useCallback(() => hapticNavigate('/custom-providers'), [hapticNavigate]);
  const goSocial = useCallback(() => hapticNavigate('/community'), [hapticNavigate]);
  const goDownloads = useCallback(() => hapticNavigate('/downloads'), [hapticNavigate]);

  // Hide where there is no need: auth/onboarding/error flows, when a takeover
  // popup is active, while the settings sheet is open (so the sheet owns
  // the bottom of the screen and its own nav stays tappable), and while the
  // mobile player holds CSS-fallback fullscreen (the player covers the
  // viewport; the bar must not paint above it on any device).
  if (isAnnouncementPopupActive || open || isPlayerFullscreen || isHiddenRoute(location.pathname)) {
    return null;
  }

  const favActive = isActive('/favorites') || isActive('/trending');
  const customActive = location.pathname.startsWith('/x/') || location.pathname === '/custom-providers';

  const navContent = (
    <div
      data-mobile-nav
      className="md:hidden fixed inset-x-0 bottom-0 z-[60]"
      role="navigation"
      aria-label={t("nav.mainNavigation")}
    >
      {/* Solid, edge-to-edge chrome with safe-area padding for thumb reach. */}
      <div className="mobile-nav-dock relative flex items-center">
        <MobileNavButton icon={LayoutGrid} label={t('nav.home')} active={isActive('/')} onClick={goHome} />
        <MobileNavButton icon={Search} label={t('nav.search')} active={isActive('/search')} onClick={goSearch} />

        {/* Favorites/Trending Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('migration.favoritesMenu')}
              title={t('comments.savedTab')}
              aria-current={favActive ? 'page' : undefined}
              className={cn(
                'ui-mobile-nav-button group relative flex flex-1 items-center justify-center rounded-xl py-2 outline-none transition-[transform,color] duration-150 motion-safe:active:scale-[.97] focus-visible:ring-2 focus-visible:ring-primary/60',
                favActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn(
                'flex h-9 w-full max-w-12 min-w-0 items-center justify-center rounded-xl transition-[background-color,box-shadow] duration-150',
                favActive ? 'bg-foreground/10 shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.1)]' : 'group-hover:bg-foreground/[0.06]',
              )}>
                <Heart className={cn('h-[22px] w-[22px]', favActive && 'fill-foreground/20')} />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="mb-3 w-52 rounded-2xl border-border bg-card p-1.5 shadow-2xl">
            <DropdownMenuItem onClick={() => hapticNavigate('/favorites')} className="gap-2 rounded-xl px-3 py-2.5 font-medium">
              <Heart className="w-4 h-4 mr-1 text-muted-foreground" />
              {t("nav.favorites")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => hapticNavigate('/trending')} className="gap-2 rounded-xl px-3 py-2.5 font-medium">
              <TrendingUp className="w-4 h-4 mr-1 text-muted-foreground" />
              {t("nav.trending")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <MobileNavButton icon={Plus} label={t('nav.customSources')} active={customActive} onClick={goCustom} />

        <MobileNavButton icon={Users} label={t('migration.social')} active={isActive('/community')} onClick={goSocial} />

        {isMobileApp && (
          <MobileDownloadsButton active={isActive('/downloads')} onClick={goDownloads} />
        )}

        <MobileNavButton icon={Settings} label={t('nav.settings')} onClick={hapticOpenSettings} />
      </div>
    </div>
  );

  // Render using portal to ensure it's at the body level. Hidden from the
  // tablet breakpoint up by the container's own `md:hidden` — at that width the
  // app uses the web floating sidebar instead.
  return typeof document !== 'undefined' ? createPortal(navContent, document.body) : navContent;
}

