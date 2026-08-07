/**
 * Desktop manga extension bridge.
 * Extensions expose optional methods: getMangaChapters, getMangaPages.
 */

import type { MangaChapterResponse, MangaReadResponse } from "@/types/manga";

type ElectronRuntime = {
  electron?: {
    invokeExtension?: (extensionId: string, method: string, args: unknown) => Promise<unknown>;
    listInstalledExtensions?: () => Promise<Array<{ id: string; name?: string; capabilities?: string[] }>>;
  };
  tatakaiRuntime?: {
    invokeExtension?: (extensionId: string, method: string, args: unknown) => Promise<unknown>;
    listExtensions?: () => Promise<Array<{ id: string; name?: string }>>;
  };
};

function getRuntime(): ElectronRuntime {
  return (typeof window !== "undefined" ? window : {}) as ElectronRuntime;
}

function hasExtensionRuntime(): boolean {
  const w = getRuntime();
  return Boolean(w.electron?.invokeExtension || w.tatakaiRuntime?.invokeExtension);
}

async function listMangaExtensions(): Promise<string[]> {
  const w = getRuntime();
  try {
    if (w.electron?.listInstalledExtensions) {
      const rows = await w.electron.listInstalledExtensions();
      return (rows || [])
        .filter((row) => {
          const caps = row.capabilities || [];
          return caps.includes("manga") || caps.includes("chapters");
        })
        .map((row) => row.id)
        .filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function invokeExt(extensionId: string, method: string, args: unknown): Promise<unknown> {
  const w = getRuntime();
  if (w.electron?.invokeExtension) {
    return w.electron.invokeExtension(extensionId, method, args);
  }
  if (w.tatakaiRuntime?.invokeExtension) {
    return w.tatakaiRuntime.invokeExtension(extensionId, method, args);
  }
  throw new Error("Extension runtime unavailable");
}

export async function fetchExtensionMangaChapters(params: {
  anilistId?: number;
  malId?: number;
  title?: string;
}): Promise<{
  chapters: Array<{
    number: number | null;
    title?: string | null;
    volume?: number | null;
    sources: Array<{
      provider: string;
      chapterKey: string;
      providerChapterId: string;
      language?: string | null;
      scanlator?: string | null;
      releaseDate?: string | null;
    }>;
  }>;
  providersAvailable: string[];
  failedProviders: string[];
}> {
  if (!hasExtensionRuntime()) {
    return { chapters: [], providersAvailable: [], failedProviders: [] };
  }

  const extensionIds = await listMangaExtensions();
  const byNumber = new Map<number, {
    number: number;
    title?: string | null;
    volume?: number | null;
    sources: Array<{
      provider: string;
      chapterKey: string;
      providerChapterId: string;
      language?: string | null;
      scanlator?: string | null;
      releaseDate?: string | null;
    }>;
  }>();
  const providersAvailable: string[] = [];
  const failedProviders: string[] = [];

  for (const extensionId of extensionIds.slice(0, 8)) {
    try {
      const result = await invokeExt(extensionId, "getMangaChapters", params) as {
        chapters?: Array<{
          number?: number;
          title?: string;
          volume?: number;
          chapterKey?: string;
          providerChapterId?: string;
          language?: string;
          scanlator?: string;
          releaseDate?: string;
        }>;
      } | null;

      const rows = Array.isArray(result?.chapters) ? result!.chapters! : [];
      if (rows.length === 0) continue;
      providersAvailable.push(extensionId);

      for (const row of rows) {
        const number = Number(row.number);
        if (!Number.isFinite(number) || number <= 0) continue;
        const existing = byNumber.get(number) ?? {
          number,
          title: row.title ?? `Chapter ${number}`,
          volume: row.volume ?? null,
          sources: [],
        };
        existing.sources.push({
          provider: extensionId,
          chapterKey: row.chapterKey || String(number),
          providerChapterId: row.providerChapterId || row.chapterKey || String(number),
          language: row.language ?? null,
          scanlator: row.scanlator ?? null,
          releaseDate: row.releaseDate ?? null,
        });
        byNumber.set(number, existing);
      }
    } catch {
      failedProviders.push(extensionId);
    }
  }

  return {
    chapters: Array.from(byNumber.values()).sort((a, b) => a.number - b.number),
    providersAvailable,
    failedProviders,
  };
}

export async function fetchExtensionMangaPages(params: {
  extensionId: string;
  chapterKey: string;
  providerChapterId?: string;
  anilistId?: number;
}): Promise<MangaReadResponse> {
  if (!hasExtensionRuntime()) {
    return {
      success: false,
      message: "Manga chapter reading requires the Tatakai desktop app.",
      guidance: {
        code: "EXTENSION_RUNTIME_REQUIRED",
        message: "Open this chapter in the Tatakai desktop app with a manga extension installed.",
        retryable: false,
      },
    };
  }

  try {
    const result = await invokeExt(params.extensionId, "getMangaPages", {
      chapterKey: params.chapterKey,
      providerChapterId: params.providerChapterId,
      anilistId: params.anilistId,
    }) as {
      pages?: Array<{ pageNumber?: number; imageUrl?: string; width?: number; height?: number }>;
      title?: string;
      number?: number;
      language?: string;
    };

    const pages = (result?.pages || [])
      .map((page, idx) => ({
        pageNumber: page.pageNumber ?? idx + 1,
        imageUrl: String(page.imageUrl || ""),
        proxiedImageUrl: null,
        width: page.width ?? null,
        height: page.height ?? null,
      }))
      .filter((page) => page.imageUrl);

    if (pages.length === 0) {
      return {
        success: false,
        message: "No pages returned from extension.",
        guidance: {
          code: "NO_PAGES_FOR_CHAPTER",
          message: "Extension returned no pages for this chapter.",
          retryable: true,
          attemptedProviders: [params.extensionId],
        },
      };
    }

    return {
      success: true,
      data: {
        pages,
        chapter: {
          chapterKey: params.chapterKey,
          anilistId: params.anilistId ?? 0,
          provider: params.extensionId,
          providerChapterId: params.providerChapterId || params.chapterKey,
          number: result?.number ?? null,
          title: result?.title ?? null,
          language: result?.language ?? null,
        },
        readMeta: {
          provider: params.extensionId,
          fetchedAt: new Date().toISOString(),
          expiresAt: null,
          retryAfter: null,
          fallbackUsed: false,
        },
      },
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Extension read failed",
      guidance: {
        code: "EXTENSION_RUNTIME_REQUIRED",
        message: "Failed to load chapter pages from extension.",
        retryable: true,
        attemptedProviders: [params.extensionId],
      },
    };
  }
}

export function mergeChaptersWithExtensions(
  base: MangaChapterResponse,
  extensionPayload: Awaited<ReturnType<typeof fetchExtensionMangaChapters>>,
): MangaChapterResponse {
  if (!extensionPayload.chapters.length) {
    return {
      ...base,
      providersAvailable: [...(base as any).providersAvailable || [], "tatakai_media"],
      failedProviders: extensionPayload.failedProviders,
    } as MangaChapterResponse;
  }

  const byNumber = new Map<number, (typeof extensionPayload.chapters)[0]>();
  for (const chapter of extensionPayload.chapters) {
    if (chapter.number != null) byNumber.set(chapter.number, chapter);
  }

  const mappedChapters = (base.mappedChapters || []).map((mapped) => {
    const num = mapped.chapterNumber;
    const ext = num != null ? byNumber.get(num) : undefined;
    if (!ext) return mapped;
    const withoutPlaceholder = mapped.sources.filter((s) => s.provider !== "tatakai_media");
    const tatakai = mapped.sources.find((s) => s.provider === "tatakai_media");
    return {
      ...mapped,
      chapterTitle: ext.title || mapped.chapterTitle,
      volume: ext.volume ?? mapped.volume,
      sources: [
        ...ext.sources.map((s) => ({
          provider: s.provider,
          chapterKey: s.chapterKey,
          providerChapterId: s.providerChapterId,
          language: s.language ?? null,
          scanlator: s.scanlator ?? null,
          releaseDate: s.releaseDate ?? null,
        })),
        ...withoutPlaceholder.filter((s) => !ext.sources.some((e) => e.provider === s.provider)),
        ...(tatakai ? [tatakai] : []),
      ],
    };
  });

  return {
    ...base,
    mappedChapters,
    partial: extensionPayload.failedProviders.length > 0,
    failedProviders: extensionPayload.failedProviders,
    providersAvailable: [...extensionPayload.providersAvailable, "tatakai_media"],
  } as MangaChapterResponse;
}
