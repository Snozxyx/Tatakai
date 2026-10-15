import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorId, getVisitSessionId } from '@/lib/analyticsIdentity';

/** Sample foreground time with recent interaction; hidden/idle time is never inferred. */
export function useEngagementTracking(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let lastInput = Date.now();
    let lastSample = Date.now();
    const interact = () => {
      lastInput = Date.now();
    };
    const visibility = () => {
      lastSample = Date.now();
      if (!document.hidden) interact();
    };
    const sample = () => {
      const now = Date.now();
      const elapsed = Math.min(
        30,
        Math.max(0, Math.floor((now - lastSample) / 1000))
      );
      lastSample = now;
      if (
        document.hidden ||
        !navigator.onLine ||
        now - lastInput > 5 * 60_000 ||
        elapsed < 1
      )
        return;
      getVisitSessionId(now);
      void supabase.rpc('record_engagement' as any, {
        p_visitor_id: getVisitorId(),
        p_active_seconds: elapsed,
      });
    };
    for (const event of ['pointerdown', 'keydown', 'scroll', 'touchstart'])
      window.addEventListener(event, interact, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(sample, 30_000);
    return () => {
      clearInterval(timer);
      for (const event of ['pointerdown', 'keydown', 'scroll', 'touchstart'])
        window.removeEventListener(event, interact);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled]);
}
