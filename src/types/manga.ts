 import type { Character, StaffMember, MediaRelation, ExternalLink } from "@/core/content/types";

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
  /** Raw source format (AniList MANGA/MANHWA/MANHUA/OEL/ONE_SHOT/NOVEL). Used to classify the reading track. */
  format?: string | null;
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
  characters?: Character[];
  staff?: StaffMember[];
  relations?: MediaRelation[];
  externalLinks?: ExternalLink[];
  /** Provenance + raw catalog columns (admin content editor / "in DB" badge). */
  tatakaiId?: string | null;
  sourceApi?: string | null;
  inDb?: boolean;
  bannerImage?: string | null;
  coverImageMedium?: string | null;
  meanScore?: number | null;
  favourites?: number | null;
  rating?: string | null;
  trailerUrl?: string | null;
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

  // ── Kitsu enrichment (see src/lib/mapping/kitsu.ts) ────────────────────────
  // Scanlation providers give a number and, if you are lucky, a title. Kitsu
  // supplies the volume a chapter belongs to — which is what makes the volume
  // hierarchy possible at all, since most providers omit it — plus the publish
  // date, page count and a thumbnail. All optional: a manga MangaBaka can't map
  // to a Kitsu id renders exactly as it did before.
  /** Kitsu chapter id, when this chapter matched a Kitsu row. */
  kitsuId?: string;
  /** `YYYY-MM-DD` release date from Kitsu. */
  published?: string | null;
  pageCount?: number | null;
  thumbnail?: string | null;
  synopsis?: string | null;
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
  /**
   * Upstream request headers for this page (Referer/User-Agent the image CDN
   * demands). Carried so the mobile in-app proxy can re-register a dead token
   * (15-minute expiry / app restart) from the page itself — desktop never
   * needs it because its loopback server holds the headers.
   */
  headers?: Record<string, string> | null;
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
