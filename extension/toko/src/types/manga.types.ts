/**
 * Manga-related type definitions
 * Defines structures for manga chapters, pages, and sources
 */

export interface MangaChapterSource {
  provider: string;
  /** Format: "<provider>:<providerChapterId>" */
  chapterKey: string;
  providerChapterId: string;
  language: string;
  scanlator: string | null;
  releaseDate: string | null;
}

export interface MangaChapterEntry {
  number: number;
  title: string | null;
  volume: string | null;
  sources: MangaChapterSource[];
}

export interface MangaPageEntry {
  pageNumber: number;
  imageUrl: string;
}

export interface MangaChapterParams {
  anilistId?: number;
  malId?: number;
  title?: string;
}
