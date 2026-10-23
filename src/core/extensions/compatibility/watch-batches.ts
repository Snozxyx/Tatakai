import type { ExtensionSourceReport } from '../remote/diagnostics';

export interface WatchExtensionBatch { sources: any[]; subtitles: any[]; statuses: ExtensionSourceReport[] }

export function remainingWatchSources(batch?: WatchExtensionBatch): string[] {
  return [...new Set(batch?.statuses.flatMap(report => report.skippedSourceIds || []) || [])];
}

/** A resumed batch must not replace streams already found by other sources. */
export function mergeWatchBatches(previous: WatchExtensionBatch, batch: WatchExtensionBatch): WatchExtensionBatch {
  const unique = (rows: any[], key: (row: any) => string) => [...new Map(rows.map(row => [key(row), row])).values()];
  const sources = unique([...previous.sources, ...batch.sources], row => JSON.stringify([row.compatibilitySourceId || row.providerKey, row.url, row.fileIndex]));
  const totals = new Map<string, { count: number; subtitles: number }>();
  for (const source of sources) {
    const total = totals.get(source.providerKey) || { count: 0, subtitles: 0 };
    total.count++; total.subtitles += source.subtitles?.length || 0;
    totals.set(source.providerKey, total);
  }
  const statuses = new Map(previous.statuses.map(report => [report.provider, report]));
  for (const report of batch.statuses) {
    const before = statuses.get(report.provider);
    const { count = 0, subtitles = 0 } = totals.get(report.provider) || {};
    const error = [...new Set([before?.status !== 'skipped' ? before?.error : undefined, report.error].filter(Boolean))].join('; ') || undefined;
    statuses.set(report.provider, { ...report, count: Math.max(count, report.count, before?.count || 0),
      subtitleCount: Math.max(report.subtitleCount || 0, subtitles),
      status: count ? error ? 'partial' : 'ok' : report.status, error });
  }
  return { sources, subtitles: unique([...previous.subtitles, ...batch.subtitles], row => row.url), statuses: [...statuses.values()] };
}
