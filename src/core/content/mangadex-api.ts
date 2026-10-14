import { isCapacitor, isElectron } from "@/lib/platform/platform";
import {
  resolveBackendOrigin,
  ANILIST_GRAPHQL_ENDPOINT,
} from "@/lib/api/backendOrigin";
import { extensionFetch } from "@/core/extensions/remote/transport";
import type {
  MangaChapterResponse,
  MangaReadResponse,
  MappedMangaChapter,
} from "@/types/manga";

const API = "https://api.mangadex.org";
const ratings = ["safe", "suggestive", "erotica", "pornographic"];
const cache = new Map<string, { at: number; value: MangaChapterResponse }>();
const pending = new Map<string, Promise<MangaChapterResponse | null>>();
let cacheGeneration = 0;

export function clearMangaDexChapterCache(id: string): void {
  cacheGeneration++;
  cache.delete(id);
  pending.delete(id);
}

/** Built-in API transport: native HTTP in apps, the JSON proxy on the website. */
async function json(url: string, init: RequestInit = {}): Promise<any> {
  const native = isCapacitor() || isElectron();
  const target =
    !native && url.startsWith(API)
      ? `${resolveBackendOrigin()}/api/proxy/json?url=${encodeURIComponent(
          url
        )}`
      : url;
  const response = native
    ? await extensionFetch(target, {
        ...init,
        headers: {
          "User-Agent": "Tatakai/6 (https://tatakai.me)",
          ...Object.fromEntries(new Headers(init.headers).entries()),
        },
        signal: AbortSignal.timeout(15_000),
      })
    : await fetch(target, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    throw new Error(`MangaDex request failed (${response.status})`);
  return response.json();
}

async function loadMapping(id: string): Promise<any | null> {
  const anilistId = Number(id.replace(/^anilist:/i, ""));
  if (!Number.isInteger(anilistId) || anilistId <= 0) return null;
  const metadata = await json(
    isCapacitor() || isElectron()
      ? "https://graphql.anilist.co"
      : ANILIST_GRAPHQL_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "query($id:Int){Media(id:$id,type:MANGA){title{english romaji native} synonyms}}",
        variables: { id: anilistId },
      }),
    }
  );
  const title = metadata?.data?.Media?.title;
  const titles: string[] = [
    ...new Set<string>(
      [title?.english, title?.romaji, title?.native].filter(Boolean)
    ),
  ];
  let manga: any;
  for (const name of titles.slice(0, 2)) {
    const query = new URLSearchParams({ title: name, limit: "50" });
    ratings.forEach((r) => query.append("contentRating[]", r));
    const result = await json(`${API}/manga?${query}`);
    const matches = result.data || [];
    manga = matches.find(
      (m: any) => String(m.attributes?.links?.al) === String(anilistId)
    );
    // Exact title fallback only for titles without a conflicting AniList link.
    manga ||= matches.find(
      (m: any) =>
        !m.attributes?.links?.al &&
        [
          ...Object.values(m.attributes?.title || {}),
          ...(m.attributes?.altTitles || []).flatMap((t: any) =>
            Object.values(t)
          ),
        ].some((t: any) =>
          titles.some(
            (name) =>
              name.trim().toLowerCase() === String(t).trim().toLowerCase()
          )
        )
    );
    if (manga) break;
  }
  return manga || null;
}

const mappings = new Map<string, Promise<any | null>>();
export async function resolveMangaDexMapping(id: string): Promise<any | null> {
  if (!mappings.has(id)) {
    const request = loadMapping(id).catch(() => null);
    mappings.set(id, request);
    request.then((value) => {
      if (!value && mappings.get(id) === request) mappings.delete(id);
    });
    while (mappings.size > 100) mappings.delete(mappings.keys().next().value!);
  }
  return mappings.get(id)!;
}

async function loadCatalog(id: string): Promise<MangaChapterResponse | null> {
  const anilistId = Number(id.replace(/^anilist:/i, ""));
  const manga = await resolveMangaDexMapping(id);
  if (!manga) return null;
  const byNumber = new Map<number, MappedMangaChapter>();
  const seen = new Set<string>();
  const feeds: Array<string | undefined> = [undefined];
  let partial = false;
  for (const language of feeds) {
    let offset = 0,
      total = Infinity;
    while (offset < total && offset < 10000) {
      const query = new URLSearchParams({
        limit: "500",
        offset: String(offset),
        "order[chapter]": "asc",
        "includes[]": "scanlation_group",
        includeExternalUrl: "0",
        includeEmptyPages: "0",
        includeFuturePublishAt: "0",
      });
      ratings.forEach((r) => query.append("contentRating[]", r));
      if (language) query.append("translatedLanguage[]", language);
      let result: any;
      try {
        result = await json(`${API}/manga/${manga.id}/feed?${query}`);
      } catch (error) {
        if (!byNumber.size) throw error;
        partial = true;
        break;
      }
      total = Number(result.total) || 0;
      const languages = [
        ...new Set<string>(
          manga.attributes?.availableTranslatedLanguages || []
        ),
      ];
      const partition = !language && total > 10000 && languages.length > 1;
      if (partition) feeds.push(...languages);
      for (const row of result.data || []) {
        const a = row.attributes || {};
        const raw = String(a.chapter ?? "").trim();
        if (
          !/^\d+(?:\.\d+)?$/.test(raw) ||
          a.pages === 0 ||
          a.externalUrl ||
          !row.id ||
          seen.has(row.id)
        )
          continue;
        const number = Number(raw);
        if (!Number.isFinite(number)) continue;
        seen.add(row.id);
        const chapter = byNumber.get(number) || {
          chapterNumber: number,
          chapterTitle: a.title || `Chapter ${number}`,
          volume:
            a.volume != null &&
            a.volume !== "" &&
            Number.isFinite(Number(a.volume))
              ? Number(a.volume)
              : null,
          canonicalOrder: 0,
          sources: [],
        };
        chapter.sources.push({
          provider: "mangadex",
          providerName: "MangaDex",
          chapterKey: `mangadex:${row.id}`,
          providerChapterId: row.id,
          language: a.translatedLanguage || null,
          scanlator:
            (row.relationships || [])
              .filter((r: any) => r.type === "scanlation_group")
              .map((r: any) => r.attributes?.name)
              .filter(Boolean)
              .join(", ") || null,
          releaseDate: a.publishAt || null,
        });
        byNumber.set(number, chapter);
      }
      if (partition) break;
      if (!(result.data || []).length) break;
      offset += 500;
      if (offset >= 10000 && offset < total) partial = true;
    }
  }
  const mappedChapters = [...byNumber.values()]
    .sort((a, b) => a.chapterNumber! - b.chapterNumber!)
    .map((c, index) => ({
      ...c,
      canonicalOrder: index,
      published:
        c.sources
          .map((s) => s.releaseDate)
          .filter(Boolean)
          .sort()
          .at(-1) || null,
      sources: c.sources.sort(
        (a, b) =>
          (a.language === "en" ? 0 : 1) - (b.language === "en" ? 0 : 1) ||
          (a.language || "").localeCompare(b.language || "")
      ),
    }));
  return {
    anilistId,
    partial,
    failedProviders: partial ? ["mangadex"] : [],
    chapters: [],
    mappedChapters,
  };
}

export async function fetchMangaDexChapters(
  id: string
): Promise<MangaChapterResponse | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  if (pending.has(id)) return pending.get(id)!;
  const generation = cacheGeneration;
  const request = loadCatalog(id)
    .then((value) => {
      if (value && generation === cacheGeneration) {
        cache.set(id, { at: Date.now(), value });
        while (cache.size > 100) cache.delete(cache.keys().next().value!);
      }
      return value;
    })
    .catch(() => null)
    .finally(() => {
      if (pending.get(id) === request) pending.delete(id);
    });
  pending.set(id, request);
  return request;
}

export async function fetchMangaDexPages(
  anilistId: number,
  chapterKey: string
): Promise<MangaReadResponse> {
  const chapterId = chapterKey.replace(/^mangadex:/i, "");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      chapterId
    )
  )
    return { success: false, message: "Invalid MangaDex chapter." };
  try {
    const result = await json(`${API}/at-home/server/${chapterId}`);
    const { hash, data: files } = result.chapter || {};
    if (!/^https:\/\//.test(result.baseUrl || "") || !hash || !files?.length)
      return {
        success: false,
        message: "MangaDex has no pages for this release.",
      };
    const pages = files.map((file: string, index: number) => ({
      pageNumber: index + 1,
      imageUrl: `${result.baseUrl}/data/${hash}/${file}`,
      proxiedImageUrl: null,
      width: null,
      height: null,
    }));
    if (isCapacitor()) {
      const { applyMobileProxyToPages } = await import(
        "@/core/extensions/mobile/mobileProxy"
      );
      return {
        success: true,
        data: {
          pages: applyMobileProxyToPages(pages),
          chapter: {
            chapterKey,
            anilistId,
            provider: "mangadex",
            providerChapterId: chapterId,
            number: null,
            title: null,
            language: null,
          },
          readMeta: {
            provider: "mangadex",
            fetchedAt: new Date().toISOString(),
            fallbackUsed: false,
          },
        },
      };
    }
    return {
      success: true,
      data: {
        pages,
        chapter: {
          chapterKey,
          anilistId,
          provider: "mangadex",
          providerChapterId: chapterId,
          number: null,
          title: null,
          language: null,
        },
        readMeta: {
          provider: "mangadex",
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
        },
      },
    };
  } catch {
    return {
      success: false,
      message: "MangaDex pages could not be loaded. Please retry.",
    };
  }
}
