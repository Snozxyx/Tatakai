import { isDeveloperModeEnabled } from '@/lib/developerMode';
export interface ExtensionSourceReport {
  provider: string; name: string; ecosystem: string; kind: 'anime' | 'manga' | 'pages' | 'custom';
  status: string; count: number; subtitleCount?: number; durationMs: number; error?: string; lookup?: 'mapping' | 'catalog-search'; attempts?: number;
  skippedSourceIds?: string[];
}
let reports: ExtensionSourceReport[] = [];
export const sourceReports = () => reports;
export function recordSourceReport(report: ExtensionSourceReport) {
  recordSourceReports([report]);
}
export function recordSourceReports(batch: ExtensionSourceReport[]) {
  // Errors can contain personalized URLs or proxy tokens. Diagnostics contain labels/counts only.
  const safe = batch.map(report => ({ ...report, error: report.error?.replace(/https?:\/\/[^\s)]+/gi, '[URL]').slice(0, 300) }));
  const replaced = new Set(safe.map(row => row.kind + ':' + row.provider));
  reports = [...reports.filter(row => !replaced.has(row.kind + ':' + row.provider)), ...safe].slice(-1000);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tatakai:source-report'));
  if (isDeveloperModeEnabled()) console.debug('[Extension sources]', safe);
}
