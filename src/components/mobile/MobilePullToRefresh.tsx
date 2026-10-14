import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { useIsPhone } from '@/hooks/ui/use-mobile';
import { PullRefreshGesture, REFRESH_PULL_THRESHOLD } from './pull-refresh-gesture';

function atScrollTop(target: Element): boolean {
  if ((document.scrollingElement?.scrollTop ?? 0) > 1) return false;
  for (let element: Element | null = target; element; element = element.parentElement) {
    if (element.scrollTop > 1) return false;
  }
  return true;
}

/** Refresh data in place, preserving navigation and local state. */
export function MobilePullToRefresh() {
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
      if (!navigator.onLine) throw new Error('Offline');
      await client.invalidateQueries({ refetchType: 'active' }, { throwOnError: true });
      toast.success('Page refreshed');
    } catch { toast.error('Could not refresh. Check your connection and try again.'); }
    finally { busy.current = false; setRefreshing(false); }
  }

  useEffect(() => {
    setPull(0);
    if (!enabled) return;
    const gesture = new PullRefreshGesture();
    let frame = 0, latest = 0;
    function display(amount: number) {
      latest = amount;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; setPull(latest); });
    }
    function start(event: TouchEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || busy.current || event.touches.length !== 1) { gesture.cancel(); return; }
      const blocked = !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="slider"],video,iframe,canvas,[data-no-pull-refresh]') ||
        !!document.querySelector('[role="dialog"],[data-state="open"][role="menu"],[data-state="open"][role="listbox"]');
      gesture.begin(event.touches[0].clientX, event.touches[0].clientY, atScrollTop(target), blocked);
    }
    function move(event: TouchEvent) {
      if (!event.touches[0]) return;
      const amount = gesture.move(event.touches[0].clientX, event.touches[0].clientY, event.touches.length);
      if (amount > 6 && event.cancelable) event.preventDefault();
      display(amount);
    }
    function end() { const ready = gesture.finish(); display(0); if (ready) void refresh(); }
    function cancel() { gesture.cancel(); display(0); }
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', cancel);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', cancel);
    };
  }, [enabled, location.pathname, location.search, client]);

  if (!enabled) return null;
  return <>
    <Button variant="outline" disabled={refreshing} onClick={() => void refresh()} className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-16 focus:z-50">Refresh page</Button>
    {(pull > 6 || refreshing) && <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex justify-center" style={{ transform: `translateY(${refreshing ? 32 : pull / 2}px)` }}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground shadow-md">
        {refreshing ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none"/> : <RefreshCw aria-hidden="true" className="size-4"/>}
        <span>{refreshing ? 'Refreshing…' : pull >= REFRESH_PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
      </div>
    </div>}
  </>;
}
