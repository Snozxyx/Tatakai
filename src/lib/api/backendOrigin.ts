/**
 * backendOrigin.ts — canonical resolver for the TatakaiAPI backend URL.
 *
 * The renderer runs from different origins depending on the build:
 *   - web dev / https://tatakai.me — `/api/*` is proxied to the backend, so a
 *     relative path works.
 *   - desktop `app://tatakai.me` — a relative `/api/…` is intercepted by the
 *     app:// scheme handler and SPA-falls-back to `index.html`, so the fetch
 *     silently returns HTML (200) and the caller's `res.json()` throws.
 *
 * A bare relative `/api/v3/…` therefore breaks on desktop. Always resolve an
 * absolute origin (from `VITE_BACKEND_ORIGIN`, then the origin of
 * `VITE_TATAKAI_API_URL`, then the http page origin) so every build hits the
 * real backend. Mirrors the resolvers already used by marketplace-client.ts and
 * turnstile.ts.
 */

/** Absolute backend origin with no trailing slash, or "" when none is known. */
export function resolveBackendOrigin(): string {
  const explicit = String(import.meta.env.VITE_BACKEND_ORIGIN || "").trim();
  if (/^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, "");

  const apiUrl = String(import.meta.env.VITE_TATAKAI_API_URL || "").trim();
  try {
    if (apiUrl) return new URL(apiUrl).origin;
  } catch {
    /* fall through */
  }

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
