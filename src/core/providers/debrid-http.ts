import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface DebridHttpRequestInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface DebridHttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export type DebridHttpRequest = (
  url: string,
  init?: DebridHttpRequestInit,
) => Promise<DebridHttpResponse>;

interface SerializedDebridResponse {
  status: number;
  statusText?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}

function responseFromSerialized(
  response: SerializedDebridResponse,
  requestUrl: string,
): DebridHttpResponse {
  const body = String(response.body ?? '');
  const status = Number(response.status) || 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(response.statusText || ''),
    url: String(response.url || requestUrl),
    headers: response.headers || {},
    text: async () => body,
    json: async <T = unknown>() => JSON.parse(body) as T,
  };
}

function bodyText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return JSON.stringify(value);
}

/**
 * Provider API transport shared by browser, Electron and Capacitor.
 *
 * Real-Debrid and TorBox do not consistently allow the app's packaged origins
 * through CORS. Electron therefore performs these requests in its main process
 * through a host-allowlisted IPC handler, while Capacitor uses its native HTTP
 * client. A normal browser keeps using fetch so the web build has no native
 * dependency at runtime.
 */
export const debridHttpRequest: DebridHttpRequest = async (url, init = {}) => {
  const method = init.method || 'GET';
  const timeoutMs = Math.max(1_000, Number(init.timeoutMs) || 20_000);

  if (Capacitor.isNativePlatform()) {
    // Preserve the exact Content-Type (multipart boundary for TorBox
    // createtorrent, urlencoded for Real-Debrid). Capacitor's native layer
    // drops headers with wrong casing on some Android builds, so normalize
    // to canonical casing before sending.
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(init.headers || {})) {
      const lower = String(name).toLowerCase();
      if (lower === 'content-type') headers['Content-Type'] = String(value);
      else if (lower === 'authorization') headers['Authorization'] = String(value);
      else if (lower === 'accept') headers['Accept'] = String(value);
      else headers[String(name)] = String(value);
    }
    const result = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: init.body,
      responseType: 'text',
      connectTimeout: Math.min(timeoutMs, 10_000),
      readTimeout: timeoutMs,
    } as any);

    // Native layer loses statusText — synthesize it so DebridApiError keeps
    // the provider error detail instead of "Unknown error".
    const statusText =
      String((result as { statusText?: unknown }).statusText || '') ||
      (result.status >= 200 && result.status < 300 ? 'OK' : `HTTP ${result.status}`);
    return responseFromSerialized({
      status: result.status,
      statusText,
      url: (result as any).url || url,
      headers: (result.headers || {}) as Record<string, string>,
      body: bodyText(result.data),
    }, url);
  }

  if (typeof window !== 'undefined' && typeof window.electron?.debridRequest === 'function') {
    const result = await window.electron.debridRequest({
      url,
      method,
      headers: init.headers || {},
      body: init.body,
      timeoutMs,
    });
    return responseFromSerialized(result, url);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url || url,
      headers: Object.fromEntries(response.headers.entries()),
      text: () => response.text(),
      json: <T = unknown>() => response.json() as Promise<T>,
    };
  } finally {
    clearTimeout(timeout);
  }
};
