/**
 * anilistTitles.ts — host-side AniList title enrichment for the mobile runtime.
 *
 * The desktop extension-API host (host-server.cjs `fetchAniListTitles` +
 * `optionsFromQuery`) merges a show's AniList english/romaji/native titles and a
 * filtered set of synonyms into the options it hands the bundle, because most
 * providers resolve an episode by searching their own catalogue BY NAME — a
 * single caller-supplied title finds far fewer servers than the full set. On
 * mobile the dispatch previously forwarded only the one `[animeName]` the client
 * passed, so mobile found fewer servers than desktop for the same show. This
 * ports the identical enrichment so the mobile host reaches parity.
 *
 * It is HOST infrastructure, not an extension request, so it calls AniList
 * directly via CapacitorHttp (bypassing the per-extension `network:domain:*`
 * gate in createNativeFetch), exactly as desktop uses its own Node `fetch`
 * rather than routing through the bundle's permission allowlist.
 */

import { CapacitorHttp } from '@capacitor/core';

const ANILIST_TITLE_TTL = 60 * 60 * 1000; // 1h, matching desktop
const cache = new Map<number, { titles: string[]; expiresAt: number }>();

// Keep only Latin-script synonyms, capped at 2 — see the host-server.cjs note:
// AniList synonyms are mostly localized (Korean/Thai/Italian/…), none of which
// match these providers' catalogues, and every extra title is another
// per-provider request (passing all 6 once pushed `animetosho` into a 20s
// timeout). So retain the useful alternate Latin release names and bound the
// added fan-out.
const LATIN_TITLE_RE = /^[\p{Script=Latin}\p{Nd}\p{P}\p{Zs}\p{S}]+$/u;

// "JJK", "KnY", "OP" — real alternate names, but a site search for the
// initialism finds nothing, and they'd consume both synonym slots ahead of a
// usable alternate release name.
function isAbbreviation(s: string): boolean {
  if (/\s/.test(s)) return false;
  if (s.length <= 4) return true;
  return s.length <= 6 && s === s.toUpperCase() && /[A-Z]/.test(s);
}

function usefulSynonyms(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return (list as unknown[])
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && LATIN_TITLE_RE.test(s) && !isAbbreviation(s))
    .slice(0, 2);
}

/** Fetch (and cache) a show's canonical AniList titles + filtered synonyms. */
export async function fetchAniListTitles(anilistId: number): Promise<string[]> {
  if (!anilistId || anilistId <= 0) return [];

  const cached = cache.get(anilistId);
  if (cached && Date.now() < cached.expiresAt) return cached.titles;

  try {
    const res = await CapacitorHttp.request({
      url: 'https://graphql.anilist.co',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // Canonical titles AND synonyms — plenty of sites index a show only under
      // an alternate name. CapacitorHttp serializes an object body as JSON when
      // the content-type says so.
      data: {
        query: `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } synonyms } }`,
        variables: { id: anilistId },
      },
      connectTimeout: 5000,
      readTimeout: 5000,
    } as any);

    const status = Number((res as any).status) || 0;
    if (status < 200 || status >= 300) return [];

    const raw = (res as any).data;
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const media = payload?.data?.Media;
    const t = media?.title;

    // Canonical titles first — providers that only try `titles[0]` or
    // `.slice(0, 2)` must still get the best names, so synonyms go last.
    const titles = [t?.english, t?.romaji, t?.userPreferred, t?.native, ...usefulSynonyms(media?.synonyms)]
      .filter(Boolean)
      .map((v: unknown) => String(v).trim())
      .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);

    cache.set(anilistId, { titles, expiresAt: Date.now() + ANILIST_TITLE_TTL });
    return titles;
  } catch {
    // Non-fatal: fall back to the caller's own titles (parity with desktop,
    // which also returns [] on any AniList failure).
    return [];
  }
}

/**
 * Merge AniList titles (canonical first, as desktop does) with the caller's
 * titles, deduped case-insensitively. Returns a NEW options object with
 * `titles` set; all other fields pass through untouched. A no-op (returns the
 * input) when there's no anilistId or AniList yields nothing.
 */
export async function enrichOptionsWithTitles(
  options: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const anilistId = Number((options as any)?.anilistId) || 0;
  if (anilistId <= 0) return options;

  const callerTitles = Array.isArray((options as any)?.titles)
    ? ((options as any).titles as unknown[]).map(String).filter(Boolean)
    : [];

  const anilistTitles = await fetchAniListTitles(anilistId);
  if (!anilistTitles.length) return options;

  const seen = new Set(anilistTitles.map((t) => t.toLowerCase()));
  const extra = callerTitles.filter((t) => t && !seen.has(t.toLowerCase()));
  return { ...options, titles: [...anilistTitles, ...extra] };
}
