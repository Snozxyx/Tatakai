import {
  LayoutGrid,
  Search,
  TrendingUp,
  Heart,
  User,
  Settings,
  LogIn,
  Users,
  Download,
  BookOpen,
  CalendarDays,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { NavIcon } from "@/components/ui/NavIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { celebrate } from "@/components/effects/Celebrate";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsModal } from "@/contexts/SettingsModalContext";
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from "@/hooks/ui/useIsNativeApp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCustomSources } from "@/hooks/api/useCustomSource";
import type { CustomSourceEntry } from "@/core/content/custom-source-runtime";
import { cn } from "@/lib/utils";

const OVERFLOW_ITEMS = [
  { icon: TrendingUp, label: "Trending", path: "/trending" },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: Heart, label: "Favorites", path: "/favorites" },
] as const;

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isBanned } = useAuth();
  const { openSettings } = useSettingsModal();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobileApp = useIsMobileApp();
  const domain = import.meta.env.VITE_PUBLIC_DOMAIN || "https://tatakai.me";

  const { data: customSources } = useCustomSources();
  const customByNamespace = (customSources ?? []).reduce<Record<string, CustomSourceEntry[]>>((acc, src) => {
    (acc[src.namespace] ||= []).push(src);
    return acc;
  }, {});
  const hasCustomSources = (customSources?.length ?? 0) > 0;

  // Logo click-streak easter egg: 7 rapid clicks → a spin + a petal pop from the
  // logo + a playful toast. The streak resets after 1.2s of no clicks. Normal
  // single clicks still just go home. Reduced motion neutralises the spin (global
  // CSS) and the petals (celebrate() checks it); only the toast remains.
  const logoRef = useRef<HTMLDivElement>(null);
  const logoClicks = useRef(0);
  const logoTimer = useRef<number | undefined>(undefined);
  const [logoSpin, setLogoSpin] = useState(false);

  const handleLogoClick = () => {
    navigate("/");
    logoClicks.current += 1;
    window.clearTimeout(logoTimer.current);
    logoTimer.current = window.setTimeout(() => {
      logoClicks.current = 0;
    }, 1200);
    if (logoClicks.current >= 7) {
      logoClicks.current = 0;
      window.clearTimeout(logoTimer.current);
      setLogoSpin(true);
      window.setTimeout(() => setLogoSpin(false), 700);
      const rect = logoRef.current?.getBoundingClientRect();
      celebrate({
        x: rect ? rect.left + rect.width / 2 : undefined,
        y: rect ? rect.top + rect.height / 2 : undefined,
        variant: "petal",
        count: 16,
      });
      toast("🌸 Tatakai! You really like that logo.", { duration: 3000 });
    }
  };

  if (isMobileApp) return null;

  const isActive = (path: string) => location.pathname === path;
  const isMangaActive = location.pathname === "/manga" || location.pathname.startsWith("/manga/");
  const overflowActive = OVERFLOW_ITEMS.some((i) => isActive(i.path));

  return (
    <nav
      data-sidebar
      className={cn(
        "fixed z-[100] flex flex-col transition-all duration-500 ease-out",
        isDesktopApp
          ? "left-0 top-0 h-screen w-20 bg-background/80 backdrop-blur-xl border-r border-border/40 pt-14 pb-6 items-center shadow-2xl"
          // Floating pill design for web
          : "left-6 top-1/2 -translate-y-1/2 w-[72px] rounded-[2rem] border border-border/40 bg-background/60 py-5 hidden md:flex items-center"
      )}
    >
      {/* 1. Logo Section with Hover Glow — pinned to the top on desktop */}
      <div
        ref={logoRef}
        onClick={handleLogoClick}
        className={cn(
          "relative flex items-center justify-center cursor-pointer group",
          isDesktopApp ? "w-12 h-12 mb-4" : "w-11 h-11 mb-6"
        )}
      >
        {/* Subtle glow effect behind the logo on hover */}
        <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <img
          src="https://raw.githubusercontent.com/Snozxyx/Tatakai/refs/heads/main/public/tatakai-logo-square.png"
          alt="Tatakai Logo"
          className={cn(
            "relative z-10 object-contain transition-all duration-300 group-hover:scale-110",
            isDesktopApp ? "w-11 h-11 rounded-2xl shadow-sm" : "w-10 h-10 rounded-xl shadow-sm"
          )}
          style={logoSpin ? { animation: "spin 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)" } : undefined}
        />
      </div>

      {/* 2. Primary Navigation Group — vertically centered between logo and footer */}
      <div className="flex flex-col gap-3 w-full items-center flex-1 justify-center">
        <NavIcon icon={LayoutGrid} active={isActive("/")} onClick={() => navigate("/")} label="Home" />
        <NavIcon icon={Search} active={isActive("/search")} onClick={() => navigate("/search")} label="Search" />
        <NavIcon icon={BookOpen} active={isMangaActive} onClick={() => navigate("/manga")} label="Manga" />

        {/* Separator Line */}
        <div className="w-8 h-[1px] bg-border/50 my-1 rounded-full" />

        {/* 3. Secondary/Social Group */}
        <NavIcon icon={Users} active={isActive("/community")} onClick={() => navigate("/community")} label="Community" />

        {/* Custom sources ("+") — extension-provided verticals; hidden when none installed. */}
        {hasCustomSources && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Custom sources"
                title="Custom sources"
                className={cn(
                  "group relative flex h-10 w-10 items-center justify-center rounded-xl outline-none transition-all duration-200",
                  "hover:bg-accent/80 hover:text-accent-foreground",
                  location.pathname.startsWith("/x/") ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <Plus className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="center"
              sideOffset={20}
              className="w-56 rounded-xl border-border/40 bg-background/80 p-1.5 shadow-xl backdrop-blur-xl"
            >
              {Object.entries(customByNamespace).map(([namespace, sources], groupIdx) => (
                <div key={namespace}>
                  {groupIdx > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {namespace}
                  </DropdownMenuLabel>
                  {sources.map((src) => {
                    const path = `/x/${src.namespace}/${src.id}`;
                    const active = location.pathname === path || location.pathname.startsWith(`${path}/`);
                    return (
                      <DropdownMenuItem
                        key={`${src.namespace}:${src.id}`}
                        onClick={() => navigate(path)}
                        className={cn(
                          "cursor-pointer gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors duration-200",
                          active ? "bg-primary/10 text-primary" : "hover:bg-accent focus:bg-accent",
                        )}
                      >
                        {src.kind === "read" ? (
                          <BookOpen className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                        ) : (
                          <LayoutGrid className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                        )}
                        <span className="min-w-0 flex-1 truncate">{src.name}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Overflow Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="More"
              title="More"
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 outline-none",
                "hover:bg-accent/80 hover:text-accent-foreground",
                overflowActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className={cn(
                "h-5 w-5 shrink-0 transition-transform duration-200",
                overflowActive ? "scale-110" : "group-hover:scale-110"
              )} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            side="right" 
            align="center" 
            sideOffset={20} 
            className="w-48 p-1.5 rounded-xl border-border/40 bg-background/80 backdrop-blur-xl shadow-xl"
          >
            {OVERFLOW_ITEMS.map(({ icon: Icon, label, path }) => {
              const active = isActive(path);
              return (
                <DropdownMenuItem
                  key={path}
                  onClick={() => navigate(path)}
                  className={cn(
                    "gap-3 rounded-lg px-3 py-2.5 font-medium cursor-pointer transition-colors duration-200",
                    active ? "bg-primary/10 text-primary" : "hover:bg-accent focus:bg-accent"
                  )}
                >
                  <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                  {label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {isDesktopApp && (
          <NavIcon icon={Download} active={isActive("/offline")} onClick={() => navigate("/offline")} label="Downloads" />
        )}
      </div>

      {/* 4. Bottom System Actions Group */}
      <div className="flex flex-col gap-3 w-full items-center mt-auto pt-4 relative">
        {/* Top border for the bottom section */}
        <div className="absolute top-0 w-8 h-[1px] bg-border/50 rounded-full" />

        {user && !isBanned ? (
          <button
            onClick={() => navigate(profile?.username ? `/@${profile.username}` : "/profile")}
            aria-label="Profile"
            title="Profile"
            className="group relative"
          >
            <span
              className={cn(
                "block h-10 w-10 overflow-hidden rounded-2xl transition-all duration-300",
                profile?.avatar_url ? "bg-muted" : "nav-icon-inactive"
              )}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username || "Profile"}
                  className="h-full w-full object-cover group-hover:scale-105"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <User className="h-5 w-5" />
                </span>
              )}
            </span>
            {isActive("/profile") || location.pathname.startsWith("/@") ? (
              <span className="pointer-events-none absolute inset-0 rounded-2xl bg-foreground/25 shadow-[0_0_20px_hsl(var(--foreground)/0.4)]" />
            ) : null}
          </button>
        ) : (
          <NavIcon icon={LogIn} active={isActive("/auth")} onClick={() => navigate("/auth")} label="Sign In" />
        )}

        <NavIcon icon={Settings} active={isActive("/settings")} onClick={() => openSettings()} label="Settings" />
      </div>
    </nav>
  );
}