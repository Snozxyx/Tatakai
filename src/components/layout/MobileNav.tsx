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
import { useCustomSources } from "@/hooks/api/useCustomSource";
import type { CustomSourceEntry } from "@/core/content/custom-source-runtime";
import { useState, useCallback, useEffect, type ComponentType } from "react";
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

function MobileNavButton({
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
  const safeProgress = progress == null ? undefined : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge ? `${label}, ${badge} active${safeProgress != null ? `, ${safeProgress}%` : ''}` : label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex flex-1 items-center justify-center rounded-xl py-2 outline-none transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/60',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'relative flex h-9 min-w-[3rem] items-center justify-center rounded-full px-4 transition-all duration-200',
          active
            ? 'bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]'
            : 'group-hover:bg-white/[0.06] group-active:bg-white/[0.08]',
        )}
      >
        <span className="flex flex-col items-center gap-0.5">
          <Icon className={cn('h-[21px] w-[21px] transition-transform duration-200', active ? 'scale-110' : 'group-hover:scale-105')} />
          <span className="mobile-nav-label text-[10px] font-semibold leading-none tracking-tight">{label}</span>
        </span>
        {badge != null && badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground shadow-lg">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {safeProgress != null && badge != null && badge > 0 && (
          <span className="absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-primary/20" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${safeProgress}%` }} />
          </span>
        )}
      </span>
    </button>
  );
}

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileApp = useIsMobileApp();
  const { open, openSettings } = useSettingsModal();
  const { data: customSources } = useCustomSources();
  const customByNamespace = (customSources ?? []).reduce<Record<string, CustomSourceEntry[]>>((acc, src) => {
    (acc[src.namespace] ||= []).push(src);
    return acc;
  }, {});
  const hasCustomSources = (customSources?.length ?? 0) > 0;
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

  // Live active-download count for the Saved tab badge (anime + manga).
  // NOTE: hooks must stay above the early return below (rules-of-hooks).
  const { activeDownloads } = useMobileDownload();
  const activeDownloadCount = isMobileApp ? activeDownloads.length : 0;
  const activeDownloadProgress = activeDownloadCount > 0
    ? activeDownloads.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.progress ?? 0)), 0) / activeDownloadCount
    : undefined;

  // Hide where there is no need: auth/onboarding/error flows, when a takeover
  // popup is active, while the settings sheet is open (so the sheet owns
  // the bottom of the screen and its own nav stays tappable), and while the
  // mobile player holds CSS-fallback fullscreen (the player covers the
  // viewport; the bar must not paint above it on any device).
  if (isAnnouncementPopupActive || open || isPlayerFullscreen || isHiddenRoute(location.pathname)) {
    return null;
  }

  const favActive = isActive('/favorites') || isActive('/trending');
  const customActive = location.pathname.startsWith('/x/');

  const navContent = (
    <div
      data-mobile-nav
      className="md:hidden fixed inset-x-0 bottom-0 z-[60]"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Docked tab bar — icon-only, compact, edge-to-edge for easy thumb reach */}
      <div className="relative flex items-center gap-1 border-t border-white/10 bg-background/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl max-[374px]:gap-0 max-[374px]:px-2">
        <MobileNavButton icon={LayoutGrid} label="Home" active={isActive('/')} onClick={() => hapticNavigate('/')} />
        <MobileNavButton icon={Search} label="Search" active={isActive('/search')} onClick={() => hapticNavigate('/search')} />

        {/* Favorites/Trending Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open favorites and trending"
              title="Saved"
              className={cn(
                'group relative flex flex-1 items-center justify-center rounded-xl py-2 outline-none transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/60',
                favActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn(
                'flex min-w-[3rem] items-center justify-center rounded-full px-4 py-1.5 transition-all duration-200',
                favActive ? 'bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]' : 'group-hover:bg-white/[0.06]',
              )}>
                <span className="flex flex-col items-center gap-0.5">
                  <Heart className={cn('h-[21px] w-[21px]', favActive && 'fill-primary/20')} />
                  <span className="mobile-nav-label text-[10px] font-semibold leading-none tracking-tight">Saved</span>
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="mb-3 w-52 rounded-2xl border-white/10 bg-background/95 p-1.5 shadow-2xl backdrop-blur-xl">
            <DropdownMenuItem onClick={() => hapticNavigate('/favorites')} className="gap-2 rounded-xl px-3 py-2.5 font-medium">
              <Heart className="w-4 h-4 mr-1 text-muted-foreground" />
              Favorites
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => hapticNavigate('/trending')} className="gap-2 rounded-xl px-3 py-2.5 font-medium">
              <TrendingUp className="w-4 h-4 mr-1 text-muted-foreground" />
              Trending
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Custom sources ("+") — extension-provided verticals; hidden when none installed. */}
        {hasCustomSources && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'group relative flex flex-1 items-center justify-center rounded-xl py-2 outline-none transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/60',
                  customActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label="Custom sources"
                title="More"
              >
                <span className={cn(
                  'flex min-w-[3rem] items-center justify-center rounded-full px-4 py-1.5 transition-all duration-200',
                  customActive ? 'bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]' : 'group-hover:bg-white/[0.06]',
                )}>
                  <span className="flex flex-col items-center gap-0.5">
                    <Plus className="h-[21px] w-[21px]" />
                    <span className="mobile-nav-label text-[10px] font-semibold leading-none tracking-tight">More</span>
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="mb-3 w-56 rounded-2xl border-white/10 bg-background/95 p-1.5 shadow-2xl backdrop-blur-xl">
              {Object.entries(customByNamespace).map(([namespace, sources], groupIdx) => (
                <div key={namespace}>
                  {groupIdx > 0 && <DropdownMenuSeparator className="bg-white/[0.06]" />}
                  <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {namespace}
                  </DropdownMenuLabel>
                  {sources.map((src) => (
                    <DropdownMenuItem
                      key={`${src.namespace}:${src.id}`}
                      onClick={() => hapticNavigate(`/x/${src.namespace}/${src.id}`)}
                      className="gap-2 rounded-xl px-3 py-2.5 font-medium"
                    >
                      {src.kind === "read" ? (
                        <BookOpen className="w-4 h-4 mr-1 text-muted-foreground" />
                      ) : (
                        <LayoutGrid className="w-4 h-4 mr-1 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{src.name}</span>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <MobileNavButton icon={Users} label="Social" active={isActive('/community')} onClick={() => hapticNavigate('/community')} />

        {isMobileApp && (
          <MobileNavButton
            icon={Download}
            label="Saved"
            active={isActive('/downloads')}
            onClick={() => hapticNavigate('/downloads')}
            badge={activeDownloadCount}
            progress={activeDownloadProgress}
          />
        )}

        <MobileNavButton icon={Settings} label="Settings" onClick={hapticOpenSettings} />
      </div>
    </div>
  );

  // Render using portal to ensure it's at the body level. Hidden from the
  // tablet breakpoint up by the container's own `md:hidden` — at that width the
  // app uses the web floating sidebar instead.
  return typeof document !== 'undefined' ? createPortal(navContent, document.body) : navContent;
}

