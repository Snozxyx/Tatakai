/**
 * localProxyNative.ts — JS bridge to the Android loopback media proxy.
 *
 * Native counterpart wiring for `TatakaiLocalProxyPlugin`
 * (`android/.../proxy/TatakaiLocalProxyPlugin.java`), itself the native port
 * of `desktop/runtime/proxy/local-proxy-server.cjs` (`LocalProxyServer`).
 *
 * When the plugin is present (Android builds with the proxy bundled), the
 * shared token registry in `mobileProxy.ts` returns
 * `http://127.0.0.1:<port>/stream/<token>` URLs instead of in-memory
 * `mobile-proxy://` URLs. The WebView then loads anime HLS/MP4, subtitles,
 * manga page images and download assets with a plain HTTP load — header replay,
 * Range and `.m3u8` child-rewrite happen natively, exactly like desktop.
 * When absent (iOS / web / old APK), everything falls back to the existing
 * `mobile-proxy://` + CapacitorHttp path with zero caller changes.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { isCapacitor } from '@/lib/platform/platform';

type LocalProxyPlugin = {
  ensureStarted(): Promise<{ success: boolean; baseUrl?: string }>;
  getBaseUrl(): Promise<{ success: boolean; baseUrl?: string }>;
  registerSource(options: {
    url: string;
    headers?: Record<string, string>;
    token?: string;
  }): Promise<{ success: boolean; token?: string; proxyUrl?: string }>;
  setEmbedActive(options: { active: boolean }): Promise<{ success: boolean }>;
  setWatchActive(options: { active: boolean }): Promise<{ success: boolean }>;
  getStats(): Promise<{ success: boolean; entries?: number; baseUrl?: string }>;
};

let plugin: LocalProxyPlugin | null = null;
let baseUrl: string | null = null;
let startPromise: Promise<string | null> | null = null;

/**
 * Tokens minted before the native server finished starting (the bootstrap
 * window). Desktop's supervisor starts the proxy before it listens, so no
 * token is ever unservable there — flushing these on start gives mobile the
 * same guarantee instead of a first-load 410.
 */
let pendingMirrors: Array<{ token: string; url: string; headers: Record<string, string> }> = [];

async function flushPendingMirrors(): Promise<void> {
  const p = loadPlugin();
  if (!p || !baseUrl || !pendingMirrors.length) {
    if (!p) pendingMirrors = [];
    return;
  }
  const batch = pendingMirrors;
  pendingMirrors = [];
  await Promise.allSettled(
    batch.map((m) => p.registerSource({ url: m.url, headers: m.headers, token: m.token })),
  );
}

function loadPlugin(): LocalProxyPlugin | null {
  if (plugin || typeof window === 'undefined') return plugin;
  try {
    if (!isCapacitor()) return null;
    if (!Capacitor.isPluginAvailable('TatakaiLocalProxy')) return null;
    plugin = registerPlugin<LocalProxyPlugin>('TatakaiLocalProxy');
    return plugin;
  } catch {
    return null;
  }
}

export function isLocalProxyPluginAvailable(): boolean {
  return loadPlugin() != null;
}

export function getNativeProxyBaseUrl(): string | null {
  return baseUrl;
}

export function isNativeProxyUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (baseUrl && value.startsWith(`${baseUrl}/stream/`)) return true;
  // Base URL unknown yet (pre-bootstrap probe) — match the shape anyway so
  // callers treat loopback stream URLs as direct loads, never blob relays.
  return /^http:\/\/127\.0\.0\.1:\d+\/stream\/[a-f0-9]{32}/i.test(value);
}

/** Start the loopback server (idempotent). Returns the base URL or null. */
export function ensureNativeProxy(): Promise<string | null> {
  if (baseUrl) return Promise.resolve(baseUrl);
  if (startPromise) return startPromise;
  const p = loadPlugin();
  if (!p) return Promise.resolve(null);
  startPromise = (async () => {
    try {
      const res = await p.ensureStarted();
      const url = String(res?.baseUrl || '').replace(/\/$/, '');
      if (res?.success && /^http:\/\/127\.0\.0\.1:\d+$/i.test(url)) {
        baseUrl = url;
        // Tokens minted during the bootstrap window become servable now.
        await flushPendingMirrors();
        try {
          const { setNativeProxyBaseUrl } = await import('@/core/extensions/mobile/mobileProxy');
          setNativeProxyBaseUrl(baseUrl);
        } catch {
          /* registry keeps working with mobile-proxy:// URLs */
        }
        return baseUrl;
      }
    } catch {
      /* native proxy unavailable — JS fallback stays */
    }
    return null;
  })().finally(() => {
    // Allow a later retry after an app resume.
    if (!baseUrl) startPromise = null;
  });
  return startPromise;
}

/**
 * Re-run startup (app resume / process recycle). No-op when already running;
 * lets a dead native service recover without an app restart.
 */
export function reensureNativeProxy(): Promise<string | null> {
  if (baseUrl) {
    void flushPendingMirrors();
    return Promise.resolve(baseUrl);
  }
  startPromise = null;
  return ensureNativeProxy();
}

/**
 * Mirror a JS-minted token into the native server (fire-and-forget).
 * The token stays the source of truth in `mobileProxy.ts`; this only ensures
 * the native server can serve `http://127.0.0.1:<port>/stream/<token>`.
 * Before the server has started the mirror is queued and flushed on start
 * instead of being dropped (the cold-start 410 race).
 */
export function mirrorTokenToNative(
  token: string,
  url: string,
  headers: Record<string, string>,
): void {
  try {
    const p = loadPlugin();
    if (!p) return;
    if (!/^[a-f0-9]{32}$/i.test(token)) return;
    const normalized = { token: token.toLowerCase(), url, headers };
    if (!baseUrl) {
      pendingMirrors.push(normalized);
      // Bound the queue — a failed native service must not leak memory.
      if (pendingMirrors.length > 200) pendingMirrors.splice(0, pendingMirrors.length - 200);
      // Kick startup in case bootstrap hasn't run yet.
      void ensureNativeProxy();
      return;
    }
    void p.registerSource({ url, headers, token: normalized.token }).catch(() => undefined);
  } catch {
    /* best-effort */
  }
}

/** Native-minted registration (async path — downloaders / probes). */
export async function registerNativeSource(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  const p = loadPlugin();
  if (!p) return null;
  const base = baseUrl || (await ensureNativeProxy());
  if (!base) return null;
  try {
    const res = await p.registerSource({ url, headers });
    if (res?.success && typeof res.proxyUrl === 'string' && res.proxyUrl) return res.proxyUrl;
  } catch {
    /* fall through */
  }
  return null;
}
