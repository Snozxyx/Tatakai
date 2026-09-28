/**
 * <Seo> — per-page Open Graph / Twitter / canonical meta for SPA navigation.
 *
 * This is the CLIENT-side complement to the server-side injection in
 * scripts/ptero-start.mjs. Social crawlers don't run JS, so this component does
 * NOT drive share previews — that's the web server's job. What it does:
 *   - keeps the browser tab <title> and meta in sync as the user navigates, and
 *   - gives JS-rendering crawlers (Googlebot) a tailored head.
 *
 * Keep the tag set here aligned with scripts/seo/inject.mjs `renderTags()` so a
 * page looks the same whether a human loads it or a crawler gets the injected
 * HTML. Safe in Electron (helmet just writes to a <head> nobody shares).
 */
import { Helmet } from "react-helmet-async";

const SITE_NAME = "Tatakai";
const SITE_ORIGIN = "https://tatakai.me";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/assets/logo/tatakaibanner.png`;

export type SeoKind = "website" | "video.other" | "book" | "article" | "profile";

export interface SeoProps {
  /** Page title, without the site suffix (added automatically). */
  title: string;
  description?: string | null;
  /** Absolute https image URL; falls back to the site banner when absent. */
  image?: string | null;
  /** Site-relative canonical path (e.g. "/anime/anilist-21") or absolute URL. */
  canonicalPath?: string;
  kind?: SeoKind;
  /** Override the "— Tatakai" suffix; pass "" to use the title verbatim. */
  suffix?: string;
  imageAlt?: string;
}

/** Trim to a crawler-friendly length on a word boundary. */
function clamp(text: string, max = 200): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

/** Resolve a possibly-relative path/URL to an absolute https URL. */
function absolute(pathOrUrl: string | undefined | null): string | undefined {
  const s = (pathOrUrl ?? "").trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `${SITE_ORIGIN}${s.startsWith("/") ? s : `/${s}`}`;
}

export function Seo({
  title,
  description,
  image,
  canonicalPath,
  kind = "website",
  suffix,
  imageAlt,
}: SeoProps) {
  const fullTitle =
    suffix === "" ? title : `${title}${suffix ?? ` — ${SITE_NAME}`}`;
  const desc = clamp(description || "");
  const img = absolute(image) || DEFAULT_IMAGE;
  const canonical =
    absolute(canonicalPath) ||
    (typeof window !== "undefined" ? window.location.href.split("?")[0] : SITE_ORIGIN);

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      {desc && <meta name="description" content={desc} />}
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content={kind} />
      <meta property="og:title" content={fullTitle} />
      {desc && <meta property="og:description" content={desc} />}
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={img} />
      <meta property="og:image:alt" content={imageAlt || fullTitle} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {desc && <meta name="twitter:description" content={desc} />}
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
}

export default Seo;
