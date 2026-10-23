/** Reject successful HTTP responses containing a portal page or JSON manifest. */
export function requireKaiArchive(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) {
    throw new Error('The extension service returned a page or manifest instead of a .kai archive. Please retry after the catalog is updated.');
  }
  return buffer;
}
