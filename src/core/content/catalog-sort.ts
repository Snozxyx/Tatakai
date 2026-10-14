/** URL values are case-insensitive; preserve the canonical mixed-case option. */
export function normalizeCatalogSort<T extends string>(value: string | null, options: readonly T[]): T | 'default' {
  const normalized = String(value || 'default').trim().toLowerCase();
  return options.find(option => option.toLowerCase() === normalized) ?? 'default';
}

/** Trending pagination must append provider order rather than re-sort by popularity. */
export function preservesCatalogPageOrder(sort: string): boolean {
  return sort === 'default' || sort === 'trending';
}
