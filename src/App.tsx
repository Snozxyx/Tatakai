import { useEffect, useState } from 'react';
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/useIsNativeApp";
import { useIsMobile } from "@/hooks/use-mobile";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReduceMotionPrompt } from '@/components/layout/ReduceMotionPrompt';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useSmartTV } from "@/hooks/useSmartTV";
import { useTheme } from "@/hooks/useTheme";
import { useMaintenanceMode } from "@/hooks/useAdminMessages";
import { usePageTracking } from "@/hooks/useAnalytics";
import { useActiveSession } from "@/hooks/useActiveSession";
import { PopupDisplay } from "@/components/layout/PopupDisplay";
import { Sidebar } from '@/components/layout/Sidebar';
import { Footer } from "@/components/layout/Footer";
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { OfflineGate } from '@/components/layout/OfflineGate';
import { V4AnnouncementPopup } from '@/components/layout/V4AnnouncementPopup';
import { MobileNav } from '@/components/layout/MobileNav';
import { Background } from '@/components/layout/Background';
import { TitleBar } from "@/components/layout/TitleBar";
import { DownloadIndicator } from "@/components/layout/DownloadIndicator";
import { LogViewer } from "@/components/debug/LogViewer";
import { DevConsole } from "@/components/debug/DevConsole";
import { MobileDownloadsUI } from "@/components/mobile/MobileDownloadsUI";
import { DesktopDownloadProvider } from "@/contexts/DesktopDownloadContext";
import { useClientId, setCachedClientId } from "@/hooks/useClientId";

// Safe mobile config getter
const getDevModeEnabled = (): boolean => {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    const saved = localStorage.getItem('tatakai_mobile_config');
    if (!saved) return false;
    const config = JSON.parse(saved);
    return config.devMode === true;
  } catch (e) {
    return false;
  }
};
import { AppDownloadPopup } from '@/components/layout/AppDownloadPopup';
import Index from "./pages/Index";
import AnimePage from "./pages/AnimePage";
import WatchPage from "./pages/WatchPage";
import OfflineLibraryPage from "./pages/OfflineLibraryPage";
import MobileOfflinePage from "./pages/MobileOfflinePage";
import GenrePage from "./pages/GenrePage";
import TrendingPage from "./pages/TrendingPage";
import FavoritesPage from "./pages/FavoritesPage";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import MalRedirectPage from "./pages/MalRedirectPage";
import AniListRedirectPage from "./pages/AniListRedirectPage";
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
import LanguagesPage from "./pages/LanguagesPage";
import LanguageAnimePage from "./pages/LanguageAnimePage";
import SearchPage from "./pages/SearchPage";
import SetupPage from "./pages/SetupPage";
import DownloadPage from "./pages/DownloadPage";
import { Capacitor } from '@capacitor/core';
import { mobileCache } from '@/services/mobileCacheService';

// Detect if running on mobile for performance optimizations
const isMobileApp = Capacitor.isNativePlatform();

// Initialize mobile cache early
if (isMobileApp) {
  mobileCache.init();
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: isMobileApp ? 1 : 2, // Fewer retries on mobile for faster feedback
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Mobile-optimized caching - longer stale times reduce API calls
      staleTime: isMobileApp ? 10 * 60 * 1000 : 5 * 60 * 1000, // 10 min on mobile, 5 min on web
      gcTime: isMobileApp ? 30 * 60 * 1000 : 15 * 60 * 1000, // 30 min cache on mobile
      // Network mode - prefer cached data on mobile
      networkMode: isMobileApp ? 'offlineFirst' : 'online',
    },
  },
});

// Handler for /@username routes and custom redirects
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
        const { data, error } = await supabase
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

  if (isRedirectLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <NotFound />;
}

// Global Listeners (Network & Onboarding)
function GlobalListeners() {
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
    // Scroll to top on route change
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (isLoading) return;

    const onboardingComplete = localStorage.getItem('tatakai_onboarding_complete') === 'true';
    const themeSelected = localStorage.getItem('tatakai_theme_selected_v2') === 'true';

    console.log("[Tatakai] Native Check:", { isNative, onboardingComplete, themeSelected, path: location.pathname });

    // Show onboarding for all new users (both web and native)
    const needsOnboarding = user && (!onboardingComplete || !themeSelected);

    if (needsOnboarding && !location.pathname.startsWith('/auth') && location.pathname !== '/onboarding') {
      console.log("[Tatakai] Redirecting to onboarding...");
      navigate('/onboarding', { replace: true });
    }
  }, [navigate, location.pathname, user, isLoading, isNative]);

  return null;
}

function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electron) {
      (window as any).electron.onNavigate((path: string) => {
        console.log('[DeepLink] Navigating to:', path);
        navigate(path);
      });
    }
  }, [navigate]);

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
  const publicPaths = ['/banned', '/maintenance', '/auth', '/error', '/setup'];
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
  useTheme();
  usePageTracking(); // Track page visits for analytics
  useActiveSession(); // Track real-time active users

  // Initialize Client ID for API rate limiting
  const clientId = useClientId();
  useEffect(() => {
    if (clientId) setCachedClientId(clientId);
  }, [clientId]);

  const { isSmartTV, platform } = useSmartTV();
  const { isBanned, isAdmin } = useAuth();
  const { isMaintenanceMode } = useMaintenanceMode();
  const location = useLocation();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri, not Capacitor mobile
  const isMobile = useIsMobile(); // Screen width based check
  const isMobileApp = Capacitor.isNativePlatform(); // Capacitor mobile apps
  
  // Pages where sidebar should be hidden even on desktop
  const hideSidebarPages = ['/auth', '/onboarding', '/setup', '/maintenance', '/banned', '/error', '/smarttv'];
  const isHiddenPage = hideSidebarPages.some(page => location.pathname.startsWith(page));
  
  // Show sidebar on desktop (web or app), but not on mobile (web or app) or hidden pages
  const showSidebar = !isMobile && !isMobileApp && !isHiddenPage;

  useEffect(() => {
    if (isSmartTV) {
      console.log(`Smart TV detected: ${platform}`);
    }
  }, [isSmartTV, platform]);

  // Add native-app and capacitor-native classes for performance optimizations
  useEffect(() => {
    if (isNative) {
      document.body.classList.add('native-app');
    } else {
      document.body.classList.remove('native-app');
    }
    
    // Add Capacitor-specific class for mobile optimizations
    if (isMobileApp) {
      document.documentElement.classList.add('capacitor-native');
    }
    
    return () => {
      document.body.classList.remove('native-app');
      document.documentElement.classList.remove('capacitor-native');
    };
  }, [isNative, isMobileApp]);

  return (
    <>
      <Toaster />
      <Sonner />
      <OfflineBanner />
      {/* <AppDownloadBanner /> */}
        <DesktopDownloadProvider>
        <OfflineGate>
          {/* Dev Console for mobile apps in dev mode */}
          {getDevModeEnabled() && <DevConsole />}
          
          {/* Downloads Panel for mobile apps */}
          <MobileDownloadsUI />
          
          <div
            className={cn(
              "min-h-screen relative flex flex-col transition-all duration-300",
              isDesktopApp && showSidebar && "pl-20", // Sidebar padding for Electron (only when sidebar visible)
              isDesktopApp && "pt-8" // Titlebar height for Electron (always)
            )}
          >
            {showSidebar && <Background />}
            {isDesktopApp && <TitleBar />}
            {showSidebar && <Sidebar />}
            <V4AnnouncementPopup />
            <GlobalListeners />
            <PopupDisplay />
            <ReduceMotionPrompt />
            <AppDownloadPopup />
            <DownloadIndicator />
            <LogViewer />
            <DeepLinkHandler />

            <main className="flex-1 w-full relative z-10">
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
                <Route path="/setup" element={<SetupPage />} />

                {/* Protected routes */}
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/anime/:animeId" element={<ProtectedRoute><AnimePage /></ProtectedRoute>} />
                <Route path="/watch/:episodeId" element={<ProtectedRoute><WatchPage /></ProtectedRoute>} />
                {/* Downloads page - different component for desktop vs mobile */}
                <Route path="/downloads" element={<ProtectedRoute>{isMobileApp ? <MobileOfflinePage /> : <OfflineLibraryPage />}</ProtectedRoute>} />
                {/* Legacy routes for backwards compatibility */}
                <Route path="/offline-library" element={<ProtectedRoute><OfflineLibraryPage /></ProtectedRoute>} />
                <Route path="/offline" element={<ProtectedRoute><OfflineLibraryPage /></ProtectedRoute>} />
                <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
                <Route path="/download" element={<ProtectedRoute><DownloadPage /></ProtectedRoute>} />
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
                <Route path="/:slug" element={<ProtectedRoute><CatchAllHandler /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>

            <ConditionalFooter />
          </div>
        </OfflineGate>
        </DesktopDownloadProvider>
    </>
  );
}


function ConditionalFooter() {
  const location = useLocation();
  const isNative = useIsNativeApp();

  // Don't show footer in native apps or on certain pages
  if (isNative) return null;

  const hideFooter = [
    '/watch/',
    '/banned',
    '/maintenance',
    '/service-unavailable',
    '/error',
    '/auth',
    '/mal-redirect',
    '/anilist-redirect'
  ].some(path => location.pathname.startsWith(path));

  if (hideFooter) return null;

  return <Footer />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);
export default App;
