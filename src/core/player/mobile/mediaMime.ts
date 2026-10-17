/** Preserve transport identity when a loopback proxy replaces the original extension. */
export function nativeMediaMime(url: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  let path: string;
  try { path = new URL(url).pathname.toLowerCase(); } catch { return undefined; }
  if (path.endsWith('.m3u8')) return 'application/x-mpegURL';
  if (path.endsWith('.mpd')) return 'application/dash+xml';
  return undefined; // MP4/MKV and RTSP retain Media3's normal inference.
}
