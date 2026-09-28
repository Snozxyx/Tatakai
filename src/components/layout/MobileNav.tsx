import { LayoutGrid, Search, User, LogIn, Users, Heart, TrendingUp, Settings, Shield, Bell, BookOpen, Plus } from "lucide-react";
import { NavIcon } from "@/components/ui/NavIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsModal } from "@/contexts/SettingsModalContext";
import { useNotifications } from "@/hooks/community/useNotifications";
import { useIsMobileApp } from "@/hooks/ui/useIsNativeApp";
import { useHaptics } from "@/hooks/ui/useHaptics";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationSheet } from "@/components/community/NotificationSheet";
import { cn } from "@/lib/utils";
import { useCustomSources } from "@/hooks/api/useCustomSource";
import type { CustomSourceEntry } from "@/core/content/custom-source-runtime";
import { useState, useCallback, useEffect } from "react";
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

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isBanned, isModerator } = useAuth();
  const { openSettings } = useSettingsModal();
  const { unreadCount } = useNotifications();
  const { data: customSources } = useCustomSources();
  const customByNamespace = (customSources ?? []).reduce<Record<string, CustomSourceEntry[]>>((acc, src) => {
    (acc[src.namespace] ||= []).push(src);
    return acc;
  }, {});
  const hasCustomSources = (customSources?.length ?? 0) > 0;
  const isMobileNative = useIsMobileApp(); // Only Capacitor Android/iOS
  const { impact } = useHaptics();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAnnouncementPopupActive, setIsAnnouncementPopupActive] = useState(() => {
    if (typeof document === 'undefined') return false;
    return (
      document.documentElement.classList.contains(POPUP_ACTIVE_CLASS) ||
      document.body.classList.contains(POPUP_ACTIVE_CLASS)
    );
  });

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

  const isActive = (path: string) => location.pathname === path;
  const isMangaActive = location.pathname.startsWith('/manga');

  // Haptic navigation handler
  const handleNavigate = useCallback((path: string) => {
    impact('light');
    navigate(path);
  }, [navigate, impact]);

  // Check if haptics are enabled from localStorage
  const getHapticEnabled = () => {
    try {
      const config = localStorage.getItem('tatakai_mobile_config');
      if (config) {
        return JSON.parse(config).hapticFeedback !== false;
      }
    } catch (e) {}
    return true;
  };

  const hapticNavigate = useCallback((path: string) => {
    if (getHapticEnabled()) {
      impact('light');
    }
    navigate(path);
  }, [navigate, impact]);

  if (isAnnouncementPopupActive) {
    return null;
  }

  const navContent = (
    <div 
      className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-card/90 backdrop-blur-2xl border border-border/30 rounded-2xl flex items-center justify-around px-2 z-[60] shadow-2xl safe-area-bottom"
      role="navigation"
      aria-label="Main navigation"
    >
      <NavIcon
        icon={LayoutGrid}
        active={isActive("/")}
        onClick={() => hapticNavigate("/")}
        aria-label="Home"
      />
      <NavIcon
        icon={Search}
        active={isActive("/search")}
        onClick={() => hapticNavigate("/search")}
        aria-label="Search"
      />

      {/* Favorites/Trending Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="nav-icon group relative cursor-pointer focus:outline-none">
            <Heart className={cn(
              "w-5 h-5",
              isActive("/favorites") || isActive("/trending")
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )} />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="mb-2">
          <DropdownMenuItem onClick={() => hapticNavigate("/favorites")}>
            <Heart className="w-4 h-4 mr-2" />
            Favorites
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => hapticNavigate("/trending")}>
            <TrendingUp className="w-4 h-4 mr-2" />
            Trending
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NavIcon
        icon={BookOpen}
        active={isMangaActive}
        onClick={() => hapticNavigate('/manga')}
        aria-label="Manga"
      />

      {/* Custom sources ("+") — extension-provided verticals; hidden when none installed. */}
      {hasCustomSources && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className="nav-icon group relative cursor-pointer focus:outline-none"
              aria-label="Custom sources"
            >
              <Plus className={cn(
                "w-5 h-5",
                location.pathname.startsWith("/x/")
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="mb-2 w-56">
            {Object.entries(customByNamespace).map(([namespace, sources], groupIdx) => (
              <div key={namespace}>
                {groupIdx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {namespace}
                </DropdownMenuLabel>
                {sources.map((src) => (
                  <DropdownMenuItem
                    key={`${src.namespace}:${src.id}`}
                    onClick={() => hapticNavigate(`/x/${src.namespace}/${src.id}`)}
                  >
                    {src.kind === "read" ? (
                      <BookOpen className="w-4 h-4 mr-2" />
                    ) : (
                      <LayoutGrid className="w-4 h-4 mr-2" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{src.name}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Downloads removed from mobile nav - use desktop/electron only */}

      <NavIcon
        icon={Users}
        active={isActive("/community")}
        onClick={() => hapticNavigate("/community")}
        aria-label="Community"
      />

      {/* Profile/Settings Dropdown */}
      {user && !isBanned ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none active:scale-95 transition-transform relative group">
              <Avatar className={`w-10 h-10 cursor-pointer transition-all ${location.pathname.startsWith('/@') || isActive("/profile") || isActive("/settings") ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50'}`}>
                <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || 'User'} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold text-sm">
                  {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white ring-1 ring-background">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2">
            <DropdownMenuItem onClick={() => hapticNavigate(profile?.username ? `/@${profile.username}` : '/profile')}>
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowNotifications(true)}>
              <Bell className="w-4 h-4 mr-2" />
              Notifications
              {unreadCount > 0 && (
                <span className="ml-auto bg-destructive text-[10px] text-white px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </DropdownMenuItem>
            {isModerator && (
              <DropdownMenuItem onClick={() => hapticNavigate("/admin")}>
                <Shield className="w-4 h-4 mr-2 text-primary" />
                Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => { if (getHapticEnabled()) impact('light'); openSettings(); }}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <NavIcon
          icon={LogIn}
          active={isActive("/auth")}
          onClick={() => hapticNavigate("/auth")}
          aria-label="Sign in"
        />
      )}
      <NotificationSheet open={showNotifications} onOpenChange={setShowNotifications} />
    </div>
  );

  // Render using portal to ensure it's at the body level
  return typeof document !== 'undefined' ? createPortal(navContent, document.body) : navContent;
}



