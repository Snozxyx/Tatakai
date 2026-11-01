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
  const parent = new Map<string, string>();
  const find = (id: string): string => { const next = parent.get(id); if (!next) { parent.set(id,id); return id; } if (next === id) return id; const root = find(next); parent.set(id,root); return root; };
  const keys = (row: ResolvedReadlistItem) => {
    const ids = [`local:${row.manga_id}`];
    if (row.anilist_id) ids.push(`al:${row.anilist_id}`);
    if (row.mal_id) ids.push(`mal:${row.mal_id}`);
    const resolved = row.resolved_manga_id || row.manga_id;
    if (/^(?:anilist:)?\d+$/i.test(resolved)) ids.push(`al:${resolved.replace(/^anilist:/i,'')}`);
    else if (/^mal:\d+$/i.test(resolved)) ids.push(resolved.toLowerCase());
    return ids;
  };
  for (const row of rows) { const ids = keys(row); for (const id of ids.slice(1)) parent.set(find(id),find(ids[0])); }
  const groups = new Map<string, ResolvedReadlistItem>();
  for (const row of rows) {
    const identity = find(keys(row)[0]);
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
      format: latest.format && latest.format !== 'unknown' ? latest.format : other.format,
      resolved_manga_id: latest.resolved_manga_id || other.resolved_manga_id,
    });
  }
  return [...groups.values()];
}
