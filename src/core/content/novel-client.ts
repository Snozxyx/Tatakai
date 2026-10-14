/**
 * Novel client — text-chapter twin of `manga-client.ts`.
 *
 * - Search/detail/home metadata: AniList MANGA/NOVEL via `/api/v3/manga/*`
 *   (novels live in the same AniList type; `format: NOVEL` distinguishes them).
 * - Chapters/content: Toko novel providers via `novel-extension-runtime`
 *   (desktop/mobile extension host), with the same reliability-ordered
 *   cross-source fallback the manga reader uses.
 */
import type {
  NovelChapterResponse,
  NovelContentResponse,
  NovelSearchItem,
  NovelSearchResult,
  MappedNovelChapter,
} from '@/types/novel';
import { ANILIST_GRAPHQL_ENDPOINT, resolveBackendOrigin } from '@/lib/api/backendOrigin';
import { getMangaTagOptions, searchMangaTags } from './manga-tag-search';

export type { NovelSearchItem, NovelSearchResult, MappedNovelChapter, NovelChapterResponse, NovelContentResponse };

export type NovelSearchOptions = {
  genre?: string;
  tags?: string[];
  tagSource?: 'anilist' | 'mangabaka';
  statuses?: string[];
  sort?: string;
  origin?: string;
  minYear?: number;
  minScore?: number;
  maxYear?: number;
  maxScore?: number;
  adult?: boolean;
};

function resolveApiOrigin(): string {
  return resolveBackendOrigin() || 'https://api.tatakai.me';
}

async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, resolveApiOrigin());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

const isNovelFormat = (media: any) => {
  const fmt = String(media?.format || media?.type || '').toUpperCase();
  return fmt === 'NOVEL' || fmt === 'LIGHT_NOVEL';
};

function rowToNovelItem(media: any): NovelSearchItem | null {
  const m = media?.media ?? media;
  if (!m) return null;
  // Novel lanes only: skip image-chapter formats when the backend mixes them in.
  if (m.format && !isNovelFormat(m)) return null;
  const id = m?.anilistId
    ? String(m.anilistId)
    : m?.malId
      ? `mal:${m.malId}`
      : m?.tatakaiId
        ? String(m.tatakaiId)
        : '';
  const title = m?.titleEnglish || m?.titleRomaji || m?.titleNative;
  if (!id || !title) return null;
  return {
    id,
    mediaType: 'novel',
    anilistId: m?.anilistId,
    malId: m?.malId,
    canonicalTitle: title,
    title: { romaji: m?.titleRomaji, english: m?.titleEnglish, native: m?.titleNative },
    poster: m?.coverImageLarge || m?.coverImageMedium || null,
    banner: m?.bannerImage,
    description: m?.description,
    status: m?.status || 'unknown',
    year: m?.startDate?.year ?? null,
    score: m?.averageScore ?? null,
    popularity: m?.popularity ?? null,
    providersAvailable: [],
    matchConfidence: 1,
    adult: Boolean(m?.isAdult),
    chapters: m?.chapters ?? null,
    volumes: m?.volumes ?? null,
    originLanguage: m?.countryOfOrigin ?? null,
    readingDirection: 'unknown',
  };
}

export async function searchNovels(
  query: string,
  page = 1,
  limit = 20,
  options: NovelSearchOptions = {},
): Promise<NovelSearchResult> {
  // Preserve the taxonomy of links from MangaBaka metadata. Sending these
  // names to AniList can silently return an empty catalog.
  if (options.tags?.length && options.tagSource === 'mangabaka') {
    const catalog = await searchMangaTags(query, page, limit, {
      ...options, mangaType: 'novel', tagSource: 'mangabaka',
    });
    return { ...catalog, results: catalog.results.map(item => ({ ...item, mediaType: 'novel' as const })) };
  }
  const taxonomy = options.tags?.length ? await getMangaTagOptions('anilist') : [];
  const tags = options.tags?.map(name => {
    const normalized = name.trim().toLowerCase() === 'regression' ? 'age regression' : name.trim().toLowerCase();
    const tag = taxonomy.find(tag => tag.name.toLowerCase() === normalized);
    if (!tag) throw new Error(`“${name}” is not an AniList tag. Choose a tag from the novel filters.`);
    return tag.name;
  });
  const statuses: Record<string, string> = {
    ongoing: 'RELEASING', completed: 'FINISHED', hiatus: 'HIATUS',
    cancelled: 'CANCELLED', unreleased: 'NOT_YET_RELEASED',
  };
  const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      // Novel/tag browsing needs the complete catalog rather than the local mirror.
      forceUpstream: true,
      query: `query NovelSearch($page: Int, $perPage: Int, $search: String, $genre: String, $tags: [String], $statuses: [MediaStatus], $sort: [MediaSort], $origin: CountryCode, $adult: Boolean, $minDate: FuzzyDateInt, $maxDate: FuzzyDateInt, $minScore: Int, $maxScore: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { currentPage lastPage hasNextPage total }
          media(type: MANGA, format: NOVEL, search: $search, genre: $genre, tag_in: $tags, status_in: $statuses, sort: $sort, countryOfOrigin: $origin, isAdult: $adult, startDate_greater: $minDate, startDate_lesser: $maxDate, averageScore_greater: $minScore, averageScore_lesser: $maxScore) {
            id idMal title { romaji english native } coverImage { large } bannerImage description
            format status startDate { year } averageScore popularity isAdult chapters volumes countryOfOrigin
          }
        }
      }`,
      variables: {
        page, perPage: limit, search: query.trim() || undefined,
        genre: options.genre, tags,
        statuses: options.statuses?.map(status => statuses[status] || status),
        sort: [options.sort || (query.trim() ? 'SEARCH_MATCH' : 'POPULARITY_DESC')],
        origin: options.origin, adult: options.adult ? undefined : false,
        minDate: options.minYear ? options.minYear * 10000 : undefined,
        maxDate: options.maxYear ? (options.maxYear + 1) * 10000 : undefined,
        minScore: options.minScore ? Math.round(options.minScore * 10) - 1 : undefined,
        maxScore: options.maxScore ? Math.round(options.maxScore * 10) + 1 : undefined,
      },
    }),
  });
  if (!response.ok) throw new Error(`Novel catalog could not be reached (${response.status}). Please retry.`);
  const payload = await response.json();
  if (payload.errors?.length || !payload.data?.Page) {
    throw new Error(payload.errors?.[0]?.message || 'Novel catalog returned no data. Please retry.');
  }
  const { media, pageInfo } = payload.data.Page;
  const results = (media as any[])
    .map(m => ({ ...m, anilistId: m.id, malId: m.idMal,
      titleEnglish: m.title?.english, titleRomaji: m.title?.romaji, titleNative: m.title?.native,
      coverImageLarge: m.coverImage?.large }))
    .map(rowToNovelItem)
    .filter((r): r is NovelSearchItem => Boolean(r));
  return {
    query,
    page,
    limit,
    partial: payload.extensions?.partial === true,
    failedProviders: payload.extensions?.partial === true ? ['anilist-upstream'] : [],
    results,
    currentPage: pageInfo.currentPage,
    totalPages: pageInfo.lastPage,
    total: pageInfo.total,
    hasNextPage: pageInfo.hasNextPage,
    source: 'anilist',
  };
}

export async function getNovelDetail(id: string) {
  const normalizedId = String(id || '');
  let row: any;
  if (normalizedId.startsWith('anilist:')) {
    row = await apiGet<any>(`/api/v3/manga/by-anilist/${normalizedId.replace('anilist:', '')}`);
  } else {
    const raw = Number(normalizedId);
    row = Number.isFinite(raw)
      ? await apiGet<any>(`/api/v3/manga/by-anilist/${raw}`)
      : await apiGet<any>(`/api/v3/manga/${encodeURIComponent(normalizedId)}`);
  }
  const media = row?.media ?? row;
  return {
    id,
    detail: {
      mediaType: 'novel' as const,
      anilistId: media?.anilistId,
      malId: media?.malId,
      canonicalTitle: media?.titleEnglish || media?.titleRomaji || media?.titleNative || 'Untitled',
      title: {
        romaji: media?.titleRomaji,
        english: media?.titleEnglish,
        native: media?.titleNative,
        synonyms: media?.synonyms || [],
      },
      status: media?.status || 'unknown',
      genres: media?.genres || [],
      format: media?.format || 'NOVEL',
      origin: media?.countryOfOrigin || null,
      originLanguage: media?.countryOfOrigin || null,
      adult: Boolean(media?.isAdult),
      yearStart: media?.startDate?.year ?? null,
      yearEnd: media?.endDate?.year ?? null,
      score: media?.averageScore ?? null,
      popularity: media?.popularity ?? null,
      coverImage: media?.coverImageLarge || media?.coverImageMedium || null,
      bannerImage: media?.bannerImage ?? null,
      synopsis: media?.description || null,
      authors: media?.authors || [],
      artists: media?.artists || [],
      totalChapters: media?.chapters || null,
      totalVolumes: media?.volumes || null,
      characters: media?.characters || [],
      staff: media?.staff || [],
      relations: media?.relations || [],
      externalLinks: media?.externalLinks || [],
      tatakaiId: media?.tatakaiId ?? null,
      inDb: Boolean(media?.tatakaiId),
    },
  };
}

export async function getNovelChapters(id: string, title?: string, titles?: string[], options: {fullScan?:boolean} = {}): Promise<NovelChapterResponse> {
  const anilistId = Number(String(id).replace(/^anilist:/i, ''));
  const { fetchExtensionNovelChapters } = await import('@/core/content/novel-extension-runtime');
  const payload = await fetchExtensionNovelChapters({
    anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
    title,
    titles,
    fullScan: options.fullScan,
  }).catch(() => ({ chapters: [], providersAvailable: [], failedProviders: [], pending: false }));
  const mappedChapters: MappedNovelChapter[] = (payload.chapters || []).map((c: any, idx: number) => ({
    chapterNumber: c.number ?? null,
    chapterTitle: c.title ?? (c.number != null ? `Chapter ${c.number}` : 'Chapter'),
    volume: c.volume ?? null,
    canonicalOrder: idx,
    sources: (c.sources || []).map((s: any) => ({
      provider: s.provider,
      providerName: s.providerName,
      chapterKey: s.chapterKey,
      providerChapterId: s.providerChapterId,
      language: s.language ?? null,
      translator: s.translator ?? null,
      releaseDate: s.releaseDate ?? null,
    })),
  }));
  return {
    anilistId: Number.isFinite(anilistId) ? anilistId : 0,
    partial: (payload.failedProviders || []).length > 0,
    sourcesPending: Boolean(payload.pending),
    failedProviders: payload.failedProviders || [],
    mappedChapters,
    providersAvailable: payload.providersAvailable || [],
  };
}

export async function getNovelContentByKey(
  id: string,
  chapterKey: string,
  options?: {
    provider?: string;
    providerChapterId?: string;
    alternatives?: Array<{ provider: string; chapterKey: string; providerChapterId?: string }>;
    offlineOnly?: boolean;
  },
): Promise<NovelContentResponse> {
  const anilistId = Number(String(id).replace(/^anilist:/i, ''));

  // ── Offline-first: a downloaded chapter serves straight from this device's
  // Dexie store — the ONLY working path with no backend, and instant otherwise.
  {
    const candidateKeys = [
      chapterKey,
      ...(options?.alternatives || []).map((a) => a.chapterKey),
    ].filter(Boolean);
    try {
      const { db } = await import('@/core/db/tatakai-db');
      for (const key of candidateKeys) {
        const row = (Number.isFinite(anilistId) ? await db.offlineNovels.get(`${anilistId}:${key}`) : undefined)
          ?? await db.offlineNovels.filter(row => row.novelId === id && row.chapterKey === key).first();
        if (row && row.paragraphs.length > 0) {
          return {
            success: true,
            data: {
              paragraphs: row.paragraphs.map((p) => ({ index: p.index, text: p.text })),
              chapter: {
                chapterKey: key,
                anilistId: row.anilistId,
                provider: 'tatakai_offline',
                providerChapterId: key,
                number: row.chapterNumber ?? null,
                title: row.chapterTitle ?? row.title,
                language: null,
              },
              readMeta: {
                provider: 'tatakai_offline',
                fetchedAt: new Date().toISOString(),
                fallbackUsed: false,
              },
            },
          };
        }
      }
    } catch {
      /* offline lookup best-effort; fall through to the extension runtime */
    }
  }

  if (options?.offlineOnly) throw new Error('This chapter is not downloaded on this device.');

  const { fetchExtensionNovelContent } = await import('@/core/content/novel-extension-runtime');
  return fetchExtensionNovelContent({
    chapterKey,
    provider: options?.provider,
    providerChapterId: options?.providerChapterId,
    anilistId: Number.isFinite(anilistId) ? anilistId : undefined,
    alternatives: options?.alternatives,
  });
}
