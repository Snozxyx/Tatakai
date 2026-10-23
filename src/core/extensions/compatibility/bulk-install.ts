import type { CompatibilityPackage, CompatibilitySource } from './client';

export interface BulkInstallProgress {
  total: number; completed: number; installed: number; failed: number; cancelled: boolean;
  current?: string; failures: { name: string; error: string }[];
}
export type BulkActionProgress = Omit<BulkInstallProgress, 'installed'> & { succeeded: number };

/** One original package at a time; cancellation never queues the next package. */
export async function installCompatibilityBatch(packages: CompatibilityPackage[], install: (pkg: CompatibilityPackage, signal?: AbortSignal) => Promise<unknown>, signal?: AbortSignal, report?: (progress: BulkInstallProgress) => void): Promise<BulkInstallProgress> {
  const candidates = [...new Map(packages.filter(pkg => !pkg.installed).map(pkg => [pkg.repository + '\0' + pkg.id, pkg])).values()];
  const installed = ({ succeeded, ...progress }: BulkActionProgress): BulkInstallProgress => ({ ...progress, installed: succeeded });
  return installed(await runCompatibilityBatch(candidates, install, signal, progress => report?.(installed(progress))));
}
export async function enableCompatibilityBatch(sources: CompatibilitySource[], enabled: boolean, change: (source: CompatibilitySource, signal?: AbortSignal) => Promise<unknown>, signal?: AbortSignal, report?: (progress: BulkActionProgress) => void) {
  const candidates = [...new Map(sources.filter(source => source.enabled !== enabled).map(source => [source.id, source])).values()];
  return runCompatibilityBatch(candidates, change, signal, report);
}
async function runCompatibilityBatch<T extends { name: string }>(candidates: T[], change: (item: T, signal?: AbortSignal) => Promise<unknown>, signal?: AbortSignal, report?: (progress: BulkActionProgress) => void): Promise<BulkActionProgress> {
  const result: BulkActionProgress = { total: candidates.length, completed: 0, succeeded: 0, failed: 0, cancelled: false, failures: [] };
  const notify = () => report?.({ ...result, failures: [...result.failures] });
  notify();
  for (const pkg of candidates) {
    if (signal?.aborted) { result.cancelled = true; break; }
    result.current = pkg.name; notify();
    try { await change(pkg, signal); result.succeeded++; }
    catch (error) {
      if (signal?.aborted) { result.cancelled = true; break; }
      result.failed++; if (result.failures.length < 20) result.failures.push({ name: pkg.name, error: error instanceof Error ? error.message.slice(0, 500) : 'Installation failed' });
    }
    result.completed++; notify();
  }
  result.cancelled ||= signal?.aborted === true;
  delete result.current; notify(); return result;
}
