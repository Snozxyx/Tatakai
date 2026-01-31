import { LayoutGrid, Search, User, LogIn, Users, Heart, TrendingUp, Settings, Download, Shield, Bell } from "lucide-react";
import { NavIcon } from "@/components/ui/NavIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationModal } from "@/components/profile/NotificationModal";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isBanned, isModerator } = useAuth();
  const { unreadCount } = useNotifications();
  const isNative = useIsNativeApp();
  const [showNotifications, setShowNotifications] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-card/90 backdrop-blur-2xl border border-border/30 rounded-2xl flex items-center justify-around px-2 z-50 shadow-2xl">
      <NavIcon
        icon={LayoutGrid}
        active={isActive("/")}
        onClick={() => navigate("/")}
      />
      <NavIcon
        icon={Search}
        active={isActive("/search")}
        onClick={() => navigate("/search")}
      />

      {/* Favorites/Trending Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="nav-icon group relative cursor-pointer focus:outline-none">
            <Heart className={cn(
              "w-5 h-5",
              isActive("/favorites") || isActive("/trending") || (isNative && isActive("/downloads"))
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )} />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="mb-2">
          <DropdownMenuItem onClick={() => navigate("/favorites")}>
            <Heart className="w-4 h-4 mr-2" />
            Favorites
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/trending")}>
            <TrendingUp className="w-4 h-4 mr-2" />
            Trending
          </DropdownMenuItem>
          {isNative && (
            <DropdownMenuItem onClick={() => navigate("/downloads")}>
              <Download className="w-4 h-4 mr-2" />
              Downloads
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NavIcon
        icon={Users}
        active={isActive("/community")}
        onClick={() => navigate("/community")}
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
            <DropdownMenuItem onClick={() => navigate(profile?.username ? `/@${profile.username}` : '/profile')}>
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
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <Shield className="w-4 h-4 mr-2 text-primary" />
                Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <NavIcon
          icon={LogIn}
          active={isActive("/auth")}
          onClick={() => navigate("/auth")}
        />
      )}
      <NotificationModal open={showNotifications} onOpenChange={setShowNotifications} />
    </div>
  );
}
