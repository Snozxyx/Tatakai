// LocalStorage keys and utilities for watchlist and continue watching

const WATCHLIST_KEY = 'anime-watchlist';
const CONTINUE_WATCHING_KEY = 'anime-continue-watching';

export interface LocalWatchlistItem {
  animeId: string;
  animeName: string;
  animePoster: string;
  status: string;
  addedAt: string;
}

export interface LocalContinueWatchingItem {
  animeId: string;
  animeName: string;
  animePoster: string;
  episodeId: string;
  episodeNumber: number;
  progressSeconds: number;
  durationSeconds: number;
  watchedAt: string;
  serverName?: string; // Save the server preference
  category?: 'sub' | 'dub'; // Save sub/dub preference
  languageCode?: string; // Save WatchAnimeWorld language preference (e.g., 'hi', 'ta')
}

// Watchlist functions
export function getLocalWatchlist(): LocalWatchlistItem[] {
  try {
    const data = localStorage.getItem(WATCHLIST_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToLocalWatchlist(item: Omit<LocalWatchlistItem, 'addedAt'>): void {
  const list = getLocalWatchlist();
  const existing = list.findIndex(i => i.animeId === item.animeId);
  
  if (existing !== -1) {
    list[existing] = { ...item, addedAt: list[existing].addedAt };
  } else {
    list.unshift({ ...item, addedAt: new Date().toISOString() });
  }
  
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

export function removeFromLocalWatchlist(animeId: string): void {
  const list = getLocalWatchlist().filter(i => i.animeId !== animeId);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

export function isInLocalWatchlist(animeId: string): boolean {
  return getLocalWatchlist().some(i => i.animeId === animeId);
}

export function getLocalWatchlistItem(animeId: string): LocalWatchlistItem | null {
  return getLocalWatchlist().find(i => i.animeId === animeId) || null;
}

export function updateLocalWatchlistStatus(animeId: string, status: string): void {
  const list = getLocalWatchlist();
  const item = list.find(i => i.animeId === animeId);
  if (item) {
    item.status = status;
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  }
}

// Continue watching functions
export function getLocalContinueWatching(): LocalContinueWatchingItem[] {
  try {
    const data = localStorage.getItem(CONTINUE_WATCHING_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function updateLocalContinueWatching(item: Omit<LocalContinueWatchingItem, 'watchedAt'>): void {
  const list = getLocalContinueWatching();
  const existing = list.findIndex(i => i.episodeId === item.episodeId);
  
  const newItem = { ...item, watchedAt: new Date().toISOString() };
  
  if (existing !== -1) {
    list.splice(existing, 1);
  }
  
  // Add to beginning (most recent first)
  list.unshift(newItem);
  
  // Keep only last 20 items
  const trimmed = list.slice(0, 20);
  localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(trimmed));
}

export function getLocalContinueWatchingForAnime(animeId: string): LocalContinueWatchingItem | null {
  const list = getLocalContinueWatching();
  return list.find(i => i.animeId === animeId) || null;
}

export function removeFromLocalContinueWatching(episodeId: string): void {
  const list = getLocalContinueWatching().filter(i => i.episodeId !== episodeId);
  localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(list));
}

export function clearLocalContinueWatching(): void {
  localStorage.removeItem(CONTINUE_WATCHING_KEY);
}
