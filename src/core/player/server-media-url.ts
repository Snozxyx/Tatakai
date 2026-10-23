/** Server media tickets already preserve upstream headers and rewrite HLS children. */
export function isServerMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      && !url.search && !url.hash && /^\/api\/server\/v1\/media\/[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/.test(url.pathname);
  } catch { return false; }
}
