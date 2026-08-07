/**
 * src/core/index.ts
 * Public API of the Tatakai core layer.
 *
 * Import from here — not from sub-modules directly.
 * This keeps the internal structure flexible to refactor without touching consumers.
 */

// ── Content graph (main browsing interface) ───────────────────────────────────
export { contentGraph, getCurrentSeason, apiGet } from './content/content-graph';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  TatakaiMedia,
  MediaFormat,
  MediaStatus,
  MediaSeason,
  MediaSource,
  FeedType,
  ContentFeed,
  SearchFilters,
  ContentSearchResult,
  HomePageBundle,
  MediaTag,
  Studio,
  Character,
  StaffMember,
  MediaRelation,
  NextAiringEpisode,
  ExternalLink,
  StreamingEpisode,
  MediaRanking,
  TatakaiAPIResponse,
} from './content/types';

// ── Legacy Type Adapters ──────────────────────────────────────────────────────
export {
  mediaToAnimeCard,
  toAnimeCard,
  toSpotlightAnime,
  toTopAnime,
  toTrendingAnime,
  toHomeData,
} from './content/types';

// ── Cache utilities ────────────────────────────────────────────────────────────
export { queryCache, TTL } from './cache/query-cache';
