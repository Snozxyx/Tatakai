import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/ui/useTheme";
import { usePageTracking } from "@/hooks/api/useAnalytics";
import { useActiveSession } from "@/hooks/auth/useActiveSession";
import { useClientId, setCachedClientId } from "@/hooks/ui/useClientId";
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { useSmartTV } from "@/hooks/ui/useSmartTV";
import { useOnline } from "@/hooks/ui/useOnline";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Sidebar } from '@/components/layout/Sidebar';
import { Footer } from "@/components/layout/Footer";
import { Background } from '@/components/layout/Background';
import { TitleBar } from "@/components/layout/TitleBar";
import { MobileNav } from '@/components/layout/MobileNav';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { OfflineGate } from '@/components/layout/OfflineGate';
import { V5AnnouncementPopup } from '@/components/layout/V6AnnouncementPopup';
import { PopupDisplay } from "@/components/layout/PopupDisplay";
import { ReduceMotionPrompt } from '@/components/layout/ReduceMotionPrompt';
import { LogViewer } from "@/components/debug/LogViewer";
import { DevConsole } from "@/components/debug/DevConsole";
import { GlobalListeners, DeepLinkHandler, AntiDevToolsGuard } from "@/routes/AppRoutes";
import { MagnetAlignmentModal } from "@/components/modals/MagnetAlignmentModal";
import { toast } from 'sonner';
import { getLocalTorrentSessionHistory, getLocalTorrentSessionHistoryEnabled } from '@/lib/localStorage';

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
  const [deferredStartupReady, setDeferredStartupReady] = useState(false);
  usePageTracking(deferredStartupReady);
  useActiveSession(deferredStartupReady);
  const restoredTorrentSessionsRef = useRef(false);
  const navigate = useNavigate();
  
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
  const isDevtoolsBlockedPage = location.pathname.startsWith('/devtools-blocked');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: number | null = null;
    let idleId: number | null = null;
    let settled = false;

    const markReady = () => {
      if (settled) return;
      settled = true;
      setDeferredStartupReady(true);
    };

    if ('requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(markReady, { timeout: 1800 });
    }

    timeoutId = window.setTimeout(markReady, 1500);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, []);

  useEffect(() => {
    if (!deferredStartupReady || !isDesktopApp || restoredTorrentSessionsRef.current) return;

    const runtime = (window as any).tatakaiRuntime;
    if (!runtime?.restoreTorrentSession) {
      restoredTorrentSessionsRef.current = true;
      return;
    }

    let cancelled = false;
    restoredTorrentSessionsRef.current = true;

    const runRestore = async () => {
      try {
        if (!getLocalTorrentSessionHistoryEnabled()) return;

        const activeSessions = getLocalTorrentSessionHistory().filter(
          (session) => session.status === 'active' && Boolean(session.infoHash),
        );

        for (const session of activeSessions) {
          if (cancelled) return;
          await runtime.restoreTorrentSession({ current: session });
        }
      } catch (error) {
        console.error('Failed to restore saved torrent sessions:', error);
      }
    };

    void runRestore();

    return () => {
      cancelled = true;
    };
  }, [deferredStartupReady, isDesktopApp]);

  const online = useOnline();
  const hideSidebarPages = ['/', '/welcome', '/download', '/downloads', '/auth', '/onboarding', '/setup', '/maintenance', '/banned', '/error', '/devtools-blocked', '/smarttv', '/manga/read'];
  const isHiddenPage = hideSidebarPages.some(page => page === '/' ? location.pathname === '/' : location.pathname.startsWith(page));
  // Also hide sidebar when offline (OfflineGate shows full-screen offline page)
  const showSidebar = !isMobile && !isMobileApp && !isHiddenPage && online;

  useEffect(() => {
    if (isNative) document.body.classList.add('native-app');
    else document.body.classList.remove('native-app');
    if (isMobileApp) document.documentElement.classList.add('capacitor-native');
    return () => {
      document.body.classList.remove('native-app');
      document.documentElement.classList.remove('capacitor-native');
    };
  }, [isNative, isMobileApp]);

  const [magnetModalOpen, setMagnetModalOpen] = useState(false);
  const [initialMagnet, setInitialMagnet] = useState<string | undefined>();
  const [initialTorrentBuffer, setInitialTorrentBuffer] = useState<any | undefined>();

  useEffect(() => {
    if (isDesktopApp && (window as any).electron) {
      const unsubMagnet = (window as any).electron.onMagnetOpen((magnet: string) => {
        setInitialMagnet(magnet);
        setMagnetModalOpen(true);
      });
      const unsubFile = (window as any).electron.onFileOpen(async (path: string) => {
        if (path.endsWith('.magnet')) {
          const res = await (window as any).tatakaiRuntime.importMagnetFile(path);
          if (res.success) {
            setInitialTorrentBuffer(undefined);
            setInitialMagnet(res.magnetLink);
            setMagnetModalOpen(true);
          }
        } else if (path.endsWith('.torrent')) {
          const imported = await (window as any).tatakaiRuntime.importTorrentFile(path);
          if (!imported?.success || !imported.torrentBuffer) {
            toast.error(imported?.error || 'Failed to open torrent file');
            return;
          }

          setInitialMagnet(undefined);
          setInitialTorrentBuffer(imported.torrentBuffer);
          setMagnetModalOpen(true);
        }
      });
      return () => {
        unsubMagnet();
        unsubFile();
      };
    }
  }, [isDesktopApp]);

  return (
    <div
      className={cn(
        "min-h-screen relative flex flex-col transition-all duration-300",
        isDesktopApp && showSidebar && online && "lg:pl-[var(--sidebar-width)]",
        isDesktopApp && "pt-8"
      )}
    >
      <Toaster />
      <Sonner />
      <OfflineBanner />
      <OfflineGate>
        {isDevtoolsBlockedPage ? (
          <main className="flex-1 w-full relative z-[1000]">
            {children}
          </main>
        ) : (
          <>
            {getDevModeEnabled() && <DevConsole />}
            {showSidebar && <Background />}
            {isDesktopApp && <TitleBar />}
            {showSidebar && <Sidebar />}
            <V5AnnouncementPopup />
            <GlobalListeners />
            {deferredStartupReady && <PopupDisplay />}
            <ReduceMotionPrompt />
            <LogViewer />
            <DeepLinkHandler />
            <AntiDevToolsGuard />
            
            <MagnetAlignmentModal 
              isOpen={magnetModalOpen} 
              onClose={() => {
                setMagnetModalOpen(false);
                setInitialMagnet(undefined);
                setInitialTorrentBuffer(undefined);
              }}
              initialMagnet={initialMagnet}
              initialTorrentBuffer={initialTorrentBuffer}
            />

            <main className="flex-1 w-full relative z-10">
              {children}
            </main>

            <ConditionalFooter />
          </>
        )}
      </OfflineGate>
    </div>
  );
};

function ConditionalFooter() {
  const location = useLocation();
  const isNative = useIsNativeApp();
  if (isNative) return null;
  const hideFooter = ['/welcome', '/download', '/watch/', '/novel/comingsoon', '/dmca', '/suggestions','/privacy', '/terms', '/char/', '/genre/', '/manga/', '/manga', '/isshoni/', '/search', '/image-search', '/status', '/banned', '/maintenance', '/service-unavailable', '/503', '/error', '/devtools-blocked', '/auth', '/reset-password', '/update-password', '/onboarding', '/setup', '/mal-redirect', '/anilist-redirect', '/favorites', '/', '/trending', '/settings' , '/recommendations' , '/admin', '/mobile-app'].some(path => location.pathname === '/' ? path === '/' : location.pathname.startsWith(path));
  if (hideFooter) return null;
  return <Footer />;
}

export default MainLayout;

