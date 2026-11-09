import type { CustomMediaCard } from '@/core/extensions/sdk/types';

/** A repeated upstream page must not leave a Load More loop on screen. */
export function mergeCustomCatalogPage(previous: CustomMediaCard[], page: { items: CustomMediaCard[]; nextSkip: number | null }) {
  const ids = new Set(previous.map(item => item.id));
  const added = page.items.filter(item => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
  return { items: [...previous, ...added], nextSkip: added.length ? page.nextSkip : null };
}
