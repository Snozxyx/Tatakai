import type { StoreExtension } from './store-api';

/** Rank the complete catalog before choosing the setup recommendations. */
export function rankSetupExtensions(items: StoreExtension[]): StoreExtension[] {
  const count = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  return items.filter(item => item.compatibility !== 'external' && item.compatibility !== 'unavailable')
    .sort((left, right) => Number(right.isFeatured) - Number(left.isFeatured)
      || (left.priority ?? 100) - (right.priority ?? 100)
      || Number(Boolean(right.banner?.trim())) - Number(Boolean(left.banner?.trim()))
      || count(right.installs) - count(left.installs)
      || count(right.downloads) - count(left.downloads)
      || left.name.localeCompare(right.name));
}
