const DEBRID_HOSTS = ['real-debrid.com', 'torbox.app', 'torboxcdn.com'];

/** Signed debrid links are device-bound; retain their transport and native player. */
export function isDebridDirectUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return DEBRID_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}
 