/** Source-based classification shared by the catalog and extension runtimes. */
export type ContentMode = "sfw" | "adult";
export type AdultCategory = "explicit" | "ecchi" | "mature";
export const ADULT_CATEGORIES: AdultCategory[] = [
  "explicit",
  "ecchi",
  "mature",
];
export type AdultCategoryPreferences = Record<AdultCategory, boolean>;
export const DEFAULT_ADULT_CATEGORIES: AdultCategoryPreferences = {
  explicit: true,
  ecchi: true,
  mature: true,
};
export function classifyAdultContent(value: unknown): AdultCategory | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const labels = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.flatMap((x) =>
          typeof x === "string"
            ? [x.toLowerCase()]
            : x && typeof x === "object" && "name" in x
            ? [String(x.name).toLowerCase()]
            : []
        )
      : [];
  const genres = labels(row.genres ?? row.genreTags);
  const tags = labels(row.tags);
  const rating = String(
    row.contentRating ?? row.content_rating ?? row.rating ?? row.ageRating ?? ""
  )
    .toLowerCase()
    .trim();
  if (
    row.adultCategory === "explicit" ||
    ["isAdult", "is_adult", "adult", "nsfw", "isNsfw", "is18Plus"].some(
      (k) => row[k] === true
    ) ||
    genres.some((x) => /^(hentai|erotica|pornographic)$/.test(x)) ||
    /^(erotica|pornographic|rx\b|r.?18\b)/.test(rating)
  )
    return "explicit";
  if (
    row.adultCategory === "ecchi" ||
    rating === "suggestive" ||
    genres.includes("ecchi") ||
    tags.some((x) => ["ecchi", "sexual content", "nudity"].includes(x))
  )
    return "ecchi";
  if (
    row.adultCategory === "mature" ||
    /^(r(?:\s*-?\s*17|\+|\s*-\s*17)|r$|nc.?17|18\+|17\+|mature)/.test(rating)
  )
    return "mature";
  return null;
}
export function normalizeAdultCategories(
  raw: unknown
): AdultCategoryPreferences {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    ADULT_CATEGORIES.map((k) => [k, typeof r[k] === "boolean" ? r[k] : true])
  ) as AdultCategoryPreferences;
}
export function selectedAdultCategories(
  raw: AdultCategoryPreferences
): AdultCategory[] {
  return ADULT_CATEGORIES.filter((k) => raw[k]);
}
export function matchesContentMode(
  value: unknown,
  mode: ContentMode,
  categories: readonly AdultCategory[] = ADULT_CATEGORIES
): boolean {
  const category = classifyAdultContent(value);
  return mode === "adult"
    ? category !== null && categories.includes(category)
    : category === null;
}
