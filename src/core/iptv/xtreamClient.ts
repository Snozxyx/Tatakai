import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { XtreamCredentials } from "./types";
import {
  registerNativeSource,
  unregisterNativeSource,
} from "@/core/mobile/localProxyNative";

export async function* streamIPTVText(
  url: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  let registered: string | null = null;
  try {
    if (Capacitor.isNativePlatform()) {
      registered = await registerNativeSource(url);
      if (!registered)
        throw new Error(
          "The local proxy is unavailable. Retry the guide import."
        );
    }
    const response = await fetch(registered || url, { signal });
    if (!response.ok || !response.body)
      throw new Error(`Guide returned ${response.status}`);
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let size = 0;
    try {
      while (true) {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 32 * 1024 * 1024)
          throw new Error("Guide exceeds 32 MB. Use a smaller regional guide.");
        yield decoder.decode(next.value, { stream: true });
      }
      yield decoder.decode();
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  } finally {
    if (registered) await unregisterNativeSource(registered);
  }
}
export async function fetchIPTVText(
  url: string,
  signal?: AbortSignal
): Promise<string> {
  if (!/^https?:\/\//i.test(url))
    throw new Error("Use an HTTP or HTTPS provider URL.");
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url,
      responseType: "text",
      connectTimeout: 15000,
      readTimeout: 30000,
    });
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Provider returned ${response.status}`);
    return typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.text();
}
export function xtreamURL(
  credentials: XtreamCredentials,
  action?: string,
  params: Record<string, string> = {}
) {
  const url = new URL(
    "player_api.php",
    credentials.server.replace(/\/?$/, "/")
  );
  url.search = new URLSearchParams({
    username: credentials.username,
    password: credentials.password,
    ...(action ? { action } : {}),
    ...params,
  }).toString();
  return url.href;
}
export async function xtreamRequest<T>(
  credentials: XtreamCredentials,
  action?: string,
  params?: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  return JSON.parse(
    await fetchIPTVText(xtreamURL(credentials, action, params), signal)
  );
}
export const xtreamActions = {
  live: "get_live_streams",
  categories: "get_live_categories",
  vod: "get_vod_streams",
  series: "get_series",
  seriesInfo: "get_series_info",
  shortEPG: "get_short_epg",
  fullEPG: "get_simple_data_table",
} as const;
