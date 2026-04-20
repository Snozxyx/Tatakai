/**
 * Proxy Load Balancer Service
 * Distributes requests across a pool of distinct proxies (e.g., CF worker, Node.js proxy, Bun proxy)
 * Automatically detects overloads and routes around them.
 */

export interface ProxyNode {
  id: string;
  url: string;      // The base URL of the proxy
  type: 'cf' | 'nodejs' | 'bun';
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
  weight: number;   // 1-10, higher means receives more traffic
  lastChecked: number;
  failureCount: number;
}

function normalizeUrl(url: string | undefined | null): string | null {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, '');
}

function isLoopbackProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isMokoProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(^|\.)moko\.tatakai\.me$/i.test(parsed.hostname);
  } catch {
    return /(^|\.)moko\.tatakai\.me/i.test(url);
  }
}

const DEFAULT_STREAM_PROXY_PATH = '/api/v1/streamingProxy';
const DEFAULT_NODE_PROXY_LOADER = 'https://hoko.tatakai.me/api/v1/streamingProxy';
const LEGACY_STREAM_PROXY_PATHS = [
  '/api/v2/hianime/proxy/m3u8-streaming-proxy',
  '/api/proxy/m3u8-streaming-proxy',
];

const STREAM_PROXY_PASSWORD = String(
  import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
).trim();
const PROXY_FETCH_TIMEOUT_MS = {
  api: Math.max(2500, Math.min(Number.parseInt(String(import.meta.env.VITE_PROXY_API_TIMEOUT_MS || '7000'), 10) || 7000, 20000)),
  m3u8: Math.max(4000, Math.min(Number.parseInt(String(import.meta.env.VITE_PROXY_M3U8_TIMEOUT_MS || '10000'), 10) || 10000, 30000)),
} as const;
const PROXY_MAX_RETRIES = Math.max(1, Math.min(Number.parseInt(String(import.meta.env.VITE_PROXY_MAX_RETRIES || '2'), 10) || 2, 5));
const PROXY_RETRY_DELAY_BASE_MS = Math.max(75, Math.min(Number.parseInt(String(import.meta.env.VITE_PROXY_RETRY_DELAY_BASE_MS || '180'), 10) || 180, 1500));
const ENABLE_PROXY_INFLIGHT_DEDUPE =
  String(import.meta.env.VITE_PROXY_INFLIGHT_DEDUPE ?? 'true').toLowerCase() !== 'false';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function createNode(id: string, url: string, type: ProxyNode['type'], weight: number): ProxyNode {
  return {
    id,
    url,
    type,
    status: 'online',
    latencyMs: 0,
    weight,
    lastChecked: Date.now(),
    failureCount: 0,
  };
}

function buildProxyPool(): ProxyNode[] {
  const fromTypedEnv: ProxyNode[] = [];
  const cfUrl = normalizeUrl(import.meta.env.VITE_PROXY_CF_URL);
  const nodeUrl = normalizeUrl(import.meta.env.VITE_PROXY_NODE_URL) || DEFAULT_NODE_PROXY_LOADER;
  const bunUrl = normalizeUrl(import.meta.env.VITE_PROXY_BUN_URL);
  const configuredDevProxyUrl = String(import.meta.env.VITE_PROXY_DEV_URL || '').trim();
  const devUrl = isLoopbackProxyUrl(configuredDevProxyUrl)
    ? null
    : normalizeUrl(configuredDevProxyUrl);

  // Hoko should always be the primary proxy when available.
  if (nodeUrl && !isMokoProxyUrl(nodeUrl)) fromTypedEnv.push(createNode('proxy-node-1', nodeUrl, 'nodejs', 10));
  if (cfUrl && !isMokoProxyUrl(cfUrl)) fromTypedEnv.push(createNode('proxy-cf-1', cfUrl, 'cf', 6));
  if (bunUrl && !isMokoProxyUrl(bunUrl)) fromTypedEnv.push(createNode('proxy-bun-1', bunUrl, 'bun', 6));
  if (devUrl && !isMokoProxyUrl(devUrl)) fromTypedEnv.push(createNode('proxy-dev-1', devUrl, 'nodejs', 9));

  const fromPoolEnvRaw = (import.meta.env.VITE_PROXY_POOL_URLS || '')
    .split(',')
    .map((entry: string) => normalizeUrl(entry))
    .filter((entry: string | null): entry is string => !!entry && !isMokoProxyUrl(entry));

  const dynamicPool = fromPoolEnvRaw.map((url, index) => {
    const lower = url.toLowerCase();
    const inferredType: ProxyNode['type'] =
      lower.includes('worker') || lower.includes('cloudflare') || lower.includes('kira') || lower.includes('moko')
        ? 'cf'
        : lower.includes('bun')
          ? 'bun'
          : 'nodejs';

    return createNode(`proxy-dynamic-${index + 1}`, url, inferredType, index === 0 ? 10 : 5);
  });

  const deduped = new Map<string, ProxyNode>();
  [...fromTypedEnv, ...dynamicPool].forEach((node) => {
    if (!deduped.has(node.url)) {
      deduped.set(node.url, node);
    }
  });

  // Final fallback to local proxy endpoint so the balancer still works in local/dev setups.
  if (deduped.size === 0 && typeof window !== 'undefined') {
    const localProxyPrimary = `${window.location.origin}${DEFAULT_STREAM_PROXY_PATH}`;
    const localProxyLegacy = `${window.location.origin}${LEGACY_STREAM_PROXY_PATHS[0]}`;
    const localProxyLegacyFallback = `${window.location.origin}${LEGACY_STREAM_PROXY_PATHS[1]}`;
    deduped.set(localProxyPrimary, createNode('proxy-local-1', localProxyPrimary, 'nodejs', 10));
    deduped.set(localProxyLegacy, createNode('proxy-local-2', localProxyLegacy, 'nodejs', 8));
    deduped.set(localProxyLegacyFallback, createNode('proxy-local-3', localProxyLegacyFallback, 'nodejs', 7));
  }

  return Array.from(deduped.values());
}

const PROXY_POOL: ProxyNode[] = buildProxyPool();

class ProxyManager {
  private pool: ProxyNode[] = [...PROXY_POOL];
  private currentIndex: number = -1;
  private inflightRequests: Map<string, Promise<Response>> = new Map();

  public getPoolStats() {
    return this.pool;
  }

  public addProxy(proxy: ProxyNode) {
    if (!this.pool.find(p => p.id === proxy.id)) {
      this.pool.push(proxy);
    }
  }

  public removeProxy(id: string) {
    this.pool = this.pool.filter(p => p.id !== id);
  }

  /**
   * Gets the best available proxy using a weighted round-robin or latency-based approach.
   */
  public getOptimalProxy(excludedProxyIds: Set<string> = new Set()): ProxyNode | null {
    const available = this.pool.filter((proxy) => proxy.status !== 'offline' && !excludedProxyIds.has(proxy.id));
    if (available.length === 0) return null;

    const preferredHoko = available.find((proxy) => proxy.url.toLowerCase().includes('hoko.tatakai.me'));
    if (preferredHoko) {
      return preferredHoko;
    }

    // Simple round robin skipping offline nodes
    this.currentIndex = (this.currentIndex + 1) % available.length;
    return available[this.currentIndex];
  }

  /**
   * Reports a failure for a specific proxy, incrementing its failure count.
   * If failure count exceeds threshold, it marks it as offline.
   */
  public reportFailure(proxyId: string, statusCode: number) {
    const proxy = this.pool.find(p => p.id === proxyId);
    if (!proxy) return;

    proxy.failureCount += 1;

    // Treat 429 Too Many Requests as immediate degrade/offline to shed load
    if (statusCode === 429) {
      proxy.failureCount += 2;
    }

    if (proxy.failureCount >= 3) {
      proxy.status = 'offline';
      console.warn(`[ProxyManager] Proxy ${proxyId} marked offline due to failures.`);

      // Auto-recover after 1 minute
      setTimeout(() => {
        const p = this.pool.find(n => n.id === proxyId);
        if (p && p.status === 'offline') {
          p.status = 'degraded';
          p.failureCount = 0;
          console.log(`[ProxyManager] Proxy ${proxyId} attempting recovery (degraded).`);
        }
      }, 60000);
    } else {
      proxy.status = 'degraded';
    }
  }

  public reportSuccess(proxyId: string, latencyMs: number) {
    const proxy = this.pool.find(p => p.id === proxyId);
    if (!proxy) return;

    proxy.failureCount = Math.max(0, proxy.failureCount - 1);
    proxy.status = 'online';
    proxy.latencyMs = latencyMs;
    proxy.lastChecked = Date.now();
  }

  private shouldDedupeRequest(
    options?: RequestInit,
    proxyType: 'api' | 'm3u8' = 'api'
  ): boolean {
    if (!ENABLE_PROXY_INFLIGHT_DEDUPE) return false;
    if (proxyType !== 'api') return false;

    const method = String(options?.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return false;
    if (options?.body != null) return false;

    return true;
  }

  private buildInflightKey(
    targetUrl: string,
    proxyType: 'api' | 'm3u8',
    referer?: string,
    options?: RequestInit
  ): string {
    const method = String(options?.method || 'GET').toUpperCase();
    return `${proxyType}|${method}|${targetUrl}|${String(referer || '')}`;
  }

  private cloneResponseForCaller(response: Response): Response {
    try {
      return response.clone();
    } catch {
      return response;
    }
  }

  private async executeFetchWithBalancer(
    targetUrl: string,
    options?: RequestInit,
    proxyType: 'api' | 'm3u8' = 'api',
    referer?: string
  ): Promise<Response> {
    const maxAttempts = Math.max(1, Math.min(PROXY_MAX_RETRIES, this.pool.length || 1));
    const attemptedProxyIds = new Set<string>();
    let lastError: any;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const proxy = this.getOptimalProxy(attemptedProxyIds);
      if (!proxy) {
        break;
      }

      attemptedProxyIds.add(proxy.id);

      const start = performance.now();
      try {
        const headers: Record<string, string> = {
          'Accept': proxyType === 'api' ? 'application/json' : '*/*',
          ...(options?.headers as Record<string, string> || {})
        };

        // Standard transparent proxy format (Bun, Node, CF)
        // E.g., https://proxy.example.com/?url=xyz&referer=abc
        const proxyParams = new URLSearchParams({ url: targetUrl, type: proxyType });
        if (referer) proxyParams.set('referer', referer);
        if (STREAM_PROXY_PASSWORD) proxyParams.set('password', STREAM_PROXY_PASSWORD);
        const fetchUrl = `${proxy.url}?${proxyParams.toString()}`;

        const controller = new AbortController();
        const timeoutMs = PROXY_FETCH_TIMEOUT_MS[proxyType];
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(fetchUrl, {
          ...options,
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          this.reportFailure(proxy.id, response.status);
          lastError = new Error(`Proxy ${proxy.id} failed with status: ${response.status}`);
          if (attempts < maxAttempts - 1) {
            await sleep(PROXY_RETRY_DELAY_BASE_MS * (attempts + 1));
          }
          continue;
        }

        const latency = performance.now() - start;
        this.reportSuccess(proxy.id, latency);
        return response;

      } catch (err: any) {
        this.reportFailure(proxy.id, 0); // 0 means network error / timeout
        lastError = err;
        if (attempts < maxAttempts - 1) {
          await sleep(PROXY_RETRY_DELAY_BASE_MS * (attempts + 1));
        }
      }
    }

    throw lastError || new Error('All proxy attempts failed');
  }

  /**
   * Executes a fetch request using the proxy balancer.
   */
  public async fetchProxied(targetUrl: string, options?: RequestInit, proxyType: 'api' | 'm3u8' = 'api', referer?: string): Promise<Response> {
    const shouldDedupe = this.shouldDedupeRequest(options, proxyType);
    if (!shouldDedupe) {
      return this.executeFetchWithBalancer(targetUrl, options, proxyType, referer);
    }

    const inflightKey = this.buildInflightKey(targetUrl, proxyType, referer, options);
    const existing = this.inflightRequests.get(inflightKey);
    if (existing) {
      const sharedResponse = await existing;
      return this.cloneResponseForCaller(sharedResponse);
    }

    const pendingRequest = this.executeFetchWithBalancer(targetUrl, options, proxyType, referer);
    this.inflightRequests.set(inflightKey, pendingRequest);

    try {
      const response = await pendingRequest;
      return this.cloneResponseForCaller(response);
    } finally {
      this.inflightRequests.delete(inflightKey);
    }
  }
}

export const proxyManager = new ProxyManager();
