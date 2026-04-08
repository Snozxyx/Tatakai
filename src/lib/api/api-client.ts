import { getClientIdSync } from '@/hooks/useClientId';
import { isApiCryptoEnabled, generateApiSignature } from '@/lib/apiCrypto';
import { proxyManager } from '@/services/proxyManager.service';

const DEFAULT_HIANIME_API_URL = "https://core.tatakai.me/api/v2/tatakai";
const CONFIGURED_HIANIME_API_URL = import.meta.env.VITE_HIANIME_API_URL || DEFAULT_HIANIME_API_URL;

function normalizeTatakaiApiBase(url: string): string {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.tatakai.me/api/v2/anime';
  if (/^https?:\/\/[^/]+$/i.test(trimmed)) return `${trimmed}/api/v2/anime`;
  if (/\/api\/v2\/anime$/i.test(trimmed)) return trimmed;
  if (/\/api\/v1$/i.test(trimmed)) return `${trimmed.replace(/\/api\/v1$/i, '')}/api/v2/anime`;
  if (/\/api\/v2$/i.test(trimmed)) return `${trimmed}/anime`;
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v2/anime`;
  return trimmed;
}

const isMobileNative = typeof window !== 'undefined' &&
  (window as any).Capacitor?.isNativePlatform?.() || false;

export const API_URL = import.meta.env.DEV && !isMobileNative
  ? '/api/tatakai'
  : CONFIGURED_HIANIME_API_URL;

const _RAW_TATAKAI_API_URL = import.meta.env.VITE_TATAKAI_API_URL || "https://api.tatakai.me/api/v2/anime";
const _NORMALIZED_TATAKAI_API_URL = normalizeTatakaiApiBase(_RAW_TATAKAI_API_URL);
export const TATAKAI_API_URL = (import.meta.env.DEV && !isMobileNative)
  ? '/api/v2/anime'
  : _NORMALIZED_TATAKAI_API_URL;

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
    return (payload as ApiEnvelope<T>).data;
  }

  if (typeof (payload as ProxyEnvelope<T>).status === "number") {
    const { status, data } = payload as ProxyEnvelope<T>;
    if (status >= 200 && status < 300) return data;
  }

  return payload as T;
}

export async function apiGet<T>(path: string, retries?: number): Promise<T> {
  const maxRetries = retries ?? (isMobileNative ? 2 : 3);
  const url = `${API_URL}${path}`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const isUsingLocalDevProxy = import.meta.env.DEV && API_URL.startsWith('/');

  const resolvedApiUrl = API_URL.startsWith('http')
    ? API_URL
    : (typeof window !== 'undefined' ? new URL(API_URL, window.location.origin).toString() : CONFIGURED_HIANIME_API_URL);

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

export function getProxiedVideoUrl(videoUrl: string, referer?: string, userAgent?: string): string {
  if (videoUrl.includes('/functions/v1/rapid-service')) return videoUrl;
  if (videoUrl.includes('/hindiapi/proxy')) return videoUrl;
  
  const proxy = proxyManager.getOptimalProxy();
  if (!proxy) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return videoUrl;
    const params = new URLSearchParams({ url: videoUrl, type: 'video' });
    if (referer) params.set('referer', referer);
    if (userAgent) params.set('userAgent', userAgent);
    const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (apikey) params.set('apikey', apikey);
    return `${supabaseUrl}/functions/v1/rapid-service?${params.toString()}`;
  }

  const params = new URLSearchParams({ url: videoUrl });
  if (referer) params.set('referer', referer);
  if (userAgent) params.set('userAgent', userAgent);
  
  return `${proxy.url}${proxy.url.includes('?') ? '&' : '?'}${params.toString()}`;
}

export function getProxiedImageUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;
  let trimmed = imageUrl.trim();
  if (!trimmed.startsWith('http')) return trimmed;
  if (trimmed.includes('/functions/v1/rapid-service')) return trimmed;
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
  if (subtitleUrl.includes('/api/proxy/m3u8-streaming-proxy')) return subtitleUrl;
  if (!subtitleUrl.startsWith('http')) return subtitleUrl;

  const params = new URLSearchParams({ url: subtitleUrl, type: 'subtitle' });
  if (referer) params.set('referer', referer);

  const proxy = proxyManager.getOptimalProxy();
  if (proxy?.url) {
    return `${proxy.url}${proxy.url.includes('?') ? '&' : '?'}${params.toString()}`;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return subtitleUrl;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (apikey) params.set('apikey', apikey);
  return `${supabaseUrl}/functions/v1/rapid-service?${params.toString()}`;
}
