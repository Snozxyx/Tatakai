/** Native offline references retain the download service's original episode ID. */
export function getMobileOfflineEpisodeId(localPath: string, fallbackId: string): string {
  const prefix = 'native-offline://';
  if (!localPath.startsWith(prefix)) return fallbackId;
  try {
    return decodeURIComponent(localPath.slice(prefix.length)) || fallbackId;
  } catch {
    return fallbackId;
  }
}
