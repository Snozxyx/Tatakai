import type {
  MangaChapterResponse,
  MangaDetailResponse,
  MangaReadResponse,
  MangaSearchResult,
} from "@/types/manga";

export type MangaSearchOptions = {
  requiresQuery?: boolean;
  adult?: boolean;
  mode?: MangaSearchMode;
  provider?: MangaSearchProvider;
  genre?: string;
  types?: string[];
  mangaType?: string;
  statuses?: string[];
  sort?: string;
  timeWindow?: string;
  origin?: string;
  minYear?: number;
  minScore?: number;
  minChapters?: number;
};

// Manga provider types
export type MangaSearchProvider = "all" | "mapped" | "atsu";
export type MangaSearchMode = "search" | "latest" | "added" | "new-chap" | "recent" | "popular" | "foryou" | "recommendation" | "origin" | "random" | "genre" | "category" | "explore";
export type MangaFeedTimeWindow = "day" | "week" | "month" | "all";
export type MangaSortOption = "relevance" | "trending" | "latestUpdate" | "rating" | "popularity" | "chapterCount";

/**
 * Normalize manga search provider string to valid MangaSearchProvider
 */
export function parseMangaSearchProvider(
  value: string | null | undefined,
  fallback: MangaSearchProvider = "all"
): MangaSearchProvider {
  const normalized = String(value || "").toLowerCase().trim();
  const validProviders: MangaSearchProvider[] = ["all", "mapped", "atsu"];
  
  if (validProviders.includes(normalized as MangaSearchProvider)) {
    return normalized as MangaSearchProvider;
  }
  
  return fallback;
}

/**
 * Get filter presets for Atsu providers
 */
export function getAtsuFilters(): Record<string, string[]> {
  return {
    types: ["manga", "manhwa", "manhua", "comics"],
    statuses: ["ongoing", "completed", "hiatus", "cancelled", "unreleased"],
    origins: ["jp", "kr", "zh"],
  };
}

/**
 * Get manga filter schema
 */
export function getMangaFilterSchema(): Record<string, any> {
  return {
    provider: { type: "select", options: ["all", "mapped", "atsu"] },
    type: { type: "select", options: ["all", "manga", "manhwa", "manhua", "comics"] },
    status: { type: "select", options: ["all", "ongoing", "completed", "hiatus", "cancelled", "unreleased"] },
    sort: { type: "select", options: ["relevance", "trending", "latestUpdate", "rating", "popularity", "chapterCount"] },
  };
}

/**
 * Get manga filter counts (for UI display)
 */
export async function getMangaFilterCounts(_query?: string): Promise<Record<string, Record<string, number>>> {
  return {
    type: { manga: 10000, manhwa: 5000, manhua: 3000, comics: 1000 },
    status: { ongoing: 15000, completed: 4000, hiatus: 500, cancelled: 100, unreleased: 50 },
    origin: { jp: 10000, kr: 4000, zh: 3000 },
  };
}

async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

export async function searchManga(
  query: string,
  page = 1,
  limit = 20,
  options: MangaSearchOptions = {},
): Promise<MangaSearchResult> {
  const rows = await apiGet<any[]>("/api/v3/manga/search", {
    q: query || undefined,
    page,
    perPage: limit,
    isAdult: options.adult,
    mode: options.mode,
    provider: options.provider,
    genre: options.genre,
    sort: options.sort,
    origin: options.origin,
    type: options.mangaType || options.types?.[0],
    minYear: options.minYear,
    minScore: options.minScore,
  });
  const results = rows.map((row) => {
    const media = row?.media ?? row;
    return {
      id: media?.anilistId
        ? String(media.anilistId)
        : media?.malId
          ? `mal:${media.malId}`
          : media?.tatakaiId
            ? String(media.tatakaiId)
            : "",
      mediaType: "manga" as const,
      anilistId: media?.anilistId,
      malId: media?.malId,
      canonicalTitle: media?.titleEnglish || media?.titleRomaji || media?.titleNative || "Untitled",
      title: { romaji: media?.titleRomaji, english: media?.titleEnglish, native: media?.titleNative },
      poster: media?.coverImageLarge || media?.coverImageMedium || null,
      status: media?.status || "unknown",
      year: media?.startDate?.year ?? null,
      score: media?.averageScore ?? null,
      popularity: media?.popularity ?? null,
      providersAvailable: [],
      matchConfidence: 1,
      adult: Boolean(media?.isAdult),
      chapters: media?.chapters ?? null,
      volumes: media?.volumes ?? null,
      originLanguage: media?.countryOfOrigin ?? null,
      readingDirection: "unknown" as const,
    };
  });

  return {
    query,
    page,
    limit,
    partial: false,
    failedProviders: [],
    results,
    currentPage: page,
    totalPages: results.length < limit ? page : page + 1,
    hasNextPage: results.length >= limit,
    source: "api-v3",
  };
}

export async function getMangaDetail(id: string): Promise<MangaDetailResponse> {
  const normalizedId = String(id || "");
  let row: any;

  if (normalizedId.startsWith("anilist:")) {
    const aniId = normalizedId.replace("anilist:", "");
    row = await apiGet<any>(`/api/v3/manga/by-anilist/${aniId}`);
  } else if (normalizedId.startsWith("mal:")) {
    // Current API might not have by-mal, fallback to general lookup or search
    row = await apiGet<any>(`/api/v3/manga/${encodeURIComponent(normalizedId)}`);
  } else {
    const raw = Number(normalizedId);
    row = Number.isFinite(raw)
      ? await apiGet<any>(`/api/v3/manga/by-anilist/${raw}`)
      : await apiGet<any>(`/api/v3/manga/${encodeURIComponent(normalizedId)}`);
  }

  const media = row?.media ?? row;
  const authors = media?.staff?.filter((s: any) => s.role?.toLowerCase().includes("story")).map((s: any) => s.name) || [];
  const artists = media?.staff?.filter((s: any) => s.role?.toLowerCase().includes("art")).map((s: any) => s.name) || [];
  const publishers = media?.studios?.map((s: any) => s.name) || [];

  return {
    id,
    detail: {
      mediaType: "manga",
      anilistId: media?.anilistId,
      malId: media?.malId,
      canonicalTitle: media?.titleEnglish || media?.titleRomaji || media?.titleNative || "Untitled",
      title: {
        romaji: media?.titleRomaji,
        english: media?.titleEnglish,
        native: media?.titleNative,
        synonyms: media?.synonyms || [],
      },
      status: media?.status || "unknown",
      genres: media?.genres || [],
      themes: [],
      origin: media?.countryOfOrigin || null,
      originLanguage: media?.countryOfOrigin || null,
      adult: Boolean(media?.isAdult),
      yearStart: media?.startDate?.year ?? null,
      yearEnd: media?.endDate?.year ?? null,
      score: media?.averageScore ?? null,
      popularity: media?.popularity ?? null,
      coverImage: media?.coverImageLarge || media?.coverImageMedium || null,
      providersAvailable: [],
      synopsis: media?.description || null,
      authors: authors.length ? authors : (media?.authors || []),
      artists: artists.length ? artists : (media?.artists || []),
      publishers: publishers.length ? publishers : (media?.publishers || []),
      serialization: media?.serialization || null,
      totalChapters: media?.chapters || null,
      totalVolumes: media?.volumes || null,
      latestChapter: null,
      lastUpdatedAt: null,
      languagesAvailable: [],
      providerCoverage: { available: [], failed: [] },
      matchConfidence: 1,
      matchedBy: "anilist",
      characters: media?.characters || [],
      staff: media?.staff || [],
      relations: media?.relations || [],
      externalLinks: media?.externalLinks || [],
    },
  };
}

export async function getMangaChapters(id: string, _providers?: string, _language?: string): Promise<MangaChapterResponse> {
  const normalizedId = encodeURIComponent(String(id || ""));
  const base = await apiGet<MangaChapterResponse>(`/api/v3/manga/${normalizedId}/chapters`);

  try {
    const { fetchExtensionMangaChapters, mergeChaptersWithExtensions } = await import(
      "@/core/content/manga-extension-runtime"
    );
    const anilistId = Number(String(id).replace(/^anilist:/i, ""));
    const extensionPayload = await fetchExtensionMangaChapters({
      anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
      title: undefined,
    });
    return mergeChaptersWithExtensions(base, extensionPayload);
  } catch {
    return base;
  }
}

export async function getMangaReadByKey(
  id: string,
  chapterKey: string,
  options?: { provider?: string; providerChapterId?: string },
): Promise<MangaReadResponse> {
  const isNative =
    typeof window !== "undefined" &&
    Boolean((window as any).electron || (window as any).tatakaiRuntime);

  if (isNative && options?.provider && options.provider !== "tatakai_media") {
    const { fetchExtensionMangaPages } = await import("@/core/content/manga-extension-runtime");
    const anilistId = Number(String(id).replace(/^anilist:/i, ""));
    return fetchExtensionMangaPages({
      extensionId: options.provider,
      chapterKey,
      providerChapterId: options.providerChapterId,
      anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
    });
  }

  return {
    success: false,
    message: "Manga chapter reading moved to extension runtime.",
    guidance: {
      code: "EXTENSION_RUNTIME_REQUIRED",
      message: isNative
        ? "Install a manga extension and open a provider source from the chapter hierarchy."
        : "Manga reader requires the Tatakai desktop app with extensions.",
      retryable: false,
    },
  };
}

// ─── Shared card type used by trending/recommendation UI ─────────────────────
export type MangaCard = {
  id: string;
  title: string;
  poster: string | null;
  score: number | null;
  popularity: number | null;
  status: string;
  chapters: number | null;
  genres: string[];
  /** Originating source for deduplication */
  anilistId?: number;
  malId?: number;
  /** 'manga' | 'manhwa' | 'manhua' */
  format?: string;
};

function rowToMangaCard(row: any): MangaCard {
  const media = row?.media ?? row;
  return {
    id: media?.anilistId
      ? String(media.anilistId)
      : media?.malId
        ? `mal:${media.malId}`
        : String(media?.id || media?.tatakaiId || ""),
    title: media?.titleEnglish || media?.titleRomaji || media?.titleNative || "Untitled",
    poster: media?.coverImageLarge || media?.coverImageMedium || null,
    score: media?.averageScore ?? null,
    popularity: media?.popularity ?? null,
    status: media?.status || "unknown",
    chapters: media?.chapters ?? null,
    genres: media?.genres || [],
    anilistId: media?.anilistId,
    malId: media?.malId,
    format: (media?.format || media?.type || "manga").toLowerCase(),
  };
}

/**
 * Fetch trending manga from AniList via the API proxy.
 * Falls back to "popular" mode if trending is not available.
 */
export async function getTrendingManga(limit = 18): Promise<MangaCard[]> {
  try {
    const rows = await apiGet<any[]>("/api/v3/manga/search", {
      mode: "popular",
      perPage: limit,
      sort: "TRENDING_DESC",
      type: "manga",
    });
    return (Array.isArray(rows) ? rows : []).map(rowToMangaCard).filter((m) => m.id);
  } catch {
    return [];
  }
}

/**
 * Fetch trending manhwa (Korean) — separate query for the manhwa row.
 */
export async function getTrendingManhwa(limit = 12): Promise<MangaCard[]> {
  try {
    const rows = await apiGet<any[]>("/api/v3/manga/search", {
      mode: "popular",
      perPage: limit,
      sort: "POPULARITY_DESC",
      origin: "kr",
    });
    return (Array.isArray(rows) ? rows : []).map(rowToMangaCard).filter((m) => m.id);
  } catch {
    return [];
  }
}

/**
 * Fetch manga recommendations based on a genre tag.
 * Used in the discovery / recommendation sections.
 */
export async function getMangaByGenre(genre: string, limit = 12): Promise<MangaCard[]> {
  try {
    const rows = await apiGet<any[]>("/api/v3/manga/search", {
      mode: "genre",
      genre,
      perPage: limit,
      sort: "POPULARITY_DESC",
    });
    return (Array.isArray(rows) ? rows : []).map(rowToMangaCard).filter((m) => m.id);
  } catch {
    return [];
  }
}

/**
 * Fetch recently-updated manga chapters feed.
 */
export async function getLatestMangaUpdates(limit = 18): Promise<MangaCard[]> {
  try {
    const rows = await apiGet<any[]>("/api/v3/manga/search", {
      mode: "new-chap",
      perPage: limit,
    });
    return (Array.isArray(rows) ? rows : []).map(rowToMangaCard).filter((m) => m.id);
  } catch {
    return [];
  }
}