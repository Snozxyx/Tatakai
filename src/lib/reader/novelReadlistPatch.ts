import type { UpsertNovelReadlistInput } from "@/hooks/user/useNovelReadlist";

/** A library status change must not clear the reader's saved paragraph/source. */
export function preserveNovelReadlistFields(
  payload: Record<string, unknown>,
  input: UpsertNovelReadlistInput
) {
  const optional: Record<string, keyof UpsertNovelReadlistInput> = {
    mal_id: "malId",
    anilist_id: "anilistId",
    last_chapter_key: "lastChapterKey",
    last_chapter_number: "lastChapterNumber",
    last_chapter_title: "lastChapterTitle",
    last_provider: "lastProvider",
    last_language: "lastLanguage",
    last_page_index: "lastParagraphIndex",
    total_pages: "totalParagraphs",
    last_scanlator: "lastTranslator",
  };
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([column]) => !optional[column] || input[optional[column]] !== undefined
    )
  );
}
