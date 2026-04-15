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
  | "added"
  | "new-chap"
  | "category"
  | "genre"
  | "author"
  | "explore";

export type MangaSearchProvider = "mapped" | "atsu" | "mangafire" | "mangaball" | "all";

export interface MangaSearchOptions {
  mode?: MangaSearchMode;
  provider?: MangaSearchProvider;
  category?: string;
  genre?: string;
  language?: string;
  author?: string;
  adult?: boolean;
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

type ConcreteProvider = Exclude<MangaSearchProvider, "all">;

const KNOWN_MANGA_PROVIDERS: ConcreteProvider[] = ["mapped", "atsu", "mangafire", "mangaball"];

const toSafeString = (value: unknown) => String(value ?? "").trim();

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
    poster: item?.thumbnail || null,
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
  if (provider === "mangaball") return Array.isArray(payload?.data) ? payload.data : [];
  return [];
};

const mapProviderRows = (provider: ConcreteProvider, rows: any[]): MangaSearchItem[] => {
  if (provider === "mapped") return rows.map(mapUnifiedSearchItem);
  if (provider === "atsu") return rows.map(mapAtsuItem);
  if (provider === "mangafire") return rows.map(mapMangaFireItem);
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

  return rowCount >= limit;
};

const isRemoteProvider = (value: string): value is MangaSearchProvider =>
  ["mapped", "atsu", "mangafire", "mangaball", "all"].includes(value);

const normalizeCategory = (value: unknown) => {
  const normalized = toSafeString(value).toLowerCase();
  if (normalized === "manwha" || normalized === "manwah") return "manhwa";
  return normalized;
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

  if (mode === "search") {
    if (!query.trim()) return null;
    return `/mangaball/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
  }
  if (mode === "latest") return `/mangaball/latest?page=${page}&limit=${limit}`;
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

const resolveProviders = (mode: MangaSearchMode, provider: MangaSearchProvider): ConcreteProvider[] => {
  if (provider !== "all") {
    const normalizedProvider = toSafeString(provider).toLowerCase();
    if (KNOWN_MANGA_PROVIDERS.includes(normalizedProvider as ConcreteProvider)) {
      return [normalizedProvider as ConcreteProvider];
    }
    return ["mapped"];
  }

  if (mode === "latest") return ["mangafire", "mangaball", "atsu"];
  if (mode === "added" || mode === "new-chap") return ["mangaball"];
  if (mode === "author") return ["atsu"];
  if (mode === "genre") return ["atsu", "mangafire"];
  if (mode === "category" || mode === "explore") return ["atsu", "mangaball", "mangafire"];
  if (mode === "search") return ["mapped", "atsu", "mangafire", "mangaball"];
  return ["mapped"];
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

export async function getMangaDetail(
  id: string
): Promise<MangaDetailResponse> {
  return mangaGet(`/${encodeURIComponent(id)}`);
}

export async function getMangaChapters(
  id: string,
  providers?: string,
  language?: string
): Promise<MangaChapterResponse> {
  const params = new URLSearchParams();
  if (providers) params.set('providers', providers);
  if (language) params.set('language', language);
  
  const queryString = params.toString();
  const suffix = queryString ? `?${queryString}` : '';
  
  return mangaGet(`/${encodeURIComponent(id)}/chapters${suffix}`);
}

export async function getMangaReadByKey(
  id: string,
  chapterKey: string
): Promise<MangaReadResponse> {
  // The shared API client can unwrap { success, data } envelopes.
  // Normalize both wrapped and unwrapped shapes for the reader page.
  const payload = await mangaGet<MangaReadResponse | NonNullable<MangaReadResponse["data"]>>(
    `/${encodeURIComponent(id)}/read/${encodeURIComponent(chapterKey)}`
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

export async function getMangaProviders(): Promise<{ success: boolean; data: string[] }> {
  return mangaGet(`/providers`);
}
