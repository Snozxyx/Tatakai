import { Search, User, LogOut, Shield, Settings } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/ui/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { user, profile, isAdmin, isBanned, signOut, isLoading } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="hidden md:flex justify-between items-center mb-12 px-2">
      <div className="flex items-center gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Welcome back, <span className="text-foreground">{profile?.display_name || 'Traveler'}</span>
        </h2>
        {isBanned && (
          <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-xs font-medium animate-pulse">
            BANNED
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-4 md:gap-6">
        <form onSubmit={handleSearch} className="flex items-center gap-3 bg-muted/50 border border-border/30 rounded-full px-4 py-2 hover:bg-muted transition-colors cursor-pointer group">
          <Search className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search anime..."
            className="bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:text-foreground w-24 sm:w-32 lg:w-48"
          />
          <div className="hidden lg:flex gap-1 ml-4">
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">⌘</span>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">K</span>
          </div>
        </form>
        
        <div className="hidden sm:block">
          <NotificationBell />
        </div>
        
        {isLoading ? (
          <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        ) : user && !isBanned ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-full">
                <Avatar className="w-10 h-10 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold">
                    {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate(profile?.username ? `/@${profile.username}` : '/profile')}>
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
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
          <Link
            to="/auth"
            className="h-10 px-4 rounded-full bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Sign In</span>
          </Link>
        )}
      </div>
    </header>
  );
}
