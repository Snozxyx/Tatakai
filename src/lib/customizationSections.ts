import type { PageCustomization, ShelfSource, CustomShelf } from './customization';

/** Keep unavailable saved identifiers, and append newly introduced sections in their original order. */
export function arrangeSectionIds(defaultIds: readonly string[], savedOrder?: readonly string[], customIds: readonly string[] = [], feedId?: string): string[] {
  const ordered = [...new Set([...(savedOrder || []), ...defaultIds])];
  const added = [...new Set(customIds)].filter(id => !ordered.includes(id));
  const insertion = feedId ? ordered.indexOf(feedId) : -1;
  ordered.splice(insertion < 0 ? ordered.length : insertion, 0, ...added);
  return ordered;
}
export function moveSection(order: readonly string[], id: string, delta: number): string[] {
  const next = [...order], index = next.indexOf(id), target = index + delta;
  if (index >= 0 && target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function retainUnavailableSectionIds(visibleOrder: readonly string[], storedOrder?: readonly string[]): string[] {
  return [...new Set([...visibleOrder, ...(storedOrder || [])])];
}
export function customShelves(page?: PageCustomization): CustomShelf[] {
  return Object.entries(page?.customSections || {}).filter((entry): entry is [string, CustomShelf] => Boolean(entry[1])).map(([id, shelf]) => ({ ...shelf, id }));
}
export function shelfSourceKey(source: ShelfSource): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, part]) => [key, stable(part)])) : value;
  return JSON.stringify(stable(source));
}
export function nextShelfPage(rawIds: readonly string[], previousIds: readonly string[], hasMore: boolean, page: number): number | undefined {
  const seen = new Set(previousIds);
  return hasMore && rawIds.some(id => !seen.has(id)) ? page + 1 : undefined;
}
