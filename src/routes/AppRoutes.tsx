import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenanceMode } from "@/hooks/admin/useAdminMessages";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { WebWatchGate } from '@/components/layout/WebWatchGate';
import { Capacitor } from '@capacitor/core';
import { initializePlayerAdapters } from '@/core/player/adapters-init';

// Base Pages
const Index = lazy(() => import("../pages/base/Index"));
const HomeGate = lazy(() => import("../pages/base/HomeGate"));
const LandingPage = lazy(() => import("../pages/base/LandingPage"));
const DownloadPage = lazy(() => import("../pages/base/DownloadPage"));
const SearchPage = lazy(() => import("../pages/base/SearchPage"));
const GenrePage = lazy(() => import("../pages/base/GenrePage"));
const TrendingPage = lazy(() => import("../pages/base/TrendingPage"));
const RecommendationsPage = lazy(() => import("../pages/base/RecommendationsPage"));
const SuggestionsPage = lazy(() => import("../pages/base/SuggestionsPage"));
const DiscordPage = lazy(() => import("../pages/base/DiscordPage"));
const CharacterPage = lazy(() => import("../pages/base/CharacterPage"));
const SettingsRouteOpener = lazy(() =>
  import("../components/settings/SettingsRouteOpener").then((m) => ({ default: m.SettingsRouteOpener })),
);
const ExtensionHubPage = lazy(() => import("../pages/base/ExtensionHubPage"));
const ExtensionDetailPage = lazy(() => import("../pages/base/ExtensionDetailPage"));

// Auth & Onboarding
const AuthPage = lazy(() => import("../pages/auth/AuthPage"));
const ResetPasswordPage = lazy(() => import("../pages/auth/ResetPasswordPage"));
const UpdatePasswordPage = lazy(() => import("../pages/auth/UpdatePasswordPage"));
const OnboardingPage = lazy(() => import("../pages/auth/OnboardingPage"));
const SetupPage = lazy(() => import("../pages/auth/SetupPage"));
const AniListRedirectPage = lazy(() => import("../pages/auth/AniListRedirectPage"));
const MalRedirectPage = lazy(() => import("../pages/auth/MalRedirectPage"));

// Watch & Streaming
const WatchPage = lazy(() => import("../pages/watch/WatchPage"));
const AnimePage = lazy(() => import("../pages/watch/AnimePage"));
const WatchRoomPage = lazy(() => import("../pages/watch/WatchRoomPage"));
const IsshoNiPage = lazy(() => import("../pages/watch/IsshoNiPage"));

// Manga & Reading
const MangaHomePage = lazy(() => import("../pages/manga/MangaHomePage"));
const MangaGenreBrowsePage = lazy(() => import("../pages/manga/MangaGenreBrowsePage"));
const MangaPage = lazy(() => import("../pages/manga/MangaPage"));
const MangaReaderPage = lazy(() => import("../pages/manga/MangaReaderPage"));
const NovelComingSoon = lazy(() => import("../pages/novel/NovelComingSoon"));

// Custom Sources (extension-provided, isolated read/watch verticals)
const CustomHomePage = lazy(() => import("../pages/custom/CustomHomePage"));
const CustomInfoPage = lazy(() => import("../pages/custom/CustomInfoPage"));
const CustomWatchPage = lazy(() => import("../pages/custom/CustomWatchPage"));
const CustomReadPage = lazy(() => import("../pages/custom/CustomReadPage"));

// Profile & Personal
const ProfilePage = lazy(() => import("../pages/profile/ProfilePage"));
const PublicProfilePage = lazy(() => import("../pages/profile/PublicProfilePage"));
const FavoritesPage = lazy(() => import("../pages/profile/FavoritesPage"));
const CollectionsPage = lazy(() => import("../pages/profile/CollectionsPage"));
const TierListPage = lazy(() => import("../pages/profile/TierListPage"));
const { TierListViewPage } = { TierListViewPage: lazy(() => import("../pages/profile/TierListPage").then(m => ({ default: m.TierListViewPage }))) };
const TierListEditPage = lazy(() => import("../pages/profile/TierListEditPage"));
const PlaylistsPage = lazy(() => import("../pages/profile/PlaylistPage"));
const { PlaylistViewPage } = { PlaylistViewPage: lazy(() => import("../pages/profile/PlaylistPage").then(m => ({ default: m.PlaylistViewPage }))) };
const PublicPlaylistPage = lazy(() => import("../pages/profile/PublicPlaylistPage"));
const WrappedPage = lazy(() => import("../pages/profile/WrappedPage"));
const OfflineLibraryPage = lazy(() => import("../pages/profile/OfflineLibraryPage"));
const NotificationsPage = lazy(() => import("../pages/profile/NotificationsPage"));
const CalendarPage = lazy(() => import("../pages/base/CalendarPage"));
const FollowConnectionsPage = lazy(() => import("../pages/profile/FollowConnectionsPage"));

// Community & Forum
const CommunityPage = lazy(() => import("../pages/community/CommunityFeedPage"));
const CommunitySpacePage = lazy(() => import("../pages/community/CommunitySpacePage"));
const CommunityInformationPage = lazy(() => import("../pages/community/CommunityInformationPage"));
const CommunitySettingsPage = lazy(() => import("../pages/community/CommunitySettingsPage"));
const BookmarksPage = lazy(() => import("../pages/community/BookmarksPage"));
const ForumPostPage = lazy(() => import("../pages/forum/ForumPostPage"));

// Legal
const TermsPage = lazy(() => import("../pages/legal/TermsPage"));
const PrivacyPage = lazy(() => import("../pages/legal/PrivacyPage"));
const DMCAPage = lazy(() => import("../pages/legal/DMCAPage"));
const CommunityGuidelinesPage = lazy(() => import("../pages/legal/CommunityGuidelinesPage"));

// Admin & Error
const AdminPage = lazy(() => import("../pages/admin/AdminPage"));
const AdminUserPage = lazy(() => import("../pages/admin/AdminUserPage"));
const ErrorPage = lazy(() => import("../pages/error/ErrorPage"));
const NotFound = lazy(() => import("../pages/error/NotFound"));
const BannedPage = lazy(() => import("../pages/error/BannedPage"));
const MaintenancePage = lazy(() => import("../pages/error/MaintenancePage"));
const ServiceUnavailablePage = lazy(() => import("../pages/error/ServiceUnavailablePage"));
const NoInternetPage = lazy(() => import("../pages/error/NoInternetPage"));
const StatusPage = lazy(() => import("../pages/error/StatusPage"));
const MobileOfflinePage = lazy(() => import("../pages/error/MobileOfflinePage"));

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

import { extensionRegistry } from '@/core/extensions/ExtensionRegistry';
import { bootstrapExtensions } from '@/core/extensions/bootstrapExtensions';

function CatchAllHandler() {
  const { slug } = useParams<{ slug: string }>();
  const [isRedirectLoading, setIsRedirectLoading] = useState(true);

  // Check Extension Registry for custom pages
  const extPages = extensionRegistry.getPages();
  const matchedExtPage = extPages.find(p => p.path === `/${slug}` || p.path === slug);

  useEffect(() => {
    if (slug?.startsWith('@') || matchedExtPage) {
      setIsRedirectLoading(false);
      return;
    }

    const checkRedirect = async () => {
      try {
        const { data } = await supabase
          .from('redirects')
          .select('target_url')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (data?.target_url) {
          window.location.replace(data.target_url);
        } else {
          setIsRedirectLoading(false);
        }
      } catch (err) {
        console.error('Redirect check failed:', err);
        setIsRedirectLoading(false);
      }
    };

    checkRedirect();
  }, [slug, matchedExtPage]);

  if (slug?.startsWith('@')) {
    return <ProfilePage key={slug} />;
  }

  if (matchedExtPage) {
    const Component = matchedExtPage.component;
    return <Component />;
  }

  if (isRedirectLoading) return <PageLoader />;
  return <NotFound />;
}

export function GlobalListeners() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const isSetupComplete = localStorage.getItem('tatakai_setup_complete') === 'true';
  const isNative = useIsNativeApp();

  useEffect(() => {
    initializePlayerAdapters();

    // Boot installed extensions' contributions (themes, analytics, custom
    // sources, and trust-gated renderer bundles). Idempotent — guarded against
    // StrictMode double-invoke inside bootstrapExtensions.
    void bootstrapExtensions((path: string) => navigate(path));

    // Sync torrent settings with main process on startup (desktop only)
    if (typeof window !== 'undefined' && (window as any).tatakaiRuntime?.updateTorrentSettings) {
      const schedule = localStorage.getItem('tatakai_bandwidth_schedule') || 'default';
      const limitDownload = Number(localStorage.getItem('tatakai_torrent_limit_dl') || 0);
      const limitUpload = Number(localStorage.getItem('tatakai_torrent_limit_ul') || 0);
      const customTrackers = (localStorage.getItem('tatakai_torrent_custom_trackers') || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      (window as any).tatakaiRuntime.updateTorrentSettings({
        schedule,
        limitDownload,
        limitUpload,
        customTrackers
      });
    }
  }, []);

  useEffect(() => {
    if (isNative && !isSetupComplete && location.pathname !== '/setup') {
      navigate('/setup');
    }
  }, [isNative, isSetupComplete, navigate, location.pathname]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (isLoading) return;
    const onboardingComplete = localStorage.getItem('tatakai_onboarding_complete') === 'true';
    const themeSelected = localStorage.getItem('tatakai_theme_selected_v2') === 'true';
    const needsOnboarding = user && (!onboardingComplete || !themeSelected);
    if (needsOnboarding && !location.pathname.startsWith('/auth') && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate, location.pathname, user, isLoading]);

  return null;
}

export function DeepLinkHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electron?.onNavigate) return;
    const unsubscribe = (window as any).electron.onNavigate((path: string) => {
      navigate(path);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [navigate]);
  return null;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isBanned, isAdmin, isLoading } = useAuth();
  const { isMaintenanceMode } = useMaintenanceMode();
  const location = useLocation();

  if (location.pathname === '/onboarding') return <>{children}</>;

  const bannedAllowedPaths = ['/banned', '/auth'];
  const isBannedAllowedPath = bannedAllowedPaths.some(path => location.pathname.startsWith(path));
  const publicPaths = ['/banned', '/maintenance', '/auth', '/error', '/setup'];
  const isPublicPath = publicPaths.some(path => location.pathname.startsWith(path));
  // Paths whose content is served entirely from the local device (IPC + IndexedDB)
  // and needs no backend. These must stay reachable during maintenance / an API
  // outage / a full server-down so the user can still browse and play their
  // downloaded library. Offline `/watch` (playing a downloaded file) qualifies too.
  const offlineCapablePaths = ['/downloads', '/offline-library', '/offline'];
  const isNativeApp =
    typeof window !== 'undefined' &&
    Boolean((window as any).electron || (window as any).tatakaiRuntime);
  const isOfflineWatch =
    location.pathname.startsWith('/watch') && location.search.includes('offline=true');
  // Reading a downloaded chapter: the reader serves pages from the local device
  // (see getMangaReadByKey's offline-first branch), so it must survive a ban /
  // maintenance / server-down just like offline `/watch`. Gated to native +
  // an explicit `offline=true` so a web visitor can't use it to bypass a gate.
  const isOfflineMangaRead =
    isNativeApp &&
    location.pathname.startsWith('/manga/read') &&
    location.search.includes('offline=true');
  const isOfflineCapablePath =
    offlineCapablePaths.some(path => location.pathname.startsWith(path)) ||
    isOfflineWatch ||
    isOfflineMangaRead;
  const strictLoadingPaths = [
    '/admin',
    '/onboarding',
    '/setup',
    '/integration/mal/redirect',
    '/integration/anilist/redirect',
  ];
  const requiresStrictBootstrap = strictLoadingPaths.some((path) =>
    location.pathname.startsWith(path)
  );
  const shouldWaitForMaintenanceRoleResolution = isLoading && !!user && isMaintenanceMode;

  if (requiresStrictBootstrap && isLoading) return <PageLoader />;
  if (shouldWaitForMaintenanceRoleResolution) return <PageLoader />;
  if (isBanned && !isBannedAllowedPath && !isOfflineCapablePath) return <Navigate to="/banned" replace />;
  if (isMaintenanceMode && !isAdmin && !isPublicPath && !isOfflineCapablePath)
    return <Navigate to="/maintenance" replace />;

  return <>{children}</>;
}

/**
 * Staff-only route guard.
 *
 * `ProtectedRoute` only handles bans and maintenance mode, so `/admin` was reachable by
 * any visitor until `AdminPage` self-redirected from a `useEffect` — after the whole
 * admin bundle had already loaded. This gates the route itself, and waits for
 * `rolesResolved` rather than `isLoading`, because the auth session settles before the
 * profile query that carries staff status.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isModerator, isLoading, rolesResolved } = useAuth();

  if (isLoading || !rolesResolved) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isModerator) return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function StatusPageGuard({ children, allowedWhen, redirectTo = "/" }: { children: React.ReactNode; allowedWhen: boolean; redirectTo?: string; }) {
  return allowedWhen ? <>{children}</> : <Navigate to={redirectTo} replace />;
}

function ExternalIdRedirect({ type }: { type: 'mal' | 'anilist' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      navigate(`/anime/${type}-${id}`, { replace: true });
    }
  }, [id, type, navigate]);

  return <PageLoader />;
}

const AppRoutes = () => {
  const { isBanned } = useAuth();
  const { isMaintenanceMode } = useMaintenanceMode();
  const isMobileApp = Capacitor.isNativePlatform();
  const location = useLocation();
  // Key the fade by the first path segment only: top-level section changes
  // (home → search → profile) fade in, but navigating within a section
  // (episode → episode, reader page → reader page) keeps the same key so the
  // subtree is never remounted — no refetch flash, no player/reader disruption.
  const routeSection = location.pathname.split('/')[1] || 'root';

  return (
    <Suspense fallback={<PageLoader />}>
      <div key={routeSection} className="route-enter">
      <Routes>
        <Route path="/maintenance" element={<StatusPageGuard allowedWhen={isMaintenanceMode}><MaintenancePage /></StatusPageGuard>} />
        <Route path="/banned" element={<StatusPageGuard allowedWhen={isBanned}><BannedPage /></StatusPageGuard>} />
        <Route path="/503" element={<StatusPageGuard allowedWhen={false}><ServiceUnavailablePage /></StatusPageGuard>} />
        <Route path="/error" element={<StatusPageGuard allowedWhen={false}><ErrorPage /></StatusPageGuard>} />
        <Route path="/char/:charname" element={<CharacterPage />} />
        <Route path="/character/:charname" element={<CharacterPage />} />
        <Route path="/extensions" element={<ProtectedRoute><ExtensionHubPage /></ProtectedRoute>} />
        <Route path="/extensions/:extensionId" element={<ProtectedRoute><ExtensionDetailPage /></ProtectedRoute>} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/discord" element={<DiscordPage />} />
        <Route path="/" element={<HomeGate />} />
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/browse" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/mal/:id" element={<ExternalIdRedirect type="mal" />} />
        <Route path="/anilist/:id" element={<ExternalIdRedirect type="anilist" />} />
        <Route path="/anime/:animeId" element={<ProtectedRoute><AnimePage /></ProtectedRoute>} />
        <Route path="/manga" element={<ProtectedRoute><MangaHomePage /></ProtectedRoute>} />
        <Route path="/manga/discover" element={<ProtectedRoute><MangaGenreBrowsePage /></ProtectedRoute>} />
        {/* Bare `/manga/genre` mirrors the anime side's `/genre`: the catalogue with no genre picked. */}
        <Route path="/manga/genre" element={<ProtectedRoute><MangaGenreBrowsePage /></ProtectedRoute>} />
        <Route path="/manga/genre/:genre" element={<ProtectedRoute><MangaGenreBrowsePage /></ProtectedRoute>} />
        <Route path="/manga/:mangaId" element={<ProtectedRoute><MangaPage /></ProtectedRoute>} />
        <Route path="/manga/read/:mangaId" element={<ProtectedRoute><WebWatchGate mode="read"><MangaReaderPage /></WebWatchGate></ProtectedRoute>} />
        <Route path="/novel/comingsoon" element={<ProtectedRoute><NovelComingSoon /></ProtectedRoute>} />
        {/* Custom sources — isolated extension verticals, addressed by (namespace, sourceId). */}
        <Route path="/x/:namespace/:sourceId" element={<ProtectedRoute><CustomHomePage /></ProtectedRoute>} />
        <Route path="/x/:namespace/:sourceId/info/:id" element={<ProtectedRoute><CustomInfoPage /></ProtectedRoute>} />
        <Route path="/x/:namespace/:sourceId/watch/:id/:episodeId" element={<ProtectedRoute><WebWatchGate><CustomWatchPage /></WebWatchGate></ProtectedRoute>} />
        <Route path="/x/:namespace/:sourceId/read/:id/:chapterId" element={<ProtectedRoute><WebWatchGate mode="read"><CustomReadPage /></WebWatchGate></ProtectedRoute>} />
        <Route path="/watch/:episodeId" element={<ProtectedRoute><WebWatchGate><WatchPage /></WebWatchGate></ProtectedRoute>} />
        <Route path="/downloads" element={<ProtectedRoute>{isMobileApp ? <MobileOfflinePage /> : <OfflineLibraryPage />}</ProtectedRoute>} />
        <Route path="/offline-library" element={<ProtectedRoute><OfflineLibraryPage /></ProtectedRoute>} />
        <Route path="/offline" element={<ProtectedRoute><OfflineLibraryPage /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/search/producer/:producerName" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/image-search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/genre" element={<ProtectedRoute><GenrePage /></ProtectedRoute>} />
        <Route path="/genre/:genre" element={<ProtectedRoute><GenrePage /></ProtectedRoute>} />
        <Route path="/trending" element={<ProtectedRoute><TrendingPage /></ProtectedRoute>} />
        <Route path="/collections" element={<ProtectedRoute><CollectionsPage /></ProtectedRoute>} />
        <Route path="/favorites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/social/:username" element={<ProtectedRoute><FollowConnectionsPage /></ProtectedRoute>} />
        <Route path="/integration/mal/redirect" element={<ProtectedRoute><MalRedirectPage /></ProtectedRoute>} />
        <Route path="/integration/anilist/redirect" element={<ProtectedRoute><AniListRedirectPage /></ProtectedRoute>} />
        <Route path="/recommendations" element={<ProtectedRoute><RecommendationsPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/user/:userId" element={<ProtectedRoute><AdminRoute><AdminUserPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/settings" element={<SettingsRouteOpener />} />
        <Route path="/status" element={<ProtectedRoute><StatusPage /></ProtectedRoute>} />
        <Route path="/suggestions" element={<ProtectedRoute><SuggestionsPage /></ProtectedRoute>} />
        <Route path="/terms" element={<ProtectedRoute><TermsPage /></ProtectedRoute>} />
        <Route path="/dmca" element={<ProtectedRoute><DMCAPage /></ProtectedRoute>} />
        <Route path="/privacy" element={<ProtectedRoute><PrivacyPage /></ProtectedRoute>} />
        <Route path="/community-guidelines" element={<ProtectedRoute><CommunityGuidelinesPage /></ProtectedRoute>} />
        <Route path="/community-rules" element={<ProtectedRoute><CommunityGuidelinesPage /></ProtectedRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route path="/community" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
        <Route path="/community/forum/new" element={<Navigate to="/community" replace />} />
        <Route path="/community/bookmarks" element={<ProtectedRoute><BookmarksPage /></ProtectedRoute>} />
        <Route path="/community/c/:slug" element={<ProtectedRoute><CommunitySpacePage /></ProtectedRoute>} />
        <Route path="/community/c/:slug/information" element={<ProtectedRoute><CommunityInformationPage /></ProtectedRoute>} />
        <Route path="/community/c/:slug/settings" element={<ProtectedRoute><CommunitySettingsPage /></ProtectedRoute>} />
        <Route path="/community/forum/:postId" element={<ProtectedRoute><ForumPostPage /></ProtectedRoute>} />
        <Route path="/tierlists" element={<ProtectedRoute><TierListPage /></ProtectedRoute>} />
        <Route path="/tierlist/:shareCode" element={<ProtectedRoute><TierListViewPage /></ProtectedRoute>} />
        <Route path="/tierlists/edit/:id" element={<ProtectedRoute><TierListEditPage /></ProtectedRoute>} />
        <Route path="/playlists" element={<ProtectedRoute><PlaylistsPage /></ProtectedRoute>} />
        <Route path="/p/:shareSlug" element={<PublicPlaylistPage />} />
        <Route path="/playlist/:playlistId" element={<ProtectedRoute><PlaylistViewPage /></ProtectedRoute>} />
        <Route path="/stats" element={<ProtectedRoute><WrappedPage /></ProtectedRoute>} />
        <Route path="/wrapped" element={<ProtectedRoute><WrappedPage /></ProtectedRoute>} />
        <Route path="/isshoni/room/:roomId" element={<ProtectedRoute><WatchRoomPage /></ProtectedRoute>} />
        <Route path="/user/:username" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/:slug" element={<ProtectedRoute><CatchAllHandler /></ProtectedRoute>} />
        <Route path="/isshoni" element={<ProtectedRoute><IsshoNiPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </div>
    </Suspense>
  );
};

export default AppRoutes;


