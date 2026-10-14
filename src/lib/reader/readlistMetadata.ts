import { getMangaDetail } from "@/core/content/manga-client";
import { fetchMangaBakaSeries } from "@/lib/mapping/mangabaka";
import type { MangaReadlistItem } from "@/hooks/user/useMangaReadlist";

type ReadlistMetadataInput = Pick<MangaReadlistItem, "manga_id" | "manga_title" | "manga_poster" | "format" | "anilist_id" | "mal_id">;

export function needsReadlistMetadata(item: ReadlistMetadataInput): boolean {
  return /^mangabaka:\d+$/i.test(item.manga_id) || !item.manga_poster?.trim() ||
    !item.manga_title?.trim() || /^MangaBaka\s*#\d+$/i.test(item.manga_title.trim());
}

/** Repair imported display metadata without changing saved progress or identity. */
export async function resolveReadlistMetadata(item: ReadlistMetadataInput) {
  let id = item.manga_id;
  let title: string | null = null;
  let poster: string | null = null;
  let format = item.format;
  const mbId = id.match(/^mangabaka:(\d+)$/i)?.[1];
  if (mbId) {
    const series = await fetchMangaBakaSeries(mbId, { source: "mangabaka" });
    if (series) {
      id = series.anilistId ? String(series.anilistId) : series.malId ? `mal:${series.malId}` : id;
      title = series.title;
      poster = series.cover.large || series.cover.medium || series.cover.original;
      format = series.type || format;
    }
  }
  if (!title || !poster) {
    const detailId = item.anilist_id ? String(item.anilist_id) : item.mal_id ? `mal:${item.mal_id}` : id;
    // An unresolved MangaBaka ID is not an AniList ID; never strip its prefix.
    if (!/^mangabaka:/i.test(detailId)) {
      try {
        const { detail } = await getMangaDetail(detailId);
        title ||= detail.canonicalTitle === "Untitled" ? null : detail.canonicalTitle;
        poster ||= detail.coverImage;
        format = detail.format || format;
        id = detailId;
      } catch { /* Keep stored metadata when the catalog is unavailable. */ }
    }
  }
  const hasStoredTitle = item.manga_title?.trim() && !/^MangaBaka\s*#\d+$/i.test(item.manga_title.trim());
  return { id, title: hasStoredTitle ? item.manga_title : title, poster: item.manga_poster?.trim() || poster, format };
}
