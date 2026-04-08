import { QueryClient } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';

const isMobileApp = Capacitor.isNativePlatform();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: isMobileApp ? 1 : 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: isMobileApp ? 10 * 60 * 1000 : 5 * 60 * 1000,
      gcTime: isMobileApp ? 30 * 60 * 1000 : 15 * 60 * 1000,
      networkMode: isMobileApp ? 'offlineFirst' : 'online',
    },
  },
});
