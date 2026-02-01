import { useOnline } from '@/hooks/useOnline';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { NoInternetPage } from '@/pages/NoInternetPage';
import { useLocation } from 'react-router-dom';

export function OfflineGate({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const isNative = useIsNativeApp();
  const location = useLocation();
  
  // In native app, allow offline library access and offline watch even when offline
  const offlinePaths = ['/offline-library'];
  const isOfflineWatch = location.pathname.startsWith('/watch') && location.search.includes('offline=true');
  const isOfflinePath = offlinePaths.some(p => location.pathname.startsWith(p)) || isOfflineWatch;
  
  // If native app and on offline-allowed path, let through
  if (isNative && isOfflinePath) {
    return <>{children}</>;
  }
  
  // Otherwise show offline page when not online
  if (!online) return <NoInternetPage isNative={isNative} />;
  return <>{children}</>;
}
