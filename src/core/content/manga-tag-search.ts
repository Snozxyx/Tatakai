import { ANILIST_GRAPHQL_ENDPOINT, resolveApiV3Base } from '@/lib/api/backendOrigin';
import { isCapacitor } from '@/lib/platform/platform';
import type { MangaSearchItem, MangaSearchResult } from '@/types/manga';
import type { MangaSearchOptions } from './manga-client';

export interface MangaTagOption {
  id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  isAdult?: boolean;
  isGeneralSpoiler?: boolean;
}

const catalogBase = import.meta.env.DEV && !isCapacitor() && typeof window !== 'undefined'
  ? `${window.location.origin}/api/v3` : resolveApiV3Base();
const MANGABAKA_API = `${catalogBase}/mapping/mangabaka`;
const tagCache = new Map<string, Promise<MangaTagOption[]>>();

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(response.status === 429
    ? 'The catalog is busy. Please wait a moment and retry.'
    : `The catalog could not be reached (${response.status}). Please retry.`);
  return response.json();
}

async function aniList<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  // Tag browsing must query the complete upstream catalog, not a partial local mirror.
  const payload = await readJson<{ data?: T; errors?: { message: string }[] }>(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables, forceUpstream: true }),
  });
  if (payload.errors?.length || !payload.data) throw new Error(payload.errors?.[0]?.message || 'Catalog returned no data. Please retry.');
  return payload.data;
}

export function getMangaTagOptions(source: 'anilist' | 'mangabaka'): Promise<MangaTagOption[]> {
  const cached = tagCache.get(source);
  if (cached) return cached;
  const request = source === 'anilist'
    ? aniList<{ MediaTagCollection: MangaTagOption[] }>('query { MediaTagCollection { id name description category isAdult isGeneralSpoiler } }')
      .then(data => data.MediaTagCollection)
    : readJson<{ data: Array<{ id: number; name: string; name_path: string; description?: string; is_spoiler: boolean; content_rating: string }> }>(`${MANGABAKA_API}/tags`)
      .then(data => data.data.map(tag => ({
        id: tag.id, name: tag.name, description: tag.description,
        category: tag.name_path.split(' > ').slice(0, -1).join(' / '),
        isGeneralSpoiler: tag.is_spoiler, isAdult: ['erotica', 'pornographic'].includes(tag.content_rating),
      })));
  tagCache.set(source, request);
  void request.catch(() => tagCache.delete(source));
  return request;
}

interface AniListMedia {
  id: number; idMal?: number; title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string }; format?: string; countryOfOrigin?: string;
  status?: string; startDate?: { year?: number }; averageScore?: number; popularity?: number;
  isAdult?: boolean; chapters?: number; volumes?: number;
}

interface MangaBakaSeries {
  id: number; title: string; romanized_title?: string; native_title?: string;
  cover?: { raw?: { url?: string }; x250?: { x1?: string } };
  source?: { anilist?: { id?: string | number }; my_anime_list?: { id?: string | number } };
  type?: string; status?: string; year?: number; rating?: number; content_rating?: string;
  total_chapters?: string; final_volume?: string; original_language?: string;
}

export async function searchMangaTags(query: string, page: number, limit: number, options: MangaSearchOptions): Promise<MangaSearchResult> {
  const names = [...new Set(options.tags || [])];
  const normalize = (name: string) => name.trim().toLocaleLowerCase();
  let source = options.tagSource;
  if (!source) {
    const tags = await getMangaTagOptions('anilist');
    source = names.every(name => tags.some(tag => normalize(tag.name) === normalize(name))) ? 'anilist' : 'mangabaka';
  }
  const taxonomy = await getMangaTagOptions(source);
  const tags = names.map(name => {
    const tag = taxonomy.find(entry => normalize(entry.name) === normalize(name));
    if (!tag) throw new Error(`“${name}” is not a ${source === 'anilist' ? 'AniList' : 'MangaBaka'} tag. Choose tags from one catalog.`);
    return tag;
  });
  const base = { query, page, currentPage: page, limit, partial: false, failedProviders: [], source };
  if (source === 'anilist') {
    const country = options.origin || ({ manhwa: 'KR', manhua: 'CN', manga: 'JP', comics: 'US' }[options.mangaType || '']);
    const data = await aniList<{ Page: { pageInfo: { total?: number; hasNextPage: boolean }; media: AniListMedia[] } }>(`
      query ($page: Int, $perPage: Int, $search: String, $tags: [String], $adult: Boolean, $genre: String, $country: CountryCode, $format: MediaFormat) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { total hasNextPage }
          media(type: MANGA, search: $search, tag_in: $tags, isAdult: $adult, genre: $genre, countryOfOrigin: $country, format: $format, sort: [POPULARITY_DESC, ID_DESC]) {
            id idMal title { romaji english native } coverImage { large } format countryOfOrigin status startDate { year } averageScore popularity isAdult chapters volumes
          }
        }
      }`, {
      page, perPage: limit, search: query || undefined, tags: tags.map(tag => tag.name),
      adult: options.adult ? undefined : false, genre: options.genre, country,
      format: options.mangaType === 'novel' ? 'NOVEL' : undefined,
    });
    const results: MangaSearchItem[] = data.Page.media.map(media => ({
      id: String(media.id), mediaType: media.countryOfOrigin === 'KR' ? 'manhwa' : media.countryOfOrigin === 'CN' ? 'manhua' : 'manga',
      anilistId: media.id, malId: media.idMal, canonicalTitle: media.title.english || media.title.romaji || media.title.native || 'Untitled',
      title: media.title, poster: media.coverImage?.large || null, status: media.status || 'unknown',
      year: media.startDate?.year ?? null, score: media.averageScore ?? null, popularity: media.popularity ?? null,
      providersAvailable: [], matchConfidence: 1, adult: Boolean(media.isAdult), chapters: media.chapters ?? null,
      volumes: media.volumes ?? null, originLanguage: media.countryOfOrigin ?? null, readingDirection: 'unknown', providerSource: 'AniList',
    }));
    // AniList documents total as an estimate; hasNextPage is authoritative.
    return { ...base, results, total: data.Page.pageInfo.total, totalIsApproximate: true,
      hasNextPage: data.Page.pageInfo.hasNextPage && page * limit < 5000, resultWindow: 5000 };
  }
  const params = new URLSearchParams({ page: String(page), limit: String(limit), tag_mode: 'and', sort_by: 'popularity_asc' });
  tags.forEach(tag => params.append('tag', String(tag.id)));
  if (query) params.set('q', query);
  if (options.genre) params.append('genre', options.genre);
  const mangaType = options.mangaType || ({ KR: 'manhwa', CN: 'manhua', JP: 'manga' }[options.origin || '']);
  if (mangaType) params.append('type', mangaType === 'comics' ? 'oel' : mangaType);
  // Explicitly request allowed ratings; MangaBaka otherwise defaults to safe only.
  (options.adult ? ['safe', 'suggestive', 'erotica', 'pornographic'] : ['safe', 'suggestive'])
    .forEach(rating => params.append('content_rating', rating));
  const data = await readJson<{ pagination: { count: number; next: string | null }; data: MangaBakaSeries[] }>(`${MANGABAKA_API}/search?${params}`);
  const results: MangaSearchItem[] = data.data.map(media => {
    const anilistId = Number(media.source?.anilist?.id) || undefined;
    const malId = Number(media.source?.my_anime_list?.id) || undefined;
    return {
      id: anilistId ? String(anilistId) : malId ? `mal:${malId}` : `mangabaka:${media.id}`,
      // Keep unmapped titles in the results; their source page is the available detail view.
      href: !anilistId && !malId ? `https://mangabaka.org/${media.id}` : undefined,
      mediaType: media.type === 'manhwa' ? 'manhwa' : media.type === 'manhua' ? 'manhua' : 'manga',
      anilistId, malId, canonicalTitle: media.title,
      title: { english: media.title, romaji: media.romanized_title, native: media.native_title },
      poster: media.cover?.x250?.x1 || media.cover?.raw?.url || null,
      status: media.status || 'unknown', year: media.year ?? null, score: media.rating ?? null, popularity: null,
      providersAvailable: [], matchConfidence: 1, adult: ['erotica', 'pornographic'].includes(media.content_rating || ''),
      chapters: Number(media.total_chapters) || null, volumes: Number(media.final_volume) || null,
      originLanguage: media.original_language || null, readingDirection: 'unknown', providerSource: 'MangaBaka',
    };
  });
  return { ...base, results, total: data.pagination.count, totalIsApproximate: false,
    hasNextPage: Boolean(data.pagination.next) && page * limit < 12000, resultWindow: 12000 };
}
