import { useOnline } from '@/hooks/useOnline';
import { NoInternetPage } from '@/pages/NoInternetPage';

export function OfflineGate({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  if (!online) return <NoInternetPage />;
  return <>{children}</>;
}
