import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { resolveRemoteSources } from '@/core/extensions/remote/resolve';

export function useRemoteExtensionSources(anilistId: number | undefined, title: string | undefined, episode: number | undefined, dub: boolean) {
  const [revision, setRevision] = useState(0);
  const client = useQueryClient();
  useEffect(() => {
    const changed = () => { setRevision(r => r + 1); void client.invalidateQueries({ queryKey: ['remote-extension-sources'] }); };
    window.addEventListener(EXTENSION_INSTALLED_EVENT, changed);
    return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, changed);
  }, [client]);
  return useQuery({ queryKey: ['remote-extension-sources', anilistId, title, episode, dub, revision],
    enabled: !!(anilistId || title) && !!episode, staleTime: 5 * 60 * 1000, retry: false,
    queryFn: ({ signal }) => resolveRemoteSources({ anilistId, title, episode, dub }, signal) });
}
