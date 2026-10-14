import { Search, User, LogOut, Shield, Download, Camera, Loader2, X, Film, Play, ChevronRight, BookOpen, ScrollText } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDesktopApp, useIsMacOS, useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { useTitlebarHidden } from "@/hooks/ui/useTitlebarHidden";
import { useMobileAppearance } from '@/hooks/ui/useMobileAppearance';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { HeaderSearchSuggestions } from "@/components/layout/HeaderSearchSuggestions";
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
import { cn } from "@/lib/utils";
import { ANILIST_GRAPHQL_ENDPOINT } from "@/lib/api/backendOrigin";
import { triggerHaptic } from "@/lib/haptics";

// ── Image search helpers ──────────────────────────────────────────────────────

async function runImageSearch(file: File): Promise<any[]> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch("https://api.trace.moe/search", { method: "POST", body: formData });
  if (!res.ok) throw new Error("trace.moe search failed");
  const data = await res.json();
  const rawResults: any[] = data.result || [];

  // Dedupe by anilist id — keep best similarity per anime
  const best = new Map<number, any>();
  for (const r of rawResults) {
    const existing = best.get(r.anilist);
    if (!existing || r.similarity > existing.similarity) best.set(r.anilist, r);
  }
  const deduped = Array.from(best.values()).sort((a, b) => b.similarity - a.similarity);

  // Batch-fetch anime titles from AniList
  const ids = deduped.map((r) => r.anilist).filter(Boolean);
  const titleMap = new Map<number, { title: string; cover: string }>();
  if (ids.length > 0) {
    try {
      const gql = `query ($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id title{english romaji}coverImage{medium}}}}`;
      const r = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: gql, variables: { ids } }),
      });
      if (r.ok) {
        const j = await r.json();
        for (const m of j?.data?.Page?.media ?? []) {
          titleMap.set(m.id, {
            title: m.title?.english || m.title?.romaji || `Anime #${m.id}`,
            cover: m.coverImage?.medium || "",
          });
        }
      }
    } catch {}
  }

  return deduped.map((r) => ({
    ...r,
    _animeTitle: titleMap.get(r.anilist)?.title ?? null,
    _animeCover: titleMap.get(r.anilist)?.cover ?? null,
  }));
}

function formatTs(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Header() {
  const refreshed = useMobileAppearance();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [systemStatus, setSystemStatus] = useState<"operational" | "degraded" | "checking">("checking");
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, isAdmin, isModerator, isBanned, signOut, isLoading } = useAuth();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMac = useIsMacOS();
  const [titlebarHidden] = useTitlebarHidden();
  // Windows/Linux paint a solid 32px TitleBar (z-9999) above the sticky header,
  // so the header must stick 32px down or its icons slide underneath it.
  // macOS is a transparent overlay with no layout bar → stick to the very top.
  const hasSolidTitlebar = isDesktopApp && !titlebarHidden && !isMac;

  // Image search state
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageResults, setImageResults] = useState<any[] | null>(null);
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [playingVideoIdx, setPlayingVideoIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { error } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
        setSystemStatus(error ? "degraded" : "operational");
      } catch {
        setSystemStatus("degraded");
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut Ctrl/Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const ids = ["tatakai-header-search", "tatakai-global-search"];
        for (const id of ids) {
          const el = document.getElementById(id) as HTMLInputElement | null;
          if (el) { el.focus(); el.select(); return; }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const commitSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    try {
      const raw = localStorage.getItem("tatakai_search_history");
      let searches: string[] = raw ? JSON.parse(raw) : [];
      searches = [trimmed, ...searches.filter((s) => s !== trimmed)].slice(0, 20);
      localStorage.setItem("tatakai_search_history", JSON.stringify(searches));
    } catch {}
    setShowSuggestions(false);
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [navigate]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    commitSearch(searchQuery);
  };

  // Mobile Anime → Manga → Novel catalog switch: haptic tick + icon pop (the
  // icon remounts on `key` change and plays `animate-catalog-switch`, gated
  // behind `motion-safe` so reduced-motion users just get the instant swap) +
  // reset scroll so the new catalog starts at the top. `triggerHaptic` already
  // honors the user's haptic toggle, reduced-motion and tap throttle.
  const catalog: 'anime' | 'manga' | 'novel' = location.pathname.startsWith('/manga')
    ? 'manga'
    : location.pathname.startsWith('/novel')
      ? 'novel'
      : 'anime';
  const handleCatalogSwitch = useCallback(() => {
    void triggerHaptic('toggle');
    navigate(catalog === 'anime' ? '/manga' : catalog === 'manga' ? '/novel' : '/');
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, [navigate, catalog]);

  // Long-press ("hard press") on the catalog pill opens a jump menu with the
  // other two catalogs; a normal tap keeps cycling anime → manga → novel.
  // Pointer-event based so it works for touch, pen and mouse alike.
  const LONG_PRESS_MS = 550;
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  const catalogBtnRef = useRef<HTMLButtonElement | null>(null);
  const catalogMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  const goCatalog = useCallback((path: '/' | '/manga' | '/novel') => {
    setCatalogMenuOpen(false);
    if (location.pathname === path) return;
    void triggerHaptic('toggle');
    navigate(path);
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, [navigate, location.pathname]);

  const startCatalogLongPress = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    longPressFired.current = false;
    clearLongPressTimer();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      void triggerHaptic('medium');
      setCatalogMenuOpen(true);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer]);

  const handleCatalogTap = useCallback(() => {
    // A tap that ends a long-press must not also cycle the catalog.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    setCatalogMenuOpen(false);
    handleCatalogSwitch();
  }, [handleCatalogSwitch]);

  // Dismiss the jump menu on route change, outside tap, or Escape.
  useEffect(() => {
    setCatalogMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!catalogMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (
        t &&
        catalogMenuRef.current?.contains(t) !== true &&
        catalogBtnRef.current?.contains(t) !== true
      ) {
        setCatalogMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCatalogMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [catalogMenuOpen]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // File selection → generate preview blob URL
  const handleFileChange = (file: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setImageResults(null);
    setPlayingVideoIdx(null);
  };

  const handleImageSearch = async () => {
    if (!selectedFile) return;
    setIsSearchingImage(true);
    setImageResults(null);
    setPlayingVideoIdx(null);
    try {
      const results = await runImageSearch(selectedFile);
      setImageResults(results);
    } catch {
      setImageResults([]);
    } finally {
      setIsSearchingImage(false);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, []);

  const statusColor =
    systemStatus === "operational" ? "bg-green-500" :
    systemStatus === "degraded" ? "bg-amber-500" : "bg-gray-500";

  return (
    <>
      <header data-mobile-header className={cn(refreshed ? 'block' : 'md:hidden', "sticky z-50 border-b border-white/[0.06] bg-background/85 backdrop-blur-xl", hasSolidTitlebar ? "top-8" : "top-0")}>
        <div className="pt-[env(safe-area-inset-top)]">
        <div className="relative flex h-14 items-center justify-between px-3">
          {/* Left slot: notifications when signed in, otherwise a home shortcut.
              Never render a dead empty box here — it reads as a blank button
              over scrolled content and swallows no action. */}
          {user && !isBanned ? (
            <div className="relative z-10 h-11 w-11">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] shadow-sm"><NotificationBell /></div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Go home"
              title="Home"
              className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] shadow-sm transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 hover:border-primary/40 hover:bg-white/[0.1] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <img
                src={`${import.meta.env.BASE_URL}assets/logo/tatakai-logo-square.png`}
                alt=""
                aria-hidden
                className="h-6 w-6 rounded-md object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </button>
          )}
          <button
            ref={catalogBtnRef}
            type="button"
            onClick={handleCatalogTap}
            onPointerDown={startCatalogLongPress}
            onPointerUp={clearLongPressTimer}
            onPointerLeave={clearLongPressTimer}
            onPointerCancel={clearLongPressTimer}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute left-1/2 top-1/2 z-10 inline-flex h-9 -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-xs font-bold tracking-wide text-foreground shadow-sm transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 [-webkit-touch-callout:none] hover:border-primary/40 hover:bg-white/[0.1] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label={catalog === 'anime' ? 'Switch to Manga' : catalog === 'manga' ? 'Switch to Novels' : 'Switch to Anime'}
            title="Tap to switch catalog · hold for all catalogs"
            aria-haspopup="menu"
            aria-expanded={catalogMenuOpen}
          >
            <span key={catalog} className="inline-flex motion-safe:animate-catalog-switch">
              {catalog === 'anime' ? <Play className="h-3.5 w-3.5 fill-primary text-primary" /> : catalog === 'manga' ? <BookOpen className="h-3.5 w-3.5 text-primary" /> : <ScrollText className="h-3.5 w-3.5 text-primary" />}
            </span>
            {catalog === 'anime' ? 'Anime' : catalog === 'manga' ? 'Manga' : 'Novels'}
          </button>
          {catalogMenuOpen && (
            <div
              ref={catalogMenuRef}
              role="menu"
              aria-label="Jump to catalog"
              className="absolute left-1/2 top-[calc(100%+8px)] z-30 w-48 -translate-x-1/2 rounded-2xl border border-white/10 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150"
            >
              {(['anime', 'manga', 'novel'] as const)
                .filter((c) => c !== catalog)
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    onClick={() => goCatalog(c === 'anime' ? '/' : c === 'manga' ? '/manga' : '/novel')}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-[0.98]"
                  >
                    {c === 'anime'
                      ? <Play className="mr-1 h-4 w-4 fill-primary text-primary" />
                      : c === 'manga'
                        ? <BookOpen className="mr-1 h-4 w-4 text-primary" />
                        : <ScrollText className="mr-1 h-4 w-4 text-primary" />}
                    {c === 'anime' ? 'Anime' : c === 'manga' ? 'Manga' : 'Novels'}
                  </button>
                ))}
            </div>
          )}
          <div className="relative z-10">
            {isLoading ? (
              <div className="h-9 w-9 rounded-full bg-muted animate-pulse ring-1 ring-white/10" />
            ) : user && !isBanned ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="Open profile menu" className="flex h-11 w-11 items-center justify-center rounded-full outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/60">
                    <Avatar className="h-9 w-9 ring-1 ring-white/20 transition-shadow hover:ring-primary/40">
                      <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || 'User'} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-xs font-bold text-primary-foreground">{profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-2xl border-white/10 bg-background/90 p-1.5 shadow-2xl backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150">
                  <DropdownMenuItem onClick={() => navigate(profile?.username ? `/@${profile.username}` : '/profile')} className="gap-2 rounded-xl px-3 py-2.5 font-medium"><User className="mr-1 h-4 w-4 text-muted-foreground" />Profile</DropdownMenuItem>
                  {(isAdmin || isModerator) && <DropdownMenuItem onClick={() => navigate('/admin')} className="gap-2 rounded-xl px-3 py-2.5 font-medium"><Shield className="mr-1 h-4 w-4 text-muted-foreground" />Admin navigation</DropdownMenuItem>}
                  <DropdownMenuSeparator className="bg-white/[0.06]" />
                  <DropdownMenuItem onClick={handleSignOut} className="gap-2 rounded-xl px-3 py-2.5 font-medium text-destructive focus:text-destructive"><LogOut className="mr-1 h-4 w-4" />Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth" className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 hover:brightness-110 active:scale-95">Sign in</Link>
            )}
          </div>
        </div>
        </div>
      </header>

      <header data-desktop-header className={cn(refreshed ? 'hidden' : 'hidden md:flex', "relative items-center mb-4 px-6 z-50 backdrop-blur-md py-2")}>
        <div className="flex items-center justify-between w-full gap-8">
        {/* Left: welcome + status */}
        <div className="flex items-center gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Welcome back, <span className="text-foreground">{profile?.display_name || "Traveler"}</span>
          </h2>
          {isBanned && (
            <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-xs font-medium animate-pulse">BANNED</span>
          )}
          <Link
            to="/status"
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/30 hover:bg-muted/50 transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 group"
            title={systemStatus === "operational" ? "All systems operational" : "Some services degraded"}
          >
            <span className={cn("w-2 h-2 rounded-full", statusColor, systemStatus === "operational" && "animate-pulse")} />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Status</span>
          </Link>
        </div>

        {/* Right: search + user */}
        <div className="flex items-center gap-4 md:gap-6">
          {/* Search form with live suggestions */}
          <div ref={searchWrapperRef} className="relative">
            <form
              onSubmit={handleSearch}
              className="flex items-center gap-3 bg-muted/50 border border-border/30 rounded-full px-4 py-2 hover:bg-muted transition-colors cursor-pointer group"
            >
              <Search className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              <input
                id="tatakai-header-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowSuggestions(false);
                }}
                placeholder="Search anime..."
                className="bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:text-foreground w-24 sm:w-32 lg:w-48"
                aria-label="Search anime"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setShowSuggestions(false); }}
                  className="p-0.5 hover:bg-muted/50 rounded-full"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowImageSearch(true); }}
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

            <HeaderSearchSuggestions
              query={searchQuery}
              visible={showSuggestions}
              onSelect={(name) => { setSearchQuery(name); setShowSuggestions(false); }}
              onClose={() => setShowSuggestions(false)}
            />
          </div>

          <div className="hidden sm:block">
            <NotificationBell />
          </div>

          {isLoading ? (
            <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
          ) : user && !isBanned ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-full active:scale-95 transition-transform">
                  <Avatar className="w-10 h-10 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || "User"} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold">
                      {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate(profile?.username ? `/@${profile.username}` : "/profile")}>
                  <User className="w-4 h-4 mr-2" /> Profile
                </DropdownMenuItem>
                {(isAdmin || isModerator) && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Shield className="w-4 h-4 mr-2" /> Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
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

      {/* ── Image Search Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showImageSearch} onOpenChange={(open) => {
        setShowImageSearch(open);
        if (!open) { handleFileChange(null); setImageResults(null); setPlayingVideoIdx(null); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Scene <span className="text-primary italic ml-1">Identification</span>
            </DialogTitle>
            <DialogDescription>
              Upload an anime screenshot to identify it via trace.moe
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Upload row */}
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer group">
                <div className="flex items-center gap-2 px-4 h-12 rounded-xl bg-muted/50 border-2 border-dashed border-white/10 group-hover:border-primary/50 transition-colors">
                  <Camera className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground truncate transition-colors">
                    {selectedFile ? selectedFile.name : "Choose anime screenshot…"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  />
                </div>
              </label>
              <button
                onClick={handleImageSearch}
                disabled={!selectedFile || isSearchingImage}
                className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 active:scale-95 transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[110px] gap-2"
              >
                {isSearchingImage ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</>
                ) : "Identify"}
              </button>
            </div>

            {/* Preview */}
            {previewUrl && (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/20 max-h-[180px]">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                <button
                  onClick={() => handleFileChange(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Results */}
            {imageResults && imageResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Film className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No matches found. Try a different screenshot.</p>
              </div>
            )}

            {imageResults && imageResults.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">
                  {imageResults.length} match{imageResults.length !== 1 ? "es" : ""} found
                </p>

                {imageResults.slice(0, 5).map((result, idx) => {
                  const title = result._animeTitle ||
                    result.filename?.split("] ")?.[1]?.split(" - ")?.[0]?.trim() ||
                    result.filename ||
                    "Unknown Anime";
                  const pct = (result.similarity * 100).toFixed(1);
                  const simColor =
                    result.similarity >= 0.95 ? "text-emerald-400" :
                    result.similarity >= 0.85 ? "text-amber-400" : "text-muted-foreground";
                  const isPlayingThis = playingVideoIdx === idx;

                  return (
                    <div
                      key={idx}
                      className="rounded-2xl overflow-hidden border border-white/5 bg-muted/20 hover:border-primary/30 transition-colors"
                    >
                      {/* Frame preview */}
                      <div className="relative aspect-video bg-black overflow-hidden">
                        {isPlayingThis && result.video ? (
                          <video
                            src={result.video}
                            autoPlay
                            controls
                            className="w-full h-full object-contain"
                            onEnded={() => setPlayingVideoIdx(null)}
                          />
                        ) : (
                          <>
                            <img
                              src={result.image}
                              alt={title}
                              className="w-full h-full object-cover"
                            />
                            {result.video && (
                              <button
                                onClick={() => setPlayingVideoIdx(isPlayingThis ? null : idx)}
                                className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
                              >
                                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 hover:bg-white/30 transition-colors">
                                  <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                                </div>
                              </button>
                            )}
                          </>
                        )}
                        {/* Overlays */}
                        <div className={cn("absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-xs font-black backdrop-blur-sm", simColor)}>
                          {pct}%
                        </div>
                        {result.episode != null && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 text-xs font-bold text-white backdrop-blur-sm">
                            EP {result.episode}
                          </div>
                        )}
                        {result.at != null && (
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-white font-mono backdrop-blur-sm">
                            {formatTs(result.at)}
                          </div>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="p-3 flex gap-3">
                        {result._animeCover && (
                          <img
                            src={result._animeCover}
                            alt=""
                            className="w-10 h-14 rounded-lg object-cover shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm line-clamp-1">{title}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                            {result.episode != null && <span className="font-semibold text-foreground/70">Episode {result.episode}</span>}
                            {result.at != null && <span>at {formatTs(result.at)}</span>}
                            <span className={cn("font-black", simColor)}>{pct}% match</span>
                          </div>
                          <div className="flex gap-2 mt-2.5">
                            <button
                              onClick={() => {
                                setShowImageSearch(false);
                                navigate(`/anime/${result.anilist}`);
                              }}
                              className="flex-1 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/30 text-[11px] font-bold text-primary transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 border border-primary/20 hover:border-primary/40"
                            >
                              View Anime
                            </button>
                            <button
                              onClick={() => {
                                setShowImageSearch(false);
                                navigate(`/search?q=${encodeURIComponent(title)}`);
                              }}
                              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 border border-white/5"
                            >
                              Search
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </header>
    </>
  );
}
