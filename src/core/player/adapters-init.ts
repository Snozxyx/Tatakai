import { sourceAdapterRegistry } from './SourceAdapterRegistry';

let initialized = false;
export function initializePlayerAdapters() {
  if (initialized) return;
  initialized = true;
  // Registration stays synchronous; the selected engine loads inside switchTo.
  sourceAdapterRegistry.registerLazy('hls', async () => new (await import('./HlsAdapter')).HlsAdapter());
  sourceAdapterRegistry.registerLazy('dash', async () => new (await import('./DashAdapter')).DashAdapter());
  sourceAdapterRegistry.registerLazy('direct', async () => new (await import('./DirectAdapter')).DirectAdapter());
  sourceAdapterRegistry.registerLazy('torrent', async () => new (await import('./TorrentAdapter')).TorrentAdapter());
  sourceAdapterRegistry.registerLazy('offline', async () => new (await import('./OfflineAdapter')).OfflineAdapter());
  sourceAdapterRegistry.registerLazy('debrid', async () => new (await import('./DebridAdapter')).DebridAdapter());
}
