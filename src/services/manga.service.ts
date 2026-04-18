import { mangaGet } from "@/lib/api/api-client";
import {
  MangaSearchResult,
  MangaSearchItem,
  MangaDetailResponse,
  MangaChapterResponse,
  MangaReadResponse
} from "@/types/manga";

export type MangaSearchMode =
  | "search"
  | "latest"
  | "recent"
  | "added"
  | "new-chap"
  | "category"
  | "genre"
  | "author"
  | "explore"
  | "popular"
  | "recommendation"
  | "foryou"
  | "origin"
  | "random";

export type MangaFeedTimeWindow = "day" | "week" | "month" | "all";

export const MANGA_SEARCH_PROVIDERS = ["mapped", "atsu", "mangafire", "mangaball", "allmanga", "all"] as const;

export type MangaSearchProvider = (typeof MANGA_SEARCH_PROVIDERS)[number];

export interface MangaSearchOptions {
  mode?: MangaSearchMode;
  provider?: MangaSearchProvider;
  category?: string;
  genre?: string;
  origin?: string;
  language?: string;
  author?: string;
  adult?: boolean;
  timeWindow?: MangaFeedTimeWindow;
  sort?: MangaSortOption;
  minYear?: number;
  maxYear?: number;
  minScore?: number;
  maxScore?: number;
  minChapters?: number;
  maxChapters?: number;
  types?: string[];
  statuses?: string[];
  mangaType?: "all" | "manga" | "manhwa" | "manhua" | "comics";
  requiresQuery?: boolean;
}

export interface AtsuFilterOption {
  name: string;
  slug: string;
}

export interface AtsuFilterSchema {
  genres: AtsuFilterOption[];
  types: AtsuFilterOption[];
  statuses: AtsuFilterOption[];
}

export type MangaSortOption =
  | "relevance"
  | "trending"
  | "latestUpdate"
  | "rating"
  | "popularity"
  | "chapterCount";

export interface MangaFilterFacetOption {
  value: string;
  label: string;
  providers: string[];
}

export interface MangaFilterFacet {
  key: string;
  type: "enum" | "range" | "boolean";
  options?: MangaFilterFacetOption[];
  range?: {
    min: number;
    max: number;
    step: number;
  };
  unsupportedProviders: string[];
}

export interface MangaFilterSchema {
  facets: MangaFilterFacet[];
  sorts: MangaSortOption[];
}

export interface MangaFilterCountValue {
  value: string;
  count: number;
  providers: string[];
}

export interface MangaFilterCountGroup {
  key: string;
  counts: MangaFilterCountValue[];
  coverageRatio: number;
  partial: boolean;
}

export interface MangaFilterCounts {
  query: string;
  groups: MangaFilterCountGroup[];
}

type ConcreteProvider = Exclude<MangaSearchProvider, "all">;

type MangaRequestControlOptions = {
  forceFresh?: boolean;
};

const KNOWN_MANGA_PROVIDERS: ConcreteProvider[] = MANGA_SEARCH_PROVIDERS.filter(
  (provider): provider is ConcreteProvider => provider !== "all"
);

const applyMangaFreshParams = (params: URLSearchParams) => {
  params.set("nocache", "1");
  params.set("refresh", "1");
  params.set("snapshotRefresh", "1");
  params.set("snapshotUse", "0");
  params.set("snapshotFallback", "0");
  params.set("snapshotPurge", "1");
  return params;
};

const buildMangaPath = (
  basePath: string,
  params?: URLSearchParams,
  options: MangaRequestControlOptions = {}
) => {
  const query = new URLSearchParams(params ? params.toString() : "");
  const forceFresh = options.forceFresh ?? true;
  if (forceFresh) {
    applyMangaFreshParams(query);
  }

  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
};

const toSafeString = (value: unknown) => String(value ?? "").trim();

const isMangaSearchProvider = (value: string): value is MangaSearchProvider =>
  (MANGA_SEARCH_PROVIDERS as readonly string[]).includes(value);

export const parseMangaSearchProvider = (
  value: unknown,
  fallback: MangaSearchProvider = "all"
): MangaSearchProvider => {
  const normalized = toSafeString(value).toLowerCase();
  if (isMangaSearchProvider(normalized)) {
    return normalized;
  }
  return fallback;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toPositiveInt = (value: unknown): number | undefined => {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return undefined;
  const intValue = Math.trunc(parsed);
  if (intValue <= 0) return undefined;
  return intValue;
};

const normalizeTitle = (value: unknown) =>
  toSafeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeMangaType = (
  value: unknown,
  fallback: MangaSearchItem["mediaType"] = "manga"
): MangaSearchItem["mediaType"] => {
  const normalized = toSafeString(value).toLowerCase();
  if (normalized.includes("manhwa") || normalized.includes("manwha") || normalized === "kr") return "manhwa";
  if (normalized.includes("manhua") || normalized === "zh") return "manhua";
  if (normalized.includes("comic") || normalized.includes("oel") || normalized === "en") return "comics";
  if (normalized.includes("manga") || normalized === "jp") return "manga";
  return fallback;
};

const normalizeStatus = (value: unknown) => {
  const normalized = toSafeString(value).toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("ongoing") || normalized.includes("releasing")) return "ongoing";
  if (normalized.includes("completed") || normalized.includes("finished")) return "completed";
  if (normalized.includes("hiatus")) return "hiatus";
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("unreleased") || normalized.includes("not")) return "unreleased";
  return normalized;
};

const guessOriginLanguage = (mediaType: MangaSearchItem["mediaType"]) => {
  if (mediaType === "manga") return "jp";
  if (mediaType === "manhwa") return "kr";
  if (mediaType === "manhua") return "zh";
  if (mediaType === "comics") return "en";
  return null;
};

const normalizeLanguageTag = (value: unknown) => {
  const normalized = toSafeString(value).toLowerCase();
  if (!normalized) return "";
  if (normalized.startsWith("ja") || normalized === "jp" || normalized.includes("japanese")) return "jp";
  if (normalized.startsWith("ko") || normalized === "kr" || normalized.includes("korean")) return "kr";
  if (normalized.startsWith("zh") || normalized === "cn" || normalized.includes("chinese")) return "zh";
  if (normalized.startsWith("en") || normalized.includes("english")) return "en";
  return normalized;
};

const normalizePosterUrl = (value: unknown): string => {
  const trimmed = toSafeString(value).replace(/\\/g, "/");
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(api|manga)\//i.test(trimmed)) return `/${trimmed}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
};

const extractImageUrlCandidate = (value: unknown, depth = 0): string => {
  if (depth > 2) return "";
  if (typeof value === "string") return normalizePosterUrl(value);
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const fields = [
    "url",
    "src",
    "proxiedUrl",
    "image",
    "thumbnail",
    "poster",
    "cover",
    "large",
    "medium",
    "small",
    "original",
  ];

  for (const field of fields) {
    const nested = record[field];
    if (!nested) continue;

    if (typeof nested === "string") {
      const normalized = normalizePosterUrl(nested);
      if (normalized) return normalized;
      continue;
    }

    const nestedCandidate = extractImageUrlCandidate(nested, depth + 1);
    if (nestedCandidate) return nestedCandidate;
  }

  return "";
};

const resolvePosterUrl = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    const extracted = extractImageUrlCandidate(candidate);
    if (extracted) return extracted;
  }
  return null;
};

const inferItemLanguage = (item: MangaSearchItem) => {
  const fromOrigin = normalizeLanguageTag(item.originLanguage);
  if (fromOrigin) return fromOrigin;
  return normalizeLanguageTag(guessOriginLanguage(item.mediaType));
};

const deriveRouteId = (provider: ConcreteProvider, providerId: unknown, title: unknown) => {
  const safeTitle = toSafeString(title);
  if (safeTitle) return `slug:${safeTitle}`;

  const safeProviderId = toSafeString(providerId);
  if (safeProviderId) return `provider:${provider}|${safeProviderId}`;

  return undefined;
};

const ensureProviders = (values: unknown, fallback: string): string[] => {
  if (Array.isArray(values)) {
    const unique = new Set<string>();
    values.forEach((value) => {
      const provider = toSafeString(value).toLowerCase();
      if (provider) unique.add(provider);
    });
    if (unique.size > 0) return Array.from(unique);
  }
  return [fallback];
};

const mapUnifiedSearchItem = (item: any): MangaSearchItem => {
  const canonicalTitle =
    toSafeString(item?.canonicalTitle) ||
    toSafeString(item?.title?.english) ||
    toSafeString(item?.title?.romaji) ||
    toSafeString(item?.title?.native) ||
    "Unknown title";

  const mediaType = normalizeMangaType(item?.mediaType || item?.type);
  const anilistId = toPositiveInt(item?.anilistId);
  const malId = toPositiveInt(item?.malId);
  const score = toNumberOrNull(item?.score);

  return {
    id:
      toSafeString(item?.id) ||
      (anilistId ? String(anilistId) : malId ? `mal:${malId}` : deriveRouteId("mapped", null, canonicalTitle)),
    mediaType,
    anilistId,
    malId,
    canonicalTitle,
    title: item?.title,
    poster: item?.poster || null,
    status: normalizeStatus(item?.status),
    year: toNumberOrNull(item?.year),
    score,
    popularity: toNumberOrNull(item?.popularity),
    providersAvailable: ensureProviders(item?.providersAvailable, "mapped"),
    matchConfidence: Number.isFinite(Number(item?.matchConfidence)) ? Number(item.matchConfidence) : 1,
    adult: Boolean(item?.adult),
    chapters: toNumberOrNull(item?.chapters),
    volumes: toNumberOrNull(item?.volumes),
    originLanguage: toSafeString(item?.originLanguage) || guessOriginLanguage(mediaType),
    readingDirection:
      item?.readingDirection === "ltr" ||
      item?.readingDirection === "rtl" ||
      item?.readingDirection === "ttb"
        ? item.readingDirection
        : "unknown",
    providerSource: "mapped",
  };
};

const mapAtsuItem = (item: any): MangaSearchItem => {
  const canonicalTitle = toSafeString(item?.title) || "Unknown title";
  const mediaType = normalizeMangaType(item?.type || "manga");

  return {
    id: deriveRouteId("atsu", item?.id, canonicalTitle),
    mediaType,
    canonicalTitle,
    title: { english: canonicalTitle },
    poster: item?.thumbnail || item?.images?.medium || item?.images?.large || item?.images?.small || null,
    status: "unknown",
    year: null,
    score: null,
    popularity: null,
    providersAvailable: ["atsu"],
    matchConfidence: 0.72,
    adult: Boolean(item?.isAdult),
    chapters: null,
    volumes: null,
    originLanguage: guessOriginLanguage(mediaType),
    readingDirection: "unknown",
    providerSource: "atsu",
  };
};

const countMangaFireChapters = (item: any): number | null => {
  if (Array.isArray(item?.chapters)) return item.chapters.length;
  if (Array.isArray(item?.latestChapters)) return item.latestChapters.length;
  return null;
};

const mapMangaFireItem = (item: any): MangaSearchItem => {
  const canonicalTitle = toSafeString(item?.title || item?.name) || "Unknown title";
  const mediaType = normalizeMangaType(item?.type || "manga");
  const chapters = countMangaFireChapters(item);

  return {
    id: deriveRouteId("mangafire", item?.id, canonicalTitle),
    mediaType,
    canonicalTitle,
    title: { english: canonicalTitle },
    poster: item?.poster || null,
    status: normalizeStatus(item?.status),
    year: null,
    score: toNumberOrNull(item?.rating),
    popularity: null,
    providersAvailable: ["mangafire"],
    matchConfidence: 0.68,
    adult: false,
    chapters,
    volumes: null,
    originLanguage: guessOriginLanguage(mediaType),
    readingDirection: "unknown",
    providerSource: "mangafire",
  };
};

const mapMangaBallItem = (item: any): MangaSearchItem => {
  const canonicalTitle = toSafeString(item?.title) || "Unknown title";
  const mediaType = normalizeMangaType(item?.mediaType || item?.type || item?.originLanguage || "manga");

  return {
    id: deriveRouteId("mangaball", item?._id || item?.slug, canonicalTitle),
    mediaType,
    canonicalTitle,
    title: { english: canonicalTitle },
    poster: resolvePosterUrl(
      item?.thumbnail,
      item?.poster,
      item?.cover,
      item?.image,
      item?.images,
      item?.images?.large,
      item?.images?.medium,
      item?.images?.small
    ),
    status: normalizeStatus(item?.status),
    year: null,
    score: null,
    popularity: null,
    providersAvailable: ["mangaball"],
    matchConfidence: 0.65,
    adult: false,
    chapters: toNumberOrNull(item?.total_chapters),
    volumes: null,
    originLanguage: guessOriginLanguage(mediaType),
    readingDirection: "unknown",
    providerSource: "mangaball",
  };
};

const mapAllMangaItem = (item: any): MangaSearchItem => {
  const canonicalTitle =
    toSafeString(item?.englishTitle) ||
    toSafeString(item?.title) ||
    toSafeString(item?.nativeTitle) ||
    "Unknown title";

  const subChapters = toNumberOrNull(item?.availableChapters?.sub);
  const rawChapters = toNumberOrNull(item?.availableChapters?.raw);

  return {
    id: deriveRouteId("allmanga", item?.id, canonicalTitle),
    mediaType: "manga",
    canonicalTitle,
    title: {
      english: toSafeString(item?.englishTitle) || canonicalTitle,
      romaji: toSafeString(item?.title) || undefined,
      native: toSafeString(item?.nativeTitle) || undefined,
    },
    poster: item?.cover || null,
    status: "unknown",
    year: null,
    score: toNumberOrNull(item?.score),
    popularity: null,
    providersAvailable: ["allmanga"],
    matchConfidence: 0.64,
    adult: false,
    chapters: Math.max(subChapters || 0, rawChapters || 0) || null,
    volumes: null,
    originLanguage: "jp",
    readingDirection: "unknown",
    providerSource: "allmanga",
  };
};

const mergeItems = (items: MangaSearchItem[]): MangaSearchItem[] => {
  const seen = new Map<string, MangaSearchItem>();

  items.forEach((item) => {
    const key =
      item.anilistId != null
        ? `anilist:${item.anilistId}`
        : item.malId != null
          ? `mal:${item.malId}`
          : normalizeTitle(item.canonicalTitle || item.title?.english || item.id);

    if (!seen.has(key)) {
      seen.set(key, item);
      return;
    }

    const existing = seen.get(key)!;
    const mergedProviders = new Set<string>([
      ...(existing.providersAvailable || []),
      ...(item.providersAvailable || []),
    ]);

    seen.set(key, {
      ...existing,
      poster: existing.poster || item.poster,
      status: existing.status !== "unknown" ? existing.status : item.status,
      score: existing.score ?? item.score,
      popularity: existing.popularity ?? item.popularity,
      chapters: existing.chapters ?? item.chapters,
      volumes: existing.volumes ?? item.volumes,
      adult: Boolean(existing.adult || item.adult),
      providersAvailable: Array.from(mergedProviders),
      matchConfidence: Math.max(existing.matchConfidence || 0, item.matchConfidence || 0),
      providerSource:
        existing.providerSource === item.providerSource
          ? existing.providerSource
          : "multi-provider",
    });
  });

  return Array.from(seen.values());
};

const getPayloadRows = (provider: ConcreteProvider, payload: any): any[] => {
  if (provider === "mapped") return Array.isArray(payload?.results) ? payload.results : [];
  if (provider === "atsu") return Array.isArray(payload?.items) ? payload.items : [];
  if (provider === "mangafire") return Array.isArray(payload?.results) ? payload.results : [];
  if (provider === "allmanga") return Array.isArray(payload?.results) ? payload.results : [];
  if (provider === "mangaball") return Array.isArray(payload?.data) ? payload.data : [];
  return [];
};

const mapProviderRows = (provider: ConcreteProvider, rows: any[]): MangaSearchItem[] => {
  if (provider === "mapped") return rows.map(mapUnifiedSearchItem);
  if (provider === "atsu") return rows.map(mapAtsuItem);
  if (provider === "mangafire") return rows.map(mapMangaFireItem);
  if (provider === "allmanga") return rows.map(mapAllMangaItem);
  return rows.map(mapMangaBallItem);
};

const inferHasNext = (
  provider: ConcreteProvider,
  payload: any,
  rowCount: number,
  page: number,
  limit: number
) => {
  if (typeof payload?.hasNextPage === "boolean") return payload.hasNextPage;

  const totalPages = toPositiveInt(payload?.totalPages);
  const currentPage = toPositiveInt(payload?.currentPage) ?? page;
  if (totalPages) return currentPage < totalPages;

  const pagination = payload?.pagination;
  const pagCurrent = toPositiveInt(pagination?.current_page || pagination?.page || pagination?.currentPage);
  const pagLast = toPositiveInt(pagination?.last_page || pagination?.total_pages || pagination?.totalPages);
  if (pagCurrent && pagLast) return pagCurrent < pagLast;
  if (pagination && typeof pagination?.next_page_url === "string") {
    return Boolean(pagination.next_page_url);
  }

  if (provider === "atsu") {
    return rowCount >= limit;
  }

  const total = toPositiveInt(payload?.total);
  if (total) {
    const effectivePageSize = rowCount > 0 ? rowCount : limit;
    return page * effectivePageSize < total;
  }

  return rowCount >= limit;
};

const isRemoteProvider = (value: string): value is MangaSearchProvider =>
  isMangaSearchProvider(value);

const normalizeCategory = (value: unknown) => {
  const normalized = toSafeString(value).toLowerCase();
  if (normalized === "manwha" || normalized === "manwah") return "manhwa";
  return normalized;
};

const normalizeFeedWindow = (value: unknown): MangaFeedTimeWindow => {
  const normalized = toSafeString(value).toLowerCase();
  if (normalized === "week") return "week";
  if (normalized === "month") return "month";
  if (normalized === "all") return "all";
  return "day";
};

const toMangaballFeedWindow = (window: MangaFeedTimeWindow) => {
  if (window === "week" || window === "month") return window;
  return "day";
};

const toAllMangaPeriod = (window: MangaFeedTimeWindow) => {
  if (window === "week") return "weekly";
  if (window === "month") return "monthly";
  if (window === "all") return "all";
  return "daily";
};

const normalizeOrigin = (value: unknown) => {
  const normalized = toSafeString(value).toLowerCase();
  if (!normalized || normalized === "all") return "all";
  if (normalized === "cn") return "zh";
  if (["jp", "kr", "zh"].includes(normalized)) return normalized;
  return "all";
};

const toAtsuTypeValue = (value: string) => {
  const normalized = normalizeCategory(value);
  if (normalized === "manhwa") return "Manwha";
  if (normalized === "manhua") return "Manhua";
  if (normalized === "comics") return "OEL";
  return "Manga";
};

const buildAtsuExplorePath = (
  base: string,
  page: number,
  options: MangaSearchOptions
) => {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(page - 1, 0)));

  const genre = toSafeString(options.genre);
  if (genre) params.set("genres", genre);

  const category = normalizeCategory(options.category || options.mangaType);
  const selectedTypes = Array.isArray(options.types) ? options.types.filter(Boolean) : [];
  if (selectedTypes.length > 0) {
    params.set("types", selectedTypes.join(","));
  } else if (category && category !== "all") {
    params.set("types", toAtsuTypeValue(category));
  }

  const statuses = Array.isArray(options.statuses) ? options.statuses.filter(Boolean) : [];
  if (statuses.length > 0) {
    params.set("statuses", statuses.join(","));
  }

  return `${base}/explore?${params.toString()}`;
};

const buildProviderPath = (
  provider: ConcreteProvider,
  mode: MangaSearchMode,
  query: string,
  page: number,
  limit: number,
  options: MangaSearchOptions
) => {
  if (provider === "mapped") {
    if (mode !== "search") return null;
    if (!query.trim()) return null;
    return `/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
  }

  if (provider === "atsu") {
    const base = options.adult ? "/adult/atsu" : "/atsu";
    if (mode === "latest") {
      const params = new URLSearchParams({ page: String(Math.max(page - 1, 0)) });
      return `${base}/recently-added?${params.toString()}`;
    }
    if (mode === "popular") {
      const params = new URLSearchParams({ page: String(Math.max(page - 1, 0)) });
      return `${base}/popular?${params.toString()}`;
    }
    if (mode === "author") {
      const author = toSafeString(options.author);
      if (!author) return null;
      return `${base}/author/${encodeURIComponent(author)}?page=${Math.max(page - 1, 0)}`;
    }
    if (mode === "genre") {
      const genre = toSafeString(options.genre);
      if (!genre) return null;
      return `${base}/genre/${encodeURIComponent(genre)}?page=${Math.max(page - 1, 0)}`;
    }
    if (mode === "explore" || mode === "category" || mode === "search") {
      return buildAtsuExplorePath(base, page, options);
    }
    return null;
  }

  if (provider === "mangafire") {
    if (mode === "search") {
      if (!query.trim()) return null;
      return `/mangafire/search?q=${encodeURIComponent(query)}&page=${page}`;
    }
    if (mode === "latest") return `/mangafire/latest?page=${page}`;
    if (mode === "category") {
      const category = normalizeCategory(options.category || options.mangaType);
      if (!category || category === "all") return null;
      return `/mangafire/category/${encodeURIComponent(category)}?page=${page}`;
    }
    if (mode === "genre") {
      const genre = toSafeString(options.genre);
      if (!genre) return null;
      return `/mangafire/genre/${encodeURIComponent(genre)}?page=${page}`;
    }
    return null;
  }

  if (provider === "allmanga") {
    if (mode === "search") {
      if (!query.trim()) return null;
      return `/allmanga/search?q=${encodeURIComponent(query)}&page=${page}`;
    }
    if (mode === "popular") {
      const period = toAllMangaPeriod(normalizeFeedWindow(options.timeWindow));
      return `/allmanga/popular?page=${page}&size=${limit}&period=${encodeURIComponent(period)}`;
    }
    if (mode === "random") {
      return `/allmanga/random`;
    }
    if (mode === "latest" || mode === "added" || mode === "new-chap") {
      return `/allmanga/latest?page=${page}`;
    }
    if (mode === "genre") {
      const genre = toSafeString(options.genre);
      if (!genre) return null;
      return `/allmanga/genre/${encodeURIComponent(genre)}?page=${page}`;
    }
    if (mode === "author") {
      const author = toSafeString(options.author);
      if (!author) return null;
      return `/allmanga/author/${encodeURIComponent(author)}?page=${page}`;
    }
    if (mode === "category" || mode === "explore") {
      const genre = toSafeString(options.genre);
      if (genre) {
        return `/allmanga/genre/${encodeURIComponent(genre)}?page=${page}`;
      }
      return `/allmanga/latest?page=${page}`;
    }
    return null;
  }

  if (mode === "search") {
    if (!query.trim()) return null;
    return `/mangaball/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
  }
  if (mode === "latest") return `/mangaball/latest?page=${page}&limit=${limit}`;
  if (mode === "recent") {
    const feedWindow = toMangaballFeedWindow(normalizeFeedWindow(options.timeWindow));
    return `/mangaball/recent?time=${encodeURIComponent(feedWindow)}&limit=${limit}`;
  }
  if (mode === "foryou") {
    const feedWindow = toMangaballFeedWindow(normalizeFeedWindow(options.timeWindow));
    return `/mangaball/foryou?time=${encodeURIComponent(feedWindow)}&limit=${limit}`;
  }
  if (mode === "recommendation") return `/mangaball/recommendation?limit=${limit}`;
  if (mode === "popular") return `/mangaball/popular?limit=${limit}`;
  if (mode === "origin") {
    const origin = normalizeOrigin(options.origin || options.category);
    return `/mangaball/origin?origin=${encodeURIComponent(origin)}`;
  }
  if (mode === "added") return `/mangaball/added?page=${page}&limit=${limit}`;
  if (mode === "new-chap") return `/mangaball/new-chap?page=${page}&limit=${limit}`;
  if (mode === "category" || mode === "explore") {
    const category = normalizeCategory(options.category || options.mangaType);
    if (!category || category === "all") return null;
    if (!["manga", "manhwa", "manhua", "comics"].includes(category)) return null;
    return `/mangaball/${encodeURIComponent(category)}?page=${page}&limit=${limit}`;
  }

  return null;
};

const MODE_SUPPORTED_PROVIDERS: Record<MangaSearchMode, ConcreteProvider[]> = {
  search: ["mapped", "atsu", "mangafire", "mangaball", "allmanga"],
  latest: ["mangafire", "mangaball", "atsu", "allmanga"],
  recent: ["mangaball"],
  added: ["mangaball"],
  "new-chap": ["mangaball"],
  category: ["atsu", "mangaball", "mangafire", "allmanga"],
  genre: ["atsu", "mangafire", "allmanga"],
  author: ["atsu", "allmanga"],
  explore: ["atsu", "mangaball", "mangafire", "allmanga"],
  popular: ["atsu", "mangaball", "allmanga"],
  recommendation: ["mangaball"],
  foryou: ["mangaball"],
  origin: ["mangaball"],
  random: ["allmanga"],
};

const resolveProviders = (mode: MangaSearchMode, provider: MangaSearchProvider): ConcreteProvider[] => {
  const supportedProviders = MODE_SUPPORTED_PROVIDERS[mode] || ["mapped"];

  if (provider !== "all") {
    const normalizedProvider = toSafeString(provider).toLowerCase();
    if (KNOWN_MANGA_PROVIDERS.includes(normalizedProvider as ConcreteProvider)) {
      const providerValue = normalizedProvider as ConcreteProvider;
      if (supportedProviders.includes(providerValue)) {
        return [providerValue];
      }
      return [supportedProviders[0]];
    }
    return [supportedProviders[0]];
  }

  return supportedProviders;
};

export async function searchManga(
  query: string,
  page: number = 1,
  limit: number = 20,
  options: MangaSearchOptions = {}
): Promise<MangaSearchResult> {
  const normalizedMode: MangaSearchMode = options.mode || "search";
  const providerValue = toSafeString(options.provider || "mapped").toLowerCase();
  const normalizedProvider: MangaSearchProvider = isRemoteProvider(providerValue)
    ? providerValue
    : "mapped";
  const trimmedQuery = query.trim();

  if (normalizedMode === "search" && normalizedProvider === "mapped") {
    if (!trimmedQuery) {
      return {
        query: "",
        page,
        limit,
        partial: false,
        failedProviders: [],
        results: [],
        currentPage: page,
        totalPages: page,
        hasNextPage: false,
        source: "search",
      };
    }

    const mappedResult = await mangaGet<MangaSearchResult>(
      `/search?q=${encodeURIComponent(trimmedQuery)}&page=${page}&limit=${limit}`
    );

    const mappedRows = Array.isArray(mappedResult?.results) ? mappedResult.results : [];
    const normalizedRows = mappedRows.map((row: any) => mapUnifiedSearchItem(row));

    const mappedCurrentPage =
      typeof mappedResult?.currentPage === "number"
        ? mappedResult.currentPage
        : typeof mappedResult?.page === "number"
          ? mappedResult.page
          : page;

    const mappedTotalPages =
      typeof mappedResult?.totalPages === "number" ? mappedResult.totalPages : undefined;

    let mappedHasNextPage: boolean;
    if (typeof mappedResult?.hasNextPage === "boolean") {
      mappedHasNextPage = mappedResult.hasNextPage;
    } else if (typeof mappedTotalPages === "number") {
      mappedHasNextPage = mappedCurrentPage < mappedTotalPages;
    } else {
      mappedHasNextPage = normalizedRows.length >= limit;
    }

    if (normalizedRows.length === 0) {
      mappedHasNextPage = false;
    }

    if (typeof mappedTotalPages === "number" && mappedCurrentPage >= mappedTotalPages) {
      mappedHasNextPage = false;
    }

    return {
      ...mappedResult,
      query: mappedResult?.query || trimmedQuery,
      page: typeof mappedResult?.page === "number" ? mappedResult.page : page,
      limit: typeof mappedResult?.limit === "number" ? mappedResult.limit : limit,
      partial: Boolean(mappedResult?.partial),
      failedProviders: Array.isArray(mappedResult?.failedProviders) ? mappedResult.failedProviders : [],
      results: normalizedRows,
      currentPage: mappedCurrentPage,
      totalPages: mappedTotalPages,
      hasNextPage: mappedHasNextPage,
      source: "search",
    };
  }

  const providers = resolveProviders(normalizedMode, normalizedProvider);
  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const path = buildProviderPath(provider, normalizedMode, trimmedQuery, page, limit, options);
      if (!path) {
        throw new Error(`Mode '${normalizedMode}' is not supported for provider '${provider}'`);
      }

      const payload = await mangaGet<any>(path);
      const rows = getPayloadRows(provider, payload);
      const mappedRows = mapProviderRows(provider, rows);

      return {
        provider,
        payload,
        mappedRows,
        hasNext: inferHasNext(provider, payload, rows.length, page, limit),
      };
    })
  );

  const failedProviders: string[] = [];
  const mergedRows: MangaSearchItem[] = [];
  let hasNextPage = false;

  settled.forEach((result, index) => {
    const provider = providers[index];
    if (!provider) return;

    if (result.status === "fulfilled") {
      mergedRows.push(...result.value.mappedRows);
      hasNextPage = hasNextPage || result.value.hasNext;
      return;
    }

    failedProviders.push(provider);
  });

  let filteredRows = mergeItems(mergedRows);

  if (trimmedQuery && normalizedMode !== "search") {
    const normalizedQuery = normalizeTitle(trimmedQuery);
    filteredRows = filteredRows.filter((item) => {
      const title = normalizeTitle(item.canonicalTitle || item.title?.english);
      return title.includes(normalizedQuery);
    });
  }

  const requestedType = normalizeCategory(options.mangaType || options.category);
  if (requestedType && requestedType !== "all") {
    filteredRows = filteredRows.filter((item) => normalizeCategory(item.mediaType) === requestedType);
  }

  const requestedLanguage = normalizeLanguageTag(options.language);
  if (requestedLanguage && requestedLanguage !== "all") {
    filteredRows = filteredRows.filter((item) => inferItemLanguage(item) === requestedLanguage);
  }

  return {
    query: trimmedQuery,
    page,
    limit,
    partial: failedProviders.length > 0,
    failedProviders,
    results: filteredRows,
    currentPage: page,
    totalPages: hasNextPage ? page + 1 : page,
    hasNextPage,
    source: normalizedMode,
  };
}

export async function getAtsuFilters(): Promise<AtsuFilterSchema> {
  const payload = await mangaGet<any>("/atsu/filters");
  const normalizeOptions = (items: any): AtsuFilterOption[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => ({
        name: toSafeString(item?.name),
        slug: toSafeString(item?.slug),
      }))
      .filter((item) => item.name.length > 0 && item.slug.length > 0);
  };

  return {
    genres: normalizeOptions(payload?.genres),
    types: normalizeOptions(payload?.types),
    statuses: normalizeOptions(payload?.statuses),
  };
}

const EMPTY_MANGA_FILTER_SCHEMA: MangaFilterSchema = {
  facets: [],
  sorts: [],
};

const EMPTY_MANGA_FILTER_COUNTS = (query: string): MangaFilterCounts => ({
  query,
  groups: [],
});

export async function getMangaFilterSchema(): Promise<MangaFilterSchema> {
  const payload = await mangaGet<any>("/filters/schema");

  if (payload && typeof payload === "object" && Array.isArray(payload?.facets) && Array.isArray(payload?.sorts)) {
    return payload as MangaFilterSchema;
  }

  if (payload && typeof payload === "object" && payload?.schema) {
    const schema = payload.schema;
    if (Array.isArray(schema?.facets) && Array.isArray(schema?.sorts)) {
      return schema as MangaFilterSchema;
    }
  }

  return EMPTY_MANGA_FILTER_SCHEMA;
}

export async function getMangaFilterCounts(rawQuery: string): Promise<MangaFilterCounts> {
  const query = toSafeString(rawQuery);
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }

  const suffix = params.toString();
  const payload = await mangaGet<any>(suffix ? `/filters/counts?${suffix}` : "/filters/counts");

  if (payload && typeof payload === "object" && Array.isArray(payload?.groups)) {
    return payload as MangaFilterCounts;
  }

  if (payload && typeof payload === "object" && payload?.counts && Array.isArray(payload.counts?.groups)) {
    return payload.counts as MangaFilterCounts;
  }

  return EMPTY_MANGA_FILTER_COUNTS(query);
}

export async function getMangaDetail(
  id: string,
  options: MangaRequestControlOptions = {}
): Promise<MangaDetailResponse> {
  return mangaGet(buildMangaPath(`/${encodeURIComponent(id)}`, undefined, options));
}

export async function getMangaChapters(
  id: string,
  providers?: string,
  language?: string,
  options: MangaRequestControlOptions = {}
): Promise<MangaChapterResponse> {
  const params = new URLSearchParams();
  if (providers) params.set('providers', providers);
  if (language) params.set('language', language);

  return mangaGet(buildMangaPath(`/${encodeURIComponent(id)}/chapters`, params, options));
}

export async function getMangaReadByKey(
  id: string,
  chapterKey: string,
  options: MangaRequestControlOptions = {}
): Promise<MangaReadResponse> {
  // The shared API client can unwrap { success, data } envelopes.
  // Normalize both wrapped and unwrapped shapes for the reader page.
  const payload = await mangaGet<MangaReadResponse | NonNullable<MangaReadResponse["data"]>>(
    buildMangaPath(`/${encodeURIComponent(id)}/read/${encodeURIComponent(chapterKey)}`, undefined, options)
  );

  if (
    payload &&
    typeof payload === "object" &&
    "chapter" in payload &&
    "pages" in payload &&
    !("data" in payload)
  ) {
    return {
      success: true,
      data: payload as NonNullable<MangaReadResponse["data"]>,
    };
  }

  return payload as MangaReadResponse;
}

export async function getMangaProviders(): Promise<{
  success?: boolean;
  providers?: {
    mapper?: string[];
    passthrough?: string[];
  };
  rewriteBase?: string;
}> {
  return mangaGet(buildMangaPath(`/providers`, undefined, { forceFresh: true }));
}
