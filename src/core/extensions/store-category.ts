/** Source categories remain client filters, compatible with older store APIs. */
export function isMangaExtension(item: { upstreamType?: string; capabilities?: string[]; categories?: string[]; name?: string; description?: string }): boolean {
  return item.upstreamType === 'manga-provider' || (item.capabilities || []).includes('manga')
    || (item.categories || []).some(category => /^(manga|manhwa|manhua)$/i.test(category))
    || /\b(manga|manhwa|manhua)\b/i.test(item.description || '');
}
