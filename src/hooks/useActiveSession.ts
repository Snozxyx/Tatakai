import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useActiveSession(enabled: boolean = true) {
    const { user } = useAuth();
    const heartbeatInterval = useRef<any>(null);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;

        const sendHeartbeat = async () => {
            try {
                if (cancelled) return;
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                if (typeof navigator !== 'undefined' && !navigator.onLine) return;

                if (user) {
                    // Update authenticated user last_seen
                    await supabase
                        .from('profiles')
                        .update({ last_seen: new Date().toISOString() })
                        .eq('user_id', user.id);
                } else {
                    // Track guest session via events
                    // Using a unique session ID from localStorage to deduplicate guests
                    let guestId = localStorage.getItem('tatakai_guest_id');
                    if (!guestId) {
                        guestId = 'guest_' + Math.random().toString(36).substring(2, 15);
                        localStorage.setItem('tatakai_guest_id', guestId);
                    }

                    await supabase.from('analytics_events').insert({
                        event_type: 'guest_heartbeat',
                        metadata: { guest_id: guestId },
                        page_path: window.location.pathname
                    });
                }
            } catch (e) {
                // Silently fail heartbeats
            }
        };

        const initialDelayMs = user ? 3000 : 10000;
        const initialTimer = setTimeout(() => {
            void sendHeartbeat();
            // Keep periodic updates, but avoid a startup network burst.
            heartbeatInterval.current = setInterval(() => {
                void sendHeartbeat();
            }, 120000);
        }, initialDelayMs);

        return () => {
            cancelled = true;
            clearTimeout(initialTimer);
            if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
        };
    }, [user, enabled]);
}
