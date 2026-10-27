import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { useIsPhone } from '@/hooks/ui/use-mobile';
import { REFRESH_PULL_THRESHOLD } from './pull-refresh-gesture';
import { installPullRefreshListeners } from './pull-refresh-listeners';

/** Refresh data in place, preserving navigation and local state. */
export function MobilePullToRefresh() {
  useUiTranslation();
  const nativeMobile = useIsMobileApp(), phone = useIsPhone(), desktop = useIsDesktopApp();
  const location = useLocation(), client = useQueryClient();
  const [pull, setPull] = useState(0), [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const enabled = !desktop && (nativeMobile || phone) &&
    !/^\/(watch|manga\/read|novel\/read|integration|api\/mal\/redirect|auth|setup|onboarding)(\/|$)/.test(location.pathname);

  async function refresh() {
    if (busy.current) return;
    busy.current = true; setRefreshing(true); setPull(0);
    try {
      if (!navigator.onLine) throw new Error(uiI18n.t('app.offline_e01fa717'));
      await client.invalidateQueries({ refetchType: 'active' }, { throwOnError: true });
      toast.success(uiI18n.t('app.page_refreshed_fcc72580'));
    } catch { toast.error(uiI18n.t('app.could_not_refresh_check_your_connection_and_try__f3b031db')); }
    finally { busy.current = false; setRefreshing(false); }
  }

  useEffect(() => {
    setPull(0);
    if (!enabled) return;
    document.documentElement.classList.add('mobile-pull-refresh-enabled');
    let frame = 0, latest = 0;
    function display(amount: number) {
      if (latest === amount) return;
      latest = amount;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; setPull(latest); });
    }
    const removeListeners = installPullRefreshListeners(window, () => busy.current, display, () => void refresh());
    return () => {
      if (frame) cancelAnimationFrame(frame);
      removeListeners();
      document.documentElement.classList.remove('mobile-pull-refresh-enabled');
    };
  }, [enabled, location.pathname, location.search, client]);

  if (!enabled) return null;
  return <>
    <Button variant="outline" disabled={refreshing} onClick={() => void refresh()} className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-16 focus:z-50">{uiI18n.t('app.refresh_page_4651e844')}</Button>
    {(pull > 6 || refreshing) && <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex justify-center" style={{ transform: `translateY(${refreshing ? 32 : pull / 2}px)` }}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground shadow-md">
        {refreshing ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none"/> : <RefreshCw aria-hidden="true" className="size-4"/>}
        <span>{refreshing ? uiI18n.t('app.refreshing_96141178') : pull >= REFRESH_PULL_THRESHOLD ? uiI18n.t('app.release_to_refresh_086a304e') : uiI18n.t('app.pull_to_refresh_62182173')}</span>
      </div>
    </div>}
  </>;
}
