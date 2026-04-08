import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { Capacitor } from '@capacitor/core';
import { mobileCache } from '@/services/mobileCacheService';
import { AuthProvider } from "@/contexts/AuthContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopDownloadProvider } from "@/contexts/DesktopDownloadContext";
import { queryClient } from "@/lib/queryClient";
import MainLayout from "@/layouts/MainLayout";
import AppRoutes from "@/routes/AppRoutes";

const App = () => {
  // Detect if running in Electron/file:// protocol
  const isElectron = window.location.protocol === 'file:';

  const routerFutureFlags = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  };

  const Router = isElectron ? HashRouter : BrowserRouter;
  
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DesktopDownloadProvider>
          <TooltipProvider>
            <Router future={routerFutureFlags}>
              <MainLayout>
                <AppRoutes />
              </MainLayout>
            </Router>
          </TooltipProvider>
        </DesktopDownloadProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
