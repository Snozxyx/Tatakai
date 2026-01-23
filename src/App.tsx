import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useSmartTV } from "@/hooks/useSmartTV";
import { useTheme } from "@/hooks/useTheme";
import { useDeviceCapabilities } from "@/hooks/useDeviceCapabilities";
import { useMaintenanceMode } from "@/hooks/useAdminMessages";
import { usePageTracking } from "@/hooks/useAnalytics";
import { PopupDisplay } from "@/components/layout/PopupDisplay";
import { GlobalPopup } from "@/components/notifications/GlobalPopup";
import { Footer } from "@/components/layout/Footer";
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import Index from "./pages/Index";
import AnimePage from "./pages/AnimePage";
import WatchPage from "./pages/WatchPage";
import SearchPage from "./pages/SearchPage";
import GenrePage from "./pages/GenrePage";
import TrendingPage from "./pages/TrendingPage";
import FavoritesPage from "./pages/FavoritesPage";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";

import SettingsPage from "./pages/SettingsPage";
import StatusPage from "./pages/StatusPage";
import NotFound from "./pages/NotFound";
import MaintenancePage from "./pages/MaintenancePage";
import ServiceUnavailablePage from "./pages/ServiceUnavailablePage";
import BannedPage from "./pages/BannedPage";
import ErrorPage from "./pages/ErrorPage";
import TierListPage, { TierListViewPage } from "./pages/TierListPage";
import TierListEditPage from "./pages/TierListEditPage";
import PlaylistsPage, { PlaylistViewPage } from "./pages/PlaylistPage";
import PublicPlaylistPage from "./pages/PublicPlaylistPage";
import CommunityPage from "./pages/CommunityPage";
import ForumPostPage from "./pages/ForumPostPage";
import ForumNewPostPage from "./pages/ForumNewPostPage";
import CollectionsPage from "./pages/CollectionsPage";
import SuggestionsPage from "./pages/SuggestionsPage";
import TermsPage from "./pages/TermsPage";
import DMCAPage from "./pages/DMCAPage";
import PrivacyPage from "./pages/PrivacyPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import UpdatePasswordPage from "./pages/UpdatePasswordPage";
import CharacterPage from "./pages/CharacterPage";
import IsshoNiPage from "./pages/IsshoNiPage";
import WatchRoomPage from "./pages/WatchRoomPage";
import AdminPage from "./pages/AdminPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import OnboardingPage from "./pages/OnboardingPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Handler for /@username routes
function AtUsernameHandler() {
  const { atUsername } = useParams<{ atUsername: string }>();

  // If the param starts with @, extract username and show profile
  if (atUsername?.startsWith('@')) {
    return <ProfilePage key={atUsername} />;
  }

  // Otherwise, show 404
  return <NotFound />;
}

// Global Listeners (Network & Onboarding)
function GlobalListeners() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return; // Wait for auth to load

    const onboardingComplete = localStorage.getItem('tatakai_onboarding_complete') === 'true';

    // Show onboarding for authenticated users who haven't completed it
    // Skip onboarding for auth pages and if already on onboarding
    if (user && !onboardingComplete && !location.pathname.startsWith('/auth') && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate, location, user, isLoading]);

  return null;
}

// Protected route wrapper that checks for banned users and maintenance mode
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isBanned, isAdmin, isLoading } = useAuth();
  const { isMaintenanceMode } = useMaintenanceMode();
  const location = useLocation();

  // Allow access to onboarding regardless of other restrictions
  if (location.pathname === '/onboarding') {
    return <>{children}</>;
  }

  // Banned users can only access /banned and /auth
  const bannedAllowedPaths = ['/banned', '/auth'];
  const isBannedAllowedPath = bannedAllowedPaths.some(path => location.pathname.startsWith(path));

  // Allow access to certain pages regardless of status
  const publicPaths = ['/banned', '/maintenance', '/auth', '/error'];
  const isPublicPath = publicPaths.some(path => location.pathname.startsWith(path));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Redirect banned users to banned page (only allow /banned and /auth)
  if (isBanned && !isBannedAllowedPath) {
    return <Navigate to="/banned" replace />;
  }

  // Redirect to maintenance page if active (admins can still access)
  if (isMaintenanceMode && !isAdmin && !isPublicPath) {
    return <Navigate to="/maintenance" replace />;
  }

  return <>{children}</>;
}

// Status page guard that only shows pages when user is in the appropriate state
function StatusPageGuard({
  children,
  allowedWhen,
  redirectTo = "/"
}: {
  children: React.ReactNode;
  allowedWhen: boolean;
  redirectTo?: string;
}) {
  return allowedWhen ? <>{children}</> : <Navigate to={redirectTo} replace />;
}

function AppContent() {
  // Initialize theme and smart TV detection
  const { theme, setTheme } = useTheme();
  const { recommendedTheme, isLowEndDevice } = useDeviceCapabilities();
  usePageTracking(); // Track page visits for analytics
  const { isSmartTV, platform } = useSmartTV();
  const { isBanned, isAdmin } = useAuth();
  const { isMaintenanceMode } = useMaintenanceMode();

  // Auto-apply lite mode theme for low-end devices
  useEffect(() => {
    if (isLowEndDevice && recommendedTheme === 'lite-mode' && theme !== 'lite-mode') {
      setTheme('lite-mode');
    }
  }, [isLowEndDevice, recommendedTheme, theme, setTheme]);

  useEffect(() => {
    if (isSmartTV) {
      console.log(`Smart TV detected: ${platform}`);
    }
  }, [isSmartTV, platform]);

  return (
    <>
      <Toaster />
      <Sonner />
      {/* Global popup system */}
      <GlobalPopup />
      {/* Offline banner lives at top level so it can be seen anywhere */}
      <OfflineBanner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <GlobalListeners />
        <PopupDisplay />
        <Routes>
          {/* Status pages - only accessible when in appropriate state */}
          <Route path="/maintenance" element={
            <StatusPageGuard allowedWhen={isMaintenanceMode}>
              <MaintenancePage />
            </StatusPageGuard>
          } />
          <Route path="/banned" element={
            <StatusPageGuard allowedWhen={isBanned}>
              <BannedPage />
            </StatusPageGuard>
          } />
          <Route path="/503" element={
            <StatusPageGuard allowedWhen={false}>
              <ServiceUnavailablePage />
            </StatusPageGuard>
          } />
          <Route path="/error" element={
            <StatusPageGuard allowedWhen={false}>
              <ErrorPage />
            </StatusPageGuard>
          } />
          <Route path="/char/:charname" element={<CharacterPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

          {/* Protected routes */}
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/anime/:animeId" element={<ProtectedRoute><AnimePage /></ProtectedRoute>} />
          <Route path="/watch/:episodeId" element={<ProtectedRoute><WatchPage /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/genre/:genre" element={<ProtectedRoute><GenrePage /></ProtectedRoute>} />
          <Route path="/trending" element={<ProtectedRoute><TrendingPage /></ProtectedRoute>} />
          <Route path="/collections" element={<ProtectedRoute><CollectionsPage /></ProtectedRoute>} />
          <Route path="/favorites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/recommendations" element={<ProtectedRoute><RecommendationsPage /></ProtectedRoute>} />
          {/* Admin Routes */}
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
          <Route path="/isshoni" element={<ProtectedRoute><IsshoNiPage /></ProtectedRoute>} />
          <Route path="/isshoni/room/:roomId" element={<ProtectedRoute><WatchRoomPage /></ProtectedRoute>} />
          <Route path="/user/:username" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/:atUsername" element={<ProtectedRoute><AtUsernameHandler /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <ConditionalFooter />
      </BrowserRouter>
    </>
  );
}

function ConditionalFooter() {
  const location = useLocation();
  // Hide footer on admin pages, watch page (immersive mode), and onboarding page
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/watch/') || location.pathname === '/onboarding') {
    return null;
  }

  return (
    <div className="mt-24">
      <Footer />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
