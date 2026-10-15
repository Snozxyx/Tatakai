/** Host-published tunnel streams already rewrite HLS segments on their origin. */
export function isWatchPartyShareUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && url.hostname.endsWith('.trycloudflare.com')
      && /^\/stream\/[a-f0-9]{32}$/.test(url.pathname)
      && !!url.searchParams.get('s');
  } catch { return false; }
}

