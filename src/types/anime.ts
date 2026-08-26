import type { MediaRelation, StaffMember, ExternalLink } from "@/core/content/types";

export interface Episode {
  sub: number;
  dub: number;
}

export interface SpotlightAnime {
  id: string;
  name: string;
  jname: string;
  poster: string;
  banner?: string;
  description: string;
  rank: number;
  otherInfo: string[];
  episodes: Episode;
}

export interface TrendingAnime {
  id: string;
  name: string;
  poster: string;
  rank: number;
}

export interface TopAnime {
  id: string;
  name: string;
  poster: string;
  rank: number;
  episodes: Episode;
  malId?: number;
  anilistId?: number;
}

export interface AnimeCard {
  id: string;
  name: string;
  jname?: string;
  poster: string;
  type?: string;
  duration?: string;
  rating?: string;
  episodes: Episode;
  malId?: number;
  anilistId?: number;
}

export interface HomeData {
  genres: string[];
  latestEpisodeAnimes: AnimeCard[];
  spotlightAnimes: SpotlightAnime[];
  top10Animes: {
    today: TopAnime[];
    week: TopAnime[];
    month: TopAnime[];
  };
  topAiringAnimes: AnimeCard[];
  topUpcomingAnimes: AnimeCard[];
  trendingAnimes: TrendingAnime[];
  mostPopularAnimes: AnimeCard[];
  mostFavoriteAnimes: AnimeCard[];
  latestCompletedAnimes: AnimeCard[];
}

export interface AnimeInfo {
  info: {
    id: string;
    name: string;
    poster: string;
    description: string;
    stats: {
      rating: string;
      quality: string;
      episodes: Episode;
      type: string;
      duration: string;
    };
    promotionalVideos: Array<{
      title?: string;
      source?: string;
      thumbnail?: string;
    }>;
    characterVoiceActor: Array<{
      character: {
        id: string;
        poster: string;
        name: string;
        cast: string;
      };
      voiceActor: {
        id: string;
        poster: string;
        name: string;
        cast: string;
      };
    }>;
  };
  moreInfo: {
    aired: string;
    genres: string[];
    status: string;
    studios: string;
    duration: string;
    malId?: number | null;
    anilistId?: number | null;
    relations: MediaRelation[];
    staff?: StaffMember[];
    externalLinks?: ExternalLink[];
    // ── ani.zip enrichment — optional ─────────────────────────────────────────
    /** Distinct series titles across languages, best-first (English → romaji → native). */
    titleAliases?: string[];
    /** Every localized series title, keyed by language tag. */
    localizedTitles?: Record<string, string>;
    /** Cross-site ids resolved in the same ani.zip call (tvdb, tmdb, imdb, kitsu…). */
    mappedIds?: Record<string, string | number | null>;
    [key: string]: any;
  };
}

export interface EpisodeData {
  number: number;
  title: string;
  episodeId: string;
  isFiller: boolean;
  // ── ani.zip enrichment — optional ───────────────────────────────────────────
  // Filled from `GET https://api.ani.zip/mappings?anilist_id=…` when a mapping
  // exists. AniList gives at most a title and a thumbnail per episode and
  // nothing at all for unaired ones, so air dates, synopses and localized
  // titles only ever come from here. Every field stays optional: an unmapped
  // show still renders, just without the extra detail.
  overview?: string;
  image?: string;
  /** Local broadcast date, `YYYY-MM-DD`. */
  airDate?: string;
  /** Broadcast instant, ISO 8601 UTC. Use this for comparisons, not `airDate`. */
  airDateUtc?: string;
  /** Runtime in minutes. */
  runtime?: number;
  /** Localized episode titles keyed by language tag (`en`, `x-jat`, `ja`, …). */
  titles?: Record<string, string>;
  /** False only when a known air date is still in the future. */
  hasAired?: boolean;
  isSpecial?: boolean;
  absoluteNumber?: number;
  seasonNumber?: number;
  /**
   * Off-site watch page for this episode (AniList `streamingEpisodes[].url`,
   * e.g. a Crunchyroll link).
   *
   * Kept strictly separate from `episodeId`. This used to *be* the `episodeId`
   * whenever AniList had a streaming row, which broke every consumer that parses
   * the id: `/playback/dispatch` could extract neither a tatakaiId nor an episode
   * number from `https://www.crunchyroll.com/watch/…` and answered 400, the
   * header rendered "Episode ?", and the Supabase view counter 406'd on a URL
   * where it expected an id.
   */
  externalUrl?: string;
}

export interface EpisodeServer {
  serverId: number;
  serverName: string;
  providerKey?: string;
  providerName?: string;
  displayName?: string;
  isProviderServer?: boolean;
  sourceCount?: number;
  language?: string;
  isDub?: boolean;
  isEmbed?: boolean;
  hasM3U8?: boolean;
  // ── Extension-API host (streaming-sources-v3) — optional enrichment ──────────
  // Populated when servers are derived from the progressive API stream so the
  // Watch page can colour buttons by type/seeders and show a rich hover card.
  sourceType?: 'hls' | 'mp4' | 'embed' | 'torrent' | 'custom';
  seeders?: number;
  leechers?: number;
  peers?: number;
  torrentTitle?: string;
  fileFormat?: string;
  fileSize?: string;
  languageLabel?: string;
  audioLanguage?: string;
  /**
   * The extension's own ranking of this server, lowest first.
   *
   * Stamped by the extension from its provider registry order and relayed by
   * the host — the app does not compute or override it, it only sorts by it.
   * That is deliberate: which server plays first is the extension's decision,
   * so adding a provider or reordering the registry changes the app's behaviour
   * with no app-side change. Absent for sources from the central dispatch
   * fallback, which sort after everything that carries a rank.
   */
  providerPriority?: number;
}

export interface StreamingSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
  language?: string;
  langCode?: string;
  isDub?: boolean;
  providerName?: string;
  providerKey?: string;
  needsHeadless?: boolean;
  isEmbed?: boolean;
  server?: string;
  contributorDisplay?: string;
  contributorUsername?: string;
  magnetLink?: string;
  torrentFileUrl?: string;
  externalUrl?: string;
  streamUrl?: string;
  releaseGroup?: string;
  sourceType?: 'subtitle' | 'server' | 'magnet' | 'torrent' | 'external' | 'hls' | 'mp4' | 'embed' | 'custom';
  codec?: string;
  audio?: string;
  subtitleType?: string;
  episodeRange?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  // ── Extension-API host (streaming-sources-v3) — optional enrichment ──────────
  isTorrent?: boolean;
  originalUrl?: string;
  seeders?: number;
  leechers?: number;
  peers?: number;
  torrentTitle?: string;
  fileFormat?: string;
  fileSize?: string;
  languageLabel?: string;
  audioLanguage?: string;
  /**
   * Tracks the provider returned for *this* source. Kept per-source so switching
   * server switches subtitles; `StreamingData.subtitles` holds the union.
   */
  subtitles?: Subtitle[];
}

export interface Subtitle {
  lang: string;
  url: string;
  label?: string;
  kind?: string;
  file?: string;
}

export interface NextEpisodeEstimate {
  lang?: string;
  server?: string;
  label: string;
  iso?: string;
}

export interface StreamingData {
  headers: {
    Referer: string;
    "User-Agent": string;
  };
  sources: StreamingSource[];
  subtitles: Subtitle[];
  tracks?: Subtitle[];
  providerServers?: EpisodeServer[];
  anilistID: number | null;
  malID: number | null;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  nextEpisodeEstimates?: NextEpisodeEstimate[];
}

export interface SearchResult {
  animes: AnimeCard[];
  mostPopularAnimes: AnimeCard[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  searchQuery: string;
}

export interface ProducerAnimeResult {
  producerName: string;
  animes: AnimeCard[];
  top10Animes: {
    today: TopAnime[];
    week: TopAnime[];
    month: TopAnime[];
  };
  topAiringAnimes: AnimeCard[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface CharacterBase {
  _id: string;
  name: string;
  anime: string;
  image: string;
  malId?: number;
  gender?: string;
  status?: string;
}

export interface CharacterDetail extends CharacterBase {
  description: string;
  age?: string;
  birthday?: string;
  occupation?: string[];
  powers?: string[];
  abilities?: string[];
  weapons?: string[];
  country?: string;
  clan?: string;
  elements?: string[];
  affiliations?: string[];
  family?: Array<{ name: string; relation: string }>;
  voiceActors?: Array<{ name: string; language: string }>;
}

export interface CharacterApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalCharacters: number;
    pageSize: number;
  };
}

export interface NextEpisodeSchedule {
  airingAt: number;
  timeUntilAiring: number;
  episode?: number;
  airingISOTimestamp?: string;
  dayOfWeek?: string;
  // Present only on the ani.zip path — AniList and the Jikan broadcast fallback
  // know when the next episode airs but nothing about what it is.
  title?: string;
  overview?: string;
  image?: string;
}
