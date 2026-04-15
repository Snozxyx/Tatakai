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

export async function baseApiGet<T>(baseUrl: string, path: string, retries?: number): Promise<T> {
  const maxRetries = retries ?? (isMobileNative ? 2 : 3);
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
    if (isMobileNative || isLocalApiTarget) {
      ordered.push({ url, type: 'direct' });
    }
    if (supabaseUrl && !isUsingLocalDevProxy) {
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const rapidUrl = `${supabaseUrl}/functions/v1/rapid-service?url=${encodeURIComponent(url)}&type=api&referer=${encodeURIComponent(apiOrigin)}` + (apikey ? `&apikey=${encodeURIComponent(apikey)}` : '');
      ordered.push({ url: rapidUrl, type: 'supabase' });
    }
    if (!ordered.some((entry) => entry.type === 'direct')) {
      ordered.push({ url, type: 'direct' });
    }
    return ordered;
  })();

  for (const proxy of proxies) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (proxy.url.includes('/rapid-service')) {
          headers['apikey'] = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const bearer = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

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
          const baseDelay = isMobileNative ? 300 : 500;
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * baseDelay));
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
      const headers = isTatakaiApi ? await withSignedHeaders(path) : withClientHeaders();
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
const REMOTE_CF_STREAM_PROXY = 'https://moko.tatakai.me/api/v1/streamingProxy';
const DEFAULT_STREAM_PROXY_PATH = '/api/v1/streamingProxy';
const STREAM_PROXY_PASSWORD = String(
  import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
).trim();
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
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  const pool = String(import.meta.env.VITE_PROXY_POOL_URLS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  pool.forEach(add);
  add(import.meta.env.VITE_PROXY_NODE_URL);
  add(import.meta.env.VITE_PROXY_CF_URL);
  add(import.meta.env.VITE_SINGLE_STREAM_PROXY_URL);
  add(import.meta.env.VITE_STREAM_PROXY_URL);

  add(REMOTE_NODE_STREAM_PROXY);
  add(REMOTE_CF_STREAM_PROXY);

  return candidates;
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

function extractUpstreamFromProxyUrl(maybeProxyUrl: string): string | null {
  if (!maybeProxyUrl) return null;
  if (!/\/api\/(v1\/streamingproxy|v2\/hianime\/proxy\/m3u8-streaming-proxy|proxy\/m3u8-streaming-proxy)/i.test(maybeProxyUrl)) {
    return null;
  }

  try {
    const parsed = new URL(
      maybeProxyUrl,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    );
    return parsed.searchParams.get('url');
  } catch {
    return null;
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

  const upstreamFromExistingProxy = extractUpstreamFromProxyUrl(videoUrl);
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
  return buildSingleProxyUrl(subtitleUrl, 'subtitle', referer);
}

export function apiGet<T>(path: string, retries?: number): Promise<T> {
  return baseApiGet<T>(API_URL, path, retries);
}

export function mangaGet<T>(path: string, retries?: number): Promise<T> {
  return baseApiGet<T>(MANGA_API_URL, path, retries);
}
