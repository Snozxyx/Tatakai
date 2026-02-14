import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useActiveSession() {
    const { user } = useAuth();
    const heartbeatInterval = useRef<any>(null);

    useEffect(() => {
        const sendHeartbeat = async () => {
            try {
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

        // Initial heartbeat
        sendHeartbeat();

        // Start interval (every 90 seconds to stay under rate limits)
        heartbeatInterval.current = setInterval(sendHeartbeat, 90000);

        return () => {
            if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
        };
    }, [user]);
}
