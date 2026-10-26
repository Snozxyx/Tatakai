import { TVLoadingScreen } from "@/components/tv/TVLoadingScreen";
import { useTVAppearance } from "@/core/tv/appearance";
import { tvThemeStyle } from "@/core/tv/themes";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  matchPath,
} from "react-router-dom";
import { Search, Home as HomeIcon, TrendingUp, Library as LibraryIcon, Tv, Zap, Settings as SettingsIcon, Clapperboard, Film, Users } from "lucide-react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Toaster } from "sonner";
import { installSpatialNavigation } from "@/core/tv/spatialNavigation";
import { devicePlugin } from "@/core/tv/device";
import { TVHandoff } from "@/components/tv/TVHandoff";
import { useAuth } from "@/contexts/AuthContext";
import { useProfilePresentation } from '@/contexts/ProfilePresentationContext';
import { useSettingsModal } from "@/contexts/SettingsModalContext";
import { TVLauncherSync } from "@/core/tv/TVLauncherSync";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { CommunityRulesGateProvider } from "@/components/community/CommunityRulesGate";
import { ProtectedRoute } from "@/routes/AppRoutes";
import "./tv.css";
import "./tv-atmosphere.css";
import "./tv-refined.css";
import "./tv-reference.css";
const Home = lazy(() => import("@/pages/tv/TVHomePage"));
const SearchPage = lazy(() => import("@/pages/tv/TVSearchPage"));
const Details = lazy(() => import("@/pages/tv/TVAnimePage"));
const Extensions = lazy(() => import("@/pages/tv/TVExtensionsPage"));
const Books = lazy(() => import("@/pages/tv/TVBooksPage"));
const Downloads = lazy(() => import("@/pages/tv/TVDownloadsPage"));
const Settings = lazy(() => import("@/pages/tv/TVSettingsPage"));
const Community = lazy(() => import("@/pages/tv/TVCommunityPage"));
const Profile = lazy(() => import("@/pages/profile/ProfilePage"));
const Saved = lazy(() => import("@/pages/tv/TVSavedPage"));
const IPTV = lazy(() => import("@/pages/tv/TVIPTVPage"));
const Library = lazy(() => import("@/pages/tv/TVLibraryPage"));
export default function TVLayout({ children }: { children: React.ReactNode }) {
  const { appearance } = useTVAppearance();
  const { fullPage: fullPageProfile } = useProfilePresentation();
  const location = useLocation(),
    navigate = useNavigate(),
    root = useRef<HTMLDivElement>(null);
  const memory = useRef(new Map<string, { key?: string; scroll: number }>());
  const [handoff, setHandoff] = useState<string | null>(null);
  const { user, profile } = useAuth();
  const settingsModal = useSettingsModal();
  useEffect(() => {
    if (!settingsModal.open) return;
    const panel = ({ player: 'playback', mobile: 'playback', debrid: 'accounts', account: 'accounts', extensions: 'library', about: 'about' } as Record<string, string>)[settingsModal.category] || 'appearance';
    settingsModal.closeSettings();
    navigate(`/settings?panel=${panel}`);
  }, [settingsModal.open, settingsModal.category, settingsModal.closeSettings, navigate]);
  const path = location.pathname;
  const currentPath = useRef(path);
  currentPath.current = path;
  useEffect(() => {
    const writing = (event: Event) =>
      setHandoff((event as CustomEvent<string>).detail);
    window.addEventListener("tatakai-tv-writing", writing);
    return () => window.removeEventListener("tatakai-tv-writing", writing);
  }, []);
  useEffect(() => {
    if (!root.current) return;
    const element = root.current;
    const back = () => {
      if (path !== "/") {
        if ((history.state?.idx || 0) > 0) navigate(-1);
        else navigate("/", { replace: true });
      } else if (Capacitor.isNativePlatform()) void CapacitorApp.exitApp();
    };
    const cleanup = installSpatialNavigation(element, back);
    const remembered = memory.current.get(path);
    const saveFocus = (event: FocusEvent) => {
      // A removed page can trigger the old observer before effect cleanup.
      if (currentPath.current !== path) return;
      const key = (event.target as HTMLElement)?.dataset.tvKey;
      if (key) memory.current.set(path, { key, scroll: element.scrollTop });
    };
    const saveScroll = () => {
      if (currentPath.current !== path) return;
      memory.current.set(path, { ...memory.current.get(path), scroll: element.scrollTop });
    };
    const restoreFocus = () => {
      const target =
        remembered?.key &&
        [...element.querySelectorAll<HTMLElement>("[data-tv-key]")].find(
          (el) => el.dataset.tvKey === remembered.key
        );
      if (target) {
        target.tabIndex = 0;
        target.focus({ preventScroll: true });
        element.scrollTop = remembered?.scroll || 0;
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(restoreFocus);
    if (remembered?.key)
      observer.observe(element, { childList: true, subtree: true });
    const restore = requestAnimationFrame(restoreFocus);
    const timer = setTimeout(() => observer.disconnect(), 10000);
    element.addEventListener("focusin", saveFocus);
    element.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      cancelAnimationFrame(restore);
      const saved = memory.current.get(path);
      if (!saved) memory.current.set(path, { scroll: element.scrollTop });
      element.removeEventListener("focusin", saveFocus);
      element.removeEventListener("scroll", saveScroll);
      cleanup();
    };
  }, [path, navigate]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void devicePlugin
      .addListener("search", (event) =>
        navigate(`/search?q=${encodeURIComponent(event.query || "")}`)
      )
      .then((handle) => {
        if (disposed) void handle.remove();
        else cleanup = () => void handle.remove();
      });
    const back = CapacitorApp.addListener("backButton", () => {
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]'
      );
      if (dialog) {
        dialog.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        return;
      }
      if (path !== "/") {
        if ((history.state?.idx || 0) > 0) navigate(-1);
        else navigate("/", { replace: true });
      } else void CapacitorApp.exitApp();
    });
    return () => {
      disposed = true;
      cleanup?.();
      void back.then((handle) => handle.remove());
    };
  }, [path, navigate]);
  useEffect(() => {
    if (/^\/(messages|chat|inbox)(\/|$)/.test(path))
      navigate("/tv/library", { replace: true });
  }, [path, navigate]);
  const details = matchPath("/anime/:animeId", path);
  const forum = matchPath("/community/forum/:postId", path);
  const manga = matchPath("/manga/:id", path),
    novel = matchPath("/novel/:id", path),
    extension = matchPath("/extensions/:id", path),
    profileRoute = matchPath("/user/:username", path);
  let specialized: React.ReactNode = (
    <div className="tv-adapted-surface">{children}</div>
  );
  if (path === "/") specialized = <Home />;
  else if (
    path === "/search" ||
    path === "/browse" ||
    path.startsWith("/genre") ||
    path === "/trending"
  )
    specialized = <SearchPage />;
  else if (path === "/tv/shows") specialized = <SearchPage format="tv" />;
  else if (path === "/tv/movies") specialized = <SearchPage format="movie" />;
  else if (path === "/tv/iptv") specialized = <IPTV />;
  else if (
    path === "/tv/library" ||
    path === "/auth" ||
    path === "/onboarding" ||
    path === "/setup"
  )
    specialized = <Library />;
  else if (details) specialized = <Details animeId={details.params.animeId!} />;
  else if (path === "/extensions" || extension)
    specialized = <Extensions extensionId={extension?.params.id} />;
  else if (["/downloads", "/offline", "/offline-library"].includes(path))
    specialized = <Downloads />;
  else if (path === "/settings") specialized = <Settings />;
  else if (
    path === "/manga" ||
    path.startsWith("/manga/genre") ||
    path === "/manga/discover" ||
    manga
  )
    specialized = (
      <Books
        kind="manga"
        id={
          ["discover", "genre"].includes(manga?.params.id || "")
            ? undefined
            : manga?.params.id
        }
      />
    );
  else if (
    path === "/novel" ||
    path.startsWith("/novel/genre") ||
    path === "/novel/discover" ||
    novel
  )
    specialized = (
      <Books
        kind="novel"
        id={
          ["discover", "genre", "comingsoon"].includes(novel?.params.id || "")
            ? undefined
            : novel?.params.id
        }
      />
    );
  else if (path === "/community" || forum)
    specialized = <Community postId={forum?.params.postId} />;
  else if (path === "/profile" || path.startsWith("/@") || profileRoute)
    specialized = (
      <div className="tv-adapted-surface tv-shared-profile">
        <Profile username={profileRoute?.params.username || (path.startsWith("/@") ? path.slice(2) : undefined)} />
      </div>
    );
  else if (path === "/favorites") specialized = <Saved />;
  else if (path === "/community/bookmarks") specialized = <Saved bookmarks />;
  const reading =
    path.startsWith("/manga/read") || path.startsWith("/novel/read");
  return (
    <ConfirmProvider>
      <CommunityRulesGateProvider>
        <div ref={root} className={`tv-shell ${path.startsWith("/watch") ? "tv-shell-watching" : ""} ${reading ? "tv-reading" : ""}`} data-tv-theme={appearance.theme} style={{ ...tvThemeStyle(appearance.theme), ...(fullPageProfile ? { padding: 0, overflow: 'hidden' } : {}) }}>
          <TVLauncherSync />
          {!fullPageProfile && !reading && <aside className="tv-icon-rail" aria-label="TV navigation">
            <Link to="/" className="tv-rail-brand" aria-label="Tatakai home">
              <img src="/assets/logo/tatakai-logo-square.png" alt="" />
              <span className="tv-rail-label tv-rail-wordmark">tatakai</span>
            </Link>
            <nav aria-label="Main navigation">
              {([
                ["/search", "Search", Search],
                ["/", "Home", HomeIcon],
                ["/tv/shows", "Shows", Clapperboard],
                ["/tv/movies", "Movies", Film],
                ["/trending", "Trending", TrendingUp],
                ["/tv/library", "My Tatakai", LibraryIcon],
                ["/community", "Community", Users],
                ["/tv/iptv", "Live TV", Tv],
                ["/extensions", "Extensions", Zap],
              ] as Array<[string, string, typeof HomeIcon]>).map(([to, label, Icon]) => (
                <NavLink key={to} to={to} end aria-label={label} data-tv-key={`nav-${label}`}>
                  <Icon /><span className="tv-rail-label">{label}</span>
                </NavLink>
              ))}
            </nav>
            <NavLink className="tv-rail-settings" to="/settings" aria-label="Settings" data-tv-key="nav-Settings">
              <SettingsIcon /><span className="tv-rail-label">Settings</span>
            </NavLink>
            <Link to="/tv/library" className="tv-rail-account" aria-label="Profile and account">
              <img src={profile?.avatar_url || "/assets/logo/tatakai-logo-square.png"} alt="" />
              <span className="tv-rail-label">Your profile</span>
            </Link>
          </aside>}
          {reading && (
            <aside className="tv-experimental">
              Experimental TV reader · Arrow keys turn pages · Select opens
              settings{" "}
              <button
                onClick={() =>
                  root.current
                    ?.querySelector<HTMLElement>("[data-tv-reader]")
                    ?.focus()
                }
              >
                Read with remote
              </button>
            </aside>
          )}
          <main
            className="tv-main"
            data-tv-reader={reading || undefined}
            data-tv-focus={reading || undefined}
            tabIndex={reading ? 0 : -1}
          >
            <Suspense
              fallback={
                <TVLoadingScreen compact={path !== "/" && !details} />
              }
            >
              <ProtectedRoute>{specialized}</ProtectedRoute>
            </Suspense>
          </main>
          <TVHandoff url={handoff} onClose={() => setHandoff(null)} />
          <Toaster theme="dark" richColors />
        </div>
      </CommunityRulesGateProvider>
    </ConfirmProvider>
  );
}
