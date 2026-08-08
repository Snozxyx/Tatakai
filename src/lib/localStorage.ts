// LocalStorage keys and utilities for watchlist and continue watching

const WATCHLIST_KEY = 'anime-watchlist';
const CONTINUE_WATCHING_KEY = 'anime-continue-watching';
const TORRENT_SESSION_HISTORY_KEY = 'tatakai_torrent_session_history_v1';
const TORRENT_SESSION_HISTORY_ENABLED_KEY = 'tatakai_keep_torrent_session_history_v1';
const TORRENT_SESSION_HISTORY_EVENT = 'tatakai-torrent-history-changed';

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
  languageCode?: string; // Save language preference (e.g., 'hi', 'ta')
}

export interface LocalTorrentSessionItem {
  sessionId: string;
  infoHash?: string;
  torrentName?: string;
  animeId?: string;
  animeName?: string;
  animePoster?: string;
  episodeId?: string;
  episodeNumber?: number;
  fileName?: string;
  fileIndex?: number;
  status: 'active' | 'completed' | 'blocked' | 'error' | 'stopped';
  error?: string;
  seeders?: number | null;
  leechers?: number | null;
  progress?: number | null;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}

const readTorrentHistoryEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(TORRENT_SESSION_HISTORY_ENABLED_KEY);
    return raw == null ? true : raw === 'true';
  } catch {
    return true;
  }
};

const emitTorrentHistoryChanged = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(TORRENT_SESSION_HISTORY_EVENT));
  } catch {
    // ignore event failures
  }
};

export function getLocalTorrentSessionHistoryEnabled(): boolean {
  return readTorrentHistoryEnabled();
}

export function setLocalTorrentSessionHistoryEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TORRENT_SESSION_HISTORY_ENABLED_KEY, String(enabled));
    emitTorrentHistoryChanged();
  } catch {
    // ignore storage failures
  }
}

export function getLocalTorrentSessionHistory(): LocalTorrentSessionItem[] {
  try {
    const data = localStorage.getItem(TORRENT_SESSION_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function upsertLocalTorrentSessionHistory(
  item: Omit<LocalTorrentSessionItem, 'startedAt' | 'updatedAt'> & { startedAt?: string; updatedAt?: string },
): void {
  if (!readTorrentHistoryEnabled()) return;

  const list = getLocalTorrentSessionHistory();
  const existingIndex = list.findIndex((entry) => entry.sessionId === item.sessionId);
  const startedAt = item.startedAt || (existingIndex !== -1 ? list[existingIndex].startedAt : new Date().toISOString());
  const updatedAt = item.updatedAt || new Date().toISOString();

  const nextItem: LocalTorrentSessionItem = {
    sessionId: item.sessionId,
    infoHash: item.infoHash,
    torrentName: item.torrentName,
    animeId: item.animeId,
    animeName: item.animeName,
    animePoster: item.animePoster,
    episodeId: item.episodeId,
    episodeNumber: item.episodeNumber,
    fileName: item.fileName,
    fileIndex: item.fileIndex,
    status: item.status,
    error: item.error,
    seeders: item.seeders,
    leechers: item.leechers,
    progress: item.progress,
    startedAt,
    updatedAt,
    endedAt: item.endedAt,
  };

  if (existingIndex !== -1) {
    list.splice(existingIndex, 1);
  }

  list.unshift(nextItem);
  localStorage.setItem(TORRENT_SESSION_HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  emitTorrentHistoryChanged();
}

export function updateLocalTorrentSessionHistory(
  sessionId: string,
  patch: Partial<LocalTorrentSessionItem>,
): void {
  if (!readTorrentHistoryEnabled()) return;

  const list = getLocalTorrentSessionHistory();
  const existing = list.find((entry) => entry.sessionId === sessionId);
  if (!existing) return;

  const next = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  const nextList = [next, ...list.filter((entry) => entry.sessionId !== sessionId)];
  localStorage.setItem(TORRENT_SESSION_HISTORY_KEY, JSON.stringify(nextList.slice(0, 30)));
  emitTorrentHistoryChanged();
}

export function removeLocalTorrentSessionHistory(sessionId: string): void {
  const list = getLocalTorrentSessionHistory().filter((entry) => entry.sessionId !== sessionId);
  localStorage.setItem(TORRENT_SESSION_HISTORY_KEY, JSON.stringify(list));
  emitTorrentHistoryChanged();
}

export function clearLocalTorrentSessionHistory(): void {
  localStorage.removeItem(TORRENT_SESSION_HISTORY_KEY);
  emitTorrentHistoryChanged();
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
  
  // Never overwrite a valid poster with an empty string — preserve the existing
  // poster when the incoming entry has no poster value (Requirements 9.1, 9.2)
  const animePoster =
    item.animePoster ||
    (existing !== -1 ? list[existing].animePoster : '') ||
    '';

  const newItem = { ...item, animePoster, watchedAt: new Date().toISOString() };
  
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
