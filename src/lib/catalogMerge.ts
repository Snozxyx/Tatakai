export interface CatalogIdentity {
  id?: string | number;
  anilistId?: number;
  malId?: number;
  canonicalTitle?: string;
  title?: { english?: string; romaji?: string; native?: string };
  mediaType?: string;
}

export const normalizeCatalogTitle = (title: string) => title.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Keep the primary catalog's identity, including when the other catalog only has MAL or an alias. */
export function mergeCatalog<T extends CatalogIdentity>(primary: T[], additions: T[]): T[] {
  const ids = new Set<string>();
  const titles = new Set<string>();
  return [...primary, ...additions].filter(item => {
    const kind = item.mediaType === 'anime' ? 'anime' : item.mediaType === 'novel' ? 'novel' : 'manga';
    const keys = [item.id != null ? `${kind}:id:${item.id}` : '', item.anilistId ? `${kind}:al:${item.anilistId}` : '', item.malId ? `${kind}:mal:${item.malId}` : ''].filter(Boolean);
    const names = [item.canonicalTitle, item.title?.english, item.title?.romaji, item.title?.native].filter((s): s is string => Boolean(s)).map(s => `${kind}:${normalizeCatalogTitle(s)}`);
    const duplicate = keys.some(key => ids.has(key)) || names.some(name => titles.has(name));
    keys.forEach(key => ids.add(key));
    names.forEach(name => titles.add(name));
    return !duplicate;
  });
}
