/**
 * URL host matching
 *
 * Domain allowlists must compare the parsed hostname, never a substring of the raw URL.
 * `url.includes('giphy.com')` is true for all of these, none of which are Giphy:
 *
 *   https://evil.com/?ref=giphy.com   — allowlisted domain in the query string
 *   https://giphy.com.evil.com/x      — allowlisted domain as a subdomain label
 *   https://giphy.com@evil.com/x      — allowlisted domain as URL userinfo
 *
 * Kept dependency-free so it can be unit tested without pulling the Supabase client in
 * through its consumers.
 */

/**
 * Hostname of a URL found in prose, lowercased, or null if it will not parse.
 *
 * Trailing punctuation is stripped because link patterns are typically greedy to
 * whitespace, so "see https://giphy.com/x." captures the full stop.
 */
export function extractHostname(rawUrl: string): string | null {
  try {
    const cleaned = rawUrl.trim().replace(/[),.;:!?'"\]}>]+$/g, '');
    if (!cleaned) return null;
    const { hostname } = new URL(cleaned);
    return hostname ? hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Whether a hostname equals an allowlisted domain or is a subdomain of one. */
export function isHostAllowed(host: string, allowedDomains: readonly string[]): boolean {
  const target = host.toLowerCase();
  return allowedDomains.some((domain) => {
    const allowed = domain.trim().toLowerCase().replace(/^\.+/, '');
    if (!allowed) return false;
    return target === allowed || target.endsWith(`.${allowed}`);
  });
}

/** Whether a URL's host is allowlisted. Unparseable URLs are never allowed. */
export function isUrlAllowed(rawUrl: string, allowedDomains: readonly string[]): boolean {
  const host = extractHostname(rawUrl);
  if (!host) return false;
  return isHostAllowed(host, allowedDomains);
}
