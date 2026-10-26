import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { extensionDeadline } from './deadline';
import { hasIosExtensionHttp, requestIosExtensionHttp } from '../mobile/iosExtensionHttp';
import { throwCompatibilityAbort } from '../compatibility/abort';

export interface ExtensionResponse {
  ok: boolean; status: number; statusText: string; url: string;
  rawHeaders: Record<string, string[]>; cookies: Record<string, string>;
  headers: { get(name: string): string | null };
  text(): Promise<string>; json(): Promise<any>;
}
/** Native HTTP on installed apps, standard CORS fetch in a browser. */
export async function extensionFetch(url: string, init: RequestInit = {}): Promise<ExtensionResponse> {
  return extensionDeadline(signal => fetchWithDeadline(url, { ...init, signal }), 15000, init.signal ?? undefined);
}
async function fetchWithDeadline(url: string, init: RequestInit): Promise<ExtensionResponse> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported extension URL protocol');
  throwCompatibilityAbort(init.signal || undefined);
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const native = (window as any).electron?.fetchExtensionResource;
  let response: { status: number; headers: Record<string, string | string[]>; body: string; url?: string; cookies?: Record<string, string> };
  if (native) {
    response = await native({ url, method: init.method || 'GET', headers, body: init.body });
  } else if (hasIosExtensionHttp()) {
    response = await requestIosExtensionHttp(url, init);
  } else if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ url, method: init.method || 'GET', headers, data: init.body, responseType: 'text', connectTimeout: 10000, readTimeout: 15000 });
    response = { status: r.status, headers: r.headers, body: typeof r.data === 'string' ? r.data : JSON.stringify(r.data), url: r.url };
  } else {
    const r = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(15000) });
    response = { status: r.status, headers: Object.fromEntries(r.headers.entries()), body: await r.text(), url: r.url };
  }
  throwCompatibilityAbort(init.signal || undefined);
  if (response.body.length > 10 * 1024 * 1024) throw new Error('Extension response is too large');
  const rawHeaders = Object.fromEntries(Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v : [v]]));
  const cookies: Record<string, string> = { ...response.cookies };
  for (const value of rawHeaders['set-cookie'] || []) {
    const pair = value.split(';')[0]; const i = pair.indexOf('=');
    if (i > 0) cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return { ok: response.status >= 200 && response.status < 300, status: response.status, statusText: '', url: response.url || url,
    rawHeaders, cookies, headers: { get: name => rawHeaders[name.toLowerCase()]?.join(', ') ?? null },
    text: async () => response.body, json: async () => JSON.parse(response.body) };
}
export async function fetchExtensionJson(url: string, signal?: AbortSignal): Promise<any> {
  const res = await extensionFetch(url, { signal });
  if (!res.ok) throw new Error(`Extension request failed (${res.status})`);
  return res.json();
}
