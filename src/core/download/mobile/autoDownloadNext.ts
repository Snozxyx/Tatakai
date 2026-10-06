/**
 * autoDownloadNext.ts — "download the next one" for Continue Watching.
 *
 * When `mobile_config.autoDownloadNext` is on and the link allows it
 * (wifiOnly guard), completing/downloading episode N arms a one-shot intent
 * for episode N+1. The intent is consumed by AnimePage/WatchPage download
 * buttons ("Next is ready — tap to fetch") so we never need the full source
 * resolver here; the series page already knows how to fetch each episode.
 *
 * Torrent/Debrid sources flow through the same intent: the series page picks
 * the active source type (HLS vs torrent vs debrid) when the user taps.
 */
import { isWifiOnlyBlocked } from './storageManager';
import { loadMobileConfig } from '@/hooks/ui/useMobileConfig';

const INTENT_KEY = 'tatakai_auto_next_intent';

export interface AutoNextIntent {
  animeId: number;
  animeTitle: string;
  nextEpisode: number;
  posterUrl?: string;
  createdAt: number;
}

export function armAutoDownloadNext(intent: Omit<AutoNextIntent, 'createdAt'>): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    if (!loadMobileConfig().autoDownloadNext) return false;
    if (isWifiOnlyBlocked()) return false;
    const full: AutoNextIntent = { ...intent, createdAt: Date.now() };
    localStorage.setItem(INTENT_KEY, JSON.stringify(full));
    return true;
  } catch {
    return false;
  }
}

export function consumeAutoDownloadNext(animeId: number): AutoNextIntent | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoNextIntent;
    if (Number(parsed.animeId) !== Number(animeId)) return parsed;
    localStorage.removeItem(INTENT_KEY);
    // 7-day expiry on intents.
    if (Date.now() - Number(parsed.createdAt || 0) > 7 * 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function peekAutoDownloadNext(): AutoNextIntent | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoNextIntent;
  } catch {
    return null;
  }
}
