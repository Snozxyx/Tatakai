import { LayoutGrid, Search, Settings, User, LogIn, Users, Menu } from "lucide-react";
import { NavIcon } from "@/components/ui/NavIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Shield } from "lucide-react";

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isBanned, isAdmin, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

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
      <NavIcon 
        icon={Users} 
        active={isActive("/community")} 
        onClick={() => navigate("/community")}
      />
      <NavIcon 
        icon={Settings} 
        active={isActive("/settings")} 
        onClick={() => navigate("/settings")}
      />
      {user && !isBanned ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none">
              <Avatar className="w-9 h-9 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold text-xs">
                  {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 mb-2">
            <DropdownMenuItem onClick={() => navigate(profile?.username ? `/@${profile.username}` : '/profile')}>
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/admin')}>
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
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
    </div>
  );
}
