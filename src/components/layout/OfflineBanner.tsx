import { useEffect } from 'react';
import { useOnline } from '@/hooks/useOnline';
import { useToast } from '@/hooks/use-toast';

export function OfflineBanner() {
  const online = useOnline();
  const { toast } = useToast();

  useEffect(() => {
    if (!online) {
      toast({ title: 'You are offline', description: 'Some features may be limited. Use Retry or Open Downloads when back online.' });
    }
  }, [online, toast]);

  if (online) return null;
  // Full-page NoInternetPage (OfflineGate) handles offline UI; we only toast.
  return null;
}
