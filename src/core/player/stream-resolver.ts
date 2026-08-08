import { fetchViaChain } from "@/core/network/proxyChain";

export interface StreamResolutionOptions {
  streamUrl: string;
  referer?: string;
  userAgent?: string;
  preferredUrl?: string;
  proxyPassword?: string;
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

export function isLoopbackProxyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
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

  add(resolveSingleStreamProxyBase());

  if (typeof window !== 'undefined') {
    add(`${window.location.origin}${CONFIG.defaultPath}`);
    CONFIG.legacyPaths.forEach((legacyPath) => {
      add(`${window.location.origin}${legacyPath}`);
    });
  }

  return candidates;
}

export function buildRefererCandidatesForStream(streamUrl: string, primaryReferer?: string): string[] {
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

  add(primaryReferer);

  return candidates.slice(0, 8);
}

export function buildProxyCandidateUrls(
  streamUrl: string,
  referer?: string,
  userAgent?: string,
  preferredUrl?: string,
  proxyPassword?: string,
): string[] {
  if (!/^https?:/i.test(streamUrl) || isLoopbackProxyUrl(streamUrl)) {
    return preferredUrl ? [preferredUrl] : [streamUrl];
  }

  const bases = buildProxyBaseCandidates();
  const referers = buildRefererCandidatesForStream(streamUrl, referer);
  const password = proxyPassword || CONFIG.password;

  const results: string[] = [];

  // Try direct first if it's not a known restricted host
  if (preferredUrl) results.push(preferredUrl);

  for (const base of bases) {
    for (const ref of referers) {
      const url = new URL(base);
      url.searchParams.set('url', streamUrl);
      url.searchParams.set('referer', ref);
      if (userAgent) url.searchParams.set('userAgent', userAgent);
      if (password) url.searchParams.set('password', password);
      results.push(url.href);
    }
  }

  return results;
}

export async function resolvePlayableStream(options: StreamResolutionOptions): Promise<string> {
  const candidates = buildProxyCandidateUrls(
    options.streamUrl,
    options.referer,
    options.userAgent,
    options.preferredUrl,
    options.proxyPassword
  );

  for (const url of candidates) {
    try {
      const res = await fetchViaChain(url);
      if (res.ok) return url;
    } catch {
      // Continue to next candidate
    }
  }

  return candidates[0] || options.streamUrl;
}
