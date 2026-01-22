import { Play, LayoutGrid, Search, TrendingUp, Heart, User, Settings, LogIn, Users } from "lucide-react";
import { NavIcon } from "@/components/ui/NavIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isBanned } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed left-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-6 p-2 rounded-3xl border border-border/30 bg-background/40 backdrop-blur-xl shadow-2xl">
      <div
        onClick={() => navigate("/")}
        className="w-10 h-10 mb-4 rounded-xl flex items-center justify-center cursor-pointer hover:scale-105 transition-transform overflow-hidden"
        style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.3)" }}
      >
        <img 
          src="/tatakai-logo-square.png" 
          alt="Tatakai Logo" 
          className="w-full h-full object-contain"
        />
      </div>
      
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
      
      <div className="mt-auto pt-4 border-t border-border/30">
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
