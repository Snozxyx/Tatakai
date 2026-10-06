import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/ui/useTheme";
import { usePageTracking } from "@/hooks/api/useAnalytics";
import { useActiveSession } from "@/hooks/auth/useActiveSession";
import { useClientId, setCachedClientId } from "@/hooks/ui/useClientId";
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp, useIsMacOS } from "@/hooks/ui/useIsNativeApp";
import { useTitlebarHidden } from "@/hooks/ui/useTitlebarHidden";
import { useIsPhone } from "@/hooks/ui/use-mobile";
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
import { V6AnnouncementPopup } from '@/components/layout/V6AnnouncementPopup';
import { PopupDisplay } from "@/components/layout/PopupDisplay";
import { LogViewer } from "@/components/debug/LogViewer";
import { DevConsole } from "@/components/debug/DevConsole";
import { GlobalListeners, DeepLinkHandler } from "@/routes/AppRoutes";
import { MobileDeepLinkBridge } from "@/components/mobile/MobileDeepLinkBridge";
import { MobileBackHandler } from "@/components/mobile/MobileBackHandler";
import { MobileUpdateBanner } from "@/components/mobile/MobileUpdateBanner";
import { EasterEggs } from "@/components/layout/EasterEggs";
import { CelebrationHost } from "@/components/effects/Celebrate";
import { MagnetAlignmentModal } from "@/components/modals/MagnetAlignmentModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { MediaQuickPeekHost } from "@/components/media/MediaQuickPeek";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { CommunityRulesGateProvider } from "@/components/community/CommunityRulesGate";
import { IdleReclaimProvider } from "@/contexts/IdleReclaimProvider";
import { toast } from 'sonner';
import { getLocalTorrentSessionHistory, getLocalTorrentSessionHistoryEnabled } from '@/lib/localStorage';

import { useMobileUpdateOrchestrator } from '@/core/update/mobile-update';

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
  useMobileUpdateOrchestrator();
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
  const isMac = useIsMacOS();
  const [titlebarHidden] = useTitlebarHidden();
  const isMobile = useIsPhone();
  const isMobileApp = useIsMobileApp();

  // No route-change haptic here: tab presses already buzz via MobileNav's
  // explicit user-gesture tick, and buzzing on *every* programmatic
  // navigation (episode → episode, deep links, redirects) is buzz fatigue.
  // Haptics stay on explicit user actions (tab press, toggle, page turn,
  // success/error) through `triggerHaptic` at those call sites.

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
  const hideSidebarPages = ['/', '/welcome', '/download', '/downloads', '/auth', '/onboarding', '/setup', '/maintenance', '/banned', '/error', '/smarttv', '/manga/read'];
  const isHiddenPage = hideSidebarPages.some(page => page === '/' ? location.pathname === '/' : location.pathname.startsWith(page));
  // The community feed ships its own X-style CommunitySidebar, so suppress the
  // global Sidebar there. The single-post /community/forum/:id view and the
  // space page /community/c/:slug now share that layout too, so they render
  // their own CommunitySidebar and must not double up with the global nav.
  const isCommunityFeed = location.pathname === '/community'
    || location.pathname.startsWith('/community/forum/')
    || /^\/community\/c\/[^/]+/.test(location.pathname);
  // Phone widths get the bottom nav instead (Sidebar is `hidden md:flex`, MobileNav is `md:hidden`).
  // The native-shell check is intentionally absent: a Capacitor tablet should still get the
  // floating sidebar rather than a stretched bottom bar.
  const showSidebar = !isMobile && !isHiddenPage && !isCommunityFeed && online;

  useEffect(() => {
    if (isNative) document.body.classList.add('native-app');
    else document.body.classList.remove('native-app');
    // desktop-app is Electron/Tauri only (native-app also covers mobile). Sheet
    // and overlay offsets that must clear the 32px titlebar key off this class.
    if (isDesktopApp) document.body.classList.add('desktop-app');
    else document.body.classList.remove('desktop-app');
    if (isMobileApp) document.documentElement.classList.add('capacitor-native');
    return () => {
      document.body.classList.remove('native-app');
      document.body.classList.remove('desktop-app');
      document.documentElement.classList.remove('capacitor-native');
    };
  }, [isNative, isMobileApp, isDesktopApp]);

  // "Hide title bar" preference → toggle the class the CSS keys off. Desktop
  // only; the class removal on cleanup keeps web/mobile untouched.
  useEffect(() => {
    const root = document.documentElement;
    if (isDesktopApp && titlebarHidden) root.classList.add('titlebar-hidden');
    else root.classList.remove('titlebar-hidden');
    // macOS uses a transparent drag-only overlay (native traffic lights), so
    // sheet/banner offsets keyed off .desktop-app can opt out via .mac-app.
    if (isDesktopApp && isMac) root.classList.add('mac-app');
    else root.classList.remove('mac-app');
    return () => {
      root.classList.remove('titlebar-hidden');
      root.classList.remove('mac-app');
    };
  }, [isDesktopApp, titlebarHidden, isMac]);

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
    <ConfirmProvider>
    <CommunityRulesGateProvider>
    <IdleReclaimProvider />
    <div
      className={cn(
        "min-h-screen relative flex flex-col transition-[padding] duration-300",
        isDesktopApp && showSidebar && online && "lg:pl-[var(--sidebar-width)]",
        // macOS keeps only a transparent drag overlay (native traffic lights),
        // so it needs no 32px layout clearance — Windows/Linux keep the solid bar.
        isDesktopApp && !titlebarHidden && !isMac && "pt-8"
      )}
    >
      <Toaster />
      <Sonner />
      <MobileUpdateBanner />
      <OfflineBanner />
      <MobileBackHandler />
      {/* Rendered OUTSIDE OfflineGate: the titlebar (drag region + window
          controls) must stay visible even when NoInternetPage takes over the
          viewport, otherwise the desktop window can't be moved or closed. */}
      {isDesktopApp && <TitleBar />}
      <OfflineGate>
          <>
            {getDevModeEnabled() && <DevConsole />}
            {showSidebar && <Background />}
            {showSidebar && <Sidebar />}
            <V6AnnouncementPopup />
            <GlobalListeners />
            <EasterEggs />
            <CelebrationHost />
            {deferredStartupReady && <PopupDisplay />}
            <LogViewer />
            <DeepLinkHandler />
            <MobileDeepLinkBridge />

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

            <SettingsModal />

            {/* Long-press quick peek for anime/manga cards (global sheet). */}
            <MediaQuickPeekHost />

            <main className="flex-1 w-full relative z-10">
              {children}
            </main>

            <ConditionalFooter />
          </>
      </OfflineGate>
    </div>
    </CommunityRulesGateProvider>
    </ConfirmProvider>
  );
};

function ConditionalFooter() {
  const location = useLocation();
  const isNative = useIsNativeApp();
  if (isNative) return null;
  const hideFooter = ['/welcome', '/download', '/watch/', '/novel/comingsoon', '/dmca', '/suggestions','/privacy', '/terms', '/community-guidelines', '/community-rules', '/char/', '/genre/', '/manga/', '/manga', '/isshoni/', '/search', '/image-search', '/status', '/banned', '/maintenance', '/service-unavailable', '/503', '/error', '/auth', '/reset-password', '/update-password', '/onboarding', '/setup', '/mal-redirect', '/anilist-redirect', '/favorites', '/', '/trending', '/settings' , '/recommendations' , '/admin', '/mobile-app'].some(path => location.pathname === '/' ? path === '/' : location.pathname.startsWith(path));
  if (hideFooter) return null;
  return <Footer />;
}

export default MainLayout;

