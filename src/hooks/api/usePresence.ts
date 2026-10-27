import { randomUUID } from '../../lib/uuid';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getVisitorId } from '@/lib/analyticsIdentity';

/**
 * Live presence over Supabase Realtime.
 *
 * Clients (every visitor, via MainLayout) track `{ session_id, user_id,
 * page_path }` on `tky-online` and re-track on navigation + every 30s while
 * visible. Admins subscribe read-only via `useOnlinePresence()` and get
 * join/leave/sync updates instantly — no 30s polling, no 5-minute staleness.
 */

export interface PresenceEntry {
  session_id: string;
  user_id: string | null;
  page_path: string;
  online_at: string;
}

const CHANNEL = 'tky-online';
const HEARTBEAT_MS = 30000;

function getSessionId(): string {
  try {
    let id = localStorage.getItem('tatakai_session_id');
    if (!id) {
      id = randomUUID();
      localStorage.setItem('tatakai_session_id', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

/** Track this browser tab as online (mount once per app, e.g. MainLayout). */
export function useClientPresence(enabled: boolean = true) {
  const { user } = useAuth();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    const sessionId = getVisitorId();

    const payload = (): PresenceEntry => ({
      session_id: sessionId,
      user_id: user?.id ?? null,
      page_path: window.location.pathname,
      online_at: new Date().toISOString(),
    });

    const track = async () => {
      if (disposed || !channel) return;
      try {
        if (document.visibilityState === 'hidden') {
          await channel.untrack();
          return;
        }
        await channel.track(payload());
      } catch {
        // Presence is best-effort; page-visit rows remain the durable record.
      }
    };

    const onNav = () => void track();

    try {
      channel = supabase.channel(CHANNEL, {
        config: { presence: { key: `web:${sessionId}` } },
      });
      void channel.subscribe(async (status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') await track();
      });
    } catch {
      channel = null;
    }

    window.addEventListener('tatakai:location-change', onNav);
    window.addEventListener('popstate', onNav);
    document.addEventListener('visibilitychange', onNav);
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') void track();
    }, HEARTBEAT_MS);

    return () => {
      disposed = true;
      window.removeEventListener('tatakai:location-change', onNav);
      window.removeEventListener('popstate', onNav);
      document.removeEventListener('visibilitychange', onNav);
      if (timer) clearInterval(timer);
      try {
        void channel?.untrack();
        if (channel) void supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [enabled, user?.id]);
}

/** Subscribe to live online users (admin dashboards). Instant, no polling. */
export function useOnlinePresence(enabled: boolean = true): PresenceEntry[] {
  const [entries, setEntries] = useState<PresenceEntry[]>([]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;

    const pull = () => {
      if (disposed || !channel) return;
      try {
        const state = channel.presenceState<PresenceEntry>();
        const bySession = new Map<string, PresenceEntry>();
        for (const arr of Object.values(state)) {
          for (const p of arr as PresenceEntry[]) {
            if (!p || typeof p.session_id !== 'string') continue;
            if (
              !Number.isFinite(Date.parse(p.online_at)) ||
              Date.now() - Date.parse(p.online_at) > 90_000
            )
              continue;
            if (p.session_id.startsWith('admin-')) continue;
            const prev = bySession.get(p.session_id);
            if (!prev || String(p.online_at) > String(prev.online_at)) {
              bySession.set(p.session_id, p);
            }
          }
        }
        setEntries(Array.from(bySession.values()));
      } catch {
        // keep last known list
      }
    };

    try {
      const adminKey = `admin-${Math.random().toString(36).slice(2)}`;
      channel = supabase.channel(CHANNEL, {
        config: { presence: { key: `admin-view:${adminKey}` } },
      });
      channel
        .on('presence', { event: 'sync' }, pull)
        .on('presence', { event: 'join' }, pull)
        .on('presence', { event: 'leave' }, pull);
      void channel.subscribe();
    } catch {
      channel = null;
    }

    const expiryTimer = setInterval(pull, HEARTBEAT_MS);
    return () => {
      disposed = true;
      clearInterval(expiryTimer);
      try {
        if (channel) void supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [enabled]);

  return entries;
}
