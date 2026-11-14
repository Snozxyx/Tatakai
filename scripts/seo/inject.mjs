/**
 * Server-side per-entity meta injection for social crawlers.
 *
 * The web server calls resolveMeta() for a matched entity route, renders the
 * blob into <meta> tags, and swaps them into dist/index.html between the
 * <!-- SEO:START --> / <!-- SEO:END --> markers. All data/secret logic lives in
 * TatakaiAPI; this module only fetches one normalized blob and formats it.
 *
 * Every failure path (timeout, network error, non-public 404) returns null so
 * the caller keeps the default site meta — a slow API never hangs a page load.
 */

const SHARE_API_ORIGIN = (
  process.env.SHARE_API_ORIGIN ||
  process.env.VITE_BACKEND_ORIGIN ||
  "https://api.tatakai.app"
).replace(/\/+$/, "");

const SITE_ORIGIN = (process.env.SITE_ORIGIN || "https://tatakai.app").replace(/\/+$/, "");

const FETCH_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Escape a string for use inside a double-quoted HTML attribute. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** schema.org type for each share-blob kind (kept in sync with src/components/seo/Seo.tsx). */
function schemaTypeFor(kind) {
  switch (kind) {
    case "anime":
      return "TVSeries";
    case "novel":
    case "manga":
      return "Book";
    case "post":
      return "Article";
    case "profile":
      return "ProfilePage";
    default:
      return "WebPage";
  }
}

/** Minimal valid JSON-LD for the entity — mirrors entityJsonLd() client-side. */
function renderJsonLd(meta, canonical, image, siteOrigin) {
  const desc = String(meta.description || "").replace(/\s+/g, " ").trim().slice(0, 5000);
  const node = {
    "@context": "https://schema.org",
    "@type": schemaTypeFor(meta.kind),
    name: meta.title || "Tatakai",
    url: canonical,
    isPartOf: { "@type": "WebSite", name: "Tatakai", url: siteOrigin },
  };
  if (desc) node.description = desc;
  if (image) node.image = image;
  // JSON inside <script>: escape `<` so a `</script>` in entity text can't break out.
  return JSON.stringify(node).replace(/</g, "\\u003c");
}

/** og:type best suited to each entity kind. */
function ogTypeFor(kind) {
  switch (kind) {
    case "post":
      return "article";
    case "anime":
      return "video.other";
    case "novel":
    case "manga":
      return "book";
    default:
      return "website";
  }
}

/**
 * Fetch the normalized share blob for a matched route. Returns null on any
 * error or non-public entity (caller falls back to default meta).
 * @param {{ type: string, id: string }} match
 */
export function createMetaResolver({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function resolve(match) {
    const key = `${match.type}/${match.id}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.value;
    if (pending.has(key)) return pending.get(key);

    const work = (async () => {
      let value = null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const url = `${SHARE_API_ORIGIN}/api/public/share/${encodeURIComponent(match.type)}/${encodeURIComponent(match.id)}`;
        const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
        if (res.ok) {
          const json = await res.json();
          if (json?.success && typeof json.data?.title === "string" && json.data.title.trim()) value = json.data;
        }
      } catch {
        // A failed lookup should recover promptly instead of keeping the site banner for five minutes.
      } finally {
        clearTimeout(timer);
      }
      cache.delete(key);
      if (cache.size >= 512) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: now() + (value ? CACHE_TTL_MS : 5000) });
      return value;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}

export const resolveMeta = createMetaResolver();

/**
 * Render a share blob into the replacement <head> meta block. `fallbackImage`
 * is the site default og:image (used when the entity has no image).
 * @param {object} meta normalized share blob from resolveMeta
 * @param {string} fallbackImage absolute default og:image URL
 */
export function renderTags(meta, fallbackImage, siteOrigin = SITE_ORIGIN) {
  const title = meta.title || "Tatakai";
  const description = meta.description || "";
  const canonical = `${siteOrigin}${meta.canonicalPath || "/"}`;
  const image = [meta.imageWide, meta.image, fallbackImage].find((url) => /^https?:\/\//i.test(url || ""));
  const ogType = ogTypeFor(meta.kind);

  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="title" content="${esc(title)}" />`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="${esc(ogType)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="Tatakai" />`,
    `<meta property="og:locale" content="en_US" />`,
  ];
  if (image) {
    lines.push(
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta property="og:image:alt" content="${esc(title)}" />`,
    );
  }
  lines.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  );
  if (image) lines.push(`<meta name="twitter:image" content="${esc(image)}" />`);
  if (image) lines.push(`<meta name="twitter:image:alt" content="${esc(title)}" />`);
  lines.push(
    `<script type="application/ld+json">${renderJsonLd(meta, canonical, image, siteOrigin)}</script>`,
  );

  // Helmet owns these tags after hydration, so client navigation replaces them instead of appending duplicates.
  return lines.map((l) => `    ${l.replace(/^<(meta|link|script)\b/, '<$1 data-rh="true"')}`).join("\n");
}

const SEO_START = "<!-- SEO:START -->";
const SEO_END = "<!-- SEO:END -->";

/**
 * Replace the marked <head> region of the base HTML with freshly rendered tags.
 * If the markers are absent (older build), returns the HTML unchanged.
 * @param {string} html base dist/index.html
 * @param {string} tagsHtml output of renderTags()
 */
export function injectIntoHtml(html, tagsHtml) {
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start === -1 || end === -1 || end < start) return html;
  const before = html.slice(0, start + SEO_START.length);
  const after = html.slice(end);
  return `${before}\n${tagsHtml}\n    ${after}`;
}

export { SITE_ORIGIN, SHARE_API_ORIGIN };
