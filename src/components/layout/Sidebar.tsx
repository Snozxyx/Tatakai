import { Play, LayoutGrid, Search, TrendingUp, Heart, User, Settings, LogIn, Users, Download } from "lucide-react";
import { NavIcon } from "@/components/ui/NavIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isBanned } = useAuth();
  const isNative = useIsNativeApp();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className={cn(
      "fixed z-50 flex flex-col transition-all duration-300",
      isNative
        ? "left-0 top-0 h-screen w-20 bg-background/60 backdrop-blur-2xl border-r border-white/5 pt-12 items-center"
        : "left-6 top-1/2 -translate-y-1/2 rounded-3xl border border-border/30 bg-background/40 backdrop-blur-xl shadow-2xl p-2 hidden md:flex"
    )}>
      <div
        onClick={() => navigate("/")}
        className={cn(
          "flex items-center justify-center cursor-pointer hover:scale-105 transition-transform overflow-hidden",
          isNative ? "w-12 h-12 mb-8 bg-primary/20 rounded-2xl" : "w-10 h-10 mb-4 rounded-xl"
        )}
        style={!isNative ? { boxShadow: "0 0 20px hsl(var(--primary) / 0.3)" } : {}}
      >
        <img
          src="/tatakai-logo-square.png"
          alt="Tatakai Logo"
          className="w-full h-full object-contain"
        />
      </div>

      <div className={cn("flex flex-col gap-6", isNative && "items-center")}>
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
        {isNative && (
          <NavIcon
            icon={Download}
            active={isActive("/downloads")}
            onClick={() => navigate("/downloads")}
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

      <div className={cn("mt-auto pt-4 border-t border-border/30", isNative && "mb-8")}>
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

import { cn } from "@/lib/utils";
