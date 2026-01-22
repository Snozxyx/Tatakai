import { Search, User, LogOut, Shield, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [systemStatus, setSystemStatus] = useState<'operational' | 'degraded' | 'checking'>('checking');
  const navigate = useNavigate();
  const { user, profile, isAdmin, isBanned, signOut, isLoading } = useAuth();

  useEffect(() => {
    // Check Supabase connectivity as a meaningful health check
    const checkStatus = async () => {
      try {
        const { error } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
        setSystemStatus(error ? 'degraded' : 'operational');
      } catch {
        setSystemStatus('degraded');
      }
    };
    checkStatus();
    // Recheck every 5 minutes
    const interval = setInterval(checkStatus, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut (Ctrl/Cmd + K) to focus and select the search input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const hasModifier = isMac ? e.metaKey : e.ctrlKey;
      if (hasModifier && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Try header input first, fall back to any global search input on the page
        const ids = ['tatakai-header-search', 'tatakai-global-search', 'tatakai-search-mobile-input'];
        for (const id of ids) {
          const el = document.getElementById(id) as HTMLInputElement | null;
          if (el) {
            el.focus();
            el.select();
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const term = searchQuery.trim();
      try {
        const history = localStorage.getItem('tatakai_search_history');
        let searches: string[] = history ? JSON.parse(history) : [];
        searches = [term, ...searches.filter(s => s !== term)].slice(0, 20);
        localStorage.setItem('tatakai_search_history', JSON.stringify(searches));
      } catch { }
      navigate(`/search?q=${encodeURIComponent(term)}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getStatusColor = () => {
    switch (systemStatus) {
      case 'operational':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-amber-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusTooltip = () => {
    switch (systemStatus) {
      case 'operational':
        return 'All systems operational';
      case 'degraded':
        return 'Some services degraded';
      default:
        return 'Checking status...';
    }
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
        {/* Status Indicator */}
        <Link
          to="/status"
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/30 hover:bg-muted/50 transition-all group"
          title={getStatusTooltip()}
        >
          <span className={`w-2 h-2 rounded-full ${getStatusColor()} ${systemStatus === 'operational' ? 'animate-pulse' : ''}`}></span>
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Status</span>
        </Link>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <form onSubmit={handleSearch} className="flex items-center gap-3 bg-muted/50 border border-border/30 rounded-full px-4 py-2 hover:bg-muted transition-colors cursor-pointer group">
          <Search className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <input
            id="tatakai-header-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search anime..."
            className="bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:text-foreground w-24 sm:w-32 lg:w-48"
            aria-label="Search anime"
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
              <button className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-full active:scale-95 transition-transform">
                <Avatar className="w-10 h-10 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                  <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || 'User'} />
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
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate('/admin')}>
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
                </DropdownMenuItem>
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
