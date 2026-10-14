import type { MangaReadlistItem } from "@/hooks/user/useMangaReadlist";

export type ResolvedReadlistItem = MangaReadlistItem & { resolved_manga_id?: string };

export function readlistProgressLabels(item: Pick<MangaReadlistItem, "last_chapter_number" | "last_chapter_key" | "last_chapter_title" | "last_page_index">) {
  const hasChapter = Number(item.last_chapter_number) > 0 || !!item.last_chapter_key;
  const chapterLabel = hasChapter && item.last_chapter_number != null
    ? `Chapter ${item.last_chapter_number}` : item.last_chapter_title || "Not started";
  const pageLabel = item.last_chapter_key ? `Page ${(Number(item.last_page_index) || 0) + 1}` : null;
  return { hasChapter, chapterLabel, pageLabel };
}

/** Collapse proven tracker aliases for display; saved rows remain untouched. */
export function mergeReadlistAliases(rows: ResolvedReadlistItem[]): ResolvedReadlistItem[] {
  const groups = new Map<string, ResolvedReadlistItem>();
  for (const row of rows) {
    const identity = row.anilist_id ? String(row.anilist_id) :
      (row.resolved_manga_id || row.manga_id).replace(/^anilist:/i, "");
    const existing = groups.get(identity);
    if (!existing) {
      groups.set(identity, row);
      continue;
    }
    const latest = Date.parse(row.updated_at) > Date.parse(existing.updated_at) ? row : existing;
    const other = latest === row ? existing : row;
    groups.set(identity, {
      ...latest,
      manga_title: !latest.manga_title || /^MangaBaka\s*#\d+$/i.test(latest.manga_title)
        ? other.manga_title : latest.manga_title,
      manga_poster: latest.manga_poster || other.manga_poster,
    });
  }
  return [...groups.values()];
}
