/**
 * Native HLS transport for Capacitor.
 *
 * Browser HLS loaders cannot send the Referer/Origin/User-Agent required by
 * many providers and pay an extra hop through the hosted proxy. CapacitorHttp
 * is Android's equivalent of the desktop loopback proxy: it is not CORS-bound
 * and can replay those headers for every playlist, key, and media request.
 *
 * In-app proxy URLs (`mobile-proxy://stream/<token>`, minted by mobileProxy —
 * the mobile equivalent of the desktop `LocalProxyServer` tokens) resolve to
 * their stored URL + replay headers here. Playlist responses are rewritten so
 * every child reference (segments, keys, variant playlists) becomes a fresh
 * proxy token carrying the same headers — a direct port of the desktop
 * `_rewritePlaylistUrls`.
 */
import { CapacitorHttp } from "@capacitor/core";
import {
  base64ToArrayBufferChunked,
  copyToArrayBuffer,
  fetchViaMobileProxy,
  isHlsProxyPayload,
  isMobileProxyUrl,
  normalizeMobileHeaders,
  resolveMobileProxy,
  rewriteMobilePlaylist,
} from "./mobileProxy";

export type NativeHlsHeaders = {
  referer?: string;
  userAgent?: string;
  origin?: string;
};

function requestHeaders(sourceHeaders: NativeHlsHeaders, context: any): Record<string, string> {
  const headers: Record<string, string> = { ...(context?.headers || {}) };
  if (sourceHeaders.referer) headers.Referer = sourceHeaders.referer;
  if (sourceHeaders.userAgent) headers["User-Agent"] = sourceHeaders.userAgent;
  if (sourceHeaders.origin) headers.Origin = sourceHeaders.origin;
  if (typeof context?.rangeStart === "number") {
    const end = typeof context.rangeEnd === "number" ? context.rangeEnd - 1 : "";
    headers.Range = `bytes=${context.rangeStart}-${end}`;
  }
  return headers;
}

function makeStats(start: number) {
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  };
}

function toBinary(raw: unknown): ArrayBuffer | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    return copyToArrayBuffer(raw as ArrayBufferView);
  }
  if (typeof raw === "string") {
    try {
      return base64ToArrayBufferChunked(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/** Returns an hls.js loader constructor bound to one source's required headers. */
export function createNativeHlsLoader(sourceHeaders: NativeHlsHeaders) {
  return class NativeHlsLoader {
    context: any = null;
    stats: any = makeStats(0);
    private aborted = false;

    // hls.js supplies a config argument when constructing loaders.
    constructor(_config?: unknown) {}

    load(context: any, _config: any, callbacks: any): void {
      this.context = context;
      this.aborted = false;
      const start = performance.now();
      const stats = makeStats(start);
      this.stats = stats;
      const textResponse = context.responseType === "text" || context.responseType === "json";

      // In-app proxy token: the stored entry owns the exact replay headers
      // (mirrors the desktop `/stream/<token>` fetch). Explicit per-request
      // headers still win where set.
      const proxyEntry = isMobileProxyUrl(context?.url)
        ? resolveMobileProxy(String(context.url))
        : null;
      const proxyHeaders = proxyEntry ? normalizeMobileHeaders(proxyEntry.headers) : {};
      const mergedSourceHeaders: NativeHlsHeaders = {
        referer: sourceHeaders.referer || proxyHeaders.Referer || proxyHeaders.referer,
        userAgent:
          sourceHeaders.userAgent || proxyHeaders["User-Agent"] || proxyHeaders["user-agent"],
        origin: sourceHeaders.origin || proxyHeaders.Origin || proxyHeaders.origin,
      };

      // Route every request through the shared proxy fetch so token resolution,
      // header replay and binary handling live in one place. The entry's stored
      // headers are the base; the loader's per-source headers fill the gaps.
      const extra = requestHeaders(mergedSourceHeaders, context);
      // Faster dead-server failover on mobile: playlists must answer quickly
      // (8s), segments can take longer (25s). The old 30s/60s stalls made a
      // dead server look like "very slow" before the player gave up.
      const isManifest = textResponse || context?.type === "manifest" || context?.type === "level";
      const send = async () => {
        if (proxyEntry) {
          return fetchViaMobileProxy(String(context.url), {
            headers: extra,
            range: extra.Range,
            responseType: textResponse ? "text" : "arraybuffer",
            timeoutMs: isManifest ? 8000 : 25000,
          }).then((res) => ({
            status: res.status,
            headers: res.headers,
            contentType: res.contentType,
            data: textResponse ? res.text : res.data,
            url: res.url,
          }));
        }
        const res = await CapacitorHttp.request({
          url: context.url,
          method: "GET",
          headers: extra,
          responseType: textResponse ? "text" : "arraybuffer",
          connectTimeout: 6000,
          readTimeout: isManifest ? 8000 : 25000,
        } as any);
        return {
          status: Number(res?.status) || 0,
          headers: (res?.headers || {}) as Record<string, string>,
          contentType: "",
          data: (res as any)?.data,
          url: (res as any)?.url,
        };
      };

      void send().then((response: any) => {
        if (this.aborted) return;
        const end = performance.now();
        stats.loading.first = end;
        stats.loading.end = end;
        const status = Number(response?.status) || 0;
        if (status < 200 || status >= 300) {
          callbacks.onError({ code: status, text: `Native HLS request failed (${status})` }, context, response, stats);
          return;
        }

        const raw = response?.data;
        if (textResponse) {
          const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
          // Rewrite child references to fresh proxy tokens so segments/keys
          // replay the same headers (desktop `_rewritePlaylistUrls` parity).
          // Only for real playlists — key files and other text payloads pass
          // through untouched.
          const isPlaylist =
            context?.type === "manifest" ||
            context?.type === "level" ||
            isHlsProxyPayload(String(response?.url || context.url), String(response?.contentType || ""));
          const upstreamUrl = proxyEntry ? proxyEntry.url : String(context.url);
          const data = isPlaylist
            ? rewriteMobilePlaylist(text, upstreamUrl, {
                ...proxyHeaders,
                ...normalizeMobileHeaders(extra),
              })
            : text;
          const size = data.length;
          stats.loaded = size;
          stats.total = size;
          stats.chunkCount = 1;
          stats.bwEstimate = end > start ? (size * 8000) / (end - start) : 0;
          callbacks.onSuccess({ url: response?.url || context.url, data, code: status }, stats, context, response);
          return;
        }

        const data = toBinary(raw);
        if (!data) {
          callbacks.onError({ code: status, text: "Native HLS binary decode failed" }, context, response, stats);
          return;
        }
        const size = data.byteLength || 0;
        stats.loaded = size;
        stats.total = size;
        stats.chunkCount = 1;
        stats.bwEstimate = end > start ? (size * 8000) / (end - start) : 0;
        callbacks.onSuccess({ url: response?.url || context.url, data, code: status }, stats, context, response);
      }).catch((error: unknown) => {
        if (this.aborted) return;
        const end = performance.now();
        stats.loading.first = end;
        stats.loading.end = end;
        callbacks.onError({ code: 0, text: error instanceof Error ? error.message : "Native HLS request failed" }, context, null, stats);
      });
    }

    abort(): void {
      this.aborted = true;
      this.stats.aborted = true;
    }

    destroy(): void {
      this.abort();
      this.context = null;
    }
  };
}
