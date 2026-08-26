import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { Capacitor } from '@capacitor/core';
import { AuthProvider } from "@/contexts/AuthContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import MainLayout from "@/layouts/MainLayout";
import AppRoutes from "@/routes/AppRoutes";
import { toast } from "sonner";
import { useEffect } from "react";


const App = () => {
  // Detect if running in Electron/file:// protocol
  const isElectron = window.location.protocol === 'file:';

  const routerFutureFlags = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  };

  const Router = isElectron ? HashRouter : BrowserRouter;

  useEffect(() => {
    const runtime = (window as any).tatakaiRuntime;
    if (!runtime?.onTorrentRestartShortcut || !runtime?.restartTorrentService) return;

    return runtime.onTorrentRestartShortcut(async () => {
      const toastId = toast.loading('Restarting torrent service...');
      try {
        const result = await runtime.restartTorrentService();
        toast.dismiss(toastId);
        if (result?.success) {
          window.dispatchEvent(new CustomEvent('tatakai-torrent-service-restarted', { detail: result }));
          toast.success('Torrent service restarted');
        } else {
          toast.error(result?.error || 'Failed to restart torrent service');
        }
      } catch (error: any) {
        toast.dismiss(toastId);
        toast.error(error?.message || 'Failed to restart torrent service');
      }
    });
  }, []);

  // Global external link handler for Electron — opens http/https links in system browser
  useEffect(() => {
    const electronBridge = (window as any).electron;
    if (!electronBridge?.openExternal) return;

    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        electronBridge.openExternal(href);
      }
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  // App-level ad/popunder blocker notifications. The blocking itself happens in
  // the main process (network + popup layer, never injected into the embed);
  // this only surfaces it so a blocked click-hijack is visible to the user.
  useEffect(() => {
    const electronBridge = (window as any).electron;
    if (!electronBridge?.onSecurityBlocked) return;

    return electronBridge.onSecurityBlocked((data: any) => {
      if (data?.kind === 'popup') {
        toast.warning(
          data.reason === 'ad-network'
            ? 'Blocked an ad popup'
            : 'Blocked a popup from the embedded player',
          {
            description: data.host
              ? `${data.host} tried to open a new window.`
              : 'A new window was opened without your interaction.',
          },
        );
        return;
      }

      if (data?.kind === 'request' && data.count > 0) {
        toast.info(`Blocked ${data.count} ad request${data.count === 1 ? '' : 's'}`, {
          description:
            Array.isArray(data.hosts) && data.hosts.length ? data.hosts.join(', ') : undefined,
        });
      }
    });
  }, []);
  
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
          <TooltipProvider>
            <Router future={routerFutureFlags}>
              <MainLayout>
                <AppRoutes />
              </MainLayout>
            </Router>
          </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
