import { fetchViaChain } from "@/core/network/proxyChain";
import { getAllActiveProxyUrls, getActiveStreamingProxySnapshot } from "@/hooks/user/useProxySettings";

export interface StreamResolutionOptions {
  streamUrl: string;
  referer?: string;
  userAgent?: string;
  preferredUrl?: string;
  proxyPassword?: string;
  /** Ordered referer alternates supplied by the extension (best-first). */
  refererCandidates?: string[];
}

export interface StreamProxyConfig {
  remoteProxy: string;
  defaultPath: string;
  legacyPaths: string[];
  password: string;
}

const CONFIG: StreamProxyConfig = {
  remoteProxy: 'https://hoko.tatakai.me/api/v1/streamingProxy',
  defaultPath: '/api/v1/streamingProxy',
  legacyPaths: [],
  password: String(
    import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
  ).trim(),
};

// ── Proxy health cache ──────────────────────────────────────────────
// Remembers the last working proxy base + referer so the next stream skips
// dead candidates entirely (desktop-parity fast path). Persisted to
// localStorage so it survives reloads; in-memory first for speed.
const HEALTH_KEY = 'tatakai_proxy_health_v1';
let healthCache: { base?: string; referer?: string; at?: number } = {};
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(HEALTH_KEY) : null;
  if (raw) healthCache = JSON.parse(raw) || {};
} catch { /* storage unavailable */ }

function persistHealth(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HEALTH_KEY, JSON.stringify({ ...healthCache, at: Date.now() }));
    }
  } catch { /* ignore */ }
}

export function markProxyWorking(base: string, referer?: string): void {
  const b = String(base || '').trim().replace(/\/$/, '');
  if (!b) return;
  // Only trust fresh entries (24h).
  healthCache = { base: b, referer: referer || healthCache.referer, at: Date.now() };
  persistHealth();
}

export function markProxyFailed(base: string): void {
  const b = String(base || '').trim().replace(/\/$/, '');
  if (!b || healthCache.base !== b) return;
  // Drop stale winner so the next resolve re-probes instead of sticking to dead.
  healthCache = {};
  persistHealth();
}

function getHealthyBase(): string | undefined {
  if (!healthCache.base) return undefined;
  const age = Date.now() - Number(healthCache.at || 0);
  if (Number.isFinite(age) && age > 24 * 3600 * 1000) return undefined;
  return healthCache.base;
}

// Hosts whose URLs must NEVER be wrapped in the remote streaming proxy.
// Debrid CDN links are IP-pinned/expiring: proxy IP != device IP => 403, plus
// an extra hop on already-direct links. Play them direct.
const DEBRID_DIRECT_HOSTS = [
  'real-debrid.com',
  'download.real-debrid.com',
  'torbox.app',
  'torboxcdn.com',
  'api.torbox.app',
];

export function isDebridDirectUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return DEBRID_DIRECT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function isLoopbackProxyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname === '::1'
    );
  } catch {
    return (
      value.includes('localhost:') ||
      value.includes('127.0.0.1:') ||
      value.includes('0.0.0.0:') ||
      value.includes('::1')
    );
  }
}

export function isMokoProxyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return /(^|\.)moko\.tatakai\.me$/i.test(parsed.hostname);
  } catch {
    return /(^|\.)moko\.tatakai\.me/i.test(value);
  }
}

export function resolveSingleStreamProxyBase(): string {
  const userProxy = getActiveStreamingProxySnapshot();
  if (userProxy?.url && !isLoopbackProxyUrl(userProxy.url)) {
    return userProxy.url.replace(/\/$/, '');
  }

  const explicitProxyBase = String(
    import.meta.env.VITE_SINGLE_STREAM_PROXY_URL ||
      import.meta.env.VITE_STREAM_PROXY_URL ||
      import.meta.env.VITE_PROXY_DEV_URL ||
      ''
  ).trim();

  if (explicitProxyBase && !isLoopbackProxyUrl(explicitProxyBase)) {
    return explicitProxyBase.replace(/\/$/, '');
  }

  return CONFIG.remoteProxy;
}

export function buildProxyBaseCandidates(): string[] {
  const candidates: string[] = [];
  const add = (value?: string) => {
    const normalized = String(value || '').trim().replace(/\/$/, '');
    if (!normalized) return;
    if (isMokoProxyUrl(normalized)) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  // Last-known-good base first — this is what makes repeat plays instant.
  const healthy = getHealthyBase();
  if (healthy) add(healthy);

  // Add all user configured active proxies first
  try {
    const userProxies = getAllActiveProxyUrls();
    // Cap to 3 user proxies: bases × referers explodes otherwise.
    userProxies.slice(0, 3).forEach(add);
  } catch (_) { }

  add(resolveSingleStreamProxyBase());

  // On Capacitor the WebView origin (tatakai.me/localhost) isn't the backend,
  // so an origin-relative proxy path is a dead candidate — use the real backend.
  const cap = (globalThis as any).Capacitor;
  const isNative = !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
  const proxyOrigin =
    isNative
      ? (String(import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/+$/, '') || 'https://api.tatakai.me')
      : (typeof window !== 'undefined' ? window.location.origin : '');
  if (proxyOrigin) {
    add(`${proxyOrigin}${CONFIG.defaultPath}`);
    CONFIG.legacyPaths.forEach((legacyPath) => {
      add(`${proxyOrigin}${legacyPath}`);
    });
  }

  return candidates;
}

export function buildRefererCandidatesForStream(
  streamUrl: string,
  primaryReferer?: string,
  extraCandidates?: string[],
): string[] {
  const candidates: string[] = [];
  const add = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    try {
      const normalized = new URL(raw).href;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    } catch {
      // Ignore invalid referer values.
    }
  };

  // Primary referer first, then the extension-supplied alternates in order.
  // The proxy is content-agnostic: these are the only referers it will try.
  add(primaryReferer);
  (extraCandidates || []).forEach(add);

  return candidates.slice(0, 8);
}

export function buildProxyCandidateUrls(
  streamUrl: string,
  referer?: string,
  userAgent?: string,
  preferredUrl?: string,
  proxyPassword?: string,
  refererCandidates?: string[],
): string[] {
  if (!/^https?:/i.test(streamUrl) || isLoopbackProxyUrl(streamUrl)) {
    return preferredUrl ? [preferredUrl] : [streamUrl];
  }

  // Debrid CDN links are direct-only (IP-pinned). Never proxy them.
  if (isDebridDirectUrl(streamUrl)) {
    return preferredUrl ? [preferredUrl, streamUrl] : [streamUrl];
  }

  const bases = buildProxyBaseCandidates().slice(0, 3);
  // Cap referers to 3: bases(3) × referers(3) = 9 max instead of 16-24.
  // Healthy referer (last working) leads when known.
  let referers = buildRefererCandidatesForStream(streamUrl, referer, refererCandidates).slice(0, 3);
  if (healthCache.referer) {
    const healthyRef = healthCache.referer;
    referers = [healthyRef, ...referers.filter((r) => r !== healthyRef)].slice(0, 3);
  }
  // Always have at least one referer so proxied URLs are valid.
  if (!referers.length && referer) {
    try { referers = [new URL(referer).href]; } catch { /* ignore */ }
  }
  const password = proxyPassword || CONFIG.password;

  const results: string[] = [];

  // Try direct first if it's not a known restricted host
  if (preferredUrl) results.push(preferredUrl);

  for (const base of bases) {
    // No referer: single candidate per base (open CDN path).
    if (!referers.length) {
      const url = new URL(base);
      url.searchParams.set('url', streamUrl);
      if (userAgent) url.searchParams.set('userAgent', userAgent);
      if (password) url.searchParams.set('password', password);
      results.push(url.href);
      continue;
    }
    for (const ref of referers) {
      const url = new URL(base);
      url.searchParams.set('url', streamUrl);
      url.searchParams.set('referer', ref);
      if (userAgent) url.searchParams.set('userAgent', userAgent);
      if (password) url.searchParams.set('password', password);
      results.push(url.href);
    }
  }

  // Hard cap: never hand hls.js / the probe loop more than 8 URLs.
  return results.slice(0, 8);
}

/**
 * Ordered playback URLs for the mobile player, best first. Mobile's own loader
 * mounts one URL and only then retries, so a wrong proxy base or referer used to
 * cost 8–30s before any failover happened. Mirrors desktop's `HlsAdapter`
 * candidate ladder, which never mounts until a candidate has answered.
 */
export function buildMobilePlaybackCandidates(
  streamUrl: string,
  opts: {
    proxiedUrl?: string;
    referer?: string;
    userAgent?: string;
    refererCandidates?: string[];
    proxyPassword?: string;
  } = {},
): string[] {
  const source = String(streamUrl || '').trim();
  const results: string[] = [];
  const add = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw || results.includes(raw)) return;
    if (results.length >= 8) return;
    results.push(raw);
  };

  // Already an in-app proxy token (mobile loopback): nothing to wrap.
  if (!/^https?:/i.test(source) || isLoopbackProxyUrl(source)) {
    add(opts.proxiedUrl || source);
    return results;
  }

  // Debrid CDN links play direct — proxying breaks IP-pinned URLs.
  if (isDebridDirectUrl(source)) {
    add(source);
    add(opts.proxiedUrl);
    return results;
  }

  // Direct access first — open CDNs answer with CORS, and this is the fastest
  // path available to the mobile WebView.
  add(source);

  const referers = buildRefererCandidatesForStream(source, opts.referer, opts.refererCandidates).slice(0, 3);
  const password = (opts as { proxyPassword?: string }).proxyPassword ?? getActiveStreamingProxySnapshot().password ?? CONFIG.password;
  for (const base of buildProxyBaseCandidates().slice(0, 3)) {
    if (!referers.length) {
      const url = new URL(base);
      url.searchParams.set('url', source);
      if (opts.userAgent) url.searchParams.set('userAgent', opts.userAgent);
      if (password) url.searchParams.set('password', password);
      add(url.href);
      continue;
    }
    for (const referer of referers) {
      const url = new URL(base);
      url.searchParams.set('url', source);
      url.searchParams.set('referer', referer);
      if (opts.userAgent) url.searchParams.set('userAgent', opts.userAgent);
      if (password) url.searchParams.set('password', password);
      add(url.href);
    }
  }

  // Whatever the caller already resolved stands last — at least one proxied
  // shape is guaranteed to be in the ladder.
  add(opts.proxiedUrl);

  return results;
}

/**
 * Probe a playback candidate without mounting it. `range: false` is the HLS
 * case: any 2xx means the manifest answers, which is all the failover ladder
 * needs to know.
 */
export async function probePlaybackCandidate(
  url: string,
  opts: { timeoutMs?: number; range?: boolean } = {},
): Promise<boolean> {
  // Fast default: dead proxy bases used to cost 4s each sequentially. 1.5s is
  // enough for a healthy edge to answer a manifest/byte-0 probe.
  const timeoutMs = opts.timeoutMs ?? 1500;
  if (!/^https?:/i.test(url)) return false;
  // Loopback / direct URLs need no network probe — mounting is the probe.
  if (isLoopbackProxyUrl(url)) return true;
  try {
    const headers: Record<string, string> = {};
    if (opts.range !== false) headers.Range = 'bytes=0-0';
    const res = await fetch(url, {
      method: 'GET',
      headers,
      mode: 'cors',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

/**
 * First-fulfilled race compatible with the app's ES2017 lib target (no
 * Promise.any). Resolves with the first probe that succeeds, rejects only
 * when every probe fails.
 */
export function firstFulfilled<T>(promises: Array<Promise<T>>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!promises.length) {
      reject(new Error('no candidates'));
      return;
    }
    let rejected = 0;
    promises.forEach((p) => {
      Promise.resolve(p).then(resolve, () => {
        rejected += 1;
        if (rejected >= promises.length) reject(new Error('all candidates failed'));
      });
    });
  });
}

/**
 * Probe candidates in parallel and return the first that answers, preserving
 * ladder order for ties. Replaces the old sequential loop (4s × N URLs).
 * Resolves in ~max(fastest candidate) instead of sum(all dead candidates).
 */
export async function resolvePlayableStreamFast(
  candidates: string[],
  opts: { timeoutMs?: number; range?: boolean } = {},
): Promise<string | null> {
  if (!candidates.length) return null;
  if (candidates.length === 1) {
    return (await probePlaybackCandidate(candidates[0], opts)) ? candidates[0] : null;
  }
  const probes = candidates.map(async (url, index) => {
    const ok = await probePlaybackCandidate(url, opts);
    if (!ok) throw new Error(`dead:${index}`);
    return { url, index };
  });
  try {
    // First success wins; failures are ignored until all reject.
    const winner = await firstFulfilled(probes);
    try {
      const u = new URL(winner.url);
      const base = `${u.origin}${u.pathname}`.replace(/\/$/, '');
      const referer = u.searchParams.get('referer') || undefined;
      markProxyWorking(base, referer);
    } catch { /* health best-effort */ }
    return winner.url;
  } catch {
    return null;
  }
}

export async function resolvePlayableStream(options: StreamResolutionOptions): Promise<string> {
  const candidates = buildProxyCandidateUrls(
    options.streamUrl,
    options.referer,
    options.userAgent,
    options.preferredUrl,
    options.proxyPassword,
    options.refererCandidates
  );

  // Fast path: race all candidates in parallel (1.5s each). Falls back to a
  // single sequential fetchViaChain pass only if the race finds nothing, so a
  // probe-hostile (HEAD-blocking) CDN still plays.
  const fast = await resolvePlayableStreamFast(candidates, {
    // HLS manifests must not use Range; MP4 probes use byte-0.
    range: /\.m3u8(?:$|[?#/])/i.test(options.streamUrl) ? false : true,
  });
  if (fast) return fast;

  for (const url of candidates.slice(0, 3)) {
    try {
      const res = await fetchViaChain(url);
      if (res.ok) return url;
    } catch {
      // Continue to next candidate
    }
  }

  return candidates[0] || options.streamUrl;
}
