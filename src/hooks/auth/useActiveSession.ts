import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getOrCreateDeviceId, getDeviceName } from '@/lib/deviceInfo';

export function useActiveSession(enabled: boolean = true) {
    const { user } = useAuth();
    const heartbeatInterval = useRef<any>(null);
    /** user.id we've already recorded a session for this app run (fires once/login). */
    const recordedForUser = useRef<string | null>(null);

    // Device-ban enforcement on boot: if this device id is banned, sign out.
    // Fail-soft — the RPC/table come from the unapplied ban-device migration.
    useEffect(() => {
        if (!enabled) return;
        const deviceId = getOrCreateDeviceId();
        if (!deviceId) return;
        let cancelled = false;
        (async () => {
            try {
                const { data, error } = await supabase.rpc('is_device_banned', { p_device_id: deviceId });
                if (cancelled || error) return;
                if (data === true) {
                    await supabase.auth.signOut();
                }
            } catch {
                // RPC absent until migration applied — ignore.
            }
        })();
        return () => { cancelled = true; };
    }, [enabled, user?.id]);

    // Record a session row once per login (stamps profiles.last_login_at + device_name).
    // Fail-soft — RPC comes from the unapplied user_sessions migration.
    useEffect(() => {
        if (!enabled || !user) return;
        if (recordedForUser.current === user.id) return;
        recordedForUser.current = user.id;
        (async () => {
            try {
                await supabase.rpc('record_user_session', {
                    p_device_id: getOrCreateDeviceId() || null,
                    p_device_name: getDeviceName(),
                    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                });
            } catch {
                // RPC absent until migration applied — ignore.
            }
        })();
    }, [enabled, user]);

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
