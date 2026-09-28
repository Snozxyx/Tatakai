import { useOnline } from '@/hooks/ui/useOnline';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import NoInternetPage from '@/pages/error/NoInternetPage';
import { useLocation } from 'react-router-dom';

export function OfflineGate({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const isNative = useIsNativeApp();
  const location = useLocation();
  
  // In native app, allow offline library access and offline watch even when offline
  const offlinePaths = ['/offline-library', '/offline', '/downloads', '/watch'];
  const isOfflineWatch = location.pathname.startsWith('/watch') && location.search.includes('offline=true');
  // Reading a downloaded chapter serves its pages from the local device
  // (getMangaReadByKey's offline-first branch). Mirror ProtectedRoute's
  // `isOfflineMangaRead` gate so the reader survives a full offline session
  // instead of being covered by NoInternetPage. Gated to `offline=true` so a
  // web/online visitor can't use it to skip the connectivity check.
  const isOfflineMangaRead =
    location.pathname.startsWith('/manga/read') && location.search.includes('offline=true');
  const isOfflinePath =
    offlinePaths.some(p => location.pathname.startsWith(p)) || isOfflineWatch || isOfflineMangaRead;
  
  // If native app and on offline-allowed path, let through
  if (isNative && isOfflinePath) {
    return <>{children}</>;
  }
  
  // Otherwise show offline page when not online
  if (!online) return <NoInternetPage isNative={isNative} />;
  return <>{children}</>;
}

