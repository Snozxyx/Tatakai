/**
 * Shared sitemap helpers for the two production web servers
 * (`scripts/ptero-start.mjs` and `scripts/seo/vite-seo-preview.mjs`).
 *
 * Single responsibility: a `/sitemap*.xml` (or `/sitemap.xsl`) URL must NEVER
 * resolve to the SPA fallback (`index.html`, i.e. `text/html`). Google Search
 * Console reports that exact failure as "Sitemap is HTML" with 0 discovered
 * URLs. Every helper here keeps that invariant:
 *
 *   - `canonicalSitemapPath()` also recognises a trailing-slash variant
 *     (`/sitemap-anime-1.xml/`) so callers can 301 it to the canonical XML
 *     URL instead of serving the SPA HTML for it.
 *   - `looksXml()` guards the upstream proxy against HTML/JSON error pages.
 *   - `degradedSitemapBody()` is the always-valid-XML last resort (served as
 *     503 so crawlers retry instead of indexing an error page).
 */

export const SITEMAP_RE = /^\/sitemap(-[\w.-]+)?\.(xml|xsl)$/;

/**
 * Return the canonical sitemap path for `pathname`, or null when it is not a
 * sitemap URL at all. A single trailing slash is tolerated and stripped
 * (`/sitemap-anime-1.xml/` → `/sitemap-anime-1.xml`) so the caller can
 * redirect instead of falling through to the SPA HTML fallback.
 * @param {string} pathname URL pathname without query string
 */
export function canonicalSitemapPath(pathname) {
  if (SITEMAP_RE.test(pathname)) return pathname;
  if (pathname.endsWith("/") && SITEMAP_RE.test(pathname.slice(0, -1))) {
    return pathname.slice(0, -1);
  }
  return null;
}

/** True when the upstream body actually parses as XML/XSL (not an HTML/JSON error page). */
export function looksXml(text) {
  const s = String(text || "").trimStart();
  return (
    s.startsWith("<?xml") ||
    s.startsWith("<urlset") ||
    s.startsWith("<sitemapindex") ||
    s.startsWith("<xsl:stylesheet") ||
    s.startsWith("<xsl:transform")
  );
}

/**
 * Last-resort body for a sitemap URL when neither upstream nor disk has usable
 * XML. Always valid XML (never HTML) — the caller must serve it as 503.
 * @param {string} canonicalPath canonical sitemap path (no trailing slash)
 * @param {string} siteOrigin e.g. "https://tatakai.me"
 */
export function degradedSitemapBody(canonicalPath, siteOrigin) {
  const isXsl = canonicalPath.endsWith(".xsl");
  const isIndex = canonicalPath === "/sitemap.xml";
  if (isXsl) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/"><html><body>temporarily unavailable</body></html></xsl:template></xsl:stylesheet>\n`;
  }
  if (isIndex) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${siteOrigin}/sitemap-static.xml</loc>\n  </sitemap>\n</sitemapindex>\n`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;
}

/** Content-Type for a canonical sitemap path (XML vs XSL stylesheet). */
export function sitemapContentType(canonicalPath) {
  return canonicalPath.endsWith(".xsl")
    ? "text/xsl; charset=utf-8"
    : "application/xml; charset=utf-8";
}
