/**
 * Shared HTTP + HTML helpers used by every Toko provider.
 *
 * Providers import `fetchText`/`fetchJson`/`loadHtml` directly so the same
 * provider code runs unchanged in three environments:
 *   1. The Toko API server (Node 18+, native fetch + cheerio)
 *   2. The browser/desktop extension (native fetch + cheerio)
 *   3. The legacy worker sandbox, where `globalThis.__tatakai_fetch__` and
 *      `globalThis.__tatakai_parse_html__` are injected.
 *
 * No provider should reference the `__tatakai_*` globals directly — go through
 * these helpers so the API form of Toko has no sandbox dependency.
 */

import * as cheerio from 'cheerio';

export type CheerioAPI = cheerio.CheerioAPI;

// In the legacy worker sandbox these globals are provided; in Node/browser
// they are undefined and we use the native implementations below.
type SandboxFetch = (url: string, init?: RequestInit) => Promise<Response>;
type SandboxParseHtml = (html: string) => CheerioAPI;

const sandboxFetch = (globalThis as unknown as {
  __tatakai_fetch__?: SandboxFetch;
}).__tatakai_fetch__;

const sandboxParseHtml = (globalThis as unknown as {
  __tatakai_parse_html__?: SandboxParseHtml;
}).__tatakai_parse_html__;

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export interface FetchOptions extends RequestInit {
  /** Per-request timeout in milliseconds. Defaults to 15s. Set 0 to disable. */
  timeoutMs?: number;
  /** Override the User-Agent header. */
  userAgent?: string;
  /** Convenience: send URL-encoded form body. */
  form?: Record<string, string>;
}

function buildHeaders(url: string, opts: FetchOptions): Headers {
  const headers = new Headers(opts.headers || {});
  if (opts.userAgent && !headers.has('User-Agent')) headers.set('User-Agent', opts.userAgent);
  if (!headers.has('User-Agent')) headers.set('User-Agent', DEFAULT_UA);
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'en-US,en;q=0.9');
  if (!headers.has('Accept')) headers.set('Accept', '*/*');
  // Many scrapers expect a Referer matching the site origin.
  if (!headers.has('Referer')) {
    try {
      headers.set('Referer', new URL(url).origin + '/');
    } catch {
      /* ignore invalid urls */
    }
  }
  if (opts.form) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    if (!opts.body) opts.body = new URLSearchParams(opts.form).toString();
  }
  return headers;
}

/**
 * fetch wrapper with timeout + sensible browser headers. Uses the sandbox
 * fetch when running inside the legacy worker, otherwise the runtime's
 * native `fetch`.
 */
export async function fetchResponse(url: string, opts: FetchOptions = {}): Promise<Response> {
  const headers = buildHeaders(url, opts);
  const timeoutMs = opts.timeoutMs ?? 15000;

  const doFetch = (input: string, init: RequestInit): Promise<Response> =>
    sandboxFetch ? sandboxFetch(input, init) : fetch(input, init);

  if (!timeoutMs) return doFetch(url, { ...opts, headers });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort());

  try {
    return await doFetch(url, {
      ...opts,
      headers,
      signal: controller.signal,
      redirect: opts.redirect || 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET a URL and return its response body as text. Returns null on HTTP/network error. */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string | null> {
  try {
    const res = await fetchResponse(url, opts);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** GET a URL and parse the body as JSON. Returns null on any error. */
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  try {
    const res = await fetchResponse(url, opts);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as T;
    }
    // Some endpoints wrap JSON in HTML; extract the first {...} block.
    const fb = trimmed.indexOf('{');
    const lb = trimmed.lastIndexOf('}');
    if (fb !== -1 && lb !== -1 && lb > fb) {
      try { return JSON.parse(trimmed.substring(fb, lb + 1)) as T; } catch { /* ignore */ }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse an HTML string into a cheerio instance. Uses the sandbox HTML parser
 * when available; otherwise cheerio directly.
 */
export type TokoCheerio = CheerioAPI & {
  /** Legacy entry point used by providers: select from the document root. */
  find(selector: string): cheerio.Cheerio<unknown>;
};

export function loadHtml(html: string): TokoCheerio {
  const $: CheerioAPI = sandboxParseHtml
    ? sandboxParseHtml(html)
    : cheerio.load(html || '', { xml: false });
  // Providers historically call `$.find(selector)` (the worker sandbox
  // exposed a cheerio wrapper with that method). Expose it on the root
  // selection so the same code works in Node/browser/API without changes.
  ($ as unknown as TokoCheerio).find = (selector: string) => $(selector);
  return $ as unknown as TokoCheerio;
}
