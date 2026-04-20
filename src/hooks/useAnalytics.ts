import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { analytics } from '@/services/AnalyticsService';

// Check if we're online
function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// Generate or get session ID from localStorage
function getSessionId(): string {
  let sessionId = localStorage.getItem('tatakai_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('tatakai_session_id', sessionId);
  }
  return sessionId;
}

const VISITOR_INFO_CACHE_KEY = 'tatakai_visitor_info_cache_v1';
const VISITOR_INFO_TTL_MS = 30 * 60 * 1000;

function getCachedVisitorInfo(): { ip?: string; country?: string; city?: string } | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(VISITOR_INFO_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      timestamp?: number;
      data?: { ip?: string; country?: string; city?: string };
    };

    if (!parsed?.timestamp || !parsed?.data) return null;
    if (Date.now() - parsed.timestamp > VISITOR_INFO_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedVisitorInfo(data: { ip?: string; country?: string; city?: string }) {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(
      VISITOR_INFO_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), data })
    );
  } catch {
    // Ignore storage failures.
  }
}

// Fetch visitor info (country, IP via external API)
async function fetchVisitorInfo(): Promise<{ ip?: string; country?: string; city?: string }> {
  // Skip if offline
  if (!isOnline()) return {};

  const cached = getCachedVisitorInfo();
  if (cached) return cached;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  try {
    const res = await fetch('https://ipapi.co/json/', {
      cache: 'force-cache',
      signal: controller.signal,
    });
    if (!res.ok) return {};

    const data = await res.json();
    const visitorInfo = {
      ip: data.ip,
      country: data.country_name,
      city: data.city,
    };

    setCachedVisitorInfo(visitorInfo);
    return visitorInfo;
  } catch {
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
}

// Track page visit
export async function trackPageVisit(pagePath: string, userId?: string): Promise<void> {
  // Skip tracking when offline
  if (!isOnline()) return;
  
  try {
    const sessionId = getSessionId();
    const visitorInfo = await fetchVisitorInfo();

    await supabase.from('page_visits').insert({
      user_id: userId || null,
      session_id: sessionId,
      ip_address: visitorInfo.ip,
      country: visitorInfo.country,
      city: visitorInfo.city,
      user_agent: navigator.userAgent,
      page_path: pagePath,
      referrer: document.referrer || null,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to track page visit:', error);
    }
  }
}

// Start watch session - returns session ID
export async function startWatchSession(
  animeId: string,
  episodeId: string,
  userId?: string,
  metadata?: { animeName?: string; animePoster?: string; genres?: string[] }
): Promise<string | null> {
  // Skip when offline
  if (!isOnline()) return null;
  
  try {
    const sessionId = getSessionId();

    const { data, error } = await supabase
      .from('watch_sessions')
      .insert({
        user_id: userId || null,
        session_id: sessionId,
        anime_id: animeId,
        episode_id: episodeId,
        anime_name: metadata?.animeName || 'Unknown',
        anime_poster: metadata?.animePoster,
        genres: metadata?.genres,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to start watch session:', error);
    }
    return null;
  }
}

// Update watch session duration
export async function updateWatchSession(
  watchSessionId: string,
  durationSeconds: number
): Promise<void> {
  // Skip when offline
  if (!isOnline()) return;
  
  try {
    await supabase
      .from('watch_sessions')
      .update({
        watch_duration_seconds: durationSeconds,
        end_time: new Date().toISOString(),
      })
      .eq('id', watchSessionId);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to update watch session:', error);
    }
  }
}

// Hook to track page visits on navigation
export function usePageTracking(enabled: boolean = true) {
  const { user } = useAuth();
  const lastPath = useRef<string>('');

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const trackCurrentPage = () => {
      const currentPath = window.location.pathname;

      // Only track if path changed
      if (currentPath !== lastPath.current) {
        lastPath.current = currentPath;
        trackPageVisit(currentPath, user?.id);

        // Comprehensive Analytics
        analytics.trackPageView(currentPath);
      }
    };

    const locationChangeEvent = 'tatakai:location-change';

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      const result = originalPushState.apply(this, args as [data: any, unused: string, url?: string | URL | null]);
      window.dispatchEvent(new Event(locationChangeEvent));
      return result;
    };

    window.history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args as [data: any, unused: string, url?: string | URL | null]);
      window.dispatchEvent(new Event(locationChangeEvent));
      return result;
    };

    let initialTrackTimeout: ReturnType<typeof setTimeout> | null = null;
    let initialIdleHandle: number | null = null;

    if ('requestIdleCallback' in window) {
      initialIdleHandle = (window as any).requestIdleCallback(trackCurrentPage, { timeout: 1200 });
    } else {
      initialTrackTimeout = setTimeout(trackCurrentPage, 450);
    }

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', trackCurrentPage);
    window.addEventListener(locationChangeEvent, trackCurrentPage);

    return () => {
      if (initialTrackTimeout !== null) clearTimeout(initialTrackTimeout);
      if (initialIdleHandle !== null && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(initialIdleHandle);
      }

      window.removeEventListener('popstate', trackCurrentPage);
      window.removeEventListener(locationChangeEvent, trackCurrentPage);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [user?.id, enabled]);
}

// Hook to track watch time
export function useWatchTracking(
  animeId: string,
  episodeId: string,
  metadata?: { animeName?: string; animePoster?: string; genres?: string[] }
) {
  const { user } = useAuth();
  const watchSessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start session
    const initSession = async () => {
      watchSessionIdRef.current = await startWatchSession(
        animeId,
        episodeId,
        user?.id,
        metadata
      );
      startTimeRef.current = Date.now();
    };

    initSession();

    // Update every 30 seconds
    updateIntervalRef.current = setInterval(() => {
      if (watchSessionIdRef.current) {
        const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        updateWatchSession(watchSessionIdRef.current, durationSeconds);
      }
    }, 30000);

    // Cleanup on unmount
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      if (watchSessionIdRef.current) {
        const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        updateWatchSession(watchSessionIdRef.current, durationSeconds);
      }
    };
  }, [animeId, episodeId, user?.id, metadata]);

  return watchSessionIdRef;
}
