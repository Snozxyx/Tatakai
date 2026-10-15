/**
 * localeHeaders.ts — Accept-Language helpers + global fetch patch.
 *
 * The renderer previously never sent `Accept-Language`, so even locale-aware
 * backends (AniList descriptions, translated content APIs) always fell back
 * to English. These helpers derive the header value from the active i18n
 * language (which itself follows the `tatakai:lang` → `navigator.language`
 * chain) and attach it to backend / GraphQL traffic.
 */

export const APP_LANGUAGE_STORAGE_KEY = 'tatakai:lang';

const FETCH_PATCH_FLAG = '__tatakaiLocaleFetchPatched__';
let activeLanguage: string | undefined;

/** The effective account/device language may differ from the persisted choice. */
export function setActiveAppLanguage(language: string): void {
  activeLanguage = normalizeLanguageCode(language) || 'en';
}

/** Normalize `es-419`, `es_MX`, `ES` … → `es`. `en-US` → `en`. */
export function normalizeLanguageCode(value: unknown): string {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (!raw) return '';
  return raw.split('-')[0];
}

/** Read the stored app language without importing i18next (safe for any module). */
export function getStoredAppLanguage(): string {
  if (activeLanguage) return activeLanguage;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
      if (stored) return normalizeLanguageCode(stored) || 'en';
    } catch {
      /* ignore */
    }
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalizeLanguageCode(navigator.language) || 'en';
  }
  return 'en';
}

/**
 * Build an `Accept-Language` header value for the given language.
 * Spanish keeps the `es-419` regional tag first so backends that distinguish
 * Latin-American Spanish still match, then falls back to generic `es`.
 */
export function toAcceptLanguageHeader(lang: string): string {
  const base = normalizeLanguageCode(lang) || 'en';
  if (base === 'es') return 'es-419,es;q=0.9,en;q=0.8';
  if (base === 'ja') return 'ja-JP,ja;q=0.9,en;q=0.8';
  if (base === 'en') return 'en-US,en;q=0.9';
  return `${base};q=0.9,en;q=0.8`;
}

/** Current `Accept-Language` value for outgoing API requests. */
export function getAcceptLanguageHeader(): string {
  return toAcceptLanguageHeader(getStoredAppLanguage());
}

export function withLocaleHeaders(
  headers: Record<string, string> = {},
  lang?: string,
): Record<string, string> {
  const normalized = normalizeLanguageCode(lang ?? getStoredAppLanguage()) || 'en';
  return {
    ...headers,
    'Accept-Language': toAcceptLanguageHeader(normalized),
  };
}

function resolveRequestUrl(input: RequestInfo | URL): URL | null {
  if (typeof window === 'undefined') return null;
  try {
    if (input instanceof Request) return new URL(input.url, window.location.origin);
    if (input instanceof URL) return new URL(input.toString(), window.location.origin);
    return new URL(String(input), window.location.origin);
  } catch {
    return null;
  }
}

function mergeHeaders(requestHeaders?: HeadersInit, initHeaders?: HeadersInit): Headers {
  const merged = new Headers();
  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) => merged.set(key, value));
  }
  if (initHeaders) {
    new Headers(initHeaders).forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

/**
 * Monkey-patch `window.fetch` so every backend / proxied request carries
 * `Accept-Language`, even call sites that build their own `fetch()` directly.
 * Third-party hosts (trace.moe, Jikan, …) are left untouched.
 */
export function installLocaleFetchPatch(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const flagHost = window as unknown as Record<string, unknown>;
  if (flagHost[FETCH_PATCH_FLAG]) return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = resolveRequestUrl(input);
    if (!requestUrl) return nativeFetch(input as RequestInfo, init);

    const isSameOrigin = requestUrl.origin === window.location.origin;
    const isApiPath = requestUrl.pathname.startsWith('/api/');
    // Backend requests: same-origin /api/*, or absolute backend origin traffic
    // is handled by callers via withLocaleHeaders — but same-origin relative
    // calls are the common case, so patch those here.
    const shouldPatch = isSameOrigin && isApiPath;

    if (!shouldPatch) return nativeFetch(input as RequestInfo, init);

    const headers = mergeHeaders(
      input instanceof Request ? input.headers : undefined,
      init?.headers,
    );
    if (!headers.has('Accept-Language')) {
      headers.set('Accept-Language', getAcceptLanguageHeader());
    }

    if (input instanceof Request) {
      return nativeFetch(new Request(input, { ...init, headers }));
    }
    return nativeFetch(input as RequestInfo, { ...init, headers });
  }) as typeof window.fetch;

  flagHost[FETCH_PATCH_FLAG] = true;
}
