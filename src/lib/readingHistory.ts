type ReadingProgress = {
  manga_id: string;
  resolved_manga_id?: string;
  format?: string | null;
  status?: string | null;
  last_chapter_key?: string | null;
  last_chapter_number?: number | null;
  last_chapter_title?: string | null;
  last_page_index?: number | null;
  last_provider?: string | null;
  updated_at?: string;
};

export function getReadingHistory<T extends ReadingProgress>(rows: T[]): T[] {
  return rows.filter(entry => entry.status === 'reading' && Boolean(
    entry.last_chapter_key || entry.last_chapter_number != null || entry.last_chapter_title?.trim(),
  )).sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
}

export function readingHistoryHref(item: ReadingProgress): string {
  const novel = item.format === 'novel';
  const kind = novel ? 'novel' : 'manga';
  const id = encodeURIComponent(item.resolved_manga_id || item.manga_id);
  if (!item.last_chapter_key?.trim()) return `/${kind}/${id}`;
  const params = new URLSearchParams({ chapterKey: item.last_chapter_key });
  params.set(novel ? 'paragraph' : 'page', String(Math.max(0, Number(item.last_page_index || 0))));
  if (novel) {
    if (item.last_provider) params.set('provider', item.last_provider);
    if (item.last_chapter_number != null) params.set('chapterNumber', String(item.last_chapter_number));
    if (item.last_chapter_title) params.set('chapterTitle', item.last_chapter_title);
  }
  return `/${kind}/read/${id}?${params}`;
}
