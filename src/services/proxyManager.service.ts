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

const DEFAULT_STREAM_PROXY_PATH = '/api/v1/streamingProxy';
const DEFAULT_NODE_PROXY_LOADER = 'https://hoko.tatakai.me/api/v1/streamingProxy';
const DEFAULT_CF_PROXY_LOADER = 'https://moko.tatakai.me/api/v1/streamingProxy';
const LEGACY_STREAM_PROXY_PATHS = [
  '/api/v2/hianime/proxy/m3u8-streaming-proxy',
  '/api/proxy/m3u8-streaming-proxy',
];

const STREAM_PROXY_PASSWORD = String(
  import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
).trim();

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
  const cfUrl = normalizeUrl(import.meta.env.VITE_PROXY_CF_URL) || DEFAULT_CF_PROXY_LOADER;
  const nodeUrl = normalizeUrl(import.meta.env.VITE_PROXY_NODE_URL) || DEFAULT_NODE_PROXY_LOADER;
  const bunUrl = normalizeUrl(import.meta.env.VITE_PROXY_BUN_URL);
  const configuredDevProxyUrl = String(import.meta.env.VITE_PROXY_DEV_URL || '').trim();
  const devUrl = isLoopbackProxyUrl(configuredDevProxyUrl)
    ? null
    : normalizeUrl(configuredDevProxyUrl);

  if (cfUrl) fromTypedEnv.push(createNode('proxy-cf-1', cfUrl, 'cf', 10));
  if (nodeUrl) fromTypedEnv.push(createNode('proxy-node-1', nodeUrl, 'nodejs', 6));
  if (bunUrl) fromTypedEnv.push(createNode('proxy-bun-1', bunUrl, 'bun', 6));
  if (devUrl) fromTypedEnv.push(createNode('proxy-dev-1', devUrl, 'nodejs', 9));

  const fromPoolEnvRaw = (import.meta.env.VITE_PROXY_POOL_URLS || '')
    .split(',')
    .map((entry: string) => normalizeUrl(entry))
    .filter((entry: string | null): entry is string => !!entry);

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
  private currentIndex: number = 0;

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
  public getOptimalProxy(): ProxyNode | null {
    const available = this.pool.filter(p => p.status !== 'offline');
    if (available.length === 0) return null;

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

  /**
   * Executes a fetch request using the proxy balancer.
   */
  public async fetchProxied(targetUrl: string, options?: RequestInit, proxyType: 'api' | 'm3u8' = 'api', referer?: string): Promise<Response> {
    const maxRetries = 2; // Try up to 2 different proxies
    let lastError: any;

    for (let attempts = 0; attempts < maxRetries; attempts++) {
      const proxy = this.getOptimalProxy();
      if (!proxy) {
        throw new Error('No online proxies available in the pool.');
      }

      const start = performance.now();
      try {
        let fetchUrl = '';
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          ...(options?.headers as Record<string, string> || {})
        };

        // Standard transparent proxy format (Bun, Node, CF)
        // E.g., https://cf-proxy.com/?url=xyz&referer=abc
        const proxyParams = new URLSearchParams({ url: targetUrl, type: proxyType });
        if (referer) proxyParams.set('referer', referer);
        if (STREAM_PROXY_PASSWORD) proxyParams.set('password', STREAM_PROXY_PASSWORD);
        fetchUrl = `${proxy.url}?${proxyParams.toString()}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const response = await fetch(fetchUrl, {
          ...options,
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const latency = performance.now() - start;
          this.reportFailure(proxy.id, response.status);
          lastError = new Error(`Proxy ${proxy.id} failed with status: ${response.status}`);
          continue; // Try next proxy
        }

        const latency = performance.now() - start;
        this.reportSuccess(proxy.id, latency);
        return response;

      } catch (err: any) {
        this.reportFailure(proxy.id, 0); // 0 means network error / timeout
        lastError = err;
      }
    }

    throw lastError || new Error('All proxy attempts failed');
  }
}

export const proxyManager = new ProxyManager();
