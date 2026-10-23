import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { resolveRemoteSources, resolveRemainingCompatibilitySources } from '@/core/extensions/remote/resolve';
import { mergeWatchBatches, remainingWatchSources, type WatchExtensionBatch } from '@/core/extensions/compatibility/watch-batches';
import { recordSourceReport, recordSourceReports, sourceReports } from '@/core/extensions/remote/diagnostics';
import { clearWatchLookupCache } from '@/core/extensions/compatibility/lookup-cache';

export function useRemoteExtensionSources(anilistId: number | undefined, title: string | undefined, episode: number | undefined, dub: boolean) {
  const [revision, setRevision] = useState(0);
  const client = useQueryClient();
  useEffect(() => {
    const changed = () => { setRevision(r => r + 1); void client.invalidateQueries({ queryKey: ['remote-extension-sources'] }); };
    window.addEventListener(EXTENSION_INSTALLED_EVENT, changed);
    return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, changed);
  }, [client]);
  const queryKey = ['remote-extension-sources', 'continuous-v2', anilistId, title, episode, dub, revision];
  const active = useRef<AbortController>();
  const [continuing, setContinuing] = useState(false);
  const [continuationError, setContinuationError] = useState('');
  useEffect(() => { setContinuing(false); setContinuationError(''); return () => { active.current?.abort(); active.current = undefined; }; }, [anilistId, title, episode, dub, revision]);
  const query = useQuery({ queryKey,
    enabled: !!(anilistId || title) && !!episode, staleTime: 5 * 60 * 1000, retry: false,
    queryFn: ({ signal }) => resolveRemoteSources({ anilistId, title, episode, dub }, signal, progress => { if (!signal.aborted) client.setQueryData(queryKey, progress); }) });
  async function searchRemaining() {
    if (active.current || query.isFetching) return;
    const previous = client.getQueryData<WatchExtensionBatch>(queryKey);
    const sourceIds = remainingWatchSources(previous);
    if (!previous || !sourceIds.length) return;
    const controller = new AbortController(); active.current = controller;
    setContinuing(true); setContinuationError('');
    const publish = (batch: WatchExtensionBatch) => {
      if (controller.signal.aborted) return;
      const merged = mergeWatchBatches(previous, batch);
      client.setQueryData(queryKey, merged);
      for (const report of merged.statuses) recordSourceReport(report);
    };
    try { publish(await resolveRemainingCompatibilitySources({ anilistId, title, episode, dub }, sourceIds, controller.signal, publish)); }
    catch (error) { if (!controller.signal.aborted) setContinuationError(error instanceof Error ? error.message : 'Could not search remaining sources'); }
    finally { if (active.current === controller) { active.current = undefined; setContinuing(false); } }
  }
  return { ...query, searchRemaining, remainingSourceCount: remainingWatchSources(query.data).length, continuing, continuationError,
    cancelLookup: async () => {
      active.current?.abort();
      const previous = client.getQueryData<WatchExtensionBatch>(queryKey) || { sources: [], subtitles: [], statuses: [] };
      await client.cancelQueries({ queryKey, exact: true });
      const statuses = previous.statuses.map(report => report.status === 'queued' ? { ...report, status: 'cancelled' } : report);
      client.setQueryData(queryKey, { ...previous, statuses });
      recordSourceReports(sourceReports().filter(report => report.kind === 'anime' && report.status === 'queued').map(report => ({ ...report, status: 'cancelled' })));
    },
    cancelRemaining: () => active.current?.abort(), refetch: () => { active.current?.abort(); clearWatchLookupCache(); return query.refetch(); } };
}
