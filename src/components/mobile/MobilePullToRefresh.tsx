import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { useIsPhone } from '@/hooks/ui/use-mobile';
import { REFRESH_PULL_THRESHOLD } from './pull-refresh-gesture';
import { installPullRefreshListeners } from './pull-refresh-listeners';
import './pull-refresh.css';

/** Refresh data in place, preserving navigation and local state. */
export function MobilePullToRefresh() {
  useUiTranslation();
  const nativeMobile = useIsMobileApp(), phone = useIsPhone(), desktop = useIsDesktopApp();
  const location = useLocation(), client = useQueryClient();
  const [pull, setPull] = useState(0), [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);
  const busy = useRef(false);
  const refreshEpoch = useRef(0);
  const enabled = !desktop && (nativeMobile || phone) &&
    !/^\/(watch|manga\/read|novel\/read|integration|api\/mal\/redirect|auth|setup|onboarding)(\/|$)/.test(location.pathname);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const epoch = refreshEpoch.current;
    busy.current = true; setRefreshing(true); setPull(0); setFeedback(null);
    try {
      if (!navigator.onLine) throw new Error(uiI18n.t('app.offline_e01fa717'));
      await client.invalidateQueries({ refetchType: 'active' }, { throwOnError: true });
      if (epoch === refreshEpoch.current) setFeedback('success');
    } catch {
      if (epoch === refreshEpoch.current) {
        setFeedback('error');
        toast.error(uiI18n.t('app.could_not_refresh_check_your_connection_and_try__f3b031db'));
      }
    } finally { if (epoch === refreshEpoch.current) { busy.current = false; setRefreshing(false); } }
  }, [client]);

  useEffect(() => {
    refreshEpoch.current += 1;
    setPull(0); setFeedback(null); setRefreshing(false); busy.current = false;
    if (!enabled) return;
    document.documentElement.classList.add('mobile-pull-refresh-enabled');
    let frame = 0, latest = 0;
    function display(amount: number) {
      if (latest === amount) return;
      latest = amount;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; setPull(latest); if (latest > 0 && !busy.current) setFeedback(null); });
    }
    const removeListeners = installPullRefreshListeners(window, () => busy.current, display, () => void refresh());
    return () => {
      if (frame) cancelAnimationFrame(frame);
      refreshEpoch.current += 1;
      removeListeners();
      document.documentElement.classList.remove('mobile-pull-refresh-enabled');
    };
  }, [enabled, location.pathname, location.search, refresh]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 900);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  if (!enabled) return null;
  const progress = Math.min(1, pull / REFRESH_PULL_THRESHOLD);
  const state = refreshing ? 'refreshing' : feedback ?? (pull >= REFRESH_PULL_THRESHOLD ? 'armed' : pull > 6 ? 'pulling' : 'idle');
  const active = state !== 'idle';
  const label = uiI18n.t(refreshing ? 'app.refreshing_96141178' : feedback === 'success' ? 'app.page_refreshed_fcc72580'
    : feedback === 'error' ? 'app.could_not_refresh_check_your_connection_and_try__f3b031db'
    : state === 'armed' ? 'app.release_to_refresh_086a304e' : 'app.pull_to_refresh_62182173');
  return <>
    <Button type="button" variant="outline" disabled={refreshing} onClick={() => void refresh()} className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-16 focus:z-50">{uiI18n.t('app.refresh_page_4651e844')}</Button>
    <div data-mobile-refresh data-state={state} data-active={active} data-dragging={pull > 0} role="status" aria-live="polite"
      className="mobile-refresh pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] flex justify-center"
      style={{ '--refresh-y': `${refreshing || feedback ? 28 : Math.min(44, pull * .55)}px`, '--refresh-turn': `${progress * 180}deg`, '--refresh-progress': progress } as CSSProperties}>
      <div className="mobile-refresh-surface flex min-h-12 w-[220px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground shadow-sm">
        <span aria-hidden className="mobile-refresh-ring relative flex size-8 shrink-0 items-center justify-center text-primary">
          <svg viewBox="0 0 32 32" className="absolute inset-0 size-8 -rotate-90"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-15" />
            <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mobile-refresh-progress" strokeDasharray={2 * Math.PI * 12} strokeDashoffset={(1 - progress) * 2 * Math.PI * 12} />
          </svg>
          {feedback === 'success' ? <Check className="mobile-refresh-result size-4" /> : feedback === 'error' ? <AlertCircle className="mobile-refresh-result size-4" /> : <RefreshCw className="mobile-refresh-icon size-4" />}
        </span>
        <span key={state} className="mobile-refresh-label text-xs font-medium leading-relaxed">{active ? label : ''}</span>
      </div>
    </div>
  </>;
}
