import { isDeveloperModeEnabled } from '@/lib/developerMode';
export interface ExtensionSourceReport {
  provider: string; name: string; ecosystem: string; kind: 'anime' | 'manga' | 'pages' | 'custom';
  status: string; count: number; subtitleCount?: number; durationMs: number; error?: string; lookup?: 'mapping' | 'catalog-search'; attempts?: number;
}
let reports: ExtensionSourceReport[] = [];
export const sourceReports = () => reports;
export function recordSourceReport(report: ExtensionSourceReport) {
  // Errors can contain personalized URLs or proxy tokens. Diagnostics contain labels/counts only.
  const safe = { ...report, error: report.error?.replace(/https?:\/\/[^\s)]+/gi, '[URL]').slice(0, 300) };
  reports = [...reports.filter(r => r.provider !== safe.provider || r.kind !== safe.kind), safe].slice(-1000);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tatakai:source-report'));
  if (isDeveloperModeEnabled()) console.debug('[Extension sources]', safe);
}
