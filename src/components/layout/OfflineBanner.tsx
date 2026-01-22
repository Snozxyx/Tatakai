import { useEffect } from 'react';
import { useOnline } from '@/hooks/useOnline';
import { useToast } from '@/hooks/use-toast';
import { X, WifiOff, Wifi, Download } from 'lucide-react';

export function OfflineBanner() {
  const online = useOnline();
  const { toast } = useToast();

  useEffect(() => {
    if (!online) {
      toast({ title: 'You are offline', description: 'Some features may be limited while offline.' });
    }
  }, [online]);

  if (online) return null;

  const handleDownloads = () => {
    window.location.href = '/downloads';
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center">
      <div className="max-w-3xl w-full mx-4 bg-amber/95 border border-amber/70 text-amber-900 px-4 py-2 rounded-b shadow-md flex items-center gap-2 sm:gap-4 flex-wrap">
        <WifiOff className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1 text-sm min-w-[200px]">
          <div className="font-semibold">You are currently offline</div>
          <div className="text-xs opacity-90 hidden sm:block">Some features (network calls, adding to playlists, streaming) may not work until you reconnect.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloads}
            className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Go to Downloads
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs whitespace-nowrap"
          >
            <Wifi className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
