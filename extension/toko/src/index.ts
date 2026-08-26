/**
 * Toko Extension Entry Point
 * Clean re-exports of the main bundle and provider registries
 */

export { TokoBundleClass as default } from './core/bundle.js';

// Re-export provider lists for tests and external usage
export {
  STREAM_PROVIDERS,
  TORRENT_PROVIDERS,
  MANGA_PROVIDERS,
} from './providers/registry.js';

// Re-export types for external consumers
export type {
  ProviderDiagnostic,
  ProviderChunk,
  DebugProviderResult,
} from './types/index.js';
