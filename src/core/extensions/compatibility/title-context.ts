import type { MangaDetailResponse } from '@/types/manga';

/** Catalog identifiers are metadata identifiers, never native extension title IDs. */
export function mangaExtensionContext(id: string, metadata?: MangaDetailResponse) {
  const detail = metadata?.detail;
  const parsedId = Number(String(id).replace(/^anilist:/i, ''));
  const titles = [...new Set([detail?.canonicalTitle, detail?.title?.english, detail?.title?.romaji, detail?.title?.native, ...(detail?.title?.synonyms || [])]
    .filter((title): title is string => typeof title === 'string' && !!title.trim() && title.trim() !== 'Untitled').map(title => title.trim()))];
  return {
    anilistId: detail?.anilistId || (Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined),
    malId: detail?.malId || undefined, title: titles[0], titles,
  };
}
