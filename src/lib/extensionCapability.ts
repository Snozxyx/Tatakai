export type ContentExtensionKind = 'anime' | 'manga' | 'novel';
export function supportsContent(
  manifest: Record<string, any>,
  kind: ContentExtensionKind
) {
  const caps: string[] =
    manifest.capabilities || manifest.manifest?.capabilities || [];
  const routes: string[] = manifest.routes || manifest.apiServer?.routes || [];
  if (kind === 'anime')
    return (
      caps.some((cap) =>
        ['stream', 'streaming', 'anime', 'torrent', 'sources'].includes(cap)
      ) ||
      routes.some((route) =>
        ['sources', 'stream', 'torrent'].includes(route)
      ) ||
      manifest.type === 'anime'
    );
  return (
    caps.includes(kind) ||
    routes.some((route) => route.startsWith(`${kind}/`)) ||
    manifest.type === kind
  );
}
