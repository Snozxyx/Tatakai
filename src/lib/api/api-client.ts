import { getClientIdSync } from '@/hooks/useClientId';
import { isApiCryptoEnabled, generateApiSignature } from '@/lib/apiCrypto';

const DEFAULT_API_BASE = "https://api.tatakai.me/api/v2";
const BACKEND_ORIGIN = (import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/$/, '');

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeConfiguredApiBase(): string {
  const rawApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const rawHianimeBase = String(import.meta.env.VITE_HIANIME_API_URL || '').trim();

  if (rawApiBase) {
    if (isAbsoluteHttpUrl(rawApiBase)) return rawApiBase;
    if (BACKEND_ORIGIN) return `${BACKEND_ORIGIN}${rawApiBase.startsWith('/') ? '' : '/'}${rawApiBase}`;
  }

  if (rawHianimeBase) {
    if (isAbsoluteHttpUrl(rawHianimeBase)) return rawHianimeBase;
    if (BACKEND_ORIGIN) return `${BACKEND_ORIGIN}${rawHianimeBase.startsWith('/') ? '' : '/'}${rawHianimeBase}`;
  }

  if (BACKEND_ORIGIN) return `${BACKEND_ORIGIN}/api/v2`;
  return DEFAULT_API_BASE;
}

const CONFIGURED_API_BASE = normalizeConfiguredApiBase();

// Remove /hianime or /anime from the end if present to get the clean base
const CLEAN_API_BASE = CONFIGURED_API_BASE.replace(/\/+(hianime|anime|tatakai)$/i, '');

const isMobileNative = typeof window !== 'undefined' &&
  (window as any).Capacitor?.isNativePlatform?.() || false;

// Unified exports derived from the single base
export const API_URL = (import.meta.env.DEV && !isMobileNative)
  ? '/api/tatakai'
  : `${CLEAN_API_BASE}/hianime`;

export const TATAKAI_API_URL = (import.meta.env.DEV && !isMobileNative)
  ? '/api/v2/anime'
  : `${CLEAN_API_BASE}/anime`;

const CONFIGURED_MANGA_API_URL =
  import.meta.env.VITE_MANGA_API_URL || `${CLEAN_API_BASE}/manga`;

export const MANGA_API_URL = (import.meta.env.DEV && !isMobileNative)
  ? '/api/v2/manga'
  : CONFIGURED_MANGA_API_URL;

const API_TIMEOUT = isMobileNative ? 15000 : 30000;
const ADMIN_API_SECRET = String(import.meta.env.VITE_ADMIN_API_SECRET || '').trim();

export class ApiError extends Error {
  constructor(
    public message: string,
    public status?: number,
    public proxyType?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiEnvelope<T> = { success: true; data: T };
type ProxyEnvelope<T> = { status: number; data: T };
type AnyEnvelope<T> = ApiEnvelope<T> | ProxyEnvelope<T>;
type ApiRequestOptions = {
  retries?: number;
  timeoutMs?: number;
  retryDelayBaseMs?: number;
};

export function unwrapApiData<T>(payload: AnyEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && !('success' in payload) && !('status' in payload)) {
    return payload as T;
  }

  if ((payload as ApiEnvelope<T>).success === true) {
    if (!Object.prototype.hasOwnProperty.call(payload as any, 'data')) {
      // Some endpoints return { success: true, ...payload } without wrapping in data.
      return payload as T;
    }

    const data = (payload as ApiEnvelope<T>).data;
    if (data && typeof data === 'object') {
      const p = payload as any;
      const ids: any = {};
      if (p.anilistID) ids.anilistID = p.anilistID;
      if (p.malID) ids.malID = p.malID;
      if (p.anilist_id) ids.anilist_id = p.anilist_id;
      if (p.mal_id) ids.mal_id = p.mal_id;
      return { ...data, ...ids } as T;
    }
    return data;
  }

  if (typeof (payload as ProxyEnvelope<T>).status === "number") {
    const { status, data } = payload as ProxyEnvelope<T>;
    if (status >= 200 && status < 300) {
      if (data && typeof data === 'object') {
        const p = payload as any;
        const ids: any = {};
        if (p.anilistID) ids.anilistID = p.anilistID;
        if (p.malID) ids.malID = p.malID;
        if (p.anilist_id) ids.anilist_id = p.anilist_id;
        if (p.mal_id) ids.mal_id = p.mal_id;
        return { ...data, ...ids } as T;
      }
      return data;
    }
  }

  return payload as T;
}

function normalizeApiRequestOptions(
  retriesOrOptions?: number | ApiRequestOptions
): Required<ApiRequestOptions> {
  if (typeof retriesOrOptions === 'number') {
    return {
      retries: retriesOrOptions,
      timeoutMs: API_TIMEOUT,
      retryDelayBaseMs: isMobileNative ? 300 : 500,
    };
  }

  const configuredRetries = retriesOrOptions?.retries;
  const configuredTimeout = retriesOrOptions?.timeoutMs;
  const configuredRetryDelay = retriesOrOptions?.retryDelayBaseMs;

  return {
    retries: Number.isFinite(configuredRetries as number)
      ? Math.max(0, Number(configuredRetries))
      : (isMobileNative ? 2 : 3),
    timeoutMs: Number.isFinite(configuredTimeout as number)
      ? Math.max(1500, Number(configuredTimeout))
      : API_TIMEOUT,
    retryDelayBaseMs: Number.isFinite(configuredRetryDelay as number)
      ? Math.max(100, Number(configuredRetryDelay))
      : (isMobileNative ? 300 : 500),
  };
}

export async function baseApiGet<T>(
  baseUrl: string,
  path: string,
  retriesOrOptions?: number | ApiRequestOptions
): Promise<T> {
  const options = normalizeApiRequestOptions(retriesOrOptions);
  const maxRetries = options.retries;
  const url = `${baseUrl}${path}`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const isUsingLocalDevProxy = import.meta.env.DEV && baseUrl.startsWith('/');

  const resolvedApiUrl = baseUrl.startsWith('http')
    ? baseUrl
    : (typeof window !== 'undefined' ? new URL(baseUrl, window.location.origin).toString() : `${CLEAN_API_BASE}/hianime`);

  const apiOrigin = new URL(resolvedApiUrl).origin;
  const isLocalApiTarget = /^(localhost|127\.0\.0\.1)$/i.test(new URL(resolvedApiUrl).hostname);

  let lastError: Error | null = null;

  const proxies = (() => {
    const ordered: Array<{ url: string; type: 'direct' | 'supabase' }> = [];
    // Prefer direct API first to avoid extra proxy hop latency.
    ordered.push({ url, type: 'direct' });

    if (supabaseUrl && !isUsingLocalDevProxy && !isLocalApiTarget) {
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const rapidUrl = `${supabaseUrl}/functions/v1/rapid-service?url=${encodeURIComponent(url)}&type=api&referer=${encodeURIComponent(apiOrigin)}` + (apikey ? `&apikey=${encodeURIComponent(apikey)}` : '');
      ordered.push({ url: rapidUrl, type: 'supabase' });
    }

    return ordered;
  })();

  for (const proxy of proxies) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const headers = withClientHeaders({ 'Accept': 'application/json' });
        if (proxy.url.includes('/rapid-service')) {
          headers['apikey'] = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const bearer = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

        const response = await fetch(proxy.url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, response.status, proxy.type);
        }

        const json = await response.json();
        return unwrapApiData<T>(json);
      } catch (error) {
        lastError = error as Error;
        if (proxy.type === 'supabase' && error instanceof ApiError && (error.status === 401 || error.status === 403)) break;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * options.retryDelayBaseMs));
        }
      }
    }
  }
  throw lastError || new ApiError('Failed to fetch data after all attempts');
}

export function withClientHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const cid = getClientIdSync();
  if (cid) headers['X-Client-Id'] = cid;
  if (ADMIN_API_SECRET) headers['X-Admin-Secret'] = ADMIN_API_SECRET;
  return headers;
}

export async function withSignedHeaders(path: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers = withClientHeaders(extra);
  if (isApiCryptoEnabled()) {
    const { timestamp, signature } = await generateApiSignature(path);
    headers['X-Api-Timestamp'] = timestamp;
    headers['X-Api-Signature'] = signature;
  }
  return headers;
}

export async function externalApiGet<T>(baseUrl: string, path: string, retries = 2, timeoutMs: number = 25000): Promise<T> {
  const url = `${baseUrl}${path}`;
  let lastError: Error | null = null;
  const isTatakaiApi = baseUrl === TATAKAI_API_URL;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const headers = isTatakaiApi ? await withSignedHeaders(path) : { Accept: 'application/json' };
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError || new Error(`Failed to fetch from ${url}`);
}

type VideoProxyOptions = {
  preferProxyManager?: boolean;
};

const REMOTE_NODE_STREAM_PROXY = 'https://hoko.tatakai.me/api/v1/streamingProxy';
const REMOTE_FOGTWIST_PROXY = 'https://mega.zanora.lol/m3u8-proxy';
const REMOTE_ANIMEPAHE_PROXY = 'https://proxy.1anime.app/m3u8-proxy';
const DEFAULT_STREAM_PROXY_PATH = '/api/v1/streamingProxy';
const STREAM_PROXY_PASSWORD = String(
  import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
).trim();
const FOGTWIST_PROXY_BASE = String(import.meta.env.VITE_FOGTWIST_PROXY_URL || REMOTE_FOGTWIST_PROXY).trim();
const ANIMEPAHE_PROXY_BASE = String(import.meta.env.VITE_ANIMEPAHE_PROXY_URL || REMOTE_ANIMEPAHE_PROXY).trim();
const ENABLE_ANIMEPAHE_PROXY =
  String(import.meta.env.VITE_ENABLE_ANIMEPAHE_PROXY ?? 'false').toLowerCase() === 'true';
const PROXY_CURSOR_STORAGE_KEY = 'tatakai.streamProxy.cursor';
let proxyBaseRoundRobinIndex = -1;

function isLoopbackProxyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isMokoProxyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return /(^|\.)moko\.tatakai\.me$/i.test(parsed.hostname);
  } catch {
    return /(^|\.)moko\.tatakai\.me/i.test(value);
  }
}

function normalizeStreamProxyBase(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/$/, '');
    const isStreamingPath = /\/api\/(v1\/streamingproxy|v2\/hianime\/proxy\/m3u8-streaming-proxy|proxy\/m3u8-streaming-proxy)$/i.test(pathname);
    if (isStreamingPath) {
      parsed.pathname = pathname;
      parsed.search = '';
      return parsed.toString().replace(/\/$/, '');
    }

    if (!pathname || pathname === '/') {
      parsed.pathname = DEFAULT_STREAM_PROXY_PATH;
      parsed.search = '';
      return parsed.toString().replace(/\/$/, '');
    }

    parsed.pathname = pathname;
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

function resolveStreamProxyBaseCandidates(): string[] {
  const candidates: string[] = [];

  const add = (value?: string) => {
    const normalized = normalizeStreamProxyBase(String(value || ''));
    if (!normalized || isLoopbackProxyUrl(normalized)) return;
    if (isMokoProxyUrl(normalized)) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  const pool = String(import.meta.env.VITE_PROXY_POOL_URLS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  pool.forEach(add);
  add(import.meta.env.VITE_PROXY_NODE_URL);
  add(import.meta.env.VITE_SINGLE_STREAM_PROXY_URL);
  add(import.meta.env.VITE_STREAM_PROXY_URL);

  add(REMOTE_NODE_STREAM_PROXY);

  return candidates;
}

function isHokoProxyCandidate(proxyBaseUrl: string): boolean {
  try {
    const parsed = new URL(proxyBaseUrl);
    return /(^|\.)hoko\.tatakai\.me$/i.test(parsed.hostname);
  } catch {
    return /(^|\.)hoko\.tatakai\.me/i.test(proxyBaseUrl);
  }
}

function resolveInitialProxyCursor(candidatesLength: number): number {
  if (proxyBaseRoundRobinIndex >= 0) {
    return proxyBaseRoundRobinIndex % Math.max(1, candidatesLength);
  }

  if (typeof window !== 'undefined') {
    const savedCursorRaw = window.sessionStorage.getItem(PROXY_CURSOR_STORAGE_KEY);
    const savedCursor = Number(savedCursorRaw);
    if (Number.isInteger(savedCursor) && savedCursor >= 0) {
      proxyBaseRoundRobinIndex = savedCursor % Math.max(1, candidatesLength);
      return proxyBaseRoundRobinIndex;
    }
  }

  proxyBaseRoundRobinIndex = Math.floor(Math.random() * Math.max(1, candidatesLength));
  return proxyBaseRoundRobinIndex;
}

function persistNextProxyCursor(value: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PROXY_CURSOR_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage issues (private mode, quota, etc.).
  }
}

function resolveSingleStreamProxyBase(): string {
  const candidates = resolveStreamProxyBaseCandidates();
  if (candidates.length === 0) {
    return REMOTE_NODE_STREAM_PROXY || DEFAULT_STREAM_PROXY_PATH;
  }

  // Always prefer Hoko for stream URL generation (anime info/card preview/video playback).
  const preferredHoko = candidates.find(isHokoProxyCandidate);
  if (preferredHoko) {
    return preferredHoko;
  }

  const currentCursor = resolveInitialProxyCursor(candidates.length);
  const selected = candidates[currentCursor % candidates.length];
  proxyBaseRoundRobinIndex = (currentCursor + 1) % candidates.length;
  persistNextProxyCursor(proxyBaseRoundRobinIndex);
  return selected;
}

function buildSingleProxyUrl(
  upstreamUrl: string,
  type: 'video' | 'subtitle',
  referer?: string,
  userAgent?: string
): string {
  const proxyBaseUrl = resolveSingleStreamProxyBase();
  const params = new URLSearchParams({ url: upstreamUrl, type });
  if (referer) params.set('referer', referer);
  if (userAgent) params.set('userAgent', userAgent);
  if (STREAM_PROXY_PASSWORD) params.set('password', STREAM_PROXY_PASSWORD);
  return `${proxyBaseUrl}${proxyBaseUrl.includes('?') ? '&' : '?'}${params.toString()}`;
}

function buildFogtwistProxyUrl(upstreamUrl: string): string {
  const proxyBase = FOGTWIST_PROXY_BASE || REMOTE_FOGTWIST_PROXY;
  const params = new URLSearchParams({ url: upstreamUrl });
  return `${proxyBase}${proxyBase.includes('?') ? '&' : '?'}${params.toString()}`;
}

function resolveAnimepaheReferer(upstreamUrl: string, referer?: string): string {
  const explicitReferer = String(referer || '').trim();
  if (explicitReferer) return explicitReferer;

  try {
    const host = new URL(upstreamUrl).hostname.toLowerCase();
    if (host.includes('kwik') || host.includes('kiwi') || host.includes('owocdn')) {
      return 'https://kwik.cx';
    }
  } catch {
    // Ignore parse failures and fall back.
  }

  return 'https://kwik.cx';
}

function buildAnimepaheProxyUrl(upstreamUrl: string, referer?: string): string {
  const proxyBase = ANIMEPAHE_PROXY_BASE || REMOTE_ANIMEPAHE_PROXY;
  const params = new URLSearchParams({ url: upstreamUrl });
  const resolvedReferer = resolveAnimepaheReferer(upstreamUrl, referer);
  if (resolvedReferer) {
    params.set('headers', JSON.stringify({ Referer: resolvedReferer }));
  }
  return `${proxyBase}${proxyBase.includes('?') ? '&' : '?'}${params.toString()}`;
}

function shouldUseFogtwistProxy(upstreamUrl: string): boolean {
  try {
    const parsed = new URL(upstreamUrl);
    return /(^|\.)fogtwist21\.xyz$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function shouldUseAnimepaheProxy(upstreamUrl: string, referer?: string): boolean {
  // This third-party proxy is CORS-sensitive in browsers; keep opt-in only.
  if (!ENABLE_ANIMEPAHE_PROXY) return false;

  if (typeof window !== 'undefined' && !isMobileNative) {
    return false;
  }

  try {
    const parsed = new URL(upstreamUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('owocdn') || host.includes('kwik') || host.includes('kiwi')) {
      return true;
    }
  } catch {
    // Ignore URL parse failures.
  }

  const ref = String(referer || '').toLowerCase();
  return ref.includes('kwik') || ref.includes('kiwi') || ref.includes('animepahe');
}

function isAlreadyGenericM3u8ProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://api.tatakai.me');
    return /\/m3u8-proxy$/i.test(parsed.pathname) && parsed.searchParams.has('url');
  } catch {
    return false;
  }
}

function extractUpstreamFromProxyUrl(maybeProxyUrl: string): string | null {
  if (!maybeProxyUrl) return null;
  if (!/\/(api\/(v1\/streamingproxy|v2\/hianime\/proxy\/m3u8-streaming-proxy|proxy\/m3u8-streaming-proxy)|m3u8-proxy)/i.test(maybeProxyUrl)) {
    return null;
  }

  try {
    const parsed = new URL(
      maybeProxyUrl,
      typeof window !== 'undefined' ? window.location.origin : 'https://api.tatakai.me'
    );
    return parsed.searchParams.get('url');
  } catch {
    return null;
  }
}

function shouldProxySubtitleUrl(subtitleUrl: string, referer?: string): boolean {
  const ref = String(referer || '').toLowerCase();
  if (
    ref.includes('watching.onl') ||
    ref.includes('rabbitstream') ||
    ref.includes('dokicloud') ||
    ref.includes('megacloud') ||
    ref.includes('kwik') ||
    ref.includes('kiwi') ||
    ref.includes('owocdn')
  ) {
    return true;
  }

  try {
    const host = new URL(subtitleUrl).hostname.toLowerCase();
    return (
      host.includes('watching.onl') ||
      host.includes('rabbitstream') ||
      host.includes('dokicloud') ||
      host.includes('megacloud') ||
      host.includes('kwik') ||
      host.includes('kiwi') ||
      host.includes('owocdn')
    );
  } catch {
    return false;
  }
}

export function getProxiedVideoUrl(
  videoUrl: string,
  referer?: string,
  userAgent?: string,
  _options: VideoProxyOptions = {}
): string {
  if (videoUrl.includes('/functions/v1/rapid-service')) return videoUrl;
  if (videoUrl.includes('/hindiapi/proxy')) return videoUrl;
  if (isAlreadyGenericM3u8ProxyUrl(videoUrl)) return videoUrl;

  const upstreamFromExistingProxy = extractUpstreamFromProxyUrl(videoUrl);
  const upstreamUrl = upstreamFromExistingProxy || videoUrl;

  if (upstreamUrl.startsWith('http') && shouldUseFogtwistProxy(upstreamUrl)) {
    return buildFogtwistProxyUrl(upstreamUrl);
  }

  if (upstreamUrl.startsWith('http') && shouldUseAnimepaheProxy(upstreamUrl, referer)) {
    return buildAnimepaheProxyUrl(upstreamUrl, referer);
  }

  if (upstreamFromExistingProxy) {
    return buildSingleProxyUrl(upstreamFromExistingProxy, 'video', referer, userAgent);
  }

  if (!videoUrl.startsWith('http')) return videoUrl;

  return buildSingleProxyUrl(videoUrl, 'video', referer, userAgent);
}

export function getProxiedImageUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;
  let trimmed = imageUrl.trim();
  if (!trimmed.startsWith('http')) return trimmed;
  if (trimmed.includes('/functions/v1/rapid-service')) return trimmed;

  // Manga provider image endpoints are already backend-proxied.
  // Re-wrapping them via rapid-service breaks URLs (especially localhost sources).
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.toLowerCase();
    const isMangaProviderImageProxy =
      /^\/api\/v\d+\/manga\/(?:adult\/)?[^/]+\/image\//.test(pathname) ||
      /^\/manga\/(?:adult\/)?[^/]+\/image\//.test(pathname);

    if (isMangaProviderImageProxy) return trimmed;
  } catch {
    // Ignore URL parse failures and fall back to default behavior.
  }

  if (trimmed.includes('s4.anilist.co') || trimmed.includes('anilist.co/file/anilistcdn')) {
    trimmed = trimmed.replace('/cover/medium/', '/cover/large/').replace(/\/banner\/(small|medium)\//, '/banner/large/');
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return trimmed;
  const params = new URLSearchParams({ url: trimmed, type: 'image' });
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (apikey) params.set('apikey', apikey);
  return `${supabaseUrl}/functions/v1/rapid-service?${params.toString()}`;
}

export function getProxiedSubtitleUrl(subtitleUrl: string | undefined, referer?: string): string {
  if (!subtitleUrl || typeof subtitleUrl !== 'string') return '';
  if (subtitleUrl.includes('/functions/v1/rapid-service')) return subtitleUrl;
  const upstreamFromExistingProxy = extractUpstreamFromProxyUrl(subtitleUrl);
  if (upstreamFromExistingProxy) {
    return buildSingleProxyUrl(upstreamFromExistingProxy, 'subtitle', referer);
  }
  if (!subtitleUrl.startsWith('http')) return subtitleUrl;
  if (!shouldProxySubtitleUrl(subtitleUrl, referer)) {
    return subtitleUrl;
  }
  return buildSingleProxyUrl(subtitleUrl, 'subtitle', referer);
}

export function apiGet<T>(path: string, retriesOrOptions?: number | ApiRequestOptions): Promise<T> {
  return baseApiGet<T>(API_URL, path, retriesOrOptions);
}

export function mangaGet<T>(path: string, retriesOrOptions?: number | ApiRequestOptions): Promise<T> {
  return baseApiGet<T>(MANGA_API_URL, path, retriesOrOptions);
}
