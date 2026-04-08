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
    [key: string]: any;
  };
}

export interface EpisodeData {
  number: number;
  title: string;
  episodeId: string;
  isFiller: boolean;
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

export interface CharacterBase {
  _id: string;
  name: string;
  anime: string;
  image: string;
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
  episode: number;
  airingISOTimestamp?: string;
}
