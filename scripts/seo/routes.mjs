/**
 * Path → shareable-entity matcher for server-side meta injection.
 *
 * Mirrors the client route table in src/routes/AppRoutes.tsx. Returns
 * `{ type, id }` for the 6 shareable entity types, or `null` for every other
 * path (home, search, settings, static assets, …) — a null match means the web
 * server serves the default site meta untouched.
 *
 * `type` is the share-API entity name; `id` is the raw path segment, passed to
 * /api/public/share/:type/:id verbatim (the API does its own id dispatch).
 */

/** Words that follow /manga/ but are NOT a manga id (list/discover/etc.). */
const MANGA_RESERVED = new Set(["read", "discover", "genre", "search"]);

/**
 * @param {string} pathname URL path (no query/hash), e.g. "/anime/anilist-21".
 * @returns {{ type: string, id: string } | null}
 */
export function matchEntityRoute(pathname) {
  const segs = String(pathname || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

  if (segs.length === 0) return null;

  // Catch-all @handle → profile (/@username).
  if (segs.length === 1) {
    const s = segs[0];
    if (s.startsWith("@") && s.length > 1) return { type: "profile", id: s.slice(1) };
    return null;
  }

  if (segs.length === 2) {
    const [a, b] = segs;
    if (!b) return null;
    switch (a) {
      case "anime":
        return { type: "anime", id: b };
      case "manga":
        return MANGA_RESERVED.has(b.toLowerCase()) ? null : { type: "manga", id: b };
      case "tierlist":
        return { type: "tierlist", id: b };
      case "p":
        return { type: "playlist", id: b };
      case "playlist":
        return { type: "playlist", id: b };
      case "user":
        return { type: "profile", id: b };
      default:
        return null;
    }
  }

  if (segs.length === 3) {
    const [a, b, c] = segs;
    if (a === "community" && b === "forum" && c) return { type: "post", id: c };
    return null;
  }

  return null;
}
