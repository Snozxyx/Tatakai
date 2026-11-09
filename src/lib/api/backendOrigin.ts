/**
 * backendOrigin.ts — canonical resolver for the TatakaiAPI backend URL.
 *
 * The renderer runs from different origins depending on the build:
 *   - web dev / https://tatakai.app — `/api/*` is proxied to the backend, so a
 *     relative path works.
 *   - desktop `app://tatakai.me` — a relative `/api/…` is intercepted by the
 *     app:// scheme handler and SPA-falls-back to `index.html`, so the fetch
 *     silently returns HTML (200) and the caller's `res.json()` throws.
 *
 * Browser development uses Vite's same-origin proxy. Other builds resolve
 * `VITE_BACKEND_ORIGIN`, then the origin of `VITE_TATAKAI_API_URL`, with a
 * production fallback for native shells. Authentication and AniList calls
 * share this resolver.
 */

import { isCapacitor, isElectron } from "@/lib/platform/platform";

/** Vite owns API proxying for browser development, including localhost/tunnels. */
export function usesDevelopmentApiProxy(): boolean {
  return import.meta.env.DEV === true && !isCapacitor() && !isElectron()
    && typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol);
}

/** Absolute backend origin with no trailing slash, or "" when none is known. */
export function resolveBackendOrigin(): string {
  // Production .env values must not send local browsers around Vite's proxy.
  if (usesDevelopmentApiProxy()) return window.location.origin;
  const explicit = String(import.meta.env.VITE_BACKEND_ORIGIN || "").trim();
  if (/^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, "");

  const apiUrl = String(import.meta.env.VITE_TATAKAI_API_URL || "").trim();
  try {
    if (apiUrl) return new URL(apiUrl).origin;
  } catch {
    /* fall through */
  }

  // Capacitor runs from the WebView's own scheme (`capacitor://` /
  // `https://localhost`), which is NOT the backend and can't proxy `/api/*`.
  // A relative base there would hit the shell and return the SPA HTML, so an
  // explicit origin is required. Use the production backend as the last resort.
  if (isCapacitor()) return "https://api.tatakai.app";

  // Packaged desktop shells cannot proxy relative requests to the API.
  if (typeof window !== 'undefined' && /^(app:|file:|tauri:)$/.test(window.location.protocol)) {
    return 'https://api.tatakai.app';
  }

  // Without an explicit backend, HTTP pages use their same-origin API proxy.
  if (typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    return window.location.origin;
  }
  return "";
}

/**
 * The TatakaiAPI `/api/v3` base. Falls back to a relative `/api/v3` only when no
 * origin is resolvable (web dev, where Vite proxies it) — never on desktop,
 * where `VITE_BACKEND_ORIGIN` is set at build time.
 */
export function resolveApiV3Base(): string {
  const origin = resolveBackendOrigin();
  return origin ? `${origin}/api/v3` : "/api/v3";
}

/** Absolute URL of the AniList GraphQL proxy (`${apiV3}/anilist/graphql`). */
export const ANILIST_GRAPHQL_ENDPOINT = `${resolveApiV3Base()}/anilist/graphql`;
