/**
 * src/core/content/content-graph.ts
 *
 * All browsing data flows through TatakaiAPI → never directly to AniList/Jikan.
 * The backend handles 3rd-party rate limits, fallback logic, and normalization.
 *
 * Public API is identical to what pages expect — zero caller changes needed.
 */

import { queryCache, TTL } from '../cache/query-cache';
import { trackEvent } from '@/core/analytics/AnalyticsService';
import { db, type CachedMedia } from '../db';
import type {
  TatakaiMedia,
  SearchFilters,
  ContentSearchResult,
  ContentFeed,
  HomePageBundle,
  MediaSeason,
  FeedType,
  TatakaiAPIResponse,
} from './types';

type MediaEnvelope = {
  id?: string;
  mapping?: unknown;
  media: TatakaiMedia;
};

function unwrapMedia(payload: TatakaiMedia | MediaEnvelope): TatakaiMedia {
  if (payload && typeof payload === 'object' && 'media' in payload && (payload as MediaEnvelope).media) {
    const envelope = payload as MediaEnvelope;
    return {
      ...envelope.media,
      tatakaiId: envelope.id ?? envelope.media.tatakaiId,
      mapping: envelope.mapping,
    };
  }
  return payload as TatakaiMedia;
}

function unwrapMediaList(payloads: Array<TatakaiMedia | MediaEnvelope>): TatakaiMedia[] {
  return payloads.map((payload) => unwrapMedia(payload));
}

// ─── API base ─────────────────────────────────────────────────────────────────

const CONTENT_BASE = '/api/v3/content';

/**
 * Origin to resolve `CONTENT_BASE` against. On the web the page is served from
 * the same origin as the API's reverse proxy, so `window.location.origin`
 * (https://…) is correct and keeps requests same-origin. In the packaged desktop
 * app the renderer loads from `file://`, where a relative `/api/v3/content/…`
 * path would resolve to `file:///api/v3/content/…` and fail — so fall back to an
 * explicit absolute backend origin (same one playback already uses).
 */
function resolveApiOrigin(): string {
  if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
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

// ─── HTTP client ─────────────────────────────────────────────────────────────

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const url = new URL(CONTENT_BASE + path, resolveApiOrigin());

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
  } catch (err) {
    trackEvent('provider_failure', {
      provider: 'tatakai_content_graph',
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    trackEvent('provider_failure', {
      provider: 'tatakai_content_graph',
      path,
      status: res.status,
      error: text,
    });
    throw new Error(`TatakaiAPI ${res.status} on ${path}: ${text}`);
  }

  const envelope = (await res.json()) as TatakaiAPIResponse<T>;

  if (!envelope.success) {
    throw new Error(`TatakaiAPI error on ${path}: ${envelope.error ?? 'unknown'}`);
  }

  return envelope.data;
}

// ─── Content Graph ────────────────────────────────────────────────────────────

class ContentGraph {

  // ── Internal cache wrapper ────────────────────────────────────────────────

  private async cached<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const hit = queryCache.get<T>(key);
    if (hit !== null) return hit;

    const result = await fetcher();
    queryCache.set(key, result, ttlMs);
    
    // Background task: If the result contains media, save to local DB
    if (result && typeof result === 'object') {
      if ('spotlight' in result && 'trending' in result) {
        // It's a HomePageBundle
        const bundle = result as any;
        const allMedia = [
          ...(bundle.spotlight || []),
          ...(bundle.trending || []),
          ...(bundle.topAiring || []),
          ...(bundle.popular || []),
          ...(bundle.topUpcoming || []),
          ...(bundle.latestCompleted || []),
          ...(bundle.top10?.today || []),
          ...(bundle.top10?.week || []),
          ...(bundle.top10?.month || []),
        ];
        this.saveManyToDb(allMedia);
      } else if ('media' in result && Array.isArray((result as any).media)) {
        const rows = unwrapMediaList((result as any).media);
        this.saveManyToDb(rows);
      } else if (Array.isArray(result)) {
        this.saveManyToDb(unwrapMediaList(result as Array<TatakaiMedia | MediaEnvelope>));
      } else if ('tatakaiId' in result || 'anilistId' in result) {
        this.saveToDb(result as unknown as TatakaiMedia);
      }
    }

    return result;
  }

  private async saveToDb(media: TatakaiMedia) {
    try {
      const id = media.tatakaiId || String(media.anilistId);
      const cached: CachedMedia = {
        id,
        anilistId: media.anilistId,
        malId: media.malId,
        title: media.titleEnglish || media.titleRomaji,
        titleJp: media.titleNative,
        poster: media.coverImageLarge,
        genres: media.genres,
        format: media.format,
        status: media.status,
        season: media.season,
        seasonYear: media.seasonYear,
        cachedAt: new Date().toISOString(),
        raw: JSON.stringify(media),
      };
      await db.cachedMedia.put(cached);
    } catch (err) {
      console.warn('[ContentGraph] Failed to save media to DB:', err);
    }
  }

  private async saveManyToDb(medias: TatakaiMedia[]) {
    for (const m of medias) {
      this.saveToDb(m);
    }
  }

  // ── Home page (single bundled call) ──────────────────────────────────────

  async getHomePage(): Promise<HomePageBundle> {
    return this.cached('home:bundle', TTL.HOT, () =>
      apiGet<HomePageBundle>('/home'),
    );
  }

  // ── Feeds ─────────────────────────────────────────────────────────────────

  async getTrending(page = 1, perPage = 20): Promise<ContentFeed> {
    return this.cached(`feed:trending:${page}:${perPage}`, TTL.HOT, async () => {
      const media = await apiGet<Array<TatakaiMedia | MediaEnvelope>>('/trending', { page, perPage });
      return { type: 'trending' as const, media: unwrapMediaList(media), fetchedAt: Date.now() };
    });
  }

  async getPopular(page = 1, perPage = 20): Promise<ContentFeed> {
    return this.cached(`feed:popular:${page}:${perPage}`, TTL.WARM, async () => {
      const media = await apiGet<Array<TatakaiMedia | MediaEnvelope>>('/popular', { page, perPage });
      return { type: 'popular' as const, media: unwrapMediaList(media), fetchedAt: Date.now() };
    });
  }

  async getTopRated(page = 1, perPage = 20): Promise<ContentFeed> {
    return this.cached(`feed:top_rated:${page}:${perPage}`, TTL.WARM, async () => {
      const media = await apiGet<Array<TatakaiMedia | MediaEnvelope>>('/top-rated', { page, perPage });
      return { type: 'top_rated' as const, media: unwrapMediaList(media), fetchedAt: Date.now() };
    });
  }

  async getSeasonal(
    season?: MediaSeason,
    year?: number,
    page = 1,
    perPage = 20,
  ): Promise<ContentFeed> {
    const s = season ?? getCurrentSeason().season;
    const y = year ?? getCurrentSeason().year;
    return this.cached(`feed:seasonal:${s}:${y}:${page}:${perPage}`, TTL.HOT, async () => {
      const media = await apiGet<Array<TatakaiMedia | MediaEnvelope>>('/seasonal', { season: s, year: y, page, perPage });
      return { type: 'seasonal' as const, media: unwrapMediaList(media), season: s, seasonYear: y, fetchedAt: Date.now() };
    });
  }

  async getUpcoming(page = 1, perPage = 20): Promise<ContentFeed> {
    return this.cached(`feed:upcoming:${page}:${perPage}`, TTL.HOT, async () => {
      const media = await apiGet<Array<TatakaiMedia | MediaEnvelope>>('/upcoming', { page, perPage });
      return { type: 'upcoming' as const, media: unwrapMediaList(media), fetchedAt: Date.now() };
    });
  }

  async getFeed(type: FeedType, page = 1, perPage = 20): Promise<ContentFeed> {
    switch (type) {
      case 'trending':        return this.getTrending(page, perPage);
      case 'popular':         return this.getPopular(page, perPage);
      case 'top_rated':       return this.getTopRated(page, perPage);
      case 'seasonal':        return this.getSeasonal(undefined, undefined, page, perPage);
      case 'upcoming':        return this.getUpcoming(page, perPage);
      case 'recently_updated': return this.getTrending(page, perPage); // fallback
      default:                return this.getTrending(page, perPage);
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async search(filters: SearchFilters): Promise<ContentSearchResult> {
    const cacheKey = `search:${JSON.stringify(filters)}`;
    return this.cached(cacheKey, TTL.HOT, async () => {
      const hasSimpleSearchInput = Boolean(filters.query?.trim() || filters.tags?.length);
      const isSimpleTextSearch = hasSimpleSearchInput &&
        !filters.genres?.length &&
        !filters.format?.length &&
        !filters.status?.length &&
        !filters.studio?.length &&
        !filters.season?.length &&
        !filters.source?.length &&
        !filters.year &&
        !filters.rating &&
        !filters.episodes &&
        !filters.sortBy;

      if (isSimpleTextSearch) {
        return apiGet<ContentSearchResult>('/search/suggestions', {
          q: filters.query,
          type: 'anime',
          tags: filters.tags?.join(','),
          page: filters.page ?? 1,
          perPage: filters.perPage ?? 20,
        });
      }

      const params: Record<string, string | number | boolean | undefined> = {
        q:        filters.query,
        page:     filters.page ?? 1,
        perPage:  filters.perPage ?? 20,
        isAdult:  filters.isAdult,
        sort:     filters.sortBy,
        genres:   filters.genres?.join(','),
        tags:     filters.tags?.join(','),
        format:   filters.format?.join(','),
        status:   filters.status?.join(','),
        source:   filters.source?.join(','),
        studio:   filters.studio?.join(','),
        yearMin:  filters.year?.min,
        yearMax:  filters.year?.max,
        season:   filters.season?.join(','),
        scoreMin: filters.rating?.min,
        scoreMax: filters.rating?.max,
        epMin:    filters.episodes?.min,
        epMax:    filters.episodes?.max,
      };

      const result = await apiGet<ContentSearchResult>('/search', params);
      return { ...result, media: unwrapMediaList(result.media as Array<TatakaiMedia | MediaEnvelope>) };
    });
  }

  // ── Single item lookup ────────────────────────────────────────────────────

  async getMedia(id: string): Promise<TatakaiMedia> {
    const rawId = String(id ?? '').trim();
    if (!rawId) throw new Error(`Invalid media ID: ${id}`);

    // Diagnostics: trace exactly which branch/endpoint resolves (or fails) a
    // given media id. Enable verbose logging by setting
    // `localStorage.tatakaiMediaDebug = '1'` in the browser console; errors are
    // always logged regardless.
    const debugOn = (() => {
      try { return localStorage.getItem('tatakaiMediaDebug') === '1'; } catch { return false; }
    })();
    const diag = (branch: string, extra?: Record<string, unknown>) => {
      if (debugOn) console.debug('[getMedia]', { rawId, branch, ...extra });
    };

    // 1. Check Memory Cache
    const memHit = queryCache.get<TatakaiMedia>(`media:resolve:${rawId}`);
    if (memHit) { diag('mem-cache-hit'); return memHit; }

    // 2. Check Local DB (Dexie)
    try {
      const local = await db.cachedMedia.get(rawId);
      if (local?.raw) {
        const media = JSON.parse(local.raw) as TatakaiMedia;
        queryCache.set(`media:resolve:${rawId}`, media, TTL.WARM);
        diag('dexie-hit');
        return media;
      }
    } catch (err) {
      console.warn('[ContentGraph] DB lookup failed:', err);
    }

    // 3. Fallback to API resolution
    const prefixed = rawId.match(/^(mal|anilist)[\-_:]?(\d+)$/i);
    if (prefixed?.[2]) {
      const numeric = Number(prefixed[2]);
      const provider = prefixed[1].toLowerCase();
      if (provider === 'mal') {
        diag('prefixed-mal', { numeric });
        return this.cached(`media:mal:${numeric}`, TTL.COLD, () =>
          apiGet<TatakaiMedia | MediaEnvelope>(`/mal/${numeric}`).then(unwrapMedia)
            .catch((e) => { console.warn('[getMedia] /mal failed', { numeric, error: (e as Error).message }); throw e; }),
        );
      }
      diag('prefixed-anilist', { numeric });
      return this.cached(`media:anilist:${numeric}`, TTL.COLD, () =>
        apiGet<TatakaiMedia | MediaEnvelope>(`/by-anilist/${numeric}`).then(unwrapMedia)
          .catch((e) => { console.warn('[getMedia] /by-anilist failed', { numeric, error: (e as Error).message }); throw e; }),
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId);
    if (isUuid) {
      diag('uuid');
      return this.cached(`media:tatakai:${rawId}`, TTL.COLD, () =>
        apiGet<TatakaiMedia | MediaEnvelope>(`/${rawId}`).then(unwrapMedia)
          .catch((e) => { console.warn('[getMedia] /:uuid failed', { rawId, error: (e as Error).message }); throw e; }),
      );
    }

    const numericId = Number(rawId);
    if (Number.isFinite(numericId) && numericId > 0) {
      diag('numeric', { numericId });
      return this.cached(`media:resolved:${numericId}`, TTL.COLD, async () => {
        try {
          const m = await apiGet<TatakaiMedia | MediaEnvelope>(`/${numericId}`).then(unwrapMedia);
          diag('numeric→/:id ok', { numericId });
          return m;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (error instanceof Error && error.message.includes('TatakaiAPI 404')) {
            console.warn('[getMedia] /:id 404 → trying /by-anilist', { numericId });
            try {
              const m = await apiGet<TatakaiMedia | MediaEnvelope>(`/by-anilist/${numericId}`).then(unwrapMedia);
              diag('numeric→/by-anilist ok', { numericId });
              return m;
            } catch (anilistError) {
              if (anilistError instanceof Error && anilistError.message.includes('TatakaiAPI 404')) {
                console.warn('[getMedia] /by-anilist 404 → trying /mal', { numericId });
                try {
                  const m = await apiGet<TatakaiMedia | MediaEnvelope>(`/mal/${numericId}`).then(unwrapMedia);
                  diag('numeric→/mal ok', { numericId });
                  return m;
                } catch (malError) {
                  console.warn('[getMedia] all endpoints failed for numeric id', {
                    numericId,
                    error: malError instanceof Error ? malError.message : String(malError),
                  });
                  throw malError;
                }
              }
              console.warn('[getMedia] /by-anilist failed (non-404)', { numericId, error: (anilistError as Error).message });
              throw anilistError;
            }
          }
          console.warn('[getMedia] /:id failed (non-404)', { numericId, error: msg });
          throw error;
        }
      });
    }

    console.warn('[getMedia] unresolvable id — no branch matched', { rawId });
    throw new Error(`Invalid media ID: ${id}`);
  }

  // ── Episodes (AniList DB first; Jikan only via TatakaiAPI) ────────────────

  async getDbEpisodes(id: string): Promise<Array<{
    episodeNumber: number;
    title?: string | null;
    isFiller?: boolean;
  }>> {
    const rawId = String(id ?? '').trim();
    if (!rawId) return [];
    try {
      const rows = await apiGet<Array<{
        episode_number?: number;
        episodeNumber?: number;
        title?: string | null;
        is_filler?: boolean;
        isFiller?: boolean;
      }>>(`/${encodeURIComponent(rawId)}/episodes`);
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => ({
        episodeNumber: Number(row.episodeNumber ?? row.episode_number ?? 0),
        title: row.title ?? null,
        isFiller: Boolean(row.isFiller ?? row.is_filler),
      })).filter((row) => row.episodeNumber > 0);
    } catch {
      return [];
    }
  }

  async getMalEpisodesPage(malId: number, page = 1): Promise<{
    episodes: Array<{ mal_id?: number; title?: string | null; filler?: boolean }>;
    hasNextPage: boolean;
  }> {
    const url = new URL(`${CONTENT_BASE}/mal/${malId}/episodes`, resolveApiOrigin());
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) {
      throw new Error(`TatakaiAPI ${res.status} on /mal/${malId}/episodes`);
    }
    const envelope = (await res.json()) as TatakaiAPIResponse<
      Array<{ mal_id?: number; title?: string | null; filler?: boolean }>
    >;
    if (!envelope.success) {
      throw new Error(envelope.error ?? 'Failed to load MAL episodes');
    }
    return {
      episodes: Array.isArray(envelope.data) ? envelope.data : [],
      hasNextPage: Boolean(envelope.meta?.hasNextPage),
    };
  }

  async getMalAnimeFull(malId: number): Promise<{
    broadcast?: {
      day?: string | null;
      time?: string | null;
      timezone?: string | null;
    } | null;
  } | null> {
    try {
      return await apiGet(`/mal/${malId}/full`);
    } catch {
      return null;
    }
  }

  // ── Genres ────────────────────────────────────────────────────────────────

  async getGenres(): Promise<string[]> {
    return this.cached('genres', TTL.COLD, () =>
      apiGet<string[]>('/genres'),
    );
  }

  // ── Live next-airing ──────────────────────────────────────────────────────

  /**
   * Live next-episode schedule for an anime, fetched from real AniList (never
   * the mirror/DB). Returns null for finished/unknown titles or on error.
   */
  async getNextAiring(anilistId: number): Promise<{
    status: string | null;
    episodes: number | null;
    nextAiringEpisode: { episode: number; airingAt: number; timeUntilAiring: number } | null;
  } | null> {
    if (!Number.isFinite(anilistId) || anilistId <= 0) return null;
    try {
      return await apiGet(`/by-anilist/${anilistId}/next-airing`);
    } catch {
      return null;
    }
  }

  // ── Cache management ──────────────────────────────────────────────────────

  invalidateAll() {
    queryCache.clear();
  }

  invalidateFeed(type: FeedType) {
    queryCache.invalidatePrefix(`feed:${type}:`);
  }

  invalidateMedia(anilistId: number) {
    queryCache.delete(`media:anilist:${anilistId}`);
  }

  invalidateHome() {
    queryCache.delete('home:bundle');
  }

  /**
   * Drop every cached copy of a single media item after it's been edited
   * server-side (admin content editor), so the next getMedia() refetches the
   * fresh row instead of serving the stale memory/Dexie copy. Coarse on the
   * memory cache (clears all `media:` resolves) but this only runs on an admin
   * save, which is rare.
   */
  async purgeMedia(id: string) {
    queryCache.invalidatePrefix('media:');
    try {
      await db.cachedMedia.delete(id);
      const numeric = Number(id);
      if (Number.isFinite(numeric) && numeric > 0) {
        await db.cachedMedia.where('anilistId').equals(numeric).delete();
      }
    } catch (err) {
      console.warn('[ContentGraph] purgeMedia failed:', err);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const contentGraph = new ContentGraph();

// ─── Utility ─────────────────────────────────────────────────────────────────

export function getCurrentSeason(): { season: MediaSeason; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const season: MediaSeason =
    month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  return { season, year };
}
