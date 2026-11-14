import { resolveBackendOrigin } from './api/backendOrigin';
import { classifyAdultContent, type ContentMode } from "./adultContentPolicy";
let mode: ContentMode = "sfw";
let pending = false;
let revision = 0;
const listeners = new Set<() => void>();
const aborters = new Set<AbortController>();
export const getAdultMode = () => mode;
export const getAdultModeRevision = () => revision;
export function getContentModeCacheKey() {
  if (mode === 'sfw') return 'sfw';
  try {
    const categories = JSON.parse(localStorage.getItem('tatakai_content_safety') || '{}').adultCategories;
    return 'adult:' + ['explicit', 'ecchi', 'mature'].filter(key => categories?.[key] !== false).join(',');
  } catch { return 'adult:explicit,ecchi,mature'; }
}
export const isAdultConfirmationPending = () => pending;
export const subscribeAdultMode = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => listeners.forEach((listener) => listener());
export function requestAdultMode() {
  if (mode !== "adult") {
    pending = true;
    emit();
  }
}
export function dismissAdultMode() {
  pending = false;
  emit();
}
export function confirmAdultMode() {
  if (!pending) return;
  pending = false;
  mode = "adult";
  invalidateContentRequests();
}
export function disableAdultMode() {
  pending = false;
  mode = "sfw";
  invalidateContentRequests();
}
export function invalidateContentRequests() {
  revision++;
  for (const controller of aborters) controller.abort();
  aborters.clear();
  emit();
}
export function contentModePath(
  path: string,
  target: ContentMode = mode
): string {
  const suffix = path.match(/[?#].*$/)?.[0] || "";
  if(suffix) return contentModePath(path.slice(0,-suffix.length),target)+suffix;
  if (target === "sfw")
    return path
      .replace(/^\/adult\/anime(?=\/|$)/, "/anime")
      .replace(/^\/adult(?=\/)/, "")
      .replace(/^\/anime$/, "/browse")
      .replace(/^\/gallery$/, "/manga");
  if (path.startsWith("/adult/")) return path;
  if (path === "/" || path === '/browse') return "/adult/anime";
  return /^\/(anime|manga|novel|search|trending|watch|genre)(\/|$)/.test(path)
    ? "/adult" + path
    : path;
}
let installed = false;
/** Scope the decorator to Tatakai catalog URLs; never attach these headers to providers. */
export function installContentModeFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url,
      window.location.href
    );
    const backend = new URL(resolveBackendOrigin() || window.location.href,window.location.href).origin;
    if(url.origin!==window.location.origin && url.origin!==backend) return original(input,init);
    if (
      !/^\/api\/v3\/(content|manga|novel|anilist|adult)(\/|$)/.test(
        url.pathname
      )
    )
      return original(input, init);
    const currentRevision = revision;
    const controller = new AbortController();
    aborters.add(controller);
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    let categories = ["explicit", "ecchi", "mature"];
    try {
      const p = JSON.parse(
        localStorage.getItem("tatakai_content_safety") || "{}"
      ).adultCategories;
      if (p) categories = categories.filter((k) => p[k] !== false);
    } catch {
      /* defaults */
    }
    const requestedCategories = url.searchParams.get('adultCategories') ?? headers.get('X-Tatakai-Adult-Categories');
    if (requestedCategories !== null) {
      const requested = requestedCategories.split(',');
      categories = categories.filter(category => requested.includes(category));
    }
    headers.set("X-Tatakai-Content-Mode", mode);
    headers.set("X-Tatakai-Adult-Categories", categories.join(","));
    url.searchParams.set("contentMode", mode);
    url.searchParams.set("adultCategories", categories.join(","));
    const upstreamSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = upstreamSignal
      ? AbortSignal.any([upstreamSignal, controller.signal])
      : controller.signal;
    try {
      const request =
        input instanceof Request ? new Request(url.href, input) : url.href;
      const response = await original(request, { ...init, headers, signal });
      if (revision !== currentRevision)
        throw new DOMException("Content mode changed", "AbortError");
      const body = await response.text();
      if (revision !== currentRevision)
        throw new DOMException("Content mode changed", "AbortError");
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("Content-Length");
      responseHeaders.delete("Content-Encoding");
      return new Response([204,205,304].includes(response.status) ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } finally {
      aborters.delete(controller);
    }
  };
}
export { classifyAdultContent };
