import uiI18n from '@/lib/uiI18n';
export function formatWatchHours(hours: number, locale = uiI18n.language): string {
  return new Intl.NumberFormat(locale || 'en', { maximumFractionDigits: 1 }).format(Number.isFinite(hours) ? Math.max(0, hours) : 0);
}
