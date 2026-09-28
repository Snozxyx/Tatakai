import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CloudOff, HardDrive, RefreshCw, X } from 'lucide-react';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';

/**
 * OfflineBanner — a slim, non-blocking notice for the "server-down" state:
 * the device HAS internet but no Tatakai origin (API + Supabase) answers
 * (maintenance, API outage, or the whole backend unreachable).
 *
 * Why non-blocking (and not a full-screen takeover like NoInternetPage):
 *   - Pure no-internet is handled by OfflineGate → NoInternetPage.
 *   - server-down is inferred from network probes, which can false-positive
 *     (an ad-blocker or a transient blip). Replacing the whole app on that
 *     signal would REDUCE capacity — the opposite of the goal. A dismissible
 *     banner keeps every working feature reachable while making the outage
 *     visible and pointing native users at their fully-local downloads.
 *
 * Only shown in the native/desktop app, where a local downloaded library
 * exists to fall back to. On web it renders nothing.
 */
export function OfflineBanner() {
  const { status, recheck } = useBackendStatus();
  const isNative = useIsNativeApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  // Already on a local/offline page, or nothing to fall back to on web.
  const onOfflinePage =
    location.pathname.startsWith('/downloads') ||
    location.pathname.startsWith('/offline');

  if (!isNative || status !== 'server-down' || dismissed || onOfflinePage) {
    return null;
  }

  return (
    <div className="fixed top-8 inset-x-0 z-[90] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto mt-2 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 backdrop-blur-md shadow-lg">
        <CloudOff className="h-4 w-4 shrink-0 text-amber-500" />
        <p className="flex-1 text-sm text-foreground/90">
          Our servers are unreachable right now. Your downloads are still available offline.
        </p>
        <button
          onClick={() => navigate('/downloads')}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-foreground/20"
        >
          <HardDrive className="h-3.5 w-3.5" />
          Downloads
        </button>
        <button
          onClick={() => recheck()}
          title="Retry connection"
          className="flex shrink-0 items-center rounded-lg p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setDismissed(true)}
          title="Dismiss"
          className="flex shrink-0 items-center rounded-lg p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
