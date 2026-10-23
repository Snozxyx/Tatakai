import type { CustomSourceEntry } from "./custom-source-runtime";

export const customSourceBase = (
  source: Pick<CustomSourceEntry, "namespace" | "id">
) =>
  `/x/${encodeURIComponent(source.namespace)}/${encodeURIComponent(source.id)}`;

export function customProviderKey(source: CustomSourceEntry) {
  // Never merge different repositories/packages, content kinds, or unknown providers by label.
  return JSON.stringify([
    source.namespace,
    source.extensionId || "",
    source.kind,
    source.providerGroup || source.id,
  ]);
}

export type CustomProviderGroup = CustomSourceEntry & {
  variants: CustomSourceEntry[];
};
export function groupCustomSources(sources: CustomSourceEntry[]) {
  const groups = new Map<string, CustomProviderGroup>();
  for (const source of sources) {
    const key = customProviderKey(source);
    const existing = groups.get(key);
    if (existing) {
      if (!existing.variants.some((item) => item.id === source.id))
        existing.variants.push(source);
    } else groups.set(key, { ...source, variants: [source] });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sourceLanguage(language?: string) {
  if (
    !language ||
    language === "all" ||
    language === "uni" ||
    language === "multi"
  )
    return "All languages";
  try {
    return (
      new Intl.DisplayNames(
        [typeof navigator === "undefined" ? "en" : navigator.language || "en"],
        { type: "language" }
      ).of(language) || language
    );
  } catch {
    return language;
  }
}

/** Stable sort, including specials with no number. Never infer episode/season mappings. */
export function orderedCustomEntries<T extends { number?: number }>(
  entries: T[],
  descending = false
) {
  const numbers = entries
    .map((item) => item.number)
    .filter(
      (number): number is number => number != null && Number.isFinite(number)
    );
  // Repeated numbers often denote seasons/alternate editions. Preserve their source order.
  if (new Set(numbers).size !== numbers.length)
    return descending ? [...entries].reverse() : [...entries];
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const an = a.entry.number,
        bn = b.entry.number;
      if (an == null || !Number.isFinite(an))
        return bn == null || !Number.isFinite(bn) ? a.index - b.index : 1;
      if (bn == null || !Number.isFinite(bn)) return -1;
      return (descending ? bn - an : an - bn) || a.index - b.index;
    })
    .map((item) => item.entry);
}
