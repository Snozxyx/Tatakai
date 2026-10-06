/**
 * React identity for one rendered reader page.
 *
 * Reader routes deliberately stay mounted while their query string changes.
 * Page numbers therefore repeat between chapters (chapter 1 page 1, chapter 2
 * page 1, ...), so a page-number-only key reuses loading/error state from the
 * previous chapter. Include both the chapter scope and the actual source URL.
 */
export function readerPageRenderKey(
  chapterScope: string | number,
  page: {
    pageNumber: number;
    imageUrl: string;
    proxiedImageUrl?: string | null;
  },
): string {
  const source = page.proxiedImageUrl || page.imageUrl;
  return `${String(chapterScope)}\u0000${page.pageNumber}\u0000${source}`;
}

/**
 * A native loopback URL already replays its headers in the native proxy. It
 * must load directly in `<img>`; sending it through the headered-blob path is
 * redundant and can turn a short token-registration race into a sticky error.
 */
export function shouldUseReaderHeaderBlob(input: {
  src: string;
  headerCount: number;
  isMobileProxy: boolean;
  isNativeLoopback: boolean;
}): boolean {
  return (
    !input.isNativeLoopback &&
    !input.isMobileProxy &&
    input.headerCount > 0 &&
    /^https?:\/\//i.test(input.src)
  );
}
