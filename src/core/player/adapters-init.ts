import { sourceAdapterRegistry } from './SourceAdapterRegistry';
import { HlsAdapter } from './HlsAdapter';
import { DirectAdapter } from './DirectAdapter';
import { TorrentAdapter } from './TorrentAdapter';
import { OfflineAdapter } from './OfflineAdapter';
import { DebridAdapter } from './DebridAdapter';

let initialized = false;
export function initializePlayerAdapters() {
  if (initialized) return;
  initialized = true;
  sourceAdapterRegistry.register('hls', new HlsAdapter());
  sourceAdapterRegistry.register('direct', new DirectAdapter());
  sourceAdapterRegistry.register('torrent', new TorrentAdapter());
  sourceAdapterRegistry.register('offline', new OfflineAdapter());
  sourceAdapterRegistry.register('debrid', new DebridAdapter());
}
