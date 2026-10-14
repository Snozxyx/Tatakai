import { isCapacitor, isElectron } from "@/lib/platform/platform";
import { resolveBackendOrigin } from "@/lib/api/backendOrigin";
import { extensionFetch } from "@/core/extensions/remote/transport";
import { resolveMangaDexMapping } from "./mangadex-api";
import type { MangaChapterResponse, MappedMangaChapter } from "@/types/manga";

export interface MangaUpdatesCatalog {
  metadata: NonNullable<MangaChapterResponse["mangaUpdates"]>;
  chapters: MappedMangaChapter[];
}
const cache = new Map<string, { at: number; value: MangaUpdatesCatalog }>();
const pending = new Map<string, Promise<MangaUpdatesCatalog | null>>();
let generation = 0;
export function clearMangaUpdatesCache(id: string) {
  generation++;
  cache.delete(id);
  pending.delete(id);
}

async function request(
  operation: "series" | "search" | "releases",
  id: string,
  title = "",
  page = 1
): Promise<any> {
  const native = isCapacitor() || isElectron();
  const path =
    operation === "series"
      ? `/series/${id}`
      : operation === "search"
      ? "/series/search"
      : "/releases/search";
  const body =
    operation === "search"
      ? { search: title, perpage: 25 }
      : {
          search: id,
          search_type: "series",
          page,
          perpage: 100,
          orderby: "date",
          asc: "desc",
          include_metadata: true,
        };
  const response = native
    ? await extensionFetch(`https://api.mangaupdates.com/v1${path}`, {
        method: operation === "series" ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Tatakai/6 (https://tatakai.me)",
        },
        ...(operation === "series" ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      })
    : await fetch(
        `${resolveBackendOrigin()}/api/proxy/mangaupdates?${new URLSearchParams(
          { operation, id, title, page: String(page) }
        )}`,
        { signal: AbortSignal.timeout(15000) }
      );
  if (!response.ok) throw new Error(`MangaUpdates HTTP ${response.status}`);
  return response.json();
}

/** Safe mapping for modern numeric IDs, base-36 slugs, and old MangaDex mu links. */
async function resolveSeries(manga: any): Promise<any | null> {
  const link = String(manga.attributes?.links?.mu || "").trim();
  const token = link.includes("/")
    ? link.match(/\/series\/([a-z0-9]+)/i)?.[1] || ""
    : link;
  const candidate = /^\d+$/.test(token)
    ? Number(token)
    : /^[a-z0-9]{5,12}$/i.test(token)
    ? parseInt(token, 36)
    : null;
  if (candidate && Number.isSafeInteger(candidate)) {
    try {
      return await request("series", String(candidate));
    } catch {
      /* Old numeric IDs require an exact title crosswalk. */
    }
  }
  const names: string[] = [
    ...Object.values(manga.attributes?.title || {}),
    ...(manga.attributes?.altTitles || []).flatMap((t: any) =>
      Object.values(t)
    ),
  ] as string[];
  const normalize = (s: string) => s.normalize("NFKC").trim().toLowerCase();
  for (const name of names.slice(0, 2)) {
    const result = await request("search", "", name);
    const matches = (result.results || []).filter((row: any) =>
      [row.record?.title, row.hit_title]
        .filter(Boolean)
        .some((t: string) => names.some((n) => normalize(n) === normalize(t)))
    );
    const ids = [
      ...new Set(matches.map((r: any) => r.record?.series_id).filter(Boolean)),
    ];
    if (ids.length === 1) return request("series", String(ids[0]));
  }
  return null;
}

export function releaseChapterNumbers(raw: unknown): number[] {
  const value = String(raw ?? "").trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number.isFinite(Number(value)) ? [Number(value)] : [];
  const range = value.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!range) return [];
  const start = Number(range[1]),
    end = Number(range[2]);
  return end >= start && end - start <= 200
    ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
    : [];
}

async function load(id: string): Promise<MangaUpdatesCatalog | null> {
  const manga = await resolveMangaDexMapping(id);
  if (!manga) return null;
  const series = await resolveSeries(manga);
  if (!series?.series_id) return null;
  const chapters = new Map<number, MappedMangaChapter>();
  let latestDate: string | null = null,
    partial = false;
  let total = Infinity,
    page = 1,
    seen = 0;
  const started = Date.now();
  while (seen < total && page <= 25 && Date.now() - started < 20_000) {
    let response: any;
    try {
      response = await request("releases", String(series.series_id), "", page);
    } catch {
      partial = true;
      break;
    }
    total = Number(response.total_hits) || 0;
    const rows = response.results || [];
    if (!rows.length) break;
    for (const row of rows) {
      if (
        row.metadata?.series?.series_id &&
        String(row.metadata.series.series_id) !== String(series.series_id)
      )
        continue;
      const release = row.record || row;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(release.release_date || "")
        ? release.release_date
        : null;
      if (date && (!latestDate || date > latestDate)) latestDate = date;
      for (const number of releaseChapterNumbers(release.chapter)) {
        const existing = chapters.get(number);
        const groups = (release.groups || [])
          .map((g: any) => String(g.name || ""))
          .filter(Boolean);
        chapters.set(number, {
          chapterNumber: number,
          chapterTitle: `Chapter ${number}`,
          volume:
            release.volume != null &&
            release.volume !== "" &&
            Number.isFinite(Number(release.volume))
              ? Number(release.volume)
              : null,
          canonicalOrder: 0,
          sources: [],
          metadataSource: "mangaupdates",
          published:
            existing?.published && (!date || existing.published > date)
              ? existing.published
              : date,
          releaseGroups: [
            ...new Set([...(existing?.releaseGroups || []), ...groups]),
          ],
        });
      }
    }
    seen += rows.length;
    page++;
  }
  if (seen < total) partial = true;
  const latest = Number(series.latest_chapter);
  return {
    metadata: {
      seriesId: Number(series.series_id),
      title: String(series.title),
      url: String(series.url || ""),
      status: series.status || null,
      latestChapter:
        series.latest_chapter != null && Number.isFinite(latest)
          ? latest
          : chapters.size
          ? Math.max(...chapters.keys())
          : null,
      latestReleaseDate: latestDate,
      partial,
    },
    chapters: [...chapters.values()]
      .sort((a, b) => a.chapterNumber! - b.chapterNumber!)
      .map((c, i) => ({ ...c, canonicalOrder: i })),
  };
}

export async function fetchMangaUpdatesCatalog(
  id: string
): Promise<MangaUpdatesCatalog | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  if (pending.has(id)) return pending.get(id)!;
  const version = generation;
  const work = load(id)
    .then((value) => {
      if (value && version === generation) {
        cache.set(id, { at: Date.now(), value });
        while (cache.size > 100) cache.delete(cache.keys().next().value!);
      }
      return value;
    })
    .catch(() => null)
    .finally(() => {
      if (pending.get(id) === work) pending.delete(id);
    });
  pending.set(id, work);
  return work;
}

/** Release records enrich chapter metadata; they never impersonate reading sources. */
export function applyMangaUpdatesCatalog(
  base: MangaChapterResponse,
  catalog: MangaUpdatesCatalog | null
): MangaChapterResponse {
  if (!catalog) return base;
  const chapters = new Map(
    base.mappedChapters.map((c) => [c.chapterNumber, c])
  );
  for (const release of catalog.chapters) {
    const prior = chapters.get(release.chapterNumber);
    chapters.set(release.chapterNumber, {
      ...release,
      ...prior,
      metadataSource: "mangaupdates",
      published: release.published,
      releaseGroups: release.releaseGroups,
      sources: prior?.sources || [],
      volume: release.volume ?? prior?.volume ?? null,
    });
  }
  return {
    ...base,
    mangaUpdates: catalog.metadata,
    mappedChapters: [...chapters.values()]
      .sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0))
      .map((c, i) => ({ ...c, canonicalOrder: i })),
  };
}
