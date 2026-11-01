type Release = {
  href: string;
  provider?: string;
  seriesId: string;
  canonicalSeriesId?: string | null;
  title: string;
  chapter: string | null;
};

/** Release identity is verified upstream; never substitute a similarly named manga. */
export function releaseMangaHref(item: Release): string {
  let path = item.href.startsWith("/manga/") ? item.href : "";
  if (!path && item.canonicalSeriesId?.startsWith("manga:"))
    path = `/manga/${encodeURIComponent(item.canonicalSeriesId.slice(6))}`;
  if (
    !path &&
    (!item.provider || item.provider === "mangaupdates") &&
    /^\d+$/.test(item.seriesId)
  )
    path = `/manga/${encodeURIComponent(`mangaupdates:${item.seriesId}`)}`;
  const url = new URL(path || "/search", "https://tatakai.invalid");
  if (!path) {
    url.searchParams.set("type", "manga");
    url.searchParams.set("q", item.title);
  }
  if (item.chapter?.trim())
    url.searchParams.set("highlightChapter", item.chapter.trim());
  return `${url.pathname}${url.search}`;
}

export function isReleaseChapter(
  number: number | null | undefined,
  requested: string | null
): boolean {
  if (number == null || !requested) return false;
  const match = requested
    .trim()
    .match(/^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?$/);
  if (!match) return false;
  const start = Number(match[1]),
    end = Number(match[2] ?? match[1]);
  return end >= start && end - start <= 200 && number >= start && number <= end;
}
