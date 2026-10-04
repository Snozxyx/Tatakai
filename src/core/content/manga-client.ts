import type {
  MangaChapterResponse,
  MangaDetailResponse,
  MangaReadResponse,
  MangaSearchItem,
  MangaSearchResult,
  MappedMangaChapter,
  MangaChapterSource,
} from "@/types/manga";
import type {
  MangaFeedSection,
  MangaHomeBundle,
  MangaSectionsPage,
  TatakaiMedia,
} from "./types";
import {
  readCachedItemsSync,
  hydrateCachedItems,
  writeCachedItems,
  MANGA_CHAPTERS_TTL_MS,
} from "@/lib/cache/extensionResultCache";
import { isCapacitor } from "@/lib/platform/platform";

/** Cache-key builder shared by the client + the query hook's placeholder. */
export function mangaChaptersCacheKey(id: string, providers?: string, language?: string): string {
  return `manga-chapters::${String(id || "")}::${providers || ""}::${language || ""}`;
}

/** Stable identity for a mapped chapter: chapter number when present, else its canonical order. */
function chapterIdentity(c: MappedMangaChapter): string {
  return c?.chapterNumber != null ? `n:${c.chapterNumber}` : `o:${c?.canonicalOrder ?? "?"}`;
}

/**
 * Per-source identity within a chapter. Includes the scanlator so distinct
 * scanlation groups of the same provider+language coexist (multi-language AND
 * multi-group sources survive the union merge) — without it, alternate groups
 * collapse into one and the reader loses same-chapter fallback candidates.
 */
function sourceIdentity(s: MangaChapterSource): string {
  return `${s?.provider || ""}::${s?.language || ""}::${s?.scanlator || ""}`;
}

/**
 * Union-merge freshly-merged chapters with a persisted cache, FRESH-AUTHORITATIVE.
 * - A chapter/provider-source present in `fresh` overwrites the cached copy (so a
 *   provider whose source rotated/changed is updated — never the stale one).
 * - Chapters (and per-chapter provider-sources) present ONLY in the cache are
 *   re-added (no-drop guarantee: a provider momentarily down never shrinks the
 *   list). Additive only.
 */
function unionMappedChapters(
  fresh: MappedMangaChapter[],
  cached: MappedMangaChapter[],
): MappedMangaChapter[] {
  const cachedById = new Map<string, MappedMangaChapter>();
  for (const c of cached || []) cachedById.set(chapterIdentity(c), c);

  const seen = new Set<string>();
  const out: MappedMangaChapter[] = [];

  const unionSources = (
    freshSrc: MangaChapterSource[],
    cachedSrc: MangaChapterSource[],
  ): MangaChapterSource[] => {
    const merged: MangaChapterSource[] = [];
    const sSeen = new Set<string>();
    for (const s of freshSrc || []) {
      const k = sourceIdentity(s);
      if (sSeen.has(k)) continue;
      sSeen.add(k);
      merged.push(s);
    }
    for (const s of cachedSrc || []) {
      const k = sourceIdentity(s);
      if (sSeen.has(k)) continue; // fresh wins per provider
      sSeen.add(k);
      merged.push(s);
    }
    return merged;
  };

  for (const f of fresh || []) {
    const id = chapterIdentity(f);
    seen.add(id);
    const prior = cachedById.get(id);
    if (!prior) {
      out.push(f);
      continue;
    }
    // Fresh chapter authoritative; fill only source-providers it lacks + any
    // Kitsu enrichment fields the fresh copy is missing.
    out.push({
      ...prior,
      ...f,
      sources: unionSources(f.sources || [], prior.sources || []),
      published: f.published ?? prior.published ?? null,
      pageCount: f.pageCount ?? prior.pageCount ?? null,
      thumbnail: f.thumbnail ?? prior.thumbnail ?? null,
      synopsis: f.synopsis ?? prior.synopsis ?? null,
      volume: f.volume ?? prior.volume ?? null,
      kitsuId: f.kitsuId ?? prior.kitsuId,
    });
  }

  // Re-add cache-only chapters (no-drop guarantee).
  for (const c of cached || []) {
    const id = chapterIdentity(c);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }

  out.sort((a, b) => {
    const ao = a?.canonicalOrder ?? a?.chapterNumber ?? 0;
    const bo = b?.canonicalOrder ?? b?.chapterNumber ?? 0;
    return ao - bo;
  });
  return out;
}


export type MangaSearchOptions = {
  requiresQuery?: boolean;
  adult?: boolean;
  mode?: MangaSearchMode;
  provider?: MangaSearchProvider;
  genre?: string;
  tags?: string[];
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

/**
 * Origin to resolve `/api/v3/manga/…` paths against. Same rationale as
 * content-graph: on the web the page origin is correct (same-origin proxy); in
 * the packaged desktop app the renderer runs from `file://`, so fall back to the
 * explicit absolute backend origin instead of `file:///api/v3/…`.
 */
function resolveApiOrigin(): string {
  // Capacitor's origin is the WebView scheme (`https://localhost` /
  // `capacitor://`), not the backend — skip straight to the explicit origin.
  if (
    typeof window !== 'undefined' &&
    /^https?:$/i.test(window.location.protocol) &&
    !isCapacitor()
  ) {
    return window.location.origin;
  }
  const explicit = String(import.meta.env.VITE_BACKEND_ORIGIN || '').trim();
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, '');
  const apiUrl = String(import.meta.env.VITE_TATAKAI_API_URL || '').trim();
  try {
    if (apiUrl) return new URL(apiUrl).origin;
  } catch {
    /* fall through */
  }
  return 'https://api.tatakai.me';
}

async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, resolveApiOrigin());
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

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = new URL(path, resolveApiOrigin());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

/**
 * Report a manga's discovered total chapter count to the mirror ("Tiger DB").
 *
 * Chapters are scraped client-side, so the backend only learns the real total
 * when the reader sends it here. The server bump is upward-only, so calling this
 * whenever a chapter list loads is safe (and cheap — one small POST). Best-effort:
 * failures are swallowed so this never disrupts reading. `mangaId` may be a bare
 * numeric AniList id or an `anilist:`/`mal:` id — the route resolves all three.
 */
export async function storeMangaTotalChapters(mangaId: string, total: number): Promise<void> {
  const id = String(mangaId || "").trim();
  if (!id || !Number.isFinite(total) || total <= 0) return;
  try {
    await apiPost(`/api/v3/manga/${encodeURIComponent(id)}/total-chapters`, {
      total: Math.floor(total),
    });
  } catch {
    /* best-effort; scraped totals are non-critical metadata */
  }
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
    tags: options.tags?.join(','),
    sort: options.sort,
    origin: options.origin,
    type: options.mangaType || options.types?.[0],
    minYear: options.minYear,
    minScore: options.minScore,
  });
  const getMangaType = (media: any) => {
    const fmt = String(media?.format || "").toUpperCase();
    if (fmt === "NOVEL" || fmt === "LIGHT_NOVEL") return "novel";
    if (media?.format === "OEL") return "comics";
    if (media?.countryOfOrigin === "KR") return "manhwa";
    if (media?.countryOfOrigin === "CN") return "manhua";
    return "manga";
  };
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
      type: getMangaType(media),
      // Raw AniList format (MANGA/MANHWA/MANHUA/OEL/ONE_SHOT/NOVEL) so callers can
      // classify the reading track precisely (e.g. tell novels from manga).
      format: media?.format ?? null,
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
      // Raw AniList format (MANGA/MANHWA/MANHUA/OEL/ONE_SHOT/NOVEL) — used to
      // classify the reading track for ranks. Falls back to media.type.
      format: media?.format || media?.type || null,
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
      // Provenance + raw columns for the admin editor and "in DB" badge.
      tatakaiId: media?.tatakaiId ?? null,
      sourceApi: media?.source_api ?? null,
      inDb: media?.source_api === "tatakai" || Boolean(media?.tatakaiId),
      bannerImage: media?.bannerImage ?? null,
      coverImageMedium: media?.coverImageMedium ?? null,
      meanScore: media?.meanScore ?? null,
      favourites: media?.favourites ?? null,
      rating: media?.rating ?? null,
      trailerUrl: media?.trailerUrl ?? null,
    },
  };
}

export async function getMangaChapters(id: string, _providers?: string, _language?: string): Promise<MangaChapterResponse> {
  const normalizedId = encodeURIComponent(String(id || ""));
  const base = await apiGet<MangaChapterResponse>(`/api/v3/manga/${normalizedId}/chapters`);

  const cacheKey = mangaChaptersCacheKey(id, _providers, _language);

  let merged: MangaChapterResponse = base;
  try {
    const { fetchExtensionMangaChapters, mergeChaptersWithExtensions } = await import(
      "@/core/content/manga-extension-runtime"
    );
    const anilistId = Number(String(id).replace(/^anilist:/i, ""));
    const extensionPayload = await fetchExtensionMangaChapters({
      anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
      title: undefined,
    });
    merged = mergeChaptersWithExtensions(base, extensionPayload);
  } catch {
    merged = base;
  }

  // Union-merge with the persisted cache (fresh-authoritative). Guarantees a
  // weaker refetch (a provider momentarily down) never *drops* previously-seen
  // chapters/sources, while a provider that re-responds with a changed source
  // updates in place. Fully non-fatal — any failure returns `merged` unchanged.
  try {
    const cachedFromMem = readCachedItemsSync<MappedMangaChapter>(cacheKey);
    const cached = cachedFromMem ?? (await hydrateCachedItems<MappedMangaChapter>(cacheKey)) ?? [];
    const unioned = unionMappedChapters(merged.mappedChapters || [], cached);

    // Recompute providersAvailable as the union across the merged chapters'
    // sources plus whatever the fresh response already advertised.
    const providers = new Set<string>((merged as any).providersAvailable || []);
    for (const c of unioned) for (const s of c.sources || []) if (s?.provider) providers.add(s.provider);

    writeCachedItems(cacheKey, unioned, MANGA_CHAPTERS_TTL_MS);

    return {
      ...merged,
      mappedChapters: unioned,
      ...(providers.size ? ({ providersAvailable: Array.from(providers) } as any) : {}),
    };
  } catch {
    return merged;
  }
}

export async function getMangaReadByKey(
  id: string,
  chapterKey: string,
  options?: {
    provider?: string;
    providerChapterId?: string;
    alternatives?: Array<{ provider: string; chapterKey: string; providerChapterId?: string }>;
  },
): Promise<MangaReadResponse> {
  const isNative =
    typeof window !== "undefined" &&
    Boolean(
      (window as any).electron ||
        (window as any).tatakaiRuntime ||
        (window as any).tatakaiMobileExtensions,
    );

  // ── Offline-first: if this chapter (or any of its alternative source keys) has
  // been downloaded, serve the local pages via tatakai-media:// instead of the
  // extension host. This is also the ONLY working path when the app is offline.
  const anilistIdNum = Number(String(id).replace(/^anilist:/i, ""));

  // ── Mobile offline-first: serve downloaded pages from app storage ──────────
  // Capacitor has no `window.electron.manga`; downloaded chapters live in Dexie
  // (offlineChapters) with page images on the filesystem, served via
  // Capacitor.convertFileSrc. This is also the only working path offline.
  if (isCapacitor() && Number.isFinite(anilistIdNum)) {
    const candidateKeys = [
      chapterKey,
      ...(options?.alternatives || []).map((a) => a.chapterKey),
    ].filter(Boolean);
    try {
      const { db } = await import("@/core/db/tatakai-db");
      let matchedKey: string | null = null;
      for (const key of candidateKeys) {
        const row = await db.offlineChapters.get(`${anilistIdNum}:${key}`);
        if (row) {
          matchedKey = key;
          break;
        }
      }
      if (matchedKey) {
        const { getOfflineMangaPagesMobile } = await import(
          "@/core/download/mobile/mobileMangaDownloader"
        );
        const localPages = await getOfflineMangaPagesMobile(anilistIdNum, matchedKey);
        if (localPages.length) {
          return {
            success: true,
            data: {
              pages: localPages.map((p) => ({
                pageNumber: p.pageNumber,
                imageUrl: p.imageUrl,
                proxiedImageUrl: null,
                width: null,
                height: null,
              })),
              chapter: {
                chapterKey: matchedKey,
                anilistId: anilistIdNum,
                provider: "tatakai_offline",
                providerChapterId: matchedKey,
                number: null,
                title: null,
                language: null,
              },
              readMeta: {
                provider: "tatakai_offline",
                fallbackUsed: false,
                fetchedAt: new Date().toISOString(),
              },
            },
          };
        }
      }
    } catch {
      /* offline lookup best-effort; fall through to the extension runtime */
    }
  }

  if (
    isNative &&
    Number.isFinite(anilistIdNum) &&
    (window as any).electron?.manga?.getOfflinePages
  ) {
    const candidateKeys = [
      chapterKey,
      ...(options?.alternatives || []).map((a) => a.chapterKey),
    ].filter(Boolean);
    try {
      const { db } = await import("@/core/db/tatakai-db");
      let matchedKey: string | null = null;
      for (const key of candidateKeys) {
        const row = await db.offlineChapters.get(`${anilistIdNum}:${key}`);
        if (row) {
          matchedKey = key;
          break;
        }
      }
      if (matchedKey) {
        const res = await (window as any).electron.manga.getOfflinePages({
          anilistId: anilistIdNum,
          chapterKey: matchedKey,
        });
        if (res?.success && Array.isArray(res.pages) && res.pages.length) {
          // Serve pages over the local HTTP stream server (the exact path anime
          // downloads use) rather than the tatakai-media:// custom protocol
          // directly. Chromium loads http://127.0.0.1:PORT/stream/… without the
          // Windows drive-letter canonicalization that breaks a raw
          // `tatakai-media:///C:/…` URL in <img src>. Falls back to the raw
          // media URL if the stream server is unavailable.
          const streamLocalFile = (window as any).electron?.streamLocalFile;
          const pages = await Promise.all(
            res.pages.map(async (p: any) => {
              const raw = String(p.imageUrl || "");
              let imageUrl = raw;
              if (streamLocalFile && raw.startsWith("tatakai-media://")) {
                try {
                  const r = await streamLocalFile(raw);
                  if (r?.success && r.url) imageUrl = String(r.url);
                } catch {
                  /* keep the raw media URL */
                }
              }
              return {
                pageNumber: Number(p.pageNumber) || 0,
                imageUrl,
                proxiedImageUrl: null,
                width: null,
                height: null,
              };
            }),
          );
          return {
            success: true,
            data: {
              pages,
              chapter: {
                chapterKey: matchedKey,
                anilistId: anilistIdNum,
                provider: "tatakai_offline",
                providerChapterId: matchedKey,
                number: typeof res.chapterNumber === "number" ? res.chapterNumber : null,
                title: typeof res.title === "string" ? res.title : null,
                language: null,
              },
              readMeta: {
                provider: "tatakai_offline",
                fallbackUsed: false,
                fetchedAt: new Date().toISOString(),
              },
            },
          };
        }
      }
    } catch {
      /* offline lookup is best-effort; fall through to the extension runtime */
    }
  }

  // "If no id then fall back to another scanlator": when the caller has no usable
  // provider/id for this chapter (e.g. a deep link that dropped them), promote the
  // first known source to the primary so the read still reaches the runtime — the
  // remaining sources stay as fallbacks.
  let provider = options?.provider;
  let effKey = chapterKey;
  let providerChapterId = options?.providerChapterId;
  if ((!provider || provider === "") && options?.alternatives?.length) {
    const first = options.alternatives[0];
    provider = first.provider;
    effKey = first.chapterKey || chapterKey;
    providerChapterId = first.providerChapterId || providerChapterId;
  }

  if (isNative && provider && provider !== "tatakai_media") {
    const { fetchExtensionMangaPages } = await import("@/core/content/manga-extension-runtime");
    const anilistId = Number(String(id).replace(/^anilist:/i, ""));
    return fetchExtensionMangaPages({
      extensionId: provider,
      chapterKey: effKey,
      providerChapterId,
      anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
      alternatives: options?.alternatives,
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
 * Fetch trending manhua (Chinese) — separate query for the manhua row.
 */
export async function getTrendingManhua(limit = 12): Promise<MangaCard[]> {
  try {
    const rows = await apiGet<any[]>("/api/v3/manga/search", {
      mode: "popular",
      perPage: limit,
      sort: "POPULARITY_DESC",
      origin: "cn",
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

// ─── Server-assembled hub feeds ──────────────────────────────────────────────
// `/manga/home` and `/manga/sections` replace the fan-out of `/manga/search`
// calls the hub used to make. Both are cached and de-duplicated upstream, and
// both return light card records with no mapping writes on the read path.

/**
 * `TatakaiMedia` → `MangaSearchItem`.
 *
 * The hub's cards are all built from `MangaSearchItem` (`toUnifiedMangaCard`,
 * `IndexMangaShowcase.toMangaCard`, `inferMangaAdultFlag`), so translating at the
 * boundary means none of those call sites change.
 */
export function mediaToMangaSearchItem(m: TatakaiMedia): MangaSearchItem {
  const origin = String(m.countryOfOrigin || "").toUpperCase();
  const mediaType: MangaSearchItem["mediaType"] =
    origin === "KR" ? "manhwa" : origin === "CN" || origin === "TW" ? "manhua" : "manga";

  return {
    id: m.anilistId ? String(m.anilistId) : m.malId ? `mal:${m.malId}` : "",
    mediaType,
    anilistId: m.anilistId,
    malId: m.malId,
    canonicalTitle: m.titleEnglish || m.titleRomaji || m.titleNative || "Untitled",
    title: { romaji: m.titleRomaji, english: m.titleEnglish, native: m.titleNative },
    poster: m.coverImageLarge || m.coverImageMedium || null,
    status: m.status || "unknown",
    year: m.startDate?.year ?? null,
    score: m.averageScore ?? null,
    popularity: m.popularity ?? null,
    providersAvailable: [],
    matchConfidence: 1,
    adult: Boolean(m.isAdult),
    chapters: m.chapters ?? null,
    volumes: m.volumes ?? null,
    originLanguage: m.countryOfOrigin ?? null,
    readingDirection: "unknown",
  };
}

function mapLane(lane: TatakaiMedia[] | undefined): MangaSearchItem[] {
  return (Array.isArray(lane) ? lane : []).map(mediaToMangaSearchItem).filter((item) => item.id);
}

/** Every lane of `MangaHomeBundle`, already in `MangaSearchItem` shape. */
export type MangaHomeFeed = {
  [K in Exclude<keyof MangaHomeBundle, "genres" | "fetchedAt">]: MangaSearchItem[];
} & {
  genres: string[];
  fetchedAt: number;
};

/** One shelf of the endless feed, with the icon still a lucide *name*. */
export type MangaFeedShelf = Omit<MangaFeedSection, "items"> & { items: MangaSearchItem[] };

export type MangaSectionsFeed = {
  page: number;
  sections: MangaFeedShelf[];
  hasNextPage: boolean;
  totalPages: number;
};

const EMPTY_HOME_FEED: MangaHomeFeed = {
  spotlight: [], trending: [], popular: [], topRated: [], newChapters: [],
  manhwa: [], manhua: [], adultLatest: [], adultPopular: [],
  genres: [], fetchedAt: 0,
};

/**
 * The whole top of `/manga` in one request.
 *
 * `adult` opts into the mature lanes; it maps to a separate cache key server-side
 * rather than a flag on the shared one.
 */
export async function getMangaHome(adult = false): Promise<MangaHomeFeed> {
  const bundle = await apiGet<MangaHomeBundle>("/api/v3/manga/home", {
    adult: adult ? 1 : undefined,
  });
  if (!bundle || typeof bundle !== "object") return EMPTY_HOME_FEED;

  return {
    spotlight: mapLane(bundle.spotlight),
    trending: mapLane(bundle.trending),
    popular: mapLane(bundle.popular),
    topRated: mapLane(bundle.topRated),
    newChapters: mapLane(bundle.newChapters),
    manhwa: mapLane(bundle.manhwa),
    manhua: mapLane(bundle.manhua),
    adultLatest: mapLane(bundle.adultLatest),
    adultPopular: mapLane(bundle.adultPopular),
    genres: Array.isArray(bundle.genres) ? bundle.genres : [],
    fetchedAt: bundle.fetchedAt ?? Date.now(),
  };
}

/**
 * One scroll page of the endless feed — four shelves, one request.
 *
 * The shelf list, its order and its filters all live server-side; the client only
 * asks for a page number.
 */
export async function getMangaSections(page = 1, adult = false): Promise<MangaSectionsFeed> {
  const data = await apiGet<MangaSectionsPage>("/api/v3/manga/sections", {
    page,
    adult: adult ? 1 : undefined,
  });

  const sections = Array.isArray(data?.sections) ? data.sections : [];
  return {
    page: data?.page ?? page,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      genre: section.genre,
      layout: section.layout,
      icon: section.icon,
      items: mapLane(section.items),
    })),
    hasNextPage: Boolean(data?.hasNextPage),
    totalPages: data?.totalPages ?? page,
  };
}

export type MangaSectionItemsPage = {
  id: string;
  title: string;
  layout: string;
  icon: string;
  genre: string;
  page: number;
  perPage: number;
  items: MangaSearchItem[];
  hasNextPage: boolean;
  totalPages: number;
};

/** Fetch per-section items for infinite scroll within a genre shelf. */
export async function getMangaSectionItems(
  sectionId: string,
  page = 1,
  options: { adult?: boolean; perPage?: number } = {},
): Promise<MangaSectionItemsPage | null> {
  const data = await apiGet<MangaSectionItemsPage>(`/api/v3/manga/sections/${sectionId}`, {
    page,
    adult: options.adult ? 1 : undefined,
    perPage: options.perPage,
  });

  if (!data?.items) return null;

  return {
    id: data.id,
    title: data.title,
    layout: data.layout || "grid",
    icon: data.icon || "",
    genre: data.genre || "",
    page: data.page ?? page,
    perPage: data.perPage ?? 24,
    items: mapLane(data.items as any[]),
    hasNextPage: Boolean(data.hasNextPage),
    totalPages: data.totalPages,
  };
}