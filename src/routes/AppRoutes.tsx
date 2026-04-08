import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenanceMode } from "@/hooks/useAdminMessages";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { useAntiDevTools } from '@/hooks/useAntiDevTools';
import { Capacitor } from '@capacitor/core';

// Base Pages
const Index = lazy(() => import("../pages/base/Index"));
const SearchPage = lazy(() => import("../pages/base/SearchPage"));
const GenrePage = lazy(() => import("../pages/base/GenrePage"));
const LanguagesPage = lazy(() => import("../pages/base/LanguagesPage"));
const LanguageAnimePage = lazy(() => import("../pages/base/LanguageAnimePage"));
const TrendingPage = lazy(() => import("../pages/base/TrendingPage"));
const RecommendationsPage = lazy(() => import("../pages/base/RecommendationsPage"));
const SchedulePage = lazy(() => import("../pages/base/SchedulePage"));
const RegionalSchedulePage = lazy(() => import("../pages/base/RegionalSchedulePage"));
const SuggestionsPage = lazy(() => import("../pages/base/SuggestionsPage"));
const DownloadPage = lazy(() => import("../pages/base/DownloadPage"));
const MobileAppSoonPage = lazy(() => import("../pages/base/MobileAppSoonPage"));
const DiscordPage = lazy(() => import("../pages/base/DiscordPage"));
const CharacterPage = lazy(() => import("../pages/base/CharacterPage"));
const SettingsPage = lazy(() => import("../pages/base/SettingsPage"));

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

// Community & Forum
const CommunityPage = lazy(() => import("../pages/forum/CommunityPage"));
const ForumPostPage = lazy(() => import("../pages/forum/ForumPostPage"));
const ForumNewPostPage = lazy(() => import("../pages/forum/ForumNewPostPage"));

// Legal
const TermsPage = lazy(() => import("../pages/legal/TermsPage"));
const PrivacyPage = lazy(() => import("../pages/legal/PrivacyPage"));
const DMCAPage = lazy(() => import("../pages/legal/DMCAPage"));

// Admin & Error
const AdminPage = lazy(() => import("../pages/admin/AdminPage"));
const ErrorPage = lazy(() => import("../pages/error/ErrorPage"));
const NotFound = lazy(() => import("../pages/error/NotFound"));
const BannedPage = lazy(() => import("../pages/error/BannedPage"));
const MaintenancePage = lazy(() => import("../pages/error/MaintenancePage"));
const ServiceUnavailablePage = lazy(() => import("../pages/error/ServiceUnavailablePage"));
const NoInternetPage = lazy(() => import("../pages/error/NoInternetPage"));
const StatusPage = lazy(() => import("../pages/error/StatusPage"));
const MobileOfflinePage = lazy(() => import("../pages/error/MobileOfflinePage"));
const DevtoolsBlockedPage = lazy(() => import("../pages/error/DevtoolsBlockedPage"));

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function CatchAllHandler() {
  const { slug } = useParams<{ slug: string }>();
  const [isRedirectLoading, setIsRedirectLoading] = useState(true);

  useEffect(() => {
    if (slug?.startsWith('@')) {
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
  }, [slug]);

  if (slug?.startsWith('@')) {
    return <ProfilePage key={slug} />;
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
    if (typeof window !== 'undefined' && (window as any).electron) {
      (window as any).electron.onNavigate((path: string) => {
        navigate(path);
      });
    }
  }, [navigate]);
  return null;
}

export function AntiDevToolsGuard() {
  useAntiDevTools();
  return null;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isBanned, isAdmin, isLoading } = useAuth();
  const { isMaintenanceMode } = useMaintenanceMode();
  const location = useLocation();

  if (location.pathname === '/onboarding') return <>{children}</>;

  const bannedAllowedPaths = ['/banned', '/auth'];
  const isBannedAllowedPath = bannedAllowedPaths.some(path => location.pathname.startsWith(path));
  const publicPaths = ['/banned', '/maintenance', '/auth', '/error', '/setup'];
  const isPublicPath = publicPaths.some(path => location.pathname.startsWith(path));

  if (isLoading) return <PageLoader />;
  if (isBanned && !isBannedAllowedPath) return <Navigate to="/banned" replace />;
  if (isMaintenanceMode && !isAdmin && !isPublicPath) return <Navigate to="/maintenance" replace />;

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

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/maintenance" element={<StatusPageGuard allowedWhen={isMaintenanceMode}><MaintenancePage /></StatusPageGuard>} />
        <Route path="/banned" element={<StatusPageGuard allowedWhen={isBanned}><BannedPage /></StatusPageGuard>} />
        <Route path="/503" element={<StatusPageGuard allowedWhen={false}><ServiceUnavailablePage /></StatusPageGuard>} />
        <Route path="/error" element={<StatusPageGuard allowedWhen={false}><ErrorPage /></StatusPageGuard>} />
        <Route path="/devtools-blocked" element={<DevtoolsBlockedPage />} />
        <Route path="/char/:charname" element={<CharacterPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/discord" element={<DiscordPage />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/mal/:id" element={<ExternalIdRedirect type="mal" />} />
        <Route path="/anilist/:id" element={<ExternalIdRedirect type="anilist" />} />
        <Route path="/anime/:animeId" element={<ProtectedRoute><AnimePage /></ProtectedRoute>} />
        <Route path="/watch/:episodeId" element={<ProtectedRoute><WatchPage /></ProtectedRoute>} />
        <Route path="/downloads" element={<ProtectedRoute>{isMobileApp ? <MobileOfflinePage /> : <OfflineLibraryPage />}</ProtectedRoute>} />
        <Route path="/offline-library" element={<ProtectedRoute><OfflineLibraryPage /></ProtectedRoute>} />
        <Route path="/offline" element={<ProtectedRoute><OfflineLibraryPage /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/download" element={<ProtectedRoute><DownloadPage /></ProtectedRoute>} />
        <Route path="/mobile-app" element={<ProtectedRoute><MobileAppSoonPage /></ProtectedRoute>} />
        <Route path="/image-search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/languages" element={<ProtectedRoute><LanguagesPage /></ProtectedRoute>} />
        <Route path="/languages/:language" element={<ProtectedRoute><LanguageAnimePage /></ProtectedRoute>} />
        <Route path="/genre/:genre" element={<ProtectedRoute><GenrePage /></ProtectedRoute>} />
        <Route path="/trending" element={<ProtectedRoute><TrendingPage /></ProtectedRoute>} />
        <Route path="/collections" element={<ProtectedRoute><CollectionsPage /></ProtectedRoute>} />
        <Route path="/favorites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/integration/mal/redirect" element={<ProtectedRoute><MalRedirectPage /></ProtectedRoute>} />
        <Route path="/integration/anilist/redirect" element={<ProtectedRoute><AniListRedirectPage /></ProtectedRoute>} />
        <Route path="/recommendations" element={<ProtectedRoute><RecommendationsPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/status" element={<ProtectedRoute><StatusPage /></ProtectedRoute>} />
        <Route path="/suggestions" element={<ProtectedRoute><SuggestionsPage /></ProtectedRoute>} />
        <Route path="/terms" element={<ProtectedRoute><TermsPage /></ProtectedRoute>} />
        <Route path="/dmca" element={<ProtectedRoute><DMCAPage /></ProtectedRoute>} />
        <Route path="/privacy" element={<ProtectedRoute><PrivacyPage /></ProtectedRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route path="/community" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
        <Route path="/community/forum/new" element={<ProtectedRoute><ForumNewPostPage /></ProtectedRoute>} />
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
    </Suspense>
  );
};

export default AppRoutes;
