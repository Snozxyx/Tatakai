import type { CustomSourceEntry } from "./custom-source-runtime";
import type { CustomInfoResult } from "@/core/extensions/sdk/types";
import { db } from "@/core/db/tatakai-db";
import { ANILIST_GRAPHQL_ENDPOINT } from "@/lib/api/backendOrigin";

export type CatalogKind = "anime" | "manga" | "novel";
export interface CustomTitleIdentity {
  namespace: string;
  sourceId: string;
  id: string;
}
export interface CatalogMedia {
  anilistId?: number;
  tatakaiId?: string;
  malId?: number;
  kind: CatalogKind;
  title: string;
  image?: string;
  banner?: string;
  format: string;
  year?: number;
  episodes?: number;
  chapters?: number;
  aliases?: string[];
}
export interface CustomCatalogLink {
  version: 1;
  identity: CustomTitleIdentity;
  media: CatalogMedia;
  verifiedBy: "source-id" | "confirmed" | "title-match";
  verifiedAt: string;
  syncEnabled: boolean;
}
export interface CatalogRecord {
  version: 1;
  link: CustomCatalogLink | null;
}
export const catalogLinkKey = (
  profile: string,
  identity: CustomTitleIdentity
) =>
  `custom-catalog:${encodeURIComponent(profile)}:${JSON.stringify([
    identity.namespace,
    identity.sourceId,
    identity.id,
  ])}`;
export const catalogRoute = (media: CatalogMedia) =>
  `/${media.kind}/${encodeURIComponent(
    String(media.anilistId || media.tatakaiId || "")
  )}`;
export const catalogEntityId = (media: CatalogMedia) =>
  String(media.anilistId || media.tatakaiId || "");
export const positiveCatalogId = (value: unknown): number | undefined => {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
  )
    return;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};
export function catalogKind(
  source?: CustomSourceEntry
): CatalogKind | undefined {
  const kind = source?.catalogMediaType;
  return source &&
    ((source.kind === "watch" && kind === "anime") ||
      (source.kind === "read" && (kind === "manga" || kind === "novel")))
    ? kind
    : undefined;
}
export function usableCatalogLink(
  source: CustomSourceEntry | undefined,
  identity: CustomTitleIdentity,
  link?: CustomCatalogLink | null
) {
  if (
    !source ||
    !link ||
    link.version !== 1 ||
    !link.media ||
    !link.identity ||
    !catalogKind(source) ||
    link.media.kind !== catalogKind(source) ||
    source.namespace !== identity.namespace ||
    source.id !== identity.sourceId ||
    link.identity?.namespace !== identity.namespace ||
    link.identity?.sourceId !== identity.sourceId ||
    link.identity?.id !== identity.id ||
    !["source-id", "confirmed", "title-match"].includes(link.verifiedBy) ||
    !Number.isFinite(Date.parse(link.verifiedAt)) ||
    !link.media.title ||
    !(positiveCatalogId(link.media.anilistId) || link.media.tatakaiId) ||
    (link.media.kind === "novel") !== (link.media.format === "NOVEL")
  )
    return null;
  return link;
}
export function catalogCommentTarget(
  source: CustomSourceEntry | undefined,
  identity: CustomTitleIdentity,
  link?: CustomCatalogLink | null
) {
  const verified = usableCatalogLink(source, identity, link);
  if (!verified?.media.anilistId) return null;
  return {
    entityType:
      verified.media.kind === "anime" ? ("anime" as const) : ("manga" as const),
    entityId: String(verified.media.anilistId),
    entityName: verified.media.title,
  };
}
const fields =
  "id idMal type format title { romaji english native } synonyms coverImage { large } bannerImage startDate { year } episodes chapters";
async function gql(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal
): Promise<any> {
  const timeout = new AbortController(),
    timer = setTimeout(
      () => timeout.abort(new Error("Catalogue lookup timed out")),
      15000
    );
  const abort = () => timeout.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: timeout.signal,
    });
    if (!response.ok)
      throw Error(`Catalogue lookup failed (${response.status})`);
    const body = await response.json();
    if (body.errors?.length)
      throw Error(body.errors[0].message || "Catalogue lookup failed");
    if (!body.data) throw Error("Catalogue returned no data");
    return body.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
function mediaFromAniList(raw: any, kind: CatalogKind): CatalogMedia | null {
  const id = positiveCatalogId(raw?.id);
  if (
    !id ||
    raw.type !== (kind === "anime" ? "ANIME" : "MANGA") ||
    !raw.format ||
    (kind === "novel") !== (raw.format === "NOVEL")
  )
    return null;
  const title = raw.title?.english || raw.title?.romaji || raw.title?.native;
  if (typeof title !== "string" || !title) return null;
  return {
    anilistId: id,
    malId: positiveCatalogId(raw.idMal),
    kind,
    title,
    format: raw.format,
    image: raw.coverImage?.large,
    banner: raw.bannerImage,
    year: raw.startDate?.year,
    episodes: positiveCatalogId(raw.episodes),
    chapters: positiveCatalogId(raw.chapters),
    aliases: [
      ...Object.values(raw.title || {}),
      ...(raw.synonyms || []),
    ].filter(
      (value): value is string => typeof value === "string" && !!value.trim()
    ),
  };
}

/** Exact aliases only: preserve season numbers, editions and meaningful punctuation. */
export const normalizedCatalogTitle = (title: string) =>
  title
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
export function confidentCustomCatalogMatch(
  kind: CatalogKind,
  title: string,
  candidates: CatalogMedia[],
  year?: number
) {
  const normalized = normalizedCatalogTitle(title);
  if (!normalized) return null;
  const exact = candidates.filter(
    (media) =>
      media.kind === kind &&
      (!year || !media.year || media.year === year) &&
      [media.title, ...(media.aliases || [])].some(
        (alias) => normalizedCatalogTitle(alias) === normalized
      )
  );
  const unique = [
    ...new Map(exact.map((media) => [media.anilistId, media])).values(),
  ];
  return unique.length === 1 ? unique[0] : null;
}
/** A source title is always a search string, including numeric titles such as “86”. */
export async function automaticallyMatchCustomCatalog(
  kind: CatalogKind,
  info: Pick<CustomInfoResult, "title" | "meta">,
  signal?: AbortSignal
) {
  const title = info.title?.trim();
  if (!title) return null;
  const data = await gql(
    `query($search:String,$type:MediaType){Page(page:1,perPage:25){media(search:$search,type:$type,sort:SEARCH_MATCH){${fields}}}}`,
    { search: title.slice(0, 300), type: kind === "anime" ? "ANIME" : "MANGA" },
    signal
  );
  const candidates = (data.Page?.media || [])
    .map((raw: unknown) => mediaFromAniList(raw, kind))
    .filter((item: CatalogMedia | null): item is CatalogMedia => !!item);
  const yearText = String(
    info.meta?.year || info.meta?.Year || info.meta?.releaseYear || ""
  );
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
  return confidentCustomCatalogMatch(kind, title, candidates, year);
}
/** Explicit ID lookups only. An opaque source ID is never passed here implicitly. */
export async function verifyCustomCatalogId(
  kind: CatalogKind,
  ids: NonNullable<CustomInfoResult["catalogIds"]>,
  signal?: AbortSignal
) {
  const anilist = positiveCatalogId(ids.anilist),
    mal = positiveCatalogId(ids.mal);
  if (!anilist && !mal) throw Error("Enter a positive AniList ID");
  const data = await gql(
    `query($id:Int,$idMal:Int,$type:MediaType){Media(id:$id,idMal:$idMal,type:$type){${fields}}}`,
    {
      ...(anilist ? { id: anilist } : { idMal: mal }),
      type: kind === "anime" ? "ANIME" : "MANGA",
    },
    signal
  );
  const media = mediaFromAniList(data.Media, kind);
  if (
    !media ||
    (anilist && media.anilistId !== anilist) ||
    (mal && media.malId !== mal)
  )
    throw Error(
      "Catalogue ID does not match this media type or its supplied IDs"
    );
  return media;
}
export async function searchCustomCatalog(
  kind: CatalogKind,
  query: string,
  signal?: AbortSignal
): Promise<CatalogMedia[]> {
  const text = query.trim();
  if (!text) return [];
  if (text.startsWith("tatakai:")) {
    const { contentGraph } = await import("./content-graph");
    const raw = await contentGraph.getMedia(text.slice(8));
    if (raw.anilistId)
      return [
        await verifyCustomCatalogId(kind, { anilist: raw.anilistId }, signal),
      ];
    // The anime graph must return its own exact identity; no numeric fallback or type guessing.
    if (
      kind !== "anime" ||
      !raw.tatakaiId ||
      raw.tatakaiId !== text.slice(8) ||
      !raw.titleRomaji
    )
      throw Error("This Tatakai title has no supported catalogue mapping");
    return [
      {
        tatakaiId: raw.tatakaiId,
        kind,
        title: raw.titleEnglish || raw.titleRomaji,
        image: raw.coverImageLarge,
        format: raw.format || "TV",
      },
    ];
  }
  const url = text.match(
    /^https?:\/\/anilist\.co\/(anime|manga)\/([1-9]\d*)(?:\/[^\s]*)?$/
  );
  if (url && url[1] !== (kind === "anime" ? "anime" : "manga"))
    throw Error("This AniList URL is for a different media type");
  const exact =
    positiveCatalogId(text) || (url ? positiveCatalogId(url[2]) : undefined);
  if (exact)
    return [await verifyCustomCatalogId(kind, { anilist: exact }, signal)];
  const data = await gql(
    `query($search:String,$type:MediaType){Page(page:1,perPage:12){media(search:$search,type:$type,sort:SEARCH_MATCH){${fields}}}}`,
    { search: text.slice(0, 300), type: kind === "anime" ? "ANIME" : "MANGA" },
    signal
  );
  return (data.Page?.media || [])
    .map((raw: unknown) => mediaFromAniList(raw, kind))
    .filter((media: CatalogMedia | null): media is CatalogMedia => !!media);
}
export async function readCustomCatalog(
  profile: string,
  identity: CustomTitleIdentity
): Promise<CatalogRecord | undefined> {
  const row = await db.kv.get(catalogLinkKey(profile, identity));
  if (!row) return;
  try {
    const record = JSON.parse(row.value);
    return record.version === 1 ? record : undefined;
  } catch {
    return;
  }
}
export async function saveCustomCatalog(
  profile: string,
  identity: CustomTitleIdentity,
  link: CustomCatalogLink | null
) {
  const key = catalogLinkKey(profile, identity);
  await db.kv.put({
    key,
    value: JSON.stringify({ version: 1, link }),
    createdAt: new Date().toISOString(),
  });
  window.dispatchEvent(new CustomEvent("tatakai-custom-catalog-changed"));
}
export function trackedCustomEntry(
  link: CustomCatalogLink | null | undefined,
  entries: { id: string; number?: number }[],
  entryId?: string
) {
  if (!link?.syncEnabled || !link.media.anilistId || !entryId) return;
  const entry = entries.find((item) => item.id === entryId),
    number = entry?.number;
  const total =
    link.media.kind === "anime" ? link.media.episodes : link.media.chapters;
  if (
    !Number.isSafeInteger(number) ||
    number! < 1 ||
    (total && number! > total) ||
    entries.filter((item) => item.number === number).length !== 1
  )
    return;
  return number;
}
