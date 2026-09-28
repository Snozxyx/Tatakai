import { useMemo, useState } from 'react';

export interface ShelfGroup<T> {
  status: string;
  items: T[];
}

/**
 * Owns the tab-level search box state and groups a flat item list into ordered
 * status shelves, applying the search term (by title) as it groups. Statuses
 * not in `order` fold into `fallbackStatus`; empty shelves are dropped so they
 * disappear while searching.
 */
export function useShelfSearch<T>(
  items: T[],
  order: string[],
  getStatus: (item: T) => string | null | undefined,
  getTitle: (item: T) => string | null | undefined,
  fallbackStatus: string,
) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();

  const groups = useMemo<ShelfGroup<T>[]>(() => {
    const byStatus = new Map<string, T[]>();
    for (const item of items) {
      if (term && !String(getTitle(item) || '').toLowerCase().includes(term)) continue;
      const raw = getStatus(item) || fallbackStatus;
      const key = order.includes(raw) ? raw : fallbackStatus;
      const arr = byStatus.get(key) || [];
      arr.push(item);
      byStatus.set(key, arr);
    }
    return order
      .filter((s) => byStatus.has(s))
      .map((status) => ({ status, items: byStatus.get(status)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, term]);

  const matchCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  return { search, setSearch, term, groups, matchCount };
}
