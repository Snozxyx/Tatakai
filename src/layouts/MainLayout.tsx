import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { usePageTracking } from "@/hooks/useAnalytics";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useClientId, setCachedClientId } from "@/hooks/useClientId";
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/useIsNativeApp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSmartTV } from "@/hooks/useSmartTV";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Sidebar } from '@/components/layout/Sidebar';
import { Footer } from "@/components/layout/Footer";
import { Background } from '@/components/layout/Background';
import { TitleBar } from "@/components/layout/TitleBar";
import { MobileNav } from '@/components/layout/MobileNav';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { OfflineGate } from '@/components/layout/OfflineGate';
import { V5AnnouncementPopup } from '@/components/layout/V4AnnouncementPopup';
import { PopupDisplay } from "@/components/layout/PopupDisplay";
import { ReduceMotionPrompt } from '@/components/layout/ReduceMotionPrompt';
import { DownloadIndicator } from "@/components/layout/DownloadIndicator";
import { LogViewer } from "@/components/debug/LogViewer";
import { DevConsole } from "@/components/debug/DevConsole";
import { GlobalListeners, DeepLinkHandler, AntiDevToolsGuard } from "@/routes/AppRoutes";

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

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  useTheme();
  usePageTracking();
  useActiveSession();
  
  const clientId = useClientId();
  useEffect(() => {
    if (clientId) setCachedClientId(clientId);
  }, [clientId]);

  const { isSmartTV, platform } = useSmartTV();
  const location = useLocation();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();
  const isMobileApp = Capacitor.isNativePlatform();

  const hideSidebarPages = ['/auth', '/onboarding', '/setup', '/maintenance', '/banned', '/error', '/smarttv', '/manga/read'];
  const isHiddenPage = hideSidebarPages.some(page => location.pathname.startsWith(page));
  const showSidebar = !isMobile && !isMobileApp && !isHiddenPage;

  useEffect(() => {
    if (isNative) document.body.classList.add('native-app');
    else document.body.classList.remove('native-app');
    if (isMobileApp) document.documentElement.classList.add('capacitor-native');
    return () => {
      document.body.classList.remove('native-app');
      document.documentElement.classList.remove('capacitor-native');
    };
  }, [isNative, isMobileApp]);

  return (
    <div
      className={cn(
        "min-h-screen relative flex flex-col transition-all duration-300",
        isDesktopApp && showSidebar && "pl-20",
        isDesktopApp && "pt-8"
      )}
    >
      <Toaster />
      <Sonner />
      <OfflineBanner />
      <OfflineGate>
        {getDevModeEnabled() && <DevConsole />}
        {showSidebar && <Background />}
        {isDesktopApp && <TitleBar />}
        {showSidebar && <Sidebar />}
        <V5AnnouncementPopup />
        <GlobalListeners />
        <PopupDisplay />
        <ReduceMotionPrompt />
        <DownloadIndicator />
        <LogViewer />
        <DeepLinkHandler />
        <AntiDevToolsGuard />

        <main className="flex-1 w-full relative z-10">
          {children}
        </main>

        <ConditionalFooter />
      </OfflineGate>
    </div>
  );
};

function ConditionalFooter() {
  const location = useLocation();
  const isNative = useIsNativeApp();
  if (isNative) return null;
  const hideFooter = ['/watch/', '/genre/', '/manga/', '/manga', '/isshoni/', '/search', '/image-search', '/status', '/banned', '/maintenance', '/service-unavailable', '/503', '/error', '/auth', '/reset-password', '/update-password', '/onboarding', '/setup', '/mal-redirect', '/anilist-redirect', '/favorites', '/trending', '/settings' , '/recommendations' , '/admin', '/mobile-app'].some(path => location.pathname.startsWith(path));
  if (hideFooter) return null;
  return <Footer />;
}

export default MainLayout;
