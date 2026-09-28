/**
 * Allowlist for the "add image by URL" path in the community image picker.
 *
 * Users may only paste image links from a small set of very well-known,
 * widely-trusted image / CDN hosts. Everything else is rejected before it can
 * ever become a rendered `src`, so a post/comment can't be used to hotlink an
 * arbitrary attacker-controlled endpoint (tracking pixels, SSRF-ish probes,
 * malware-serving hosts, etc.). Treat every pasted URL as untrusted input.
 *
 * Matching is by registrable host: the URL's hostname must equal an entry or be
 * a subdomain of one (`endsWith('.' + entry)`), and the scheme must be https.
 */
export const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  // Image hosts
  'imgur.com',
  'ibb.co',
  'postimg.cc',
  'postimage.org',
  'imgbox.com',
  // Reddit
  'redd.it',
  'redditmedia.com',
  // Discord
  'discordapp.com',
  'discordapp.net',
  'discord.com',
  // Wikimedia / Wikipedia
  'wikimedia.org',
  'wikipedia.org',
  // GitHub
  'githubusercontent.com',
  'github.com',
  'github.io',
  // GIF providers
  'giphy.com',
  'tenor.com',
  // Anime / catalog CDNs the app already trusts
  'anilist.co',
  'myanimelist.net',
  'kitsu.io',
  'kitsu.app',
  'tmdb.org',
  'simkl.net',
  // General well-known image CDNs
  'unsplash.com',
  'pinimg.com',
  'cloudinary.com',
  'imgix.net',
  'googleusercontent.com',
  'staticflickr.com',
  'flickr.com',
];

/** Human-readable summary of a few trusted hosts, for helper text in the UI. */
export const ALLOWED_IMAGE_HOSTS_HINT =
  'imgur, Discord, Reddit, Wikimedia, GitHub, AniList, MyAnimeList, Giphy, Tenor & other well-known image hosts';

/**
 * True when `raw` is an `https` URL whose host is (or is a subdomain of) an
 * allowlisted image host. Rejects everything else, including `http`,
 * `data:`/`blob:`/`javascript:` schemes, and unknown hosts.
 */
export function isAllowedImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_IMAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
