export interface MangaCard {
  id: string;
  name: string;
  poster: string;
  type?: string;
  status?: string;
  rating?: string;
  malId?: number;
  anilistId?: number;
}

export interface MangaSearchItem {
  id?: string;
  mediaType: "manga" | "manhwa" | "manhua" | "comics";
  anilistId?: number;
  malId?: number;
  canonicalTitle: string;
  title?: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  poster: string | null;
  status: string;
  year: number | null;
  score: number | null;
  popularity: number | null;
  providersAvailable: string[];
  matchConfidence: number;
  adult?: boolean;
  chapters: number | null;
  volumes: number | null;
  originLanguage: string | null;
  readingDirection: "ltr" | "rtl" | "ttb" | "unknown";
  providerSource?: string;
}

export interface MangaSearchResult {
  success?: true;
  query: string;
  page: number;
  limit: number;
  partial: boolean;
  failedProviders: string[];
  results: MangaSearchItem[];
  currentPage?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  source?: string;
}

export interface MangaDetail {
  mediaType: "manga" | "manhwa" | "manhua";
  anilistId: number;
  malId?: number;
  canonicalTitle: string;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
    synonyms?: string[];
  };
  status: string;
  genres: string[];
  themes: string[];
  origin: string | null;
  originLanguage: string | null;
  adult: boolean;
  yearStart: number | null;
  yearEnd: number | null;
  score: number | null;
  popularity: number | null;
  coverImage: string | null;
  providersAvailable: string[];
  synopsis: string | null;
  authors: string[];
  artists: string[];
  publishers: string[];
  serialization: string | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  latestChapter: number | null;
  lastUpdatedAt: string | null;
  languagesAvailable: string[];
  providerCoverage: {
    available: string[];
    failed: string[];
  };
  matchConfidence: number;
  matchedBy: "anilist" | "mal" | "title" | "provider";
}

export interface MangaDetailResponse {
  success?: true;
  id: string;
  idResolution?: {
    anilistId?: number;
    malId?: number;
    [key: string]: unknown;
  };
  detail: MangaDetail;
}

export interface MangaChapter {
  chapterKey: string;
  anilistId: number;
  provider?: string;
  providerChapterId?: string;
  number: number | null;
  volume?: number | null;
  title: string | null;
  language?: string | null;
  scanlator?: string | null;
  releaseDate?: string | null;
  pageCount?: number | null;
  canonicalOrder?: number;
  isOfficial?: boolean;
  isPremium?: boolean;
}

export interface MangaChapterSource {
  provider: string;
  chapterKey: string;
  providerChapterId: string;
  language: string | null;
  scanlator: string | null;
  releaseDate: string | null;
}

export interface MappedMangaChapter {
  chapterNumber: number | null;
  chapterTitle: string | null;
  volume: number | null;
  canonicalOrder: number;
  sources: MangaChapterSource[];
}

export interface MangaChapterResponse {
  success?: true;
  anilistId: number;
  partial: boolean;
  failedProviders: string[];
  chapters: MangaChapter[];
  mappedChapters: MappedMangaChapter[];
  providerStatus?: Array<{
    provider: string;
    success: boolean;
    chapterCount: number;
    latencyMs: number;
    error?: string;
  }>;
}

export interface MangaReadGuidance {
  code: 'NO_PAGES_FOR_CHAPTER' | 'MANGADEX_NO_PAGES' | 'NO_FALLBACK_PAGES' | string;
  message: string;
  retryable: boolean;
  suggestedProviders?: string[];
  attemptedProviders?: string[];
}

export interface MangaPage {
  pageNumber: number;
  imageUrl: string;
  proxiedImageUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface MangaReadResponse {
  success: boolean;
  partial?: boolean;
  failedProviders?: string[];
  data?: {
    pages: MangaPage[];
    chapter: {
      chapterKey: string;
      anilistId: number;
      provider: string;
      providerChapterId: string;
      number: number | null;
      title: string | null;
      language: string | null;
    };
    readMeta?: {
      provider?: string;
      fetchedAt?: string;
      expiresAt?: string | null;
      retryAfter?: number | null;
      fallbackUsed: boolean;
      failedProviders?: string[];
    };
  };
  guidance?: MangaReadGuidance;
  message?: string;
}
