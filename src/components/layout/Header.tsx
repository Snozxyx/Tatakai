import { Search, User, LogOut, Shield, Download, Camera, Loader2, X, Film } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [systemStatus, setSystemStatus] = useState<'operational' | 'degraded' | 'checking'>('checking');
  const navigate = useNavigate();
  const { user, profile, isAdmin, isModerator, isBanned, signOut, isLoading } = useAuth();
  const isNative = useIsNativeApp();

  // Image search states
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageResults, setImageResults] = useState<any[] | null>(null);
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageSearch = async () => {
    if (!selectedFile) return;

    setIsSearchingImage(true);
    setImageResults(null);
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("https://api.trace.moe/search", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setImageResults(data.result || []);
    } catch (error) {
      console.error("Image search error:", error);
    } finally {
      setIsSearchingImage(false);
    }
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
    <header className="hidden md:flex items-center mb-4 px-6 sticky top-0 z-50 backdrop-blur-md py-2">
      <div className="flex items-center justify-between w-full gap-8">
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
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowImageSearch(true);
              }}
              className="p-1 hover:bg-muted/50 rounded-lg transition-colors"
              title="Search by image"
            >
              <Camera className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
            <div className="hidden lg:flex gap-1 ml-2">
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
                {(isAdmin || isModerator) && (
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
      </div>

      {/* Image Search Dialog */}
      <Dialog open={showImageSearch} onOpenChange={setShowImageSearch}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Search Anime by Image
            </DialogTitle>
            <DialogDescription>
              Upload a screenshot or image from an anime to identify it using trace.moe
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Upload Section */}
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer group">
                <div className="flex items-center justify-center gap-2 px-4 h-12 rounded-xl bg-muted/50 border-2 border-dashed border-white/10 group-hover:border-primary/50 transition-colors">
                  <Camera className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors overflow-hidden truncate">
                    {selectedFile ? selectedFile.name : 'Choose anime screenshot...'}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      setSelectedFile(e.target.files?.[0] || null);
                      setImageResults(null);
                    }}
                  />
                </div>
              </label>
              <button
                onClick={handleImageSearch}
                disabled={!selectedFile || isSearchingImage}
                className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
              >
                {isSearchingImage ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Identify'
                )}
              </button>
            </div>

            {/* Preview Selected Image */}
            {selectedFile && (
              <div className="relative w-full max-h-[200px] rounded-xl overflow-hidden border border-white/10">
                <img
                  src={URL.createObjectURL(selectedFile)}
                  alt="Preview"
                  className="w-full h-full object-contain bg-black/20"
                />
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setImageResults(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Results Section */}
            {imageResults && imageResults.length > 0 && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Film className="w-4 h-4 text-primary" />
                  Found {imageResults.length} result{imageResults.length > 1 ? 's' : ''}
                </h3>
                {imageResults.slice(0, 5).map((result: any, idx: number) => {
                  const similarity = (result.similarity * 100).toFixed(1);
                  const title = result.anilist?.title?.english || result.anilist?.title?.romaji || result.filename;
                  const anilistId = result.anilist?.id;

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-muted/30 border border-white/5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm truncate flex-1">
                          {title}
                        </p>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${parseFloat(similarity) > 90 ? 'bg-green-500/20 text-green-500' : parseFloat(similarity) > 80 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'}`}>
                          {similarity}% match
                        </span>
                      </div>
                      {result.episode && (
                        <p className="text-xs text-muted-foreground mb-3">
                          Episode {result.episode} • {Math.floor(result.from / 60)}:{Math.floor(result.from % 60).toString().padStart(2, '0')}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (anilistId) {
                              setShowImageSearch(false);
                              navigate(`/anime/${anilistId}`);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Film className="w-3.5 h-3.5" />
                          View Anime
                        </button>
                        <button
                          onClick={() => {
                            setShowImageSearch(false);
                            navigate(`/search?q=${encodeURIComponent(title)}`);
                          }}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-foreground text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Search className="w-3.5 h-3.5" />
                          Search
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {imageResults && imageResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Film className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No matches found. Try a different image.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
