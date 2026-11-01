export type LibraryKind = "anime" | "manga" | "novel";
export interface LibraryEntry {
  key: string;
  id: string;
  kind: LibraryKind;
  title: string;
  poster: string | null;
  status: string;
  format: string;
  updatedAt: string;
  href: string;
  resumeHref?: string;
  progress?: string;
  source: any;
}

export const LIBRARY_STATUS_ORDER = [
  "watching",
  "reading",
  "completed",
  "plan_to_watch",
  "plan_to_read",
  "on_hold",
  "dropped",
];

export function filterLibrary(
  entries: LibraryEntry[],
  filters: {
    search?: string;
    status?: string;
    format?: string;
    kind?: string;
    sort?: string;
    days?: number;
    now?: number;
  }
) {
  const term = (filters.search || "").trim().toLocaleLowerCase();
  const cutoff = filters.days
    ? (filters.now ?? Date.now()) - filters.days * 86400000
    : -Infinity;
  return entries
    .filter(
      (entry) =>
        (!term || entry.title.toLocaleLowerCase().includes(term)) &&
        (!filters.status ||
          filters.status === "all" ||
          entry.status === filters.status) &&
        (!filters.format ||
          filters.format === "all" ||
          entry.format === filters.format) &&
        (!filters.kind ||
          filters.kind === "all" ||
          entry.kind === filters.kind) &&
        (!filters.days || Date.parse(entry.updatedAt) >= cutoff)
    )
    .sort((a, b) =>
      filters.sort === "title"
        ? a.title.localeCompare(b.title) || a.key.localeCompare(b.key)
        : (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) ||
          a.key.localeCompare(b.key)
    );
}

export function groupLibrary(entries: LibraryEntry[]) {
  return LIBRARY_STATUS_ORDER.map((status) => ({
    status,
    entries: entries.filter((entry) => entry.status === status),
  })).filter((group) => group.entries.length > 0);
}
