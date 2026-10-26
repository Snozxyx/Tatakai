import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  matchPath,
} from "react-router-dom";
import { Search, ChevronDown } from "lucide-react";
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
import { TVVideoWallpaper } from "@/components/tv/TVVideoBackdrop";
import "./tv.css";
import "./tv-atmosphere.css";
import "./tv-refined.css";
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
        <div ref={root} className={`tv-shell ${reading ? "tv-reading" : ""}`} style={fullPageProfile ? { padding: 0, overflow: 'hidden' } : undefined}>
          <TVVideoWallpaper paused={fullPageProfile || reading || path.startsWith('/watch') || path === '/tv/iptv'} />
          <TVLauncherSync />
          {!fullPageProfile && <header className="tv-header">
            <Link
              className="tv-profile-link"
              to="/tv/library"
              aria-label="Profile and account"
            >
              <span className="tv-avatar">
                <img
                  src={
                    profile?.avatar_url ||
                    "/assets/logo/tatakai-logo-square.png"
                  }
                  alt=""
                />
              </span>
              <ChevronDown />
            </Link>
            <nav aria-label="Main navigation">
              <NavLink
                className="tv-nav-search"
                to="/search"
                aria-label="Search"
              >
                <Search />
              </NavLink>
              {[
                ["/", "Home"],
                ["/tv/shows", "Shows"],
                ["/tv/movies", "Movies"],
                ["/community", "Community"],
                ["/tv/library", "My Tatakai"],
              ].map(([to, label]) => (
                <NavLink key={to} to={to} end data-tv-key={`nav-${label}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
            <Link className="tv-brand" to="/" aria-label="Tatakai home">
              tatakai<span>アニメの世界</span>
            </Link>
          </header>}
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
                <div className="tv-state" role="status">
                  Loading…
                </div>
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
