/**
 * Novel types — mirrors `src/types/manga.ts` for text chapters.
 *
 * Metadata (detail/search) reuses the AniList MANGA/NOVEL shape so every
 * existing manga UI helper (cards, safety flags, recommendations) works
 * unchanged. Chapters/content come from the Toko novel providers
 * (wuxiaworld/webnovel/justlightnovels/lightnovelto) via `novel-client`.
 */

export interface NovelSearchItem {
  href?: string;
  id?: string;
  mediaType: 'novel';
  anilistId?: number;
  malId?: number;
  canonicalTitle: string;
  title?: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  poster: string | null;
  banner?: string;
  logo?: string;
  titleLogo?: string;
  description?: string;
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
  readingDirection: 'ltr' | 'rtl' | 'ttb' | 'unknown';
  providerSource?: string;
}

export interface NovelSearchResult {
  total?: number;
  query: string;
  page: number;
  limit: number;
  partial: boolean;
  failedProviders: string[];
  results: NovelSearchItem[];
  currentPage?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  source?: string;
}

export interface NovelChapterSource {
  provider: string;
  providerName?: string;
  chapterKey: string;
  providerChapterId: string;
  language: string | null;
  translator: string | null;
  releaseDate: string | null;
}

export interface MappedNovelChapter {
  chapterNumber: number | null;
  chapterTitle: string | null;
  volume: number | null;
  canonicalOrder: number;
  sources: NovelChapterSource[];
}

export interface NovelChapterResponse {
  sourcesPending?: boolean;
  success?: true;
  anilistId: number;
  partial: boolean;
  failedProviders: string[];
  mappedChapters: MappedNovelChapter[];
  providersAvailable?: string[];
}

export interface NovelParagraph {
  index: number;
  text: string;
}

export interface NovelContentResponse {
  success: boolean;
  data?: {
    paragraphs: NovelParagraph[];
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
      fallbackUsed: boolean;
      failedProviders?: string[];
    };
  };
  guidance?: {
    code: string;
    message: string;
    retryable: boolean;
    attemptedProviders?: string[];
  };
  message?: string;
}
