import { Play, LayoutGrid, Search, TrendingUp, Heart, User, Settings, LogIn, Users, Download, Smartphone } from "lucide-react";
import { NavIcon } from "@/components/ui/NavIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from "@/hooks/useIsNativeApp";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isBanned } = useAuth();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri
  const isMobileApp = useIsMobileApp(); // Only Capacitor
  
  // Don't render sidebar on mobile apps at all
  if (isMobileApp) return null;

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className={cn(
      "fixed z-[100] flex flex-col transition-all duration-300",
      isDesktopApp
        ? "left-0 top-0 h-screen w-20 bg-background/60 backdrop-blur-2xl border-r border-white/5 pt-12 items-center"
        : "left-6 top-1/2 gap-6 -translate-y-1/2 rounded-3xl border border-border/30 bg-background/40  shadow-2xl p-2 hidden md:flex"
    )}>
      <div
        onClick={() => navigate("/")}
        className={cn(
          "flex items-center justify-center cursor-pointer hover:scale-105 transition-transform overflow-hidden",
          isDesktopApp ? "w-12 h-12 mb-8 bg-primary/20 rounded-2xl" : "w-10 h-10 mb-4 rounded-xl"
        )}
        style={!isDesktopApp ? { boxShadow: "0 0 20px hsl(var(--primary) / 0.3)" } : {}}
       >    
       <img
    src="/tatakai-logo-square.png"
    alt="Tatakai Logo"
    className="w-full h-full object-contain"
  />
      </div>

      <div className={cn("flex flex-col gap-6", isDesktopApp && "items-center")}>
        <NavIcon
          icon={LayoutGrid}
          active={isActive("/")}
          onClick={() => navigate("/")}
          label="Home"
        />
        <NavIcon
          icon={Search}
          active={isActive("/search")}
          onClick={() => navigate("/search")}
          label="Search"
        />
        <NavIcon
          icon={TrendingUp}
          active={isActive("/trending")}
          onClick={() => navigate("/trending")}
          label="Trending"
        />
        <NavIcon
          icon={Heart}
          active={isActive("/favorites")}
          onClick={() => navigate("/favorites")}
          label="Favorites"
        />
        <NavIcon
          icon={Users}
          active={isActive("/community")}
          onClick={() => navigate("/community")}
          label="Community"
        />
        {isDesktopApp && (
          <NavIcon
            icon={Download}
            active={isActive("/offline")}
            onClick={() => navigate("/offline")}
            label="Downloads"
          />
        )}
        {user && !isBanned ? (
          <NavIcon
            icon={User}
            active={location.pathname.startsWith('/@') || isActive("/profile")}
            onClick={() => navigate(profile?.username ? `/@${profile.username}` : '/profile')}
            label="Profile"
          />
        ) : (
          <NavIcon
            icon={LogIn}
            active={isActive("/auth")}
            onClick={() => navigate("/auth")}
            label="Sign In"
          />
        )}
      </div>

      <div className={cn("mt-auto pt-4 border-t border-border/30", isDesktopApp && "mb-8")}>
        <NavIcon
          icon={Settings}
          active={isActive("/settings")}
          onClick={() => navigate("/settings")}
          label="Settings"
        />
      </div>
    </nav>
  );
}
