/** Respect explicit upstream format information before accepting manga chapters. */
export function declaresNovelContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.isNovel === true || row.is_novel === true) return true;
  return [
    row.format,
    row.mediaType,
    row.medium,
    row.contentType,
    row.type,
  ].some((value) =>
    [
      "novel",
      "lightnovel",
      "webnovel",
      "ln",
      "wn",
      "prose",
      "textnovel",
    ].includes(
      String(value ?? "")
        .toLowerCase()
        .replace(/[\s_-]+/g, "")
    )
  );
}
