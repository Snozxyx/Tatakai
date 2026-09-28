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
  "https://api.tatakai.me"
).replace(/\/+$/, "");

const SITE_ORIGIN = (process.env.SITE_ORIGIN || "https://tatakai.me").replace(/\/+$/, "");

const FETCH_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Small in-memory TTL cache (blob or null) keyed by "type/id". */
const cache = new Map();

/** Escape a string for use inside a double-quoted HTML attribute. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** og:type best suited to each entity kind. */
function ogTypeFor(kind) {
  switch (kind) {
    case "post":
      return "article";
    case "anime":
      return "video.other";
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
export async function resolveMeta(match) {
  const key = `${match.type}/${match.id}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.value;

  let value = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const url = `${SHARE_API_ORIGIN}/api/public/share/${encodeURIComponent(
      match.type,
    )}/${encodeURIComponent(match.id)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    }).finally(() => clearTimeout(timer));
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && json.data) value = json.data;
    }
  } catch {
    value = null;
  }

  cache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value;
}

/**
 * Render a share blob into the replacement <head> meta block. `fallbackImage`
 * is the site default og:image (used when the entity has no image).
 * @param {object} meta normalized share blob from resolveMeta
 * @param {string} fallbackImage absolute default og:image URL
 */
export function renderTags(meta, fallbackImage) {
  const title = meta.title || "Tatakai";
  const description = meta.description || "";
  const canonical = `${SITE_ORIGIN}${meta.canonicalPath || "/"}`;
  const image = /^https?:\/\//i.test(meta.image || "") ? meta.image : fallbackImage;
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

  return lines.map((l) => `    ${l}`).join("\n");
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
